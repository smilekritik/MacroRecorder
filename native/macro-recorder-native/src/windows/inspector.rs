//! Window inspector and cursor probe services.
//!
//! of the window, control, client coordinates, and pixel color under the mouse cursor.

use napi_derive::napi;
use windows::Win32::Foundation::{BOOL, HWND, POINT, RECT};
use windows::Win32::Graphics::Gdi::{GetDC, GetPixel, ReleaseDC, CLR_INVALID};
use windows::Win32::UI::WindowsAndMessaging::{
    GetAncestor, GetClassNameW, GetClientRect, GetCursorPos, GetForegroundWindow,
    GetWindowRect, GetWindowTextLengthW, GetWindowTextW, GetWindowThreadProcessId,
    WindowFromPoint, GA_ROOT,
};

#[link(name = "user32")]
extern "system" {
    fn ScreenToClient(hwnd: HWND, lppoint: *mut POINT) -> BOOL;
}

use crate::error::NativeResult;
use crate::windows::process::get_process_name;

/// Detailed diagnostic snapshot of a window, child control, and screen coordinates.
///
#[napi(object)]
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct WindowInspectionSnapshot {
    pub is_self: bool,
    pub title: String,
    pub class_name: String,
    pub process_name: String,
    pub process_id: u32,
    pub mouse_screen_x: i32,
    pub mouse_screen_y: i32,
    pub mouse_window_x: i32,
    pub mouse_window_y: i32,
    pub mouse_client_x: i32,
    pub mouse_client_y: i32,
    pub rgb: i32,
    pub window_x: i32,
    pub window_y: i32,
    pub window_width: i32,
    pub window_height: i32,
    pub client_width: i32,
    pub client_height: i32,
    pub control_class: String,
    pub control_x: i32,
    pub control_y: i32,
    pub control_width: i32,
    pub control_height: i32,
    pub hex: String,
}

/// Helper to safely read a pixel at `(x, y)` from desktop DC, returning -1 on failure.
fn read_pixel_color(x: i32, y: i32) -> i32 {
    let dc = unsafe { GetDC(HWND(std::ptr::null_mut())) };
    if dc.is_invalid() || dc.0.is_null() {
        return -1;
    }

    struct DcGuard(windows::Win32::Graphics::Gdi::HDC);
    impl Drop for DcGuard {
        fn drop(&mut self) {
            unsafe {
                let _ = ReleaseDC(HWND(std::ptr::null_mut()), self.0);
            }
        }
    }
    let _guard = DcGuard(dc);

    let color_ref = unsafe { GetPixel(dc, x, y) };
    if color_ref.0 == CLR_INVALID {
        return -1;
    }

    // Windows COLORREF is 0x00bbggrr; convert to standard RGB 0x00rrggbb
    let r = (color_ref.0 & 0xFF) as i32;
    let g = ((color_ref.0 >> 8) & 0xFF) as i32;
    let b = ((color_ref.0 >> 16) & 0xFF) as i32;
    (r << 16) | (g << 8) | b
}

/// Captures a complete snapshot of the target window and control under the cursor.
///
/// - `follow_mouse`: if true, targets the window under cursor; if false, targets active foreground window.
/// - `self_handle`: handle of tool window to ignore self-inspection.
/// - `owner_handle`: handle of owner window to ignore self-inspection.
pub fn capture_window_inspection(
    follow_mouse: bool,
    self_handle: Option<i64>,
    owner_handle: Option<i64>,
) -> NativeResult<WindowInspectionSnapshot> {
    let mut cursor = POINT { x: 0, y: 0 };
    unsafe { let _ = GetCursorPos(&mut cursor); };

    let control_handle = unsafe { WindowFromPoint(cursor) };
    let target = if follow_mouse {
        if control_handle.0.is_null() {
            HWND(std::ptr::null_mut())
        } else {
            unsafe { GetAncestor(control_handle, GA_ROOT) }
        }
    } else {
        unsafe { GetForegroundWindow() }
    };

    let target_val = target.0 as usize as i64;
    let is_self = !target.0.is_null()
        && (self_handle == Some(target_val) || owner_handle == Some(target_val));

    // Title of target window
    let title = if !target.0.is_null() {
        let text_len = unsafe { GetWindowTextLengthW(target) };
        if text_len > 0 {
            let mut buf = vec![0u16; (text_len + 1) as usize];
            let copied = unsafe { GetWindowTextW(target, &mut buf) };
            String::from_utf16_lossy(&buf[..copied as usize])
        } else {
            String::new()
        }
    } else {
        String::new()
    };

    // Class name of target window
    let class_name = if !target.0.is_null() {
        let mut buf = [0u16; 256];
        let len = unsafe { GetClassNameW(target, &mut buf) };
        if len > 0 {
            String::from_utf16_lossy(&buf[..len as usize])
        } else {
            String::new()
        }
    } else {
        String::new()
    };

    // Process ID and name of target window
    let mut process_id = 0u32;
    let process_name = if !target.0.is_null() {
        unsafe { GetWindowThreadProcessId(target, Some(&mut process_id)) };
        if process_id != 0 {
            get_process_name(process_id)
        } else {
            String::new()
        }
    } else {
        String::new()
    };

    // Window geometry
    let mut window_rect = RECT::default();
    if !target.0.is_null() {
        unsafe { let _ = GetWindowRect(target, &mut window_rect); };
    }

    let mut client_rect = RECT::default();
    if !target.0.is_null() {
        unsafe { let _ = GetClientRect(target, &mut client_rect); };
    }

    // Client mouse coordinates
    let mut client_point = cursor;
    if !target.0.is_null() {
        unsafe { let _ = ScreenToClient(target, &mut client_point); };
    }

    // Pixel color
    let rgb = read_pixel_color(cursor.x, cursor.y);

    // Control information
    let control_class = if !control_handle.0.is_null() {
        let mut buf = [0u16; 256];
        let len = unsafe { GetClassNameW(control_handle, &mut buf) };
        if len > 0 {
            String::from_utf16_lossy(&buf[..len as usize])
        } else {
            String::new()
        }
    } else {
        String::new()
    };

    let mut control_rect = RECT::default();
    if !control_handle.0.is_null() {
        unsafe { let _ = GetWindowRect(control_handle, &mut control_rect); };
    }

    let hex = if rgb < 0 {
        "—".to_string()
    } else {
        format!("#{:06X}", rgb & 0xFFFFFF)
    };

    Ok(WindowInspectionSnapshot {
        is_self,
        title,
        class_name,
        process_name,
        process_id,
        mouse_screen_x: cursor.x,
        mouse_screen_y: cursor.y,
        mouse_window_x: cursor.x - window_rect.left,
        mouse_window_y: cursor.y - window_rect.top,
        mouse_client_x: client_point.x,
        mouse_client_y: client_point.y,
        rgb,
        window_x: window_rect.left,
        window_y: window_rect.top,
        window_width: (window_rect.right - window_rect.left).max(0),
        window_height: (window_rect.bottom - window_rect.top).max(0),
        client_width: (client_rect.right - client_rect.left).max(0),
        client_height: (client_rect.bottom - client_rect.top).max(0),
        control_class,
        control_x: control_rect.left,
        control_y: control_rect.top,
        control_width: (control_rect.right - control_rect.left).max(0),
        control_height: (control_rect.bottom - control_rect.top).max(0),
        hex,
    })
}

/// Lightweight probe returning the process name of the window under the cursor.
pub fn process_under_cursor() -> NativeResult<String> {
    let mut point = POINT { x: 0, y: 0 };
    unsafe { let _ = GetCursorPos(&mut point); };

    let handle = unsafe { WindowFromPoint(point) };
    if handle.0.is_null() {
        return Ok(String::new());
    }

    let root = unsafe { GetAncestor(handle, GA_ROOT) };
    if root.0.is_null() {
        return Ok(String::new());
    }

    let mut pid = 0u32;
    unsafe { GetWindowThreadProcessId(root, Some(&mut pid)) };
    if pid == 0 {
        return Ok(String::new());
    }

    Ok(get_process_name(pid))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_capture_window_inspection_smoke() {
        let snapshot = capture_window_inspection(false, None, None)
            .expect("capture_window_inspection must succeed");
        // Coordinates and dimensions should be finite integers
        assert!(snapshot.window_width >= 0);
        assert!(snapshot.window_height >= 0);
        assert!(snapshot.client_width >= 0);
        assert!(snapshot.client_height >= 0);
        if snapshot.rgb >= 0 {
            assert!(snapshot.hex.starts_with('#'));
            assert_eq!(snapshot.hex.len(), 7);
        } else {
            assert_eq!(snapshot.hex, "—");
        }
    }

    #[test]
    fn test_process_under_cursor_smoke() {
        let _ = process_under_cursor();
    }
}
