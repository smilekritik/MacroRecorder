//! Foreground window tracking, inspection, and condition matching.
//!
//! and supports WaitForWindow condition evaluations.

use napi_derive::napi;
use windows::Win32::UI::WindowsAndMessaging::{
    GetClassNameW, GetForegroundWindow, GetWindowTextLengthW, GetWindowTextW,
    GetWindowThreadProcessId,
};

use crate::error::NativeResult;
use crate::windows::process::get_process_name;

/// Snapshot of the currently focused foreground window.
#[napi(object)]
#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct ForegroundWindowSnapshot {
    pub handle: i64,
    pub title: String,
    pub process_name: String,
    pub process_id: u32,
    pub class_name: String,
}

/// Retrieves the raw HWND of the current foreground window.
pub fn get_foreground_window() -> i64 {
    unsafe { GetForegroundWindow().0 as usize as i64 }
}

/// Inspects the current foreground window, extracting handle, title, process name, and class name.
pub fn get_foreground_window_info() -> NativeResult<ForegroundWindowSnapshot> {
    let hwnd = unsafe { GetForegroundWindow() };
    if hwnd.0.is_null() {
        return Ok(ForegroundWindowSnapshot::default());
    }

    let mut pid = 0u32;
    unsafe { GetWindowThreadProcessId(hwnd, Some(&mut pid)) };

    let text_len = unsafe { GetWindowTextLengthW(hwnd) };
    let title = if text_len > 0 {
        let mut buf = vec![0u16; (text_len + 1) as usize];
        let copied = unsafe { GetWindowTextW(hwnd, &mut buf) };
        String::from_utf16_lossy(&buf[..copied as usize])
            .trim()
            .to_string()
    } else {
        String::new()
    };

    let mut class_buf = [0u16; 256];
    let class_len = unsafe { GetClassNameW(hwnd, &mut class_buf) };
    let class_name = if class_len > 0 {
        String::from_utf16_lossy(&class_buf[..class_len as usize])
    } else {
        String::new()
    };

    let process_name = if pid != 0 {
        get_process_name(pid)
    } else {
        String::new()
    };

    Ok(ForegroundWindowSnapshot {
        handle: hwnd.0 as usize as i64,
        title,
        process_name,
        process_id: pid,
        class_name,
    })
}

/// Returns `true` if the specified handle is currently the foreground window.
pub fn is_foreground_window(hwnd: i64) -> bool {
    get_foreground_window() == hwnd
}

/// Evaluates whether the current foreground window matches target criteria.
///
/// Used for `WaitForWindow` macro event evaluation:
/// - If `process_name` is provided, asserts case-insensitive match (with or without `.exe`).
/// - If `window_title` is provided, asserts case-insensitive substring or exact match.
pub fn matches_foreground(process_name: Option<&str>, window_title: Option<&str>) -> bool {
    let Ok(info) = get_foreground_window_info() else {
        return false;
    };

    if info.handle == 0 {
        return false;
    }

    if let Some(target_proc) = process_name {
        if !target_proc.is_empty() {
            let p_base = target_proc.strip_suffix(".exe").unwrap_or(target_proc);
            let info_p_base = info
                .process_name
                .strip_suffix(".exe")
                .unwrap_or(&info.process_name);

            let proc_matched = target_proc.eq_ignore_ascii_case(&info.process_name)
                || p_base.eq_ignore_ascii_case(info_p_base);

            if !proc_matched {
                return false;
            }
        }
    }

    if let Some(target_title) = window_title {
        if !target_title.is_empty() {
            let t_lower = target_title.to_lowercase();
            let info_t_lower = info.title.to_lowercase();

            let title_matched =
                info_t_lower.contains(&t_lower) || t_lower.contains(&info_t_lower);

            if !title_matched {
                return false;
            }
        }
    }

    true
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_get_foreground_window_smoke() {
        let handle = get_foreground_window();
        // May be 0 if running in non-interactive environment, but should not panic
        let info = get_foreground_window_info().expect("Must not error");
        assert_eq!(info.handle, handle);
    }

    #[test]
    fn test_matches_foreground_none_criteria() {
        // If foreground exists, empty criteria should match
        if get_foreground_window() != 0 {
            assert!(matches_foreground(None, None));
            assert!(matches_foreground(Some(""), Some("")));
        }
    }
}
