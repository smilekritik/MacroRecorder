//! Focused child discovery and keyboard target resolution.
//!
//! Provides the directed-mode keyboard routing logic from `WindowsInputInjector.ResolveKeyboardTarget`:
//! 1. Foreground fast path via `GetGUIThreadInfo`
//! 2. Background attached queue path via `AttachThreadInput` + `GetFocus`
//! 3. Child window discovery searching for text controls (`Edit`, `RichEdit`, `Scintilla`, `TextBox`)

use windows::Win32::Foundation::{BOOL, FALSE, HWND, LPARAM, TRUE};
use windows::Win32::System::Threading::GetCurrentThreadId;
use windows::Win32::UI::Input::KeyboardAndMouse::GetFocus;
use windows::Win32::UI::WindowsAndMessaging::{
    EnumChildWindows, GetClassNameW, GetGUIThreadInfo, GetWindowThreadProcessId, GUITHREADINFO,
};

extern "system" {
    fn AttachThreadInput(idAttach: u32, idAttachTo: u32, fAttach: BOOL) -> BOOL;
}

/// Resolves the true keyboard message recipient for a given top-level or parent window.
///
/// In classic Win32 applications (e.g. Notepad), keyboard input directed to the top frame
/// window is lost because child controls handle typing. This function discovers:
/// 1. The focused control in the foreground queue
/// 2. The focused control in a background queue via thread input attachment
/// 3. The first editable child control (`Edit`, `RichEdit`, `Scintilla`, `TextBox`)
///
/// If no specialized child is found, returns `hwnd` itself.
pub fn resolve_keyboard_target(hwnd: i64) -> i64 {
    if hwnd == 0 {
        return 0;
    }

    let target_hwnd = HWND(hwnd as usize as *mut _);
    let mut target_pid = 0u32;
    let target_thread = unsafe { GetWindowThreadProcessId(target_hwnd, Some(&mut target_pid)) };

    if target_thread == 0 {
        return hwnd;
    }

    // 1. Fast path: If the window or its thread has foreground focus, GetGUIThreadInfo reveals it
    let mut info = GUITHREADINFO {
        cbSize: std::mem::size_of::<GUITHREADINFO>() as u32,
        ..Default::default()
    };
    if unsafe { GetGUIThreadInfo(target_thread, &mut info).is_ok() }
        && !info.hwndFocus.0.is_null()
    {
        return info.hwndFocus.0 as usize as i64;
    }

    // 2. Background path: Attach thread input queue to take GetFocus from background thread
    let current_thread = unsafe { GetCurrentThreadId() };
    if current_thread != target_thread {
        let attached = unsafe { AttachThreadInput(current_thread, target_thread, TRUE) };
        if attached.as_bool() {
            let focus = unsafe { GetFocus() };
            let _ = unsafe { AttachThreadInput(current_thread, target_thread, FALSE) };
            if !focus.0.is_null() {
                return focus.0 as usize as i64;
            }
        }
    }

    // 3. Fallback: Search child controls for classic editable classes (Edit, Scintilla, TextBox)
    if let Some(editable_child) = find_editable_child(hwnd) {
        return editable_child;
    }

    hwnd
}

/// Discovers the first child window belonging to an editable text class.
///
/// Searches for class names containing `Edit`, `Scintilla`, or `TextBox` (case-insensitive).
pub fn find_editable_child(parent_hwnd: i64) -> Option<i64> {
    if parent_hwnd == 0 {
        return None;
    }

    let parent = HWND(parent_hwnd as usize as *mut _);
    let mut found_hwnd: Option<i64> = None;

    unsafe extern "system" fn enum_child_proc(hwnd: HWND, lparam: LPARAM) -> BOOL {
        let result_ptr = &mut *(lparam.0 as *mut Option<i64>);
        let mut class_buf = [0u16; 64];
        let len = GetClassNameW(hwnd, &mut class_buf);

        if len > 0 {
            let class_name = String::from_utf16_lossy(&class_buf[..len as usize]);
            let lower = class_name.to_lowercase();
            if lower.contains("edit") || lower.contains("scintilla") || lower.contains("textbox") {
                *result_ptr = Some(hwnd.0 as usize as i64);
                return FALSE; // Stop enumeration immediately
            }
        }

        TRUE
    }

    unsafe {
        let _ = EnumChildWindows(
            parent,
            Some(enum_child_proc),
            LPARAM(&mut found_hwnd as *mut Option<i64> as isize),
        );
    }

    found_hwnd
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_resolve_keyboard_target_zero_returns_zero() {
        assert_eq!(resolve_keyboard_target(0), 0);
    }

    #[test]
    fn test_find_editable_child_zero_returns_none() {
        assert_eq!(find_editable_child(0), None);
    }
}
