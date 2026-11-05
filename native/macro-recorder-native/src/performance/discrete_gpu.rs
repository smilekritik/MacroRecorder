//! Discrete GPU adapter discovery, LUID filtering, and preference exports.
//!
//! Covers:
//! - Uses DXGI 1.1 to enumerate display adapters
//! - Filters out software emulation devices (e.g. Microsoft Basic Render Driver)
//! - Identifies the most powerful discrete GPU by dedicated video memory
//! - Formats PDH counter instance LUID filters: `luid_0x00000000_0x0000C4C1`
//! - Exports global preference hints (`NvOptimusEnablement`, `AmdPowerXpressRequestHighPerformance`)

use napi_derive::napi;
use windows::core::GUID;
use windows::Win32::Foundation::HMODULE;

extern "system" {
    fn LoadLibraryW(lpLibFileName: *const u16) -> HMODULE;
    fn GetProcAddress(hModule: HMODULE, lpProcName: *const u8) -> *mut std::ffi::c_void;
}

const DXGI_ADAPTER_FLAG_SOFTWARE: u32 = 2;
const IID_IDXGI_FACTORY1: GUID = GUID::from_u128(0x770aae78_f26f_4dba_a829_253c83d1b387);

#[repr(C)]
struct DxgiAdapterDesc1 {
    description: [u16; 128],
    vendor_id: u32,
    device_id: u32,
    subsys_id: u32,
    revision: u32,
    dedicated_video_memory: usize,
    dedicated_system_memory: usize,
    shared_system_memory: usize,
    adapter_luid_low: u32,
    adapter_luid_high: i32,
    flags: u32,
}

#[allow(non_snake_case)]
type FnCreateDXGIFactory1 = unsafe extern "system" fn(
    riid: *const GUID,
    ppFactory: *mut *mut std::ffi::c_void,
) -> i32;

/// Diagnostic metadata for an enumerated GPU video adapter.
#[napi(object)]
#[derive(Debug, Clone, PartialEq)]
pub struct GpuAdapterInfo {
    pub description: String,
    pub dedicated_video_memory_mb: f64,
    pub dedicated_system_memory_mb: f64,
    pub shared_system_memory_mb: f64,
    pub vendor_id: u32,
    pub device_id: u32,
    pub subsys_id: u32,
    pub revision: u32,
    pub luid_filter: String,
    pub is_discrete: bool,
}

/// Helper to dynamically resolve `CreateDXGIFactory1` from `dxgi.dll`.
fn resolve_create_dxgi_factory1() -> Option<FnCreateDXGIFactory1> {
    let dll_name: Vec<u16> = "dxgi.dll\0".encode_utf16().collect();
    let module = unsafe { LoadLibraryW(dll_name.as_ptr()) };
    if module.is_invalid() || module.0.is_null() {
        return None;
    }
    let proc_name = std::ffi::CString::new("CreateDXGIFactory1").ok()?;
    let proc = unsafe { GetProcAddress(module, proc_name.as_ptr() as *const u8) };
    if proc.is_null() {
        return None;
    }
    Some(unsafe { std::mem::transmute(proc) })
}

unsafe fn vtable_release(obj: *mut std::ffi::c_void) -> u32 {
    if obj.is_null() {
        return 0;
    }
    let vtable = *(obj as *mut *mut usize);
    let func_ptr = *vtable.add(2);
    let release_fn: unsafe extern "system" fn(*mut std::ffi::c_void) -> u32 =
        std::mem::transmute(func_ptr);
    release_fn(obj)
}

unsafe fn vtable_enum_adapters1(
    factory: *mut std::ffi::c_void,
    index: u32,
    adapter: *mut *mut std::ffi::c_void,
) -> i32 {
    let vtable = *(factory as *mut *mut usize);
    let func_ptr = *vtable.add(12);
    let enum_fn: unsafe extern "system" fn(
        *mut std::ffi::c_void,
        u32,
        *mut *mut std::ffi::c_void,
    ) -> i32 = std::mem::transmute(func_ptr);
    enum_fn(factory, index, adapter)
}

unsafe fn vtable_get_desc1(adapter: *mut std::ffi::c_void, desc: *mut DxgiAdapterDesc1) -> i32 {
    let vtable = *(adapter as *mut *mut usize);
    let func_ptr = *vtable.add(10);
    let desc_fn: unsafe extern "system" fn(
        *mut std::ffi::c_void,
        *mut DxgiAdapterDesc1,
    ) -> i32 = std::mem::transmute(func_ptr);
    desc_fn(adapter, desc)
}

/// Enumerates all hardware video adapters present on the system.
pub fn enumerate_adapters() -> Vec<GpuAdapterInfo> {
    let Some(create_factory) = resolve_create_dxgi_factory1() else {
        return Vec::new();
    };

    let mut factory: *mut std::ffi::c_void = std::ptr::null_mut();
    let hr = unsafe { create_factory(&IID_IDXGI_FACTORY1, &mut factory) };
    if hr != 0 || factory.is_null() {
        return Vec::new();
    }

    struct ComGuard(*mut std::ffi::c_void);
    impl Drop for ComGuard {
        fn drop(&mut self) {
            unsafe {
                let _ = vtable_release(self.0);
            }
        }
    }
    let _factory_guard = ComGuard(factory);

    let mut adapters = Vec::new();
    let mut index = 0u32;

    loop {
        let mut adapter: *mut std::ffi::c_void = std::ptr::null_mut();
        let enum_hr = unsafe { vtable_enum_adapters1(factory, index, &mut adapter) };
        if enum_hr != 0 || adapter.is_null() {
            break;
        }

        let _adapter_guard = ComGuard(adapter);

        let mut desc: DxgiAdapterDesc1 = unsafe { std::mem::zeroed() };
        let desc_hr = unsafe { vtable_get_desc1(adapter, &mut desc) };

        if desc_hr == 0 {
            let is_software = (desc.flags & DXGI_ADAPTER_FLAG_SOFTWARE) != 0;
            if !is_software {
                let null_pos = desc
                    .description
                    .iter()
                    .position(|&c| c == 0)
                    .unwrap_or(desc.description.len());
                let description = String::from_utf16_lossy(&desc.description[..null_pos]);

                let dedicated_vram_mb = (desc.dedicated_video_memory as f64) / (1024.0 * 1024.0);
                let dedicated_sys_mb = (desc.dedicated_system_memory as f64) / (1024.0 * 1024.0);
                let shared_sys_mb = (desc.shared_system_memory as f64) / (1024.0 * 1024.0);

                let luid_filter = format!(
                    "luid_0x{:08X}_0x{:08X}",
                    desc.adapter_luid_high, desc.adapter_luid_low
                );

                // Dedicated VRAM > 512 MB indicates a discrete graphics card
                let is_discrete = dedicated_vram_mb >= 512.0;

                adapters.push(GpuAdapterInfo {
                    description,
                    dedicated_video_memory_mb: dedicated_vram_mb,
                    dedicated_system_memory_mb: dedicated_sys_mb,
                    shared_system_memory_mb: shared_sys_mb,
                    vendor_id: desc.vendor_id,
                    device_id: desc.device_id,
                    subsys_id: desc.subsys_id,
                    revision: desc.revision,
                    luid_filter,
                    is_discrete,
                });
            }
        }

        index += 1;
    }

    adapters
}

/// Identifies the most powerful (discrete) video adapter by dedicated video memory.
pub fn find_strongest_adapter() -> Option<GpuAdapterInfo> {
    let adapters = enumerate_adapters();
    adapters
        .into_iter()
        .max_by(|a, b| {
            a.dedicated_video_memory_mb
                .partial_cmp(&b.dedicated_video_memory_mb)
                .unwrap_or(std::cmp::Ordering::Equal)
        })
}

/// Returns the LUID filter fragment for the strongest discrete GPU (e.g. `luid_0x00000000_0x0000C4C1`).
///
pub fn find_strongest_adapter_luid_filter() -> Option<String> {
    find_strongest_adapter().map(|a| a.luid_filter)
}

// Global symbol exports recognized by Nvidia Optimus and AMD PowerXpress graphics drivers
// to instruct the driver stack to route application execution to the discrete high-performance GPU.
#[no_mangle]
pub static NvOptimusEnablement: u32 = 0x00000001;

#[no_mangle]
pub static AmdPowerXpressRequestHighPerformance: i32 = 1;

/// Confirms discrete GPU export enablement configuration.
pub fn export_discrete_gpu_preference() -> bool {
    NvOptimusEnablement == 1 && AmdPowerXpressRequestHighPerformance == 1
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_discrete_gpu_driver_exports() {
        assert_eq!(NvOptimusEnablement, 1);
        assert_eq!(AmdPowerXpressRequestHighPerformance, 1);
        assert!(export_discrete_gpu_preference());
    }

    #[test]
    fn test_enumerate_adapters_smoke() {
        // Enumerate adapters on the current machine
        let adapters = enumerate_adapters();
        // Even in CI/headless without discrete GPU, it must not panic
        for a in &adapters {
            assert!(!a.luid_filter.is_empty());
            assert!(a.luid_filter.starts_with("luid_0x"));
        }
    }

    #[test]
    fn test_find_strongest_adapter_luid_filter() {
        let filter = find_strongest_adapter_luid_filter();
        if let Some(f) = filter {
            assert!(f.starts_with("luid_0x"));
            assert_eq!(f.len(), 26); // "luid_0x00000000_0x00000000"
        }
    }
}
