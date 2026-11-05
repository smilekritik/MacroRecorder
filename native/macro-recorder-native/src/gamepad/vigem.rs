//! ViGEmClient C-FFI and ViGEmBus virtual gamepad driver interface.
//!
//! Dynamically loads `ViGEmClient.dll` to communicate with the `ViGEmBus` driver.
//! When the driver is missing or unavailable, emits explicit `DriverNotFound` errors.

use std::ffi::c_void;
use std::sync::OnceLock;
use windows::Win32::Foundation::HMODULE;

use crate::error::{IpcErrorCode, NativeError};

extern "system" {
    fn LoadLibraryW(lpLibFileName: *const u16) -> HMODULE;
    fn GetProcAddress(hModule: HMODULE, lpProcName: *const u8) -> *mut c_void;
}

#[allow(non_camel_case_types)]
pub type PVIGEM_CLIENT = *mut c_void;
#[allow(non_camel_case_types)]
pub type PVIGEM_TARGET = *mut c_void;
#[allow(non_camel_case_types)]
pub type VIGEM_ERROR = u32;

pub const VIGEM_ERROR_NONE: VIGEM_ERROR = 0x20000000;
pub const VIGEM_ERROR_BUS_NOT_FOUND: VIGEM_ERROR = 0xE0000001;
pub const VIGEM_ERROR_NO_FREE_SLOT: VIGEM_ERROR = 0xE0000002;
pub const VIGEM_ERROR_INVALID_TARGET: VIGEM_ERROR = 0xE0000003;
pub const VIGEM_ERROR_ALREADY_CONNECTED: VIGEM_ERROR = 0xE0000005;

pub fn vigem_success(err: VIGEM_ERROR) -> bool {
    err == VIGEM_ERROR_NONE
}

/// Raw report submitted to a virtual Xbox 360 controller via ViGEmBus.
#[repr(C)]
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub struct XusbReport {
    pub w_buttons: u16,
    pub b_left_trigger: u8,
    pub b_right_trigger: u8,
    pub s_thumb_lx: i16,
    pub s_thumb_ly: i16,
    pub s_thumb_rx: i16,
    pub s_thumb_ry: i16,
}

/// Raw report submitted to a virtual DualShock 4 controller via ViGEmBus.
#[repr(C)]
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Ds4Report {
    pub b_thumb_lx: u8,
    pub b_thumb_ly: u8,
    pub b_thumb_rx: u8,
    pub b_thumb_ry: u8,
    pub w_buttons: u16,
    pub b_special: u8,
    pub b_trigger_l: u8,
    pub b_trigger_r: u8,
}

impl Default for Ds4Report {
    fn default() -> Self {
        Self {
            b_thumb_lx: 128, // Neutral center
            b_thumb_ly: 128, // Neutral center
            b_thumb_rx: 128, // Neutral center
            b_thumb_ry: 128, // Neutral center
            w_buttons: 0x0008, // D-Pad neutral: DS4_BUTTON_DPAD_NONE = 0x8
            b_special: 0,
            b_trigger_l: 0,
            b_trigger_r: 0,
        }
    }
}

pub type FnVigemAlloc = unsafe extern "system" fn() -> PVIGEM_CLIENT;
pub type FnVigemFree = unsafe extern "system" fn(client: PVIGEM_CLIENT);
pub type FnVigemConnect = unsafe extern "system" fn(client: PVIGEM_CLIENT) -> VIGEM_ERROR;
pub type FnVigemDisconnect = unsafe extern "system" fn(client: PVIGEM_CLIENT);
pub type FnVigemTargetX360Alloc = unsafe extern "system" fn() -> PVIGEM_TARGET;
pub type FnVigemTargetDs4Alloc = unsafe extern "system" fn() -> PVIGEM_TARGET;
pub type FnVigemTargetFree = unsafe extern "system" fn(target: PVIGEM_TARGET);
pub type FnVigemTargetAdd = unsafe extern "system" fn(client: PVIGEM_CLIENT, target: PVIGEM_TARGET) -> VIGEM_ERROR;
pub type FnVigemTargetRemove = unsafe extern "system" fn(client: PVIGEM_CLIENT, target: PVIGEM_TARGET) -> VIGEM_ERROR;
pub type FnVigemTargetX360Update = unsafe extern "system" fn(client: PVIGEM_CLIENT, target: PVIGEM_TARGET, report: XusbReport) -> VIGEM_ERROR;
pub type FnVigemTargetDs4Update = unsafe extern "system" fn(client: PVIGEM_CLIENT, target: PVIGEM_TARGET, report: Ds4Report) -> VIGEM_ERROR;

pub struct ViGEmApi {
    pub alloc: FnVigemAlloc,
    pub free: FnVigemFree,
    pub connect: FnVigemConnect,
    pub disconnect: FnVigemDisconnect,
    pub target_x360_alloc: FnVigemTargetX360Alloc,
    pub target_ds4_alloc: FnVigemTargetDs4Alloc,
    pub target_free: FnVigemTargetFree,
    pub target_add: FnVigemTargetAdd,
    pub target_remove: FnVigemTargetRemove,
    pub target_x360_update: FnVigemTargetX360Update,
    pub target_ds4_update: FnVigemTargetDs4Update,
}

static VIGEM_API: OnceLock<Option<ViGEmApi>> = OnceLock::new();

fn load_vigem_api() -> Option<ViGEmApi> {
    let dll_candidates = [
        "ViGEmClient.dll\0",
        "drivers/ViGEmClient.dll\0",
    ];

    for dll_str in &dll_candidates {
        let utf16: Vec<u16> = dll_str.encode_utf16().collect();
        let hmodule = unsafe { LoadLibraryW(utf16.as_ptr()) };
        if hmodule.is_invalid() || hmodule.0.is_null() {
            continue;
        }

        let resolve = |name: &[u8]| -> *mut c_void {
            unsafe { GetProcAddress(hmodule, name.as_ptr()) }
        };

        let p_alloc = resolve(b"vigem_alloc\0");
        let p_free = resolve(b"vigem_free\0");
        let p_connect = resolve(b"vigem_connect\0");
        let p_disconnect = resolve(b"vigem_disconnect\0");
        let p_x360_alloc = resolve(b"vigem_target_x360_alloc\0");
        let p_ds4_alloc = resolve(b"vigem_target_ds4_alloc\0");
        let p_target_free = resolve(b"vigem_target_free\0");
        let p_target_add = resolve(b"vigem_target_add\0");
        let p_target_remove = resolve(b"vigem_target_remove\0");
        let p_x360_update = resolve(b"vigem_target_x360_update\0");
        let p_ds4_update = resolve(b"vigem_target_ds4_update\0");

        if p_alloc.is_null()
            || p_free.is_null()
            || p_connect.is_null()
            || p_disconnect.is_null()
            || p_x360_alloc.is_null()
            || p_ds4_alloc.is_null()
            || p_target_free.is_null()
            || p_target_add.is_null()
            || p_target_remove.is_null()
            || p_x360_update.is_null()
            || p_ds4_update.is_null()
        {
            continue;
        }

        return Some(ViGEmApi {
            alloc: unsafe { std::mem::transmute(p_alloc) },
            free: unsafe { std::mem::transmute(p_free) },
            connect: unsafe { std::mem::transmute(p_connect) },
            disconnect: unsafe { std::mem::transmute(p_disconnect) },
            target_x360_alloc: unsafe { std::mem::transmute(p_x360_alloc) },
            target_ds4_alloc: unsafe { std::mem::transmute(p_ds4_alloc) },
            target_free: unsafe { std::mem::transmute(p_target_free) },
            target_add: unsafe { std::mem::transmute(p_target_add) },
            target_remove: unsafe { std::mem::transmute(p_target_remove) },
            target_x360_update: unsafe { std::mem::transmute(p_x360_update) },
            target_ds4_update: unsafe { std::mem::transmute(p_ds4_update) },
        });
    }

    None
}

/// Retrieves the dynamically loaded ViGEmClient API if available.
pub fn get_vigem_api() -> Option<&'static ViGEmApi> {
    VIGEM_API.get_or_init(load_vigem_api).as_ref()
}

/// Checks whether the ViGEmBus driver is available without creating a persistent controller.
pub fn is_vigem_driver_available() -> bool {
    let api = match get_vigem_api() {
        Some(a) => a,
        None => return false,
    };
    let client = unsafe { (api.alloc)() };
    if client.is_null() {
        return false;
    }
    let res = unsafe { (api.connect)(client) };
    let connected = vigem_success(res);
    if connected {
        unsafe { (api.disconnect)(client) };
    }
    unsafe { (api.free)(client) };
    connected
}

/// Helper returning the canonical driver unavailable error.
pub fn vigem_driver_unavailable_error() -> NativeError {
    NativeError::new(
        IpcErrorCode::DriverNotFound,
        "The ViGEmBus driver is not installed or unavailable.",
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_driver_availability_probe_does_not_panic() {
        let available = is_vigem_driver_available();
        // On a test machine with no ViGEmBus driver installed, this must cleanly return false
        if !available {
            let err = vigem_driver_unavailable_error();
            assert_eq!(err.code, IpcErrorCode::DriverNotFound);
            assert!(err.message.contains("ViGEmBus"));
        }
    }

    #[test]
    fn test_default_reports_are_neutral() {
        let xusb = XusbReport::default();
        assert_eq!(xusb.w_buttons, 0);
        assert_eq!(xusb.s_thumb_lx, 0);
        assert_eq!(xusb.s_thumb_ly, 0);
        assert_eq!(xusb.s_thumb_rx, 0);
        assert_eq!(xusb.s_thumb_ry, 0);
        assert_eq!(xusb.b_left_trigger, 0);
        assert_eq!(xusb.b_right_trigger, 0);

        let ds4 = Ds4Report::default();
        assert_eq!(ds4.b_thumb_lx, 128); // Centered
        assert_eq!(ds4.b_thumb_ly, 128);
        assert_eq!(ds4.b_thumb_rx, 128);
        assert_eq!(ds4.b_thumb_ry, 128);
        assert_eq!(ds4.w_buttons, 0x0008); // D-Pad neutral (0x8)
        assert_eq!(ds4.b_special, 0);
        assert_eq!(ds4.b_trigger_l, 0);
        assert_eq!(ds4.b_trigger_r, 0);
    }
}
