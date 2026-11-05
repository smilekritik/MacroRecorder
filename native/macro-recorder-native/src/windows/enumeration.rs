//! Window enumeration, stable matching, handle discovery, and activation.
//!
//! Covers:
//! - Window enumeration with visibility, title, and process filtering
//! - Stable two-pass window matching (exact title, then substring)
//! - Focus/activation restoration for minimized (iconic) windows
//! - Detection of input-ignoring window classes (Chromium/Electron, UWP)

use napi_derive::napi;
use windows::Win32::Foundation::{BOOL, HWND, LPARAM, TRUE};
use windows::Win32::UI::WindowsAndMessaging::{
    EnumWindows, GetClassNameW, GetWindowTextLengthW, GetWindowTextW, GetWindowThreadProcessId,
    IsIconic, IsWindowVisible, SetForegroundWindow, ShowWindow, SW_RESTORE,
};

use crate::error::NativeResult;
use crate::windows::process::get_process_name;

/// Information about an open top-level application window.
///
#[napi(object)]
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct OpenWindowInfo {
    pub handle: i64,
    pub title: String,
    pub process_name: String,
    pub process_id: u32,
    pub class_name: Option<String>,
}

impl OpenWindowInfo {
    /// Formats a readable display name: `Title — ProcessName`.
    pub fn display_name(&self) -> String {
        format!("{}  —  {}", self.title, self.process_name)
    }
}

/// Enumerates visible top-level application windows with titles, excluding optional PID.
///
/// Returns a stably sorted list (by `process_name` case-insensitive, then by `title`).
pub fn get_open_windows(excluded_process_id: Option<u32>) -> NativeResult<Vec<OpenWindowInfo>> {
    struct EnumContext {
        excluded_pid: Option<u32>,
        windows: Vec<OpenWindowInfo>,
    }

    let mut context = EnumContext {
        excluded_pid: excluded_process_id,
        windows: Vec::new(),
    };

    unsafe extern "system" fn enum_proc(hwnd: HWND, lparam: LPARAM) -> BOOL {
        let ctx = &mut *(lparam.0 as *mut EnumContext);

        if !IsWindowVisible(hwnd).as_bool() {
            return TRUE;
        }

        let text_len = GetWindowTextLengthW(hwnd);
        if text_len == 0 {
            return TRUE;
        }

        let mut pid = 0u32;
        unsafe { GetWindowThreadProcessId(hwnd, Some(&mut pid)) };
        if pid == 0 {
            return TRUE;
        }

        if let Some(excluded) = ctx.excluded_pid {
            if pid == excluded {
                return TRUE;
            }
        }

        let mut title_buf = vec![0u16; (text_len + 1) as usize];
        let copied = unsafe { GetWindowTextW(hwnd, &mut title_buf) };
        if copied == 0 {
            return TRUE;
        }

        let title = String::from_utf16_lossy(&title_buf[..copied as usize])
            .trim()
            .to_string();
        if title.is_empty() {
            return TRUE;
        }

        let process_name = get_process_name(pid);
        let class_name = class_name_of(hwnd.0 as usize as i64).ok();

        ctx.windows.push(OpenWindowInfo {
            handle: hwnd.0 as usize as i64,
            title,
            process_name,
            process_id: pid,
            class_name,
        });

        TRUE
    }

    unsafe {
        let _ = EnumWindows(
            Some(enum_proc),
            LPARAM(&mut context as *mut EnumContext as isize),
        );
    }

    // Stable sorting matching WindowCatalog.GetOpenWindows:
    // .OrderBy(w => w.ProcessName, StringComparer.CurrentCultureIgnoreCase)
    // .ThenBy(w => w.Title, StringComparer.CurrentCultureIgnoreCase)
    context.windows.sort_by(|a, b| {
        match a.process_name.to_lowercase().cmp(&b.process_name.to_lowercase()) {
            std::cmp::Ordering::Equal => a.title.to_lowercase().cmp(&b.title.to_lowercase()),
            other => other,
        }
    });

    Ok(context.windows)
}

/// Helper closure to test if a window's process name matches the target process name,
/// ignoring case and tolerating absent or present `.exe` extensions.
fn process_names_match(actual: &str, target: &str) -> bool {
    if actual.eq_ignore_ascii_case(target) {
        return true;
    }
    let actual_base = actual.strip_suffix(".exe").unwrap_or(actual);
    let target_base = target.strip_suffix(".exe").unwrap_or(target);
    actual_base.eq_ignore_ascii_case(target_base)
}

/// Stable matching for a window by process name and title.
///
/// 1. Exact match on process name AND exact match on window title (case-insensitive)
/// 2. Fallback: exact match on process name AND substring match on window title (case-insensitive)
pub fn match_window(process_name: &str, window_title: &str) -> NativeResult<Option<OpenWindowInfo>> {
    let windows = get_open_windows(None)?;

    // Pass 1: exact process and exact title
    if let Some(target) = windows.iter().find(|w| {
        process_names_match(&w.process_name, process_name)
            && w.title.eq_ignore_ascii_case(window_title)
    }) {
        return Ok(Some(target.clone()));
    }

    // Pass 2: exact process and substring title match (either contains the other)
    let target_title_lower = window_title.to_lowercase();
    if let Some(target) = windows.iter().find(|w| {
        if !process_names_match(&w.process_name, process_name) {
            return false;
        }
        let w_title_lower = w.title.to_lowercase();
        w_title_lower.contains(&target_title_lower) || target_title_lower.contains(&w_title_lower)
    }) {
        return Ok(Some(target.clone()));
    }

    Ok(None)
}

/// Finds the HWND of a target window matching process and title, or returns `None`.
pub fn find_handle(process_name: &str, window_title: &str) -> NativeResult<Option<i64>> {
    Ok(match_window(process_name, window_title)?.map(|w| w.handle))
}

/// Attempts to activate and bring to front a window matching process name and title.
///
/// If the window is minimized (iconic), restores it via `SW_RESTORE` first.
/// Returns `true` if a matching window was found and foregrounded, `false` otherwise.
pub fn try_activate(process_name: &str, window_title: &str) -> NativeResult<bool> {
    let target = match match_window(process_name, window_title)? {
        Some(t) => t,
        None => return Ok(false),
    };

    let hwnd = HWND(target.handle as usize as *mut _);

    // If minimized, restore first (matching IsIconic -> ShowWindow(SwRestore))
    if unsafe { IsIconic(hwnd).as_bool() } {
        unsafe { let _ = ShowWindow(hwnd, SW_RESTORE); };
    }

    let success = unsafe { SetForegroundWindow(hwnd).as_bool() };
    Ok(success)
}

/// Retrieves the Win32 window class name for a given window handle.
pub fn class_name_of(handle: i64) -> NativeResult<String> {
    if handle == 0 {
        return Ok(String::new());
    }

    let hwnd = HWND(handle as usize as *mut _);
    let mut buffer = [0u16; 256];
    let len = unsafe { GetClassNameW(hwnd, &mut buffer) };

    if len > 0 {
        Ok(String::from_utf16_lossy(&buffer[..len as usize]))
    } else {
        Ok(String::new())
    }
}

/// Checks if a window is known to ignore background posted messages (`WM_KEYDOWN`, `WM_CHAR`).
///
/// Chromium/Electron windows (`Chrome_WidgetWin*`) and UWP application frames
/// (`ApplicationFrameWindow`, `Windows.UI.Core.CoreWindow`) swallow or bypass standard
/// Win32 message queue processing.
pub fn ignores_posted_input(process_name: &str, window_title: &str) -> NativeResult<bool> {
    let handle = match find_handle(process_name, window_title)? {
        Some(h) => h,
        None => return Ok(false),
    };

    let class_name = class_name_of(handle)?;
    Ok(class_name.starts_with("Chrome_WidgetWin")
        || class_name == "ApplicationFrameWindow"
        || class_name == "Windows.UI.Core.CoreWindow")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_process_names_match() {
        assert!(process_names_match("notepad.exe", "notepad"));
        assert!(process_names_match("notepad", "notepad.exe"));
        assert!(process_names_match("Code.exe", "code.exe"));
        assert!(process_names_match("game", "GAME"));
        assert!(!process_names_match("notepad.exe", "calc.exe"));
    }

    #[test]
    fn test_get_open_windows_returns_valid_entries() {
        let windows = get_open_windows(None).expect("get_open_windows must succeed");
        // On an interactive Windows session, there should normally be at least one open window (e.g. explorer, IDE)
        for w in &windows {
            assert!(w.handle != 0);
            assert!(!w.title.is_empty());
            assert!(w.process_id > 0);
        }
    }

    #[test]
    fn test_open_window_display_name() {
        let info = OpenWindowInfo {
            handle: 12345,
            title: "Document".to_string(),
            process_name: "notepad.exe".to_string(),
            process_id: 42,
            class_name: Some("Notepad".to_string()),
        };
        assert_eq!(info.display_name(), "Document  —  notepad.exe");
    }

    #[test]
    fn test_class_name_of_zero_is_empty() {
        assert_eq!(class_name_of(0).unwrap(), "");
    }
}
