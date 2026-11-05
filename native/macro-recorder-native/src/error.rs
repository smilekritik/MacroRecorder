//! Structured error handling, error codes, and panic containment for the native addon.
//!
//! Maps to versioned application error codes defined in contracts, captures Win32 error
//! codes, and ensures that panics never unwind across the N-API FFI boundary into Electron.

use std::fmt;
use std::panic::{catch_unwind, AssertUnwindSafe};
use windows::Win32::Foundation::GetLastError;

/// Standard error codes matching `IpcErrorCode` in `@macro-recorder/contracts`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum IpcErrorCode {
    InvalidArgument,
    NotFound,
    AlreadyExists,
    PermissionDenied,
    ResourceExhausted,
    FailedPrecondition,
    Aborted,
    Cancelled,
    Unavailable,
    Internal,
    UnsupportedVersion,
    ChecksumMismatch,
    CorruptData,
    HotkeyConflict,
    RecursionLimitExceeded,
    CycleDetected,
    DriverNotFound,
    NativeHookError,
    WindowNotFound,
}

impl IpcErrorCode {
    /// String identifier matching the contract schema exactly.
    pub const fn as_str(&self) -> &'static str {
        match self {
            Self::InvalidArgument => "INVALID_ARGUMENT",
            Self::NotFound => "NOT_FOUND",
            Self::AlreadyExists => "ALREADY_EXISTS",
            Self::PermissionDenied => "PERMISSION_DENIED",
            Self::ResourceExhausted => "RESOURCE_EXHAUSTED",
            Self::FailedPrecondition => "FAILED_PRECONDITION",
            Self::Aborted => "ABORTED",
            Self::Cancelled => "CANCELLED",
            Self::Unavailable => "UNAVAILABLE",
            Self::Internal => "INTERNAL",
            Self::UnsupportedVersion => "UNSUPPORTED_VERSION",
            Self::ChecksumMismatch => "CHECKSUM_MISMATCH",
            Self::CorruptData => "CORRUPT_DATA",
            Self::HotkeyConflict => "HOTKEY_CONFLICT",
            Self::RecursionLimitExceeded => "RECURSION_LIMIT_EXCEEDED",
            Self::CycleDetected => "CYCLE_DETECTED",
            Self::DriverNotFound => "DRIVER_NOT_FOUND",
            Self::NativeHookError => "NATIVE_HOOK_ERROR",
            Self::WindowNotFound => "WINDOW_NOT_FOUND",
        }
    }
}

impl fmt::Display for IpcErrorCode {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.as_str())
    }
}

/// Structured error produced by native operations.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct NativeError {
    /// Structured IPC / application error code.
    pub code: IpcErrorCode,
    /// Human-readable explanation.
    pub message: String,
    /// Underlying Win32 error code, if applicable.
    pub win32_code: Option<u32>,
    /// Optional context details.
    pub details: Option<String>,
}

impl NativeError {
    /// Creates a new native error with the specified code and message.
    pub fn new(code: IpcErrorCode, message: impl Into<String>) -> Self {
        Self {
            code,
            message: message.into(),
            win32_code: None,
            details: None,
        }
    }

    /// Invalid argument error.
    pub fn invalid_argument(message: impl Into<String>) -> Self {
        Self::new(IpcErrorCode::InvalidArgument, message)
    }

    /// Not found error.
    pub fn not_found(message: impl Into<String>) -> Self {
        Self::new(IpcErrorCode::NotFound, message)
    }

    /// Resource exhausted error (e.g. bounded queue full).
    pub fn resource_exhausted(message: impl Into<String>) -> Self {
        Self::new(IpcErrorCode::ResourceExhausted, message)
    }

    /// Precondition failed.
    pub fn failed_precondition(message: impl Into<String>) -> Self {
        Self::new(IpcErrorCode::FailedPrecondition, message)
    }

    /// Operation cancelled.
    pub fn cancelled(message: impl Into<String>) -> Self {
        Self::new(IpcErrorCode::Cancelled, message)
    }

    /// Service or thread unavailable.
    pub fn unavailable(message: impl Into<String>) -> Self {
        Self::new(IpcErrorCode::Unavailable, message)
    }

    /// Internal error.
    pub fn internal(message: impl Into<String>) -> Self {
        Self::new(IpcErrorCode::Internal, message)
    }

    /// Native Windows hook or input capture failure.
    pub fn native_hook_error(message: impl Into<String>) -> Self {
        Self::new(IpcErrorCode::NativeHookError, message)
    }

    /// Hotkey conflict error.
    pub fn hotkey_conflict(message: impl Into<String>) -> Self {
        Self::new(IpcErrorCode::HotkeyConflict, message)
    }

    /// Target window not found.
    pub fn window_not_found(message: impl Into<String>) -> Self {
        Self::new(IpcErrorCode::WindowNotFound, message)
    }

    /// Attaches an underlying Win32 error code.
    pub fn with_win32_code(mut self, code: u32) -> Self {
        self.win32_code = Some(code);
        self
    }

    /// Attaches additional detail text.
    pub fn with_details(mut self, details: impl Into<String>) -> Self {
        self.details = Some(details.into());
        self
    }

    /// Constructs a `NativeError` from a Win32 context and explicit error code.
    pub fn from_win32(context: impl Into<String>, code: u32) -> Self {
        let ctx = context.into();
        Self {
            code: IpcErrorCode::NativeHookError,
            message: format!("{ctx} failed with Win32 error {code} (0x{code:08X})"),
            win32_code: Some(code),
            details: None,
        }
    }

    /// Constructs a `NativeError` by inspecting Win32 `GetLastError`.
    pub fn from_last_win32(context: impl Into<String>) -> Self {
        let code = unsafe { GetLastError().0 };
        Self::from_win32(context, code)
    }
}

impl fmt::Display for NativeError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "[{}] {}", self.code.as_str(), self.message)?;
        if let Some(w32) = self.win32_code {
            write!(f, " (Win32 error: {w32} / 0x{w32:08X})")?;
        }
        if let Some(details) = &self.details {
            write!(f, " ({details})")?;
        }
        Ok(())
    }
}

impl std::error::Error for NativeError {}

impl From<NativeError> for napi::Error {
    fn from(err: NativeError) -> Self {
        let reason = err.to_string();
        napi::Error::new(napi::Status::GenericFailure, reason)
    }
}

/// Convenience result alias for native operations.
pub type NativeResult<T> = Result<T, NativeError>;

/// Executes an operation inside a panic containment boundary.
///
/// Any panic is caught and transformed into `NativeError::internal` rather than
/// unwinding across FFI/N-API boundaries into Electron.
pub fn contain_panics<F, R>(action: F) -> NativeResult<R>
where
    F: FnOnce() -> NativeResult<R>,
{
    match catch_unwind(AssertUnwindSafe(action)) {
        Ok(result) => result,
        Err(payload) => {
            let panic_msg = if let Some(s) = payload.downcast_ref::<&str>() {
                (*s).to_string()
            } else if let Some(s) = payload.downcast_ref::<String>() {
                s.clone()
            } else {
                "Unknown panic payload".to_string()
            };
            Err(NativeError::internal(format!(
                "Native panic contained: {panic_msg}"
            )))
        }
    }
}

/// Wraps a closure returning `napi::Result<R>` in panic containment.
pub fn catch_unwind_napi<F, R>(action: F) -> napi::Result<R>
where
    F: FnOnce() -> napi::Result<R>,
{
    match catch_unwind(AssertUnwindSafe(action)) {
        Ok(result) => result,
        Err(payload) => {
            let panic_msg = if let Some(s) = payload.downcast_ref::<&str>() {
                (*s).to_string()
            } else if let Some(s) = payload.downcast_ref::<String>() {
                s.clone()
            } else {
                "Unknown panic payload".to_string()
            };
            Err(napi::Error::from(NativeError::internal(format!(
                "Native panic contained: {panic_msg}"
            ))))
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_error_code_strings() {
        assert_eq!(IpcErrorCode::InvalidArgument.as_str(), "INVALID_ARGUMENT");
        assert_eq!(IpcErrorCode::NativeHookError.as_str(), "NATIVE_HOOK_ERROR");
        assert_eq!(IpcErrorCode::HotkeyConflict.as_str(), "HOTKEY_CONFLICT");
        assert_eq!(
            IpcErrorCode::ResourceExhausted.as_str(),
            "RESOURCE_EXHAUSTED"
        );
    }

    #[test]
    fn test_native_error_display() {
        let err =
            NativeError::invalid_argument("Key code out of range").with_details("VK 300 > 255");
        assert!(err.to_string().contains("[INVALID_ARGUMENT]"));
        assert!(err.to_string().contains("Key code out of range"));
        assert!(err.to_string().contains("VK 300 > 255"));
    }

    #[test]
    fn test_contain_panics_catches_unwind() {
        let result = contain_panics(|| -> NativeResult<()> {
            panic!("Test deliberate panic");
        });
        assert!(result.is_err());
        let err = result.unwrap_err();
        assert_eq!(err.code, IpcErrorCode::Internal);
        assert!(err.message.contains("Test deliberate panic"));
    }

    #[test]
    fn test_contain_panics_success() {
        let result = contain_panics(|| -> NativeResult<u32> { Ok(42) });
        assert_eq!(result.unwrap(), 42);
    }
}
