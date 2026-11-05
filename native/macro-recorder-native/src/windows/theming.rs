//! Native window title bar and border chrome theming via Desktop Window Manager (DWM).
//!
//! Covers:
//! - Applies dark mode to title bar on Windows 10 (build 18985+) and Windows 11
//! - Paints custom caption color, border color, and caption text color on Windows 11
//! - Gracefully ignores unsupported attributes on older Windows builds without throwing

use napi_derive::napi;
use windows::Win32::Foundation::{HMODULE, HWND};

extern "system" {
    fn LoadLibraryW(lpLibFileName: *const u16) -> HMODULE;
    fn GetProcAddress(hModule: HMODULE, lpProcName: *const u8) -> *mut std::ffi::c_void;
}

use crate::error::NativeResult;

const DWMWA_USE_IMMERSIVE_DARK_MODE: u32 = 20;
const DWMWA_BORDER_COLOR: u32 = 34;
const DWMWA_CAPTION_COLOR: u32 = 35;
const DWMWA_TEXT_COLOR: u32 = 36;

#[allow(non_snake_case)]
type FnDwmSetWindowAttribute = unsafe extern "system" fn(
    hwnd: HWND,
    dwAttribute: u32,
    pvAttribute: *const std::ffi::c_void,
    cbAttribute: u32,
) -> i32;

/// Configuration options for native window chrome theming.
#[napi(object)]
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct WindowThemeOptions {
    pub dark_mode: bool,
    pub caption_rgb: u32,
    pub text_rgb: u32,
}

/// Converts a 0x00RRGGBB integer to Win32 GDI/DWM COLORREF format (0x00BBGGRR).
pub fn to_colorref(rgb: u32) -> u32 {
    let r = (rgb >> 16) & 0xFF;
    let g = (rgb >> 8) & 0xFF;
    let b = rgb & 0xFF;
    (b << 16) | (g << 8) | r
}

/// Helper to dynamically resolve `DwmSetWindowAttribute` from `dwmapi.dll`.
fn get_dwm_set_window_attribute() -> Option<FnDwmSetWindowAttribute> {
    let dll_name: Vec<u16> = "dwmapi.dll\0".encode_utf16().collect();
    let module = unsafe { LoadLibraryW(dll_name.as_ptr()) };
    if module.is_invalid() || module.0.is_null() {
        return None;
    }
    let proc_name = std::ffi::CString::new("DwmSetWindowAttribute").ok()?;
    let proc = unsafe { GetProcAddress(module, proc_name.as_ptr() as *const u8) };
    if proc.is_null() {
        return None;
    }
    Some(unsafe { std::mem::transmute(proc) })
}

/// Applies immersive dark mode and caption colors to a native window handle.
pub fn apply_window_theme(
    hwnd: i64,
    dark_mode: bool,
    caption_rgb: u32,
    text_rgb: u32,
) -> NativeResult<()> {
    if hwnd == 0 {
        return Ok(());
    }

    let Some(set_attribute) = get_dwm_set_window_attribute() else {
        return Ok(()); // Older system where dwmapi.dll is unavailable
    };

    let target_hwnd = HWND(hwnd as usize as *mut _);

    // 1. Immersive dark mode (DWMWA_USE_IMMERSIVE_DARK_MODE = 20)
    let dark_val: i32 = if dark_mode { 1 } else { 0 };
    unsafe {
        set_attribute(
            target_hwnd,
            DWMWA_USE_IMMERSIVE_DARK_MODE,
            &dark_val as *const _ as *const std::ffi::c_void,
            std::mem::size_of::<i32>() as u32,
        );
    }

    // 2. Caption color (DWMWA_CAPTION_COLOR = 35) & border color (DWMWA_BORDER_COLOR = 34)
    let caption_colorref = to_colorref(caption_rgb) as i32;
    unsafe {
        set_attribute(
            target_hwnd,
            DWMWA_CAPTION_COLOR,
            &caption_colorref as *const _ as *const std::ffi::c_void,
            std::mem::size_of::<i32>() as u32,
        );
        set_attribute(
            target_hwnd,
            DWMWA_BORDER_COLOR,
            &caption_colorref as *const _ as *const std::ffi::c_void,
            std::mem::size_of::<i32>() as u32,
        );
    }

    // 3. Caption text color (DWMWA_TEXT_COLOR = 36)
    let text_colorref = to_colorref(text_rgb) as i32;
    unsafe {
        set_attribute(
            target_hwnd,
            DWMWA_TEXT_COLOR,
            &text_colorref as *const _ as *const std::ffi::c_void,
            std::mem::size_of::<i32>() as u32,
        );
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_to_colorref_conversion() {
        // Red: 0xFF0000 -> COLORREF 0x0000FF
        assert_eq!(to_colorref(0xFF0000), 0x0000FF);
        // Green: 0x00FF00 -> COLORREF 0x00FF00
        assert_eq!(to_colorref(0x00FF00), 0x00FF00);
        // Blue: 0x0000FF -> COLORREF 0xFF0000
        assert_eq!(to_colorref(0x0000FF), 0xFF0000);
        // Mixed: 0x123456 -> COLORREF 0x563412
        assert_eq!(to_colorref(0x123456), 0x563412);
    }

    #[test]
    fn test_apply_theme_zero_handle_succeeds() {
        assert!(apply_window_theme(0, true, 0x1E1E1E, 0xFFFFFF).is_ok());
    }
}
