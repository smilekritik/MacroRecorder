//! Display DPI inspection and per-monitor awareness.
//!
//! Covers:
//! - Queries system effective DPI (96 = 100% scale)
//! - Queries per-window DPI for multi-monitor mixed-DPI environments
//! - Queries per-monitor DPI for coordinate scaling and trigger normalization

use windows::Win32::Foundation::{HMODULE, HWND, POINT};
use windows::Win32::Graphics::Gdi::{MonitorFromPoint, HMONITOR, MONITOR_DEFAULTTONEAREST};

extern "system" {
    fn LoadLibraryW(lpLibFileName: *const u16) -> HMODULE;
    fn GetProcAddress(hModule: HMODULE, lpProcName: *const u8) -> *mut std::ffi::c_void;
}

/// Base standard DPI (96 DPI corresponds to 100% display scaling in Windows).
pub const DEFAULT_SYSTEM_DPI: u32 = 96;

type FnGetDpiForSystem = unsafe extern "system" fn() -> u32;
type FnGetDpiForWindow = unsafe extern "system" fn(hwnd: HWND) -> u32;
#[allow(non_snake_case)]
type FnGetDpiForMonitor = unsafe extern "system" fn(
    hmonitor: HMONITOR,
    dpiType: i32,
    dpiX: *mut u32,
    dpiY: *mut u32,
) -> i32;

/// Resolves `GetDpiForSystem` dynamically from `user32.dll`.
fn resolve_get_dpi_for_system() -> Option<FnGetDpiForSystem> {
    let dll_name: Vec<u16> = "user32.dll\0".encode_utf16().collect();
    let module = unsafe { LoadLibraryW(dll_name.as_ptr()) };
    if module.is_invalid() || module.0.is_null() {
        return None;
    }
    let proc_name = std::ffi::CString::new("GetDpiForSystem").ok()?;
    let proc = unsafe { GetProcAddress(module, proc_name.as_ptr() as *const u8) };
    if proc.is_null() {
        return None;
    }
    Some(unsafe { std::mem::transmute(proc) })
}

/// Resolves `GetDpiForWindow` dynamically from `user32.dll`.
fn resolve_get_dpi_for_window() -> Option<FnGetDpiForWindow> {
    let dll_name: Vec<u16> = "user32.dll\0".encode_utf16().collect();
    let module = unsafe { LoadLibraryW(dll_name.as_ptr()) };
    if module.is_invalid() || module.0.is_null() {
        return None;
    }
    let proc_name = std::ffi::CString::new("GetDpiForWindow").ok()?;
    let proc = unsafe { GetProcAddress(module, proc_name.as_ptr() as *const u8) };
    if proc.is_null() {
        return None;
    }
    Some(unsafe { std::mem::transmute(proc) })
}

/// Resolves `GetDpiForMonitor` dynamically from `shcore.dll`.
fn resolve_get_dpi_for_monitor() -> Option<FnGetDpiForMonitor> {
    let dll_name: Vec<u16> = "shcore.dll\0".encode_utf16().collect();
    let module = unsafe { LoadLibraryW(dll_name.as_ptr()) };
    if module.is_invalid() || module.0.is_null() {
        return None;
    }
    let proc_name = std::ffi::CString::new("GetDpiForMonitor").ok()?;
    let proc = unsafe { GetProcAddress(module, proc_name.as_ptr() as *const u8) };
    if proc.is_null() {
        return None;
    }
    Some(unsafe { std::mem::transmute(proc) })
}

/// Returns the system effective DPI (96 = 100% scale).
///
/// Falls back to 96 when the API is unavailable or returns 0.
pub fn get_effective_system_dpi() -> u32 {
    if let Some(get_dpi) = resolve_get_dpi_for_system() {
        let dpi = unsafe { get_dpi() };
        if dpi > 0 {
            return dpi;
        }
    }
    DEFAULT_SYSTEM_DPI
}

/// Returns the DPI for the monitor containing the specified window handle.
pub fn get_dpi_for_window(hwnd: i64) -> u32 {
    if hwnd != 0 {
        if let Some(get_dpi) = resolve_get_dpi_for_window() {
            let dpi = unsafe { get_dpi(HWND(hwnd as usize as *mut _)) };
            if dpi > 0 {
                return dpi;
            }
        }
    }
    get_effective_system_dpi()
}

/// Returns the DPI for the monitor displaying the given screen coordinates `(x, y)`.
pub fn get_dpi_for_point(x: i32, y: i32) -> u32 {
    let point = POINT { x, y };
    let monitor = unsafe { MonitorFromPoint(point, MONITOR_DEFAULTTONEAREST) };

    if !monitor.is_invalid() && !monitor.0.is_null() {
        if let Some(get_dpi) = resolve_get_dpi_for_monitor() {
            let mut dpi_x = 0u32;
            let mut dpi_y = 0u32;
            // 0 corresponds to MDT_EFFECTIVE_DPI
            let hr = unsafe { get_dpi(monitor, 0, &mut dpi_x, &mut dpi_y) };
            if hr == 0 && dpi_x > 0 {
                return dpi_x;
            }
        }
    }

    get_effective_system_dpi()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_effective_dpi_non_zero() {
        let dpi = get_effective_system_dpi();
        assert!(dpi >= 96, "DPI must be at least 96, got: {dpi}");
        assert!(dpi % 24 == 0 || dpi == 96, "Typical Windows DPIs are multiples of 24 (96, 120, 144, etc.), got: {dpi}");
    }

    #[test]
    fn test_dpi_for_window_zero_falls_back() {
        assert_eq!(get_dpi_for_window(0), get_effective_system_dpi());
    }

    #[test]
    fn test_dpi_for_origin_point() {
        let dpi = get_dpi_for_point(0, 0);
        assert!(dpi >= 96);
    }
}
