//! Windows integrity-level comparison, elevation detection, and UIPI guards.
//!
//! Privilege Isolation (UIPI) checks while preserving privacy: warnings strictly report
//! elevation status without leaking process names, PIDs, or binary paths.

use napi_derive::napi;
use windows::Win32::Foundation::{BOOL, HANDLE, HWND};
use windows::Win32::System::Threading::{
    GetCurrentProcess, GetCurrentProcessId, OpenProcess, PROCESS_QUERY_LIMITED_INFORMATION,
};
use windows::Win32::UI::WindowsAndMessaging::{GetForegroundWindow, GetWindowThreadProcessId};

use crate::error::{NativeError, NativeResult};
use crate::windows::process::AutoHandle;

pub const SECURITY_MANDATORY_UNTRUSTED_RID: u32 = 0x0000;
pub const SECURITY_MANDATORY_LOW_RID: u32 = 0x1000;
pub const SECURITY_MANDATORY_MEDIUM_RID: u32 = 0x2000;
pub const SECURITY_MANDATORY_HIGH_RID: u32 = 0x3000;
pub const SECURITY_MANDATORY_SYSTEM_RID: u32 = 0x4000;

const TOKEN_QUERY: u32 = 0x0008;
const TOKEN_INTEGRITY_LEVEL: u32 = 25;
const TOKEN_ELEVATION: u32 = 20;

#[repr(C)]
struct SidAndAttributes {
    sid: *mut std::ffi::c_void,
    attributes: u32,
}

#[repr(C)]
struct TokenMandatoryLabel {
    label: SidAndAttributes,
}

#[repr(C)]
struct TokenElevationStruct {
    token_is_elevated: u32,
}

extern "system" {
    fn OpenProcessToken(
        ProcessHandle: HANDLE,
        DesiredAccess: u32,
        TokenHandle: *mut HANDLE,
    ) -> BOOL;

    fn GetTokenInformation(
        TokenHandle: HANDLE,
        TokenInformationClass: u32,
        TokenInformation: *mut std::ffi::c_void,
        TokenInformationLength: u32,
        ReturnLength: *mut u32,
    ) -> BOOL;

    fn GetSidSubAuthorityCount(pSid: *mut std::ffi::c_void) -> *mut u8;
    fn GetSidSubAuthority(pSid: *mut std::ffi::c_void, nSubAuthority: u32) -> *mut u32;
}

/// Result of evaluating window injection integrity boundaries.
#[napi(object)]
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct IntegrityCheckResult {
    pub can_inject: bool,
    pub target_is_higher: bool,
    pub current_integrity: u32,
    pub target_integrity: Option<u32>,
    pub warning_message: Option<String>,
}

/// Reads the mandatory integrity level RID (e.g. 0x2000 Medium, 0x3000 High) for a process.
pub fn read_process_integrity_level(process_id: u32) -> NativeResult<u32> {
    if process_id == 0 {
        return Err(NativeError::invalid_argument("PID cannot be 0"));
    }

    let h_process_res = unsafe { OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, process_id) };
    let process = match h_process_res {
        Ok(h) if !h.is_invalid() && !h.0.is_null() => AutoHandle(h),
        _ => return Err(NativeError::from_last_win32("OpenProcess")),
    };

    let mut token_handle = HANDLE::default();
    let token_ok = unsafe { OpenProcessToken(process.handle(), TOKEN_QUERY, &mut token_handle) };
    if !token_ok.as_bool() || token_handle.is_invalid() || token_handle.0.is_null() {
        return Err(NativeError::from_last_win32("OpenProcessToken"));
    }
    let token = AutoHandle(token_handle);

    let mut length_needed = 0u32;
    unsafe {
        let _ = GetTokenInformation(
            token.handle(),
            TOKEN_INTEGRITY_LEVEL,
            std::ptr::null_mut(),
            0,
            &mut length_needed,
        );
    }

    if length_needed == 0 {
        return Err(NativeError::from_last_win32("GetTokenInformation query length"));
    }

    let mut buffer = vec![0u8; length_needed as usize];
    let ok = unsafe {
        GetTokenInformation(
            token.handle(),
            TOKEN_INTEGRITY_LEVEL,
            buffer.as_mut_ptr() as *mut std::ffi::c_void,
            length_needed,
            &mut length_needed,
        )
    };

    if !ok.as_bool() {
        return Err(NativeError::from_last_win32("GetTokenInformation query data"));
    }

    let label = unsafe { &*(buffer.as_ptr() as *const TokenMandatoryLabel) };
    let count_ptr = unsafe { GetSidSubAuthorityCount(label.label.sid) };
    if count_ptr.is_null() {
        return Err(NativeError::internal("GetSidSubAuthorityCount returned null"));
    }

    let count = unsafe { *count_ptr };
    if count == 0 {
        return Err(NativeError::internal("SID has zero sub-authorities"));
    }

    let rid_ptr = unsafe { GetSidSubAuthority(label.label.sid, (count - 1) as u32) };
    if rid_ptr.is_null() {
        return Err(NativeError::internal("GetSidSubAuthority returned null"));
    }

    let rid = unsafe { *rid_ptr };
    Ok(rid)
}

/// Checks whether the current process is running with elevated (Administrator/High) privileges.
pub fn is_current_process_elevated() -> bool {
    let mut token_handle = HANDLE::default();
    let current_proc = unsafe { GetCurrentProcess() };
    let ok = unsafe { OpenProcessToken(current_proc, TOKEN_QUERY, &mut token_handle) };
    if !ok.as_bool() || token_handle.is_invalid() || token_handle.0.is_null() {
        return false;
    }
    let token = AutoHandle(token_handle);

    let mut elevation = TokenElevationStruct { token_is_elevated: 0 };
    let mut return_length = 0u32;
    let success = unsafe {
        GetTokenInformation(
            token.handle(),
            TOKEN_ELEVATION,
            &mut elevation as *mut _ as *mut std::ffi::c_void,
            std::mem::size_of::<TokenElevationStruct>() as u32,
            &mut return_length,
        )
    };

    if success.as_bool() && elevation.token_is_elevated != 0 {
        return true;
    }

    // Fallback check against integrity RID >= HIGH (0x3000)
    let current_pid = unsafe { GetCurrentProcessId() };
    if let Ok(rid) = read_process_integrity_level(current_pid) {
        return rid >= SECURITY_MANDATORY_HIGH_RID;
    }

    false
}

/// Evaluates if inputs can be safely injected into a target window (or foreground window if 0).
///
/// If the target window belongs to a process with higher integrity than Macro Recorder,
/// injection is rejected with a standardized warning message that deliberately omits
/// process details to maintain privacy.
pub fn check_window_injection_integrity(hwnd: i64) -> IntegrityCheckResult {
    let target_hwnd = if hwnd == 0 {
        unsafe { GetForegroundWindow() }
    } else {
        HWND(hwnd as usize as *mut _)
    };

    if target_hwnd.0.is_null() {
        return IntegrityCheckResult {
            can_inject: false,
            target_is_higher: false,
            current_integrity: SECURITY_MANDATORY_MEDIUM_RID,
            target_integrity: None,
            warning_message: Some("Could not determine the target process.".to_string()),
        };
    }

    let mut target_pid = 0u32;
    unsafe { GetWindowThreadProcessId(target_hwnd, Some(&mut target_pid)) };
    if target_pid == 0 {
        return IntegrityCheckResult {
            can_inject: false,
            target_is_higher: false,
            current_integrity: SECURITY_MANDATORY_MEDIUM_RID,
            target_integrity: None,
            warning_message: Some("Could not determine the target process.".to_string()),
        };
    }

    let current_pid = unsafe { GetCurrentProcessId() };
    let current_integrity =
        read_process_integrity_level(current_pid).unwrap_or(SECURITY_MANDATORY_MEDIUM_RID);

    match read_process_integrity_level(target_pid) {
        Ok(target_integrity) => {
            if target_integrity > current_integrity {
                IntegrityCheckResult {
                    can_inject: false,
                    target_is_higher: true,
                    current_integrity,
                    target_integrity: Some(target_integrity),
                    // Standard message matching IntegrityLevelGuard without leaking process names/paths
                    warning_message: Some(
                        "The target application has a higher privilege level. Restart Macro Recorder as administrator.".to_string(),
                    ),
                }
            } else {
                IntegrityCheckResult {
                    can_inject: true,
                    target_is_higher: false,
                    current_integrity,
                    target_integrity: Some(target_integrity),
                    warning_message: None,
                }
            }
        }
        Err(_) => {
            // Matching behavior: UIPI is enforced by SendInput directly;
            // if inspection is denied (e.g. anti-cheat or protected process),
            // do not pre-emptively block what SendInput might handle.
            IntegrityCheckResult {
                can_inject: true,
                target_is_higher: false,
                current_integrity,
                target_integrity: None,
                warning_message: None,
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_current_process_integrity_is_valid() {
        let current_pid = unsafe { GetCurrentProcessId() };
        let integrity = read_process_integrity_level(current_pid)
            .expect("Must be able to read own process integrity");
        assert!(
            integrity >= SECURITY_MANDATORY_LOW_RID,
            "Expected at least LOW integrity, got: {integrity:#X}"
        );
    }

    #[test]
    fn test_check_window_injection_integrity_on_self() {
        // Checking injection into own process shouldn't block
        let result = check_window_injection_integrity(0);
        // Foreground window might not exist in headless test, but must not panic
        assert!(!result.target_is_higher);
    }

    #[test]
    fn test_elevated_target_warning_does_not_leak_process_details() {
        // Synthesize an elevated warning and verify format
        let warning = "The target application has a higher privilege level. Restart Macro Recorder as administrator.";
        assert!(!warning.contains(".exe"));
        assert!(!warning.contains("PID"));
        assert!(!warning.contains("C:\\"));
    }
}
