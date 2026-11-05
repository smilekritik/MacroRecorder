//! Tests for Win32 error translation, IPC error code mapping, panic containment boundaries,
//! and UIPI integrity inspection with privacy preservation.

#![allow(dead_code)]

#[rustfmt::skip]
#[path = "../src/error.rs"]
mod error;

pub mod windows {
    #[rustfmt::skip]
    #[path = "../../src/windows/integrity.rs"]
    pub mod integrity;
    #[rustfmt::skip]
    #[path = "../../src/windows/process.rs"]
    pub mod process;
}

use ::windows::Win32::Foundation as WinFoundation;
use WinFoundation::{HANDLE, SetLastError, WIN32_ERROR};
use error::{IpcErrorCode, NativeError, NativeResult, contain_panics};
use windows::integrity::{
    SECURITY_MANDATORY_HIGH_RID, SECURITY_MANDATORY_LOW_RID, SECURITY_MANDATORY_MEDIUM_RID,
    SECURITY_MANDATORY_SYSTEM_RID, SECURITY_MANDATORY_UNTRUSTED_RID,
    check_window_injection_integrity, is_current_process_elevated, read_process_integrity_level,
};
use windows::process::AutoHandle;

#[test]
fn test_ipc_error_code_strings_exhaustive() {
    let cases = [
        (IpcErrorCode::InvalidArgument, "INVALID_ARGUMENT"),
        (IpcErrorCode::NotFound, "NOT_FOUND"),
        (IpcErrorCode::AlreadyExists, "ALREADY_EXISTS"),
        (IpcErrorCode::PermissionDenied, "PERMISSION_DENIED"),
        (IpcErrorCode::ResourceExhausted, "RESOURCE_EXHAUSTED"),
        (IpcErrorCode::FailedPrecondition, "FAILED_PRECONDITION"),
        (IpcErrorCode::Aborted, "ABORTED"),
        (IpcErrorCode::Cancelled, "CANCELLED"),
        (IpcErrorCode::Unavailable, "UNAVAILABLE"),
        (IpcErrorCode::Internal, "INTERNAL"),
        (IpcErrorCode::UnsupportedVersion, "UNSUPPORTED_VERSION"),
        (IpcErrorCode::ChecksumMismatch, "CHECKSUM_MISMATCH"),
        (IpcErrorCode::CorruptData, "CORRUPT_DATA"),
        (IpcErrorCode::HotkeyConflict, "HOTKEY_CONFLICT"),
        (
            IpcErrorCode::RecursionLimitExceeded,
            "RECURSION_LIMIT_EXCEEDED",
        ),
        (IpcErrorCode::CycleDetected, "CYCLE_DETECTED"),
        (IpcErrorCode::DriverNotFound, "DRIVER_NOT_FOUND"),
        (IpcErrorCode::NativeHookError, "NATIVE_HOOK_ERROR"),
        (IpcErrorCode::WindowNotFound, "WINDOW_NOT_FOUND"),
    ];

    for (code, expected_str) in cases {
        assert_eq!(code.as_str(), expected_str);
        assert_eq!(format!("{code}"), expected_str);
    }
}

#[test]
fn test_native_error_constructors() {
    let err = NativeError::invalid_argument("Bad param");
    assert_eq!(err.code, IpcErrorCode::InvalidArgument);
    assert_eq!(err.message, "Bad param");

    let err = NativeError::not_found("Missing file");
    assert_eq!(err.code, IpcErrorCode::NotFound);

    let err = NativeError::resource_exhausted("Queue full");
    assert_eq!(err.code, IpcErrorCode::ResourceExhausted);

    let err = NativeError::failed_precondition("Device not initialized");
    assert_eq!(err.code, IpcErrorCode::FailedPrecondition);

    let err = NativeError::cancelled("User stopped");
    assert_eq!(err.code, IpcErrorCode::Cancelled);

    let err = NativeError::unavailable("Loop dead");
    assert_eq!(err.code, IpcErrorCode::Unavailable);

    let err = NativeError::internal("Bug");
    assert_eq!(err.code, IpcErrorCode::Internal);

    let err = NativeError::native_hook_error("Hook failed");
    assert_eq!(err.code, IpcErrorCode::NativeHookError);

    let err = NativeError::hotkey_conflict("Hotkey in use");
    assert_eq!(err.code, IpcErrorCode::HotkeyConflict);

    let err = NativeError::window_not_found("HWND gone");
    assert_eq!(err.code, IpcErrorCode::WindowNotFound);
}

#[test]
fn test_native_error_win32_code_formatting() {
    let err = NativeError::from_win32("OpenProcessToken", 5);
    assert_eq!(err.code, IpcErrorCode::NativeHookError);
    assert_eq!(err.win32_code, Some(5));

    let display = format!("{err}");
    assert!(display.contains("[NATIVE_HOOK_ERROR]"));
    assert!(display.contains("OpenProcessToken failed with Win32 error 5 (0x00000005)"));
    assert!(display.contains("Win32 error: 5 / 0x00000005"));
}

#[test]
fn test_native_error_from_last_win32() {
    // Set a known Win32 error code on current thread
    unsafe { SetLastError(WIN32_ERROR(1428)) }; // ERROR_HOOK_NEEDS_HMOD
    let err = NativeError::from_last_win32("SetWindowsHookExW");

    assert_eq!(err.win32_code, Some(1428));
    assert!(
        err.message
            .contains("SetWindowsHookExW failed with Win32 error 1428")
    );
}

#[test]
fn test_native_error_with_details() {
    let err = NativeError::invalid_argument("Coordinate out of range")
        .with_details("x=-50000 outside virtual screen");

    assert_eq!(
        err.details,
        Some("x=-50000 outside virtual screen".to_string())
    );
    let display = format!("{err}");
    assert!(display.contains("(x=-50000 outside virtual screen)"));
}

#[test]
fn test_contain_panics_success() {
    let result = contain_panics(|| -> NativeResult<u32> { Ok(100) });
    assert_eq!(result.unwrap(), 100);
}

#[test]
fn test_contain_panics_catches_literal_panic() {
    let result = contain_panics(|| -> NativeResult<()> {
        panic!("Literal panic string");
    });
    assert!(result.is_err());
    let err = result.unwrap_err();
    assert_eq!(err.code, IpcErrorCode::Internal);
    assert!(
        err.message
            .contains("Native panic contained: Literal panic string")
    );
}

#[test]
fn test_contain_panics_catches_formatted_string_panic() {
    let val = 42;
    let result = contain_panics(|| -> NativeResult<()> {
        panic!("Dynamic panic with value: {}", val);
    });
    assert!(result.is_err());
    let err = result.unwrap_err();
    assert_eq!(err.code, IpcErrorCode::Internal);
    assert!(
        err.message
            .contains("Native panic contained: Dynamic panic with value: 42")
    );
}

#[test]
fn test_contain_panics_catches_arbitrary_panic_payload() {
    let result = contain_panics(|| -> NativeResult<()> {
        std::panic::panic_any(12345);
    });
    assert!(result.is_err());
    let err = result.unwrap_err();
    assert_eq!(err.code, IpcErrorCode::Internal);
    assert!(err.message.contains("Unknown panic payload"));
}

#[test]
fn test_integrity_constants() {
    assert_eq!(SECURITY_MANDATORY_UNTRUSTED_RID, 0x0000);
    assert_eq!(SECURITY_MANDATORY_LOW_RID, 0x1000);
    assert_eq!(SECURITY_MANDATORY_MEDIUM_RID, 0x2000);
    assert_eq!(SECURITY_MANDATORY_HIGH_RID, 0x3000);
    assert_eq!(SECURITY_MANDATORY_SYSTEM_RID, 0x4000);
}

#[test]
fn test_read_process_integrity_level_pid_zero() {
    let res = read_process_integrity_level(0);
    assert!(res.is_err());
    assert_eq!(res.unwrap_err().code, IpcErrorCode::InvalidArgument);
}

#[test]
fn test_current_process_integrity_and_elevation() {
    let current_pid = unsafe { ::windows::Win32::System::Threading::GetCurrentProcessId() };
    let integrity = read_process_integrity_level(current_pid)
        .expect("Reading own integrity level should succeed");
    assert!(integrity >= SECURITY_MANDATORY_LOW_RID);

    // Elevated check should complete without error
    let _is_elevated = is_current_process_elevated();
}

#[test]
fn test_uipi_warning_preserves_privacy_no_path_leak() {
    let result = check_window_injection_integrity(0);
    // Even if warning message is present, verify strict privacy
    if let Some(warning) = result.warning_message {
        assert!(
            !warning.contains(".exe"),
            "Warning message must not contain process executable names"
        );
        assert!(
            !warning.contains("PID"),
            "Warning message must not contain raw PIDs"
        );
        assert!(
            !warning.contains(":\\"),
            "Warning message must not leak file system paths"
        );
        assert!(
            warning.contains("The target application has a higher privilege level.")
                || warning.contains("Could not determine the target process.")
        );
    }
}

#[test]
fn test_auto_handle_raii_safety() {
    // Null handle
    let null_handle = AutoHandle(HANDLE(std::ptr::null_mut()));
    assert!(!null_handle.is_valid());
    // Dropping null handle must be a no-op and not call CloseHandle
    drop(null_handle);

    // Invalid handle
    let invalid_handle = AutoHandle(HANDLE(-1isize as *mut _));
    assert!(!invalid_handle.is_valid());
    drop(invalid_handle);
}
