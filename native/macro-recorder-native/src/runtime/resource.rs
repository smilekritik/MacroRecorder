//! Safe resource ownership and deterministic RAII cleanup primitives for Win32 handles.
//!
//! Enforces single-owner semantics to guarantee that hooks, windows, classes, and DCs
//! are deterministically freed without leaking across repeated initialize-shutdown cycles.

use std::sync::atomic::{AtomicBool, Ordering};
use windows::core::PCWSTR;
use windows::Win32::Foundation::{HINSTANCE, HWND};
use windows::Win32::Graphics::Gdi::{ReleaseDC, HDC};
use windows::Win32::UI::WindowsAndMessaging::{
    DestroyWindow, UnhookWindowsHookEx, UnregisterClassW, HHOOK,
};

/// Safe single-owner RAII wrapper for a Windows hook handle (`HHOOK`).
pub struct HookHandle {
    hook: Option<HHOOK>,
}

// SAFETY: HHOOK is a thread-safe Win32 opaque handle. Transferring ownership across
// threads is safe as long as unhooking occurs on a thread that is either the creator
// or standard unhook path.
unsafe impl Send for HookHandle {}
unsafe impl Sync for HookHandle {}

impl HookHandle {
    /// Wraps an active hook handle.
    pub fn new(hook: HHOOK) -> Self {
        Self {
            hook: if hook.0.is_null() { None } else { Some(hook) },
        }
    }

    /// Returns the raw hook handle if still active.
    pub fn raw(&self) -> Option<HHOOK> {
        self.hook
    }

    /// Returns `true` if the hook handle is valid and active.
    pub fn is_valid(&self) -> bool {
        self.hook.is_some()
    }

    /// Deterministically unhooks and disarms the RAII guard.
    pub fn unhook(&mut self) -> bool {
        if let Some(h) = self.hook.take() {
            // SAFETY: `h` is a valid HHOOK handle previously returned by SetWindowsHookExW.
            // Taking ownership ensures UnhookWindowsHookEx is invoked exactly once.
            unsafe { UnhookWindowsHookEx(h).is_ok() }
        } else {
            false
        }
    }
}

impl Drop for HookHandle {
    fn drop(&mut self) {
        self.unhook();
    }
}

/// Safe single-owner RAII wrapper for a Win32 window (`HWND`).
pub struct WindowHandle {
    hwnd: Option<HWND>,
}

// SAFETY: HWND is an opaque window handle managed by the Windows subsystem.
// Transferring handle representation across threads is safe.
unsafe impl Send for WindowHandle {}
unsafe impl Sync for WindowHandle {}

impl WindowHandle {
    /// Wraps an active window handle.
    pub fn new(hwnd: HWND) -> Self {
        Self {
            hwnd: if hwnd.0.is_null() { None } else { Some(hwnd) },
        }
    }

    /// Returns the raw window handle.
    pub fn raw(&self) -> Option<HWND> {
        self.hwnd
    }

    /// Returns `true` if the window handle is valid.
    pub fn is_valid(&self) -> bool {
        self.hwnd.is_some()
    }

    /// Deterministically destroys the window and disarms the RAII guard.
    pub fn destroy(&mut self) -> bool {
        if let Some(w) = self.hwnd.take() {
            // SAFETY: `w` is a valid HWND owned exclusively by this wrapper.
            // DestroyWindow is called exactly once.
            unsafe { DestroyWindow(w).is_ok() }
        } else {
            false
        }
    }
}

impl Drop for WindowHandle {
    fn drop(&mut self) {
        self.destroy();
    }
}

/// RAII guard for a registered Win32 window class.
pub struct WindowClassGuard {
    class_name: Vec<u16>,
    instance: HINSTANCE,
    unregistered: AtomicBool,
}

// SAFETY: Class name buffer and HINSTANCE are immutable and safe to transfer across threads.
unsafe impl Send for WindowClassGuard {}
unsafe impl Sync for WindowClassGuard {}

impl WindowClassGuard {
    /// Creates a new class registration guard.
    pub fn new(class_name: Vec<u16>, instance: HINSTANCE) -> Self {
        Self {
            class_name,
            instance,
            unregistered: AtomicBool::new(false),
        }
    }

    /// Explicitly unregisters the window class.
    pub fn unregister(&self) -> bool {
        if !self.unregistered.swap(true, Ordering::SeqCst) {
            // SAFETY: `self.class_name` is a null-terminated UTF-16 string buffer matching
            // the name registered with RegisterClassExW, and `self.instance` is the corresponding HINSTANCE.
            unsafe { UnregisterClassW(PCWSTR(self.class_name.as_ptr()), self.instance).is_ok() }
        } else {
            false
        }
    }
}

impl Drop for WindowClassGuard {
    fn drop(&mut self) {
        self.unregister();
    }
}

/// RAII guard for a Device Context (`HDC`) obtained from `GetDC`.
pub struct DcGuard {
    hwnd: HWND,
    hdc: Option<HDC>,
}

// SAFETY: DC guard uniquely owns the HDC handle for release on drop.
unsafe impl Send for DcGuard {}

impl DcGuard {
    /// Wraps an active HDC and target HWND.
    pub fn new(hwnd: HWND, hdc: HDC) -> Self {
        Self {
            hwnd,
            hdc: if hdc.0.is_null() { None } else { Some(hdc) },
        }
    }

    /// Returns the raw device context.
    pub fn raw(&self) -> Option<HDC> {
        self.hdc
    }

    /// Explicitly releases the DC.
    pub fn release(&mut self) -> bool {
        if let Some(dc) = self.hdc.take() {
            // SAFETY: `dc` was acquired from `GetDC(hwnd)` and is released with matching parameters.
            unsafe { ReleaseDC(self.hwnd, dc) != 0 }
        } else {
            false
        }
    }
}

impl Drop for DcGuard {
    fn drop(&mut self) {
        self.release();
    }
}

/// Generalized RAII wrapper for any native resource with custom single-owner cleanup.
pub struct ResourceGuard<T, F: FnOnce(T)> {
    value: Option<T>,
    cleanup: Option<F>,
}

impl<T, F: FnOnce(T)> ResourceGuard<T, F> {
    /// Creates a new resource guard.
    pub fn new(value: T, cleanup: F) -> Self {
        Self {
            value: Some(value),
            cleanup: Some(cleanup),
        }
    }

    /// Returns a reference to the guarded value.
    pub fn get(&self) -> Option<&T> {
        self.value.as_ref()
    }

    /// Defuses the guard and transfers ownership of the resource without running cleanup.
    pub fn disarm(mut self) -> T {
        self.cleanup = None;
        self.value.take().expect("resource already taken")
    }
}

impl<T, F: FnOnce(T)> Drop for ResourceGuard<T, F> {
    fn drop(&mut self) {
        if let (Some(v), Some(cleanup)) = (self.value.take(), self.cleanup.take()) {
            cleanup(v);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::AtomicU32;
    use std::sync::Arc;

    #[test]
    fn test_resource_guard_runs_cleanup_on_drop() {
        let counter = Arc::new(AtomicU32::new(0));
        let c_clone = Arc::clone(&counter);

        {
            let _guard = ResourceGuard::new(100, move |val| {
                c_clone.store(val, Ordering::SeqCst);
            });
        }

        assert_eq!(counter.load(Ordering::SeqCst), 100);
    }

    #[test]
    fn test_resource_guard_disarm_bypasses_cleanup() {
        let counter = Arc::new(AtomicU32::new(0));
        let c_clone = Arc::clone(&counter);

        let value = {
            let guard = ResourceGuard::new(200, move |val| {
                c_clone.store(val, Ordering::SeqCst);
            });
            guard.disarm()
        };

        assert_eq!(value, 200);
        assert_eq!(counter.load(Ordering::SeqCst), 0);
    }

    #[test]
    fn test_hook_handle_idempotent_unhook() {
        let mut handle = HookHandle { hook: None };
        assert!(!handle.is_valid());
        assert!(!handle.unhook());
    }
}
