//! GPU utilization measurement via Performance Data Helper (PDH).
//!
//! Covers:
//! - Samples `\GPU Engine(*)\Utilization Percentage` via PDH
//! - Filters engines by strongest discrete GPU LUID filter (e.g. `luid_0x00000000_0x0000C4C1`)
//! - Sums utilization across all 3D/Compute/Copy engines of the discrete adapter
//! - Clamps load to [0.0, 100.0]

use windows::Win32::Foundation::HMODULE;

extern "system" {
    fn LoadLibraryW(lpLibFileName: *const u16) -> HMODULE;
    fn GetProcAddress(hModule: HMODULE, lpProcName: *const u8) -> *mut std::ffi::c_void;
}

use crate::performance::discrete_gpu::find_strongest_adapter_luid_filter;

const PDH_FMT_DOUBLE: u32 = 0x00000200;
const PDH_MORE_DATA: u32 = 0x800007D2;
const GPU_COUNTER_PATH: &str = "\\GPU Engine(*)\\Utilization Percentage";

type PdhQueryHandle = isize;
type PdhCounterHandle = isize;

#[allow(non_snake_case)]
type FnPdhOpenQueryW = unsafe extern "system" fn(
    szDataSource: *const u16,
    dwUserData: usize,
    phQuery: *mut PdhQueryHandle,
) -> u32;

#[allow(non_snake_case)]
type FnPdhAddEnglishCounterW = unsafe extern "system" fn(
    hQuery: PdhQueryHandle,
    szFullCounterPath: *const u16,
    dwUserData: usize,
    phCounter: *mut PdhCounterHandle,
) -> u32;

#[allow(non_snake_case)]
type FnPdhCollectQueryData = unsafe extern "system" fn(hQuery: PdhQueryHandle) -> u32;

#[allow(non_snake_case)]
type FnPdhGetFormattedCounterArrayW = unsafe extern "system" fn(
    hCounter: PdhCounterHandle,
    dwFormat: u32,
    lpdwBufferSize: *mut u32,
    lpdwItemCount: *mut u32,
    itemBuffer: *mut std::ffi::c_void,
) -> u32;

#[allow(non_snake_case)]
type FnPdhCloseQuery = unsafe extern "system" fn(hQuery: PdhQueryHandle) -> u32;

#[repr(C)]
struct PdhFormattedCounterValue {
    c_status: u32,
    double_value: f64,
}

#[repr(C)]
struct PdhFormattedCounterItemW {
    name: *mut u16,
    value: PdhFormattedCounterValue,
}

struct PdhFunctions {
    open_query: FnPdhOpenQueryW,
    add_counter: FnPdhAddEnglishCounterW,
    collect_data: FnPdhCollectQueryData,
    get_formatted_array: FnPdhGetFormattedCounterArrayW,
    close_query: FnPdhCloseQuery,
}

fn resolve_pdh() -> Option<PdhFunctions> {
    let dll_name: Vec<u16> = "pdh.dll\0".encode_utf16().collect();
    let module = unsafe { LoadLibraryW(dll_name.as_ptr()) };
    if module.is_invalid() || module.0.is_null() {
        return None;
    }

    unsafe {
        let open_q = GetProcAddress(module, b"PdhOpenQueryW\0".as_ptr());
        let add_c = GetProcAddress(module, b"PdhAddEnglishCounterW\0".as_ptr());
        let coll = GetProcAddress(module, b"PdhCollectQueryData\0".as_ptr());
        let get_arr = GetProcAddress(module, b"PdhGetFormattedCounterArrayW\0".as_ptr());
        let close_q = GetProcAddress(module, b"PdhCloseQuery\0".as_ptr());

        if open_q.is_null()
            || add_c.is_null()
            || coll.is_null()
            || get_arr.is_null()
            || close_q.is_null()
        {
            return None;
        }

        Some(PdhFunctions {
            open_query: std::mem::transmute(open_q),
            add_counter: std::mem::transmute(add_c),
            collect_data: std::mem::transmute(coll),
            get_formatted_array: std::mem::transmute(get_arr),
            close_query: std::mem::transmute(close_q),
        })
    }
}

/// Standalone GPU load probe managing PDH query resources.
pub struct GpuLoadProbe {
    query: PdhQueryHandle,
    counter: PdhCounterHandle,
    luid_filter: Option<String>,
    primed: bool,
    close_fn: Option<FnPdhCloseQuery>,
}

impl GpuLoadProbe {
    /// Creates a new GPU load probe, binding to the discrete GPU's PDH engines.
    pub fn new() -> Self {
        let luid_filter = find_strongest_adapter_luid_filter();

        let Some(pdh) = resolve_pdh() else {
            return Self {
                query: 0,
                counter: 0,
                luid_filter,
                primed: false,
                close_fn: None,
            };
        };

        let mut query: PdhQueryHandle = 0;
        let mut counter: PdhCounterHandle = 0;

        let open_status = unsafe { (pdh.open_query)(std::ptr::null(), 0, &mut query) };
        if open_status != 0 || query == 0 {
            return Self {
                query: 0,
                counter: 0,
                luid_filter,
                primed: false,
                close_fn: None,
            };
        }

        let counter_path_w: Vec<u16> = GPU_COUNTER_PATH
            .encode_utf16()
            .chain(std::iter::once(0))
            .collect();

        let add_status = unsafe {
            (pdh.add_counter)(query, counter_path_w.as_ptr(), 0, &mut counter)
        };

        if add_status != 0 {
            unsafe { (pdh.close_query)(query); }
            return Self {
                query: 0,
                counter: 0,
                luid_filter,
                primed: false,
                close_fn: None,
            };
        }

        // Prime initial sample (first PDH collection returns no data)
        unsafe { (pdh.collect_data)(query); }

        Self {
            query,
            counter,
            luid_filter,
            primed: false,
            close_fn: Some(pdh.close_query),
        }
    }

    /// Samples current discrete GPU load as a percentage [0.0, 100.0].
    pub fn sample(&mut self) -> Option<f64> {
        if self.query == 0 || self.counter == 0 {
            return None;
        }

        let Some(pdh) = resolve_pdh() else {
            return None;
        };

        let status = unsafe { (pdh.collect_data)(self.query) };
        if status != 0 {
            return None;
        }

        if !self.primed {
            self.primed = true;
            return None;
        }

        let mut buffer_size = 0u32;
        let mut item_count = 0u32;

        let check_status = unsafe {
            (pdh.get_formatted_array)(
                self.counter,
                PDH_FMT_DOUBLE,
                &mut buffer_size,
                &mut item_count,
                std::ptr::null_mut(),
            )
        };

        if check_status != PDH_MORE_DATA || buffer_size == 0 {
            return None;
        }

        let mut buffer = vec![0u8; buffer_size as usize];
        let query_status = unsafe {
            (pdh.get_formatted_array)(
                self.counter,
                PDH_FMT_DOUBLE,
                &mut buffer_size,
                &mut item_count,
                buffer.as_mut_ptr() as *mut std::ffi::c_void,
            )
        };

        if query_status != 0 {
            return None;
        }

        let items_ptr = buffer.as_ptr() as *const PdhFormattedCounterItemW;
        let mut total_utilization = 0.0f64;

        for i in 0..item_count as usize {
            let item = unsafe { &*items_ptr.add(i) };
            if item.value.c_status != 0 || !item.value.double_value.is_finite() {
                continue;
            }

            if let Some(ref filter) = self.luid_filter {
                if !item.name.is_null() {
                    let mut len = 0;
                    while unsafe { *item.name.add(len) } != 0 {
                        len += 1;
                    }
                    let name = String::from_utf16_lossy(unsafe {
                        std::slice::from_raw_parts(item.name, len)
                    });
                    if !name.to_lowercase().contains(&filter.to_lowercase()) {
                        continue;
                    }
                }
            }

            total_utilization += item.value.double_value;
        }

        Some(total_utilization.clamp(0.0, 100.0))
    }
}

impl Drop for GpuLoadProbe {
    fn drop(&mut self) {
        if self.query != 0 {
            if let Some(close_fn) = self.close_fn {
                unsafe {
                    let _ = close_fn(self.query);
                }
            }
            self.query = 0;
            self.counter = 0;
        }
    }
}

impl Default for GpuLoadProbe {
    fn default() -> Self {
        Self::new()
    }
}

/// Convenience function sampling GPU utilization using a thread-local probe.
pub fn sample_gpu_utilization() -> Option<f64> {
    use std::cell::RefCell;
    thread_local! {
        static PROBE: RefCell<GpuLoadProbe> = RefCell::new(GpuLoadProbe::new());
    }

    PROBE.with(|p| p.borrow_mut().sample())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_gpu_probe_creation_and_drop() {
        let mut probe = GpuLoadProbe::new();
        let _ = probe.sample();
        // Drop must run cleanly with zero handle leaks
    }
}
