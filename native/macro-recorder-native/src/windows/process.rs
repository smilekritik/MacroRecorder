//! Safe Windows process metadata queries and lifetime inspection.
//!
//! Provides non-panicking, bounded-overhead process name and executable path inspection,
//! guaranteeing zero handle leaks via RAII wrappers.

use std::path::Path;
use windows::Win32::Foundation::{CloseHandle, BOOL, HANDLE};
use windows::Win32::System::Threading::{
    GetExitCodeProcess, OpenProcess, PROCESS_QUERY_LIMITED_INFORMATION,
};

/// RAII wrapper around a Win32 `HANDLE` ensuring `CloseHandle` is always called on drop.
#[derive(Debug)]
pub struct AutoHandle(pub HANDLE);

impl AutoHandle {
    /// Returns the wrapped raw handle.
    pub fn handle(&self) -> HANDLE {
        self.0
    }

    /// Returns `true` if the handle is valid and non-null.
    pub fn is_valid(&self) -> bool {
        !self.0.is_invalid() && !self.0 .0.is_null()
    }
}

impl Drop for AutoHandle {
    fn drop(&mut self) {
        if self.is_valid() {
            unsafe {
                let _ = CloseHandle(self.0);
            }
        }
    }
}

extern "system" {
    fn QueryFullProcessImageNameW(
        hProcess: HANDLE,
        dwFlags: u32,
        lpExeName: *mut u16,
        lpdwSize: *mut u32,
    ) -> BOOL;
}

/// Safely queries the process executable name for a given PID.
///
/// Returns the file name (e.g. `notepad.exe`) without directory paths.
/// If the process cannot be inspected (e.g. PID 0, terminated, or permission denied),
/// an empty string is returned without throwing or leaking handles.
pub fn get_process_name(pid: u32) -> String {
    if pid == 0 {
        return String::new();
    }

    let full_path = get_process_image_path(pid);
    match full_path {
        Some(path) => Path::new(&path)
            .file_name()
            .and_then(|f| f.to_str())
            .unwrap_or("")
            .to_string(),
        None => String::new(),
    }
}

/// Safely queries the full executable path for a given PID.
///
/// Returns `Some(path)` if successful, or `None` if inaccessible or terminated.
pub fn get_process_image_path(pid: u32) -> Option<String> {
    if pid == 0 {
        return None;
    }

    let raw_handle = unsafe { OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid) };
    let handle = match raw_handle {
        Ok(h) if !h.is_invalid() && !h.0.is_null() => AutoHandle(h),
        _ => return None,
    };

    let mut buffer = [0u16; 1024];
    let mut size = buffer.len() as u32;

    let success = unsafe {
        QueryFullProcessImageNameW(handle.handle(), 0, buffer.as_mut_ptr(), &mut size)
    };

    if success.as_bool() && size > 0 {
        Some(String::from_utf16_lossy(&buffer[..size as usize]))
    } else {
        None
    }
}

/// Checks whether a process with the specified PID is currently running.
pub fn is_process_alive(pid: u32) -> bool {
    if pid == 0 {
        return false;
    }

    let raw_handle = unsafe { OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid) };
    let handle = match raw_handle {
        Ok(h) if !h.is_invalid() && !h.0.is_null() => AutoHandle(h),
        _ => return false,
    };

    let mut exit_code = 0u32;
    let ok = unsafe { GetExitCodeProcess(handle.handle(), &mut exit_code) };
    if ok.is_err() {
        return false;
    }

    // 259 corresponds to STILL_ACTIVE
    exit_code == 259
}

#[cfg(test)]
mod tests {
    use super::*;
    use windows::Win32::System::Threading::GetCurrentProcessId;

    #[test]
    fn test_current_process_name() {
        let pid = unsafe { GetCurrentProcessId() };
        let name = get_process_name(pid);
        assert!(!name.is_empty(), "Current process name must not be empty");
        assert!(
            name.ends_with(".exe") || !name.contains('\\'),
            "Expected executable name, got: {name}"
        );
    }

    #[test]
    fn test_current_process_alive() {
        let pid = unsafe { GetCurrentProcessId() };
        assert!(is_process_alive(pid));
    }

    #[test]
    fn test_invalid_process_pid_zero() {
        assert_eq!(get_process_name(0), "");
        assert_eq!(get_process_image_path(0), None);
        assert!(!is_process_alive(0));
    }

    #[test]
    fn test_nonexistent_process() {
        // High PID unlikely to exist
        let non_existent = 0xFFFF_FFFE;
        assert_eq!(get_process_name(non_existent), "");
        assert_eq!(get_process_image_path(non_existent), None);
        assert!(!is_process_alive(non_existent));
    }
}
