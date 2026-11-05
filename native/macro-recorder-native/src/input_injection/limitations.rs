//! Detection of UIPI privilege elevation boundaries and unsupported background delivery targets.
//!
//! Enforces User Interface Privilege Isolation (UIPI) checks to prevent silent injection
//! failures, and identifies Chromium/Electron and UWP windows that swallow posted Win32
//! messages, surfacing immediate descriptive errors rather than retrying indefinitely.

use std::ptr;
use windows::Win32::Foundation::{CloseHandle, HANDLE, HWND};
use windows::Win32::System::Threading::{
    GetCurrentProcessId, OpenProcess, PROCESS_QUERY_LIMITED_INFORMATION,
};
use windows::Win32::UI::WindowsAndMessaging::{GetClassNameW, GetWindowThreadProcessId, IsWindow};

use crate::error::{NativeError, NativeResult};

const TOKEN_QUERY: u32 = 0x0008;
const TOKEN_INTEGRITY_LEVEL: i32 = 25;

#[repr(C)]
struct SidAndAttributes {
    sid: *mut std::ffi::c_void,
    attributes: u32,
}

#[repr(C)]
struct TokenMandatoryLabel {
    label: SidAndAttributes,
}

#[link(name = "advapi32")]
extern "system" {
    fn OpenProcessToken(
        ProcessHandle: HANDLE,
        DesiredAccess: u32,
        TokenHandle: *mut HANDLE,
    ) -> windows::Win32::Foundation::BOOL;

    fn GetTokenInformation(
        TokenHandle: HANDLE,
        TokenInformationClass: i32,
        TokenInformation: *mut std::ffi::c_void,
        TokenInformationLength: u32,
        ReturnLength: *mut u32,
    ) -> windows::Win32::Foundation::BOOL;

    fn GetSidSubAuthorityCount(pSid: *mut std::ffi::c_void) -> *mut u8;
    fn GetSidSubAuthority(pSid: *mut std::ffi::c_void, nSubAuthority: u32) -> *mut u32;
}

/// Reads the mandatory integrity RID (e.g. 0x2000 for Medium, 0x3000 for High) of a process.
pub fn read_process_integrity(process_id: u32) -> Result<u32, u32> {
    let process = unsafe {
        OpenProcess(
            PROCESS_QUERY_LIMITED_INFORMATION,
            false,
            process_id,
        )
    };
    if let Err(e) = process {
        return Err(e.code().0 as u32);
    }
    let process_handle = process.unwrap();

    let mut token_handle = HANDLE::default();
    let token_ok = unsafe {
        OpenProcessToken(
            process_handle,
            TOKEN_QUERY,
            &mut token_handle,
        )
    };

    if !token_ok.as_bool() {
        let err = unsafe { windows::Win32::Foundation::GetLastError().0 };
        let _ = unsafe { CloseHandle(process_handle) };
        return Err(err);
    }

    let mut return_length = 0u32;
    // First query length needed
    unsafe {
        let _ = GetTokenInformation(
            token_handle,
            TOKEN_INTEGRITY_LEVEL,
            ptr::null_mut(),
            0,
            &mut return_length,
        );
    }

    if return_length == 0 {
        let err = unsafe { windows::Win32::Foundation::GetLastError().0 };
        let _ = unsafe { CloseHandle(token_handle) };
        let _ = unsafe { CloseHandle(process_handle) };
        return Err(err);
    }

    let mut buffer = vec![0u8; return_length as usize];
    let info_ok = unsafe {
        GetTokenInformation(
            token_handle,
            TOKEN_INTEGRITY_LEVEL,
            buffer.as_mut_ptr() as *mut _,
            return_length,
            &mut return_length,
        )
    };

    let result = if info_ok.as_bool() {
        let label = unsafe { &*(buffer.as_ptr() as *const TokenMandatoryLabel) };
        let sid = label.label.sid;
        let count_ptr = unsafe { GetSidSubAuthorityCount(sid) };
        if !count_ptr.is_null() {
            let count = unsafe { *count_ptr };
            if count > 0 {
                let rid_ptr = unsafe { GetSidSubAuthority(sid, (count - 1) as u32) };
                if !rid_ptr.is_null() {
                    Ok(unsafe { *rid_ptr })
                } else {
                    Err(0)
                }
            } else {
                Err(0)
            }
        } else {
            Err(0)
        }
    } else {
        Err(unsafe { windows::Win32::Foundation::GetLastError().0 })
    };

    let _ = unsafe { CloseHandle(token_handle) };
    let _ = unsafe { CloseHandle(process_handle) };
    result
}

/// Retrieves the Win32 class name for a given HWND.
pub fn get_window_class_name(hwnd: HWND) -> String {
    if unsafe { !IsWindow(hwnd).as_bool() } {
        return String::new();
    }
    let mut buf = [0u16; 256];
    let len = unsafe { GetClassNameW(hwnd, &mut buf) };
    if len > 0 {
        String::from_utf16_lossy(&buf[..len as usize])
    } else {
        String::new()
    }
}

/// Checks whether the window is known to ignore or swallow posted background input messages.
///
/// Chromium/Electron windows (class starts with "Chrome_WidgetWin") and UWP windows
/// ("ApplicationFrameWindow", "Windows.UI.Core.CoreWindow") do not route background
/// Win32 messages to their web/render viewports.
pub fn ignores_posted_background_input(hwnd: HWND) -> bool {
    let class_name = get_window_class_name(hwnd);
    class_name.starts_with("Chrome_WidgetWin")
        || class_name == "ApplicationFrameWindow"
        || class_name == "Windows.UI.Core.CoreWindow"
}

/// Validates target window capabilities and privilege boundaries before directed injection.
///
/// Returns an error if:
/// - The window handle is invalid or closed (`WINDOW_NOT_FOUND`)
/// - Target process has higher integrity level than caller (`PERMISSION_DENIED` - UIPI)
/// - Target is Chromium/UWP which does not support background PostMessage (`FAILED_PRECONDITION`)
pub fn validate_targeted_window(hwnd: HWND) -> NativeResult<()> {
    if unsafe { !IsWindow(hwnd).as_bool() } {
        return Err(NativeError::window_not_found(format!(
            "Target window handle 0x{:X} is invalid or has been destroyed",
            hwnd.0 as usize
        )));
    }

    let mut target_pid = 0u32;
    unsafe {
        GetWindowThreadProcessId(hwnd, Some(&mut target_pid));
    }

    if target_pid == 0 {
        return Err(NativeError::window_not_found(
            "Could not determine process identifier for target window",
        ));
    }

    // UIPI Integrity Level check
    let current_pid = unsafe { GetCurrentProcessId() };
    if let (Ok(current_integrity), Ok(target_integrity)) = (
        read_process_integrity(current_pid),
        read_process_integrity(target_pid),
    ) {
        if target_integrity > current_integrity {
            return Err(NativeError::new(
                crate::error::IpcErrorCode::PermissionDenied,
                "The target application has a higher privilege level (UIPI). Restart Macro Recorder as administrator.",
            ));
        }
    }

    // Check for Chromium / UWP background message swallowing
    if ignores_posted_background_input(hwnd) {
        return Err(NativeError::failed_precondition(
            "Target window is a Chromium or UWP application which ignores background window messages. Use global SendInput mode instead."
        ));
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_current_process_integrity_readable() {
        let current_pid = unsafe { GetCurrentProcessId() };
        let integrity = read_process_integrity(current_pid);
        assert!(integrity.is_ok(), "Current process integrity should be readable");
        assert!(integrity.unwrap() >= 0x1000, "Integrity level should be at least Low");
    }

    #[test]
    fn test_validate_invalid_hwnd_returns_window_not_found() {
        let invalid_hwnd = HWND(std::ptr::null_mut());
        let result = validate_targeted_window(invalid_hwnd);
        assert!(result.is_err());
        assert_eq!(result.unwrap_err().code, crate::error::IpcErrorCode::WindowNotFound);
    }
}
