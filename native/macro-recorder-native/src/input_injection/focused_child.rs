//! Resolution of the focused child control for HWND-targeted background keyboard input.
//!
//! Replicates the AutoHotkey ControlSend technique:
//! - Never activates or steals focus from the foreground window.
//! - Checks `GetGUIThreadInfo` for active threads.
//! - Temporarily attaches thread input queues via `AttachThreadInput` to query `GetFocus`.
//! - Recursively enumerates child windows to locate Edit / RichEdit / Scintilla controls
//!   in inactive windows.
//! - Safely falls back to the top-level HWND if no focused child exists.

use windows::Win32::Foundation::{BOOL, HWND, LPARAM};
use windows::Win32::System::Threading::{AttachThreadInput, GetCurrentThreadId};
use windows::Win32::UI::Input::KeyboardAndMouse::GetFocus;
use windows::Win32::UI::WindowsAndMessaging::{
    EnumChildWindows, GetClassNameW, GetGUIThreadInfo, GetWindowThreadProcessId, GUITHREADINFO,
};

/// Resolves the destination HWND for keyboard messages targeted to `hwnd`.
///
/// Ensures input is delivered directly to the child edit control without stealing focus
/// or activating the target application.
pub fn resolve_keyboard_target(hwnd: HWND) -> HWND {
    if hwnd.is_invalid() || hwnd.0.is_null() {
        return hwnd;
    }

    let mut target_pid = 0u32;
    let target_thread = unsafe { GetWindowThreadProcessId(hwnd, Some(&mut target_pid)) };
    if target_thread == 0 {
        return hwnd;
    }

    // 1. Fast path: if the window/thread is active, GetGUIThreadInfo returns focus directly
    let mut info = GUITHREADINFO {
        cbSize: std::mem::size_of::<GUITHREADINFO>() as u32,
        ..Default::default()
    };
    if unsafe { GetGUIThreadInfo(target_thread, &mut info).is_ok() }
        && !info.hwndFocus.is_invalid()
        && !info.hwndFocus.0.is_null()
    {
        return info.hwndFocus;
    }

    // 2. Background path: temporarily attach input queues to inspect GetFocus
    let current_thread = unsafe { GetCurrentThreadId() };
    if current_thread != target_thread {
        let attached = unsafe { AttachThreadInput(current_thread, target_thread, true).as_bool() };
        if attached {
            let focus = unsafe { GetFocus() };
            unsafe {
                let _ = AttachThreadInput(current_thread, target_thread, false);
            }
            if !focus.is_invalid() && !focus.0.is_null() {
                return focus;
            }
        }
    }

    // 3. Fallback: search child controls for classic editable classes (Edit, RichEdit, Scintilla, TextBox)
    if let Some(editable) = find_editable_child(hwnd) {
        return editable;
    }

    // 4. Ultimate fallback: the window itself
    hwnd
}

/// Enumerates child windows searching for standard text editing controls.
pub fn find_editable_child(parent: HWND) -> Option<HWND> {
    struct SearchContext {
        found: Option<HWND>,
    }

    unsafe extern "system" fn enum_child_proc(child: HWND, lparam: LPARAM) -> BOOL {
        let ctx = &mut *(lparam.0 as *mut SearchContext);
        let mut name_buf = [0u16; 64];
        let len = GetClassNameW(child, &mut name_buf);
        if len > 0 {
            let class_name = String::from_utf16_lossy(&name_buf[..len as usize]);
            let lower = class_name.to_ascii_lowercase();
            if lower.contains("edit") || lower.contains("scintilla") || lower.contains("textbox") {
                ctx.found = Some(child);
                return BOOL(0); // Stop enumeration
            }
        }
        BOOL(1) // Continue enumeration
    }

    let mut context = SearchContext { found: None };
    unsafe {
        let _ = EnumChildWindows(
            parent,
            Some(enum_child_proc),
            LPARAM(&mut context as *mut SearchContext as isize),
        );
    }

    context.found
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_resolve_keyboard_target_null_hwnd_returns_null() {
        let null_hwnd = HWND(std::ptr::null_mut());
        assert_eq!(resolve_keyboard_target(null_hwnd), null_hwnd);
    }
}
