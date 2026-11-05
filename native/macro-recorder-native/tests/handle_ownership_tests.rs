//! Tests for safe handle ownership, RAII guards, and Win32 cleanup invariants.

#[rustfmt::skip]
#[path = "../src/runtime/resource.rs"]
mod resource;

use resource::{DcGuard, HookHandle, ResourceGuard, WindowClassGuard, WindowHandle};
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use windows::Win32::Foundation::{HINSTANCE, HWND};
use windows::Win32::Graphics::Gdi::HDC;
use windows::Win32::UI::WindowsAndMessaging::HHOOK;

#[test]
fn test_resource_guard_runs_cleanup_on_drop() {
    let cleaned_up = Arc::new(AtomicBool::new(false));
    let cleaned_clone = Arc::clone(&cleaned_up);

    {
        let _guard = ResourceGuard::new(42, move |val| {
            assert_eq!(val, 42);
            cleaned_clone.store(true, Ordering::SeqCst);
        });
        assert!(!cleaned_up.load(Ordering::SeqCst));
    }

    assert!(
        cleaned_up.load(Ordering::SeqCst),
        "Cleanup should run on drop"
    );
}

#[test]
fn test_resource_guard_disarm_bypasses_cleanup() {
    let cleaned_up = Arc::new(AtomicBool::new(false));
    let cleaned_clone = Arc::clone(&cleaned_up);

    let val = {
        let guard = ResourceGuard::new(99, move |_| {
            cleaned_clone.store(true, Ordering::SeqCst);
        });
        assert_eq!(guard.get(), Some(&99));
        guard.disarm()
    };

    assert_eq!(val, 99);
    assert!(
        !cleaned_up.load(Ordering::SeqCst),
        "Disarm must prevent cleanup execution"
    );
}

#[test]
fn test_resource_guard_get_value() {
    let guard = ResourceGuard::new(String::from("native_resource"), |_| {});
    assert_eq!(guard.get().map(|s| s.as_str()), Some("native_resource"));
}

#[test]
fn test_hook_handle_null_is_invalid() {
    let handle = HookHandle::new(HHOOK(std::ptr::null_mut()));
    assert!(!handle.is_valid());
    assert!(handle.raw().is_none());
}

#[test]
fn test_hook_handle_idempotent_unhook() {
    let mut handle = HookHandle::new(HHOOK(std::ptr::null_mut()));
    assert!(
        !handle.unhook(),
        "Unhook on invalid handle must return false"
    );
    assert!(!handle.unhook(), "Second unhook must also return false");
}

#[test]
fn test_hook_handle_fake_handle_unhook_and_disarm() {
    // When a non-null handle is wrapped, is_valid is true and unhook takes it
    let fake_hook = HHOOK(0x12345678 as *mut _);
    let mut handle = HookHandle::new(fake_hook);
    assert!(handle.is_valid());
    assert_eq!(handle.raw(), Some(fake_hook));

    // Calling unhook will attempt Win32 UnhookWindowsHookEx (which may return false for dummy pointer),
    // but the handle MUST be taken so subsequent calls return false
    let _ = handle.unhook();
    assert!(!handle.is_valid());
    assert!(handle.raw().is_none());
    assert!(
        !handle.unhook(),
        "Subsequent unhook call must be idempotent"
    );
}

#[test]
fn test_window_handle_null_is_invalid() {
    let handle = WindowHandle::new(HWND(std::ptr::null_mut()));
    assert!(!handle.is_valid());
    assert!(handle.raw().is_none());
}

#[test]
fn test_window_handle_idempotent_destroy() {
    let mut handle = WindowHandle::new(HWND(std::ptr::null_mut()));
    assert!(
        !handle.destroy(),
        "Destroy on invalid window handle must return false"
    );
    assert!(!handle.destroy(), "Second destroy must also return false");
}

#[test]
fn test_window_handle_takes_ownership() {
    let fake_hwnd = HWND(0xABCDEF as *mut _);
    let mut handle = WindowHandle::new(fake_hwnd);
    assert!(handle.is_valid());
    assert_eq!(handle.raw(), Some(fake_hwnd));

    let _ = handle.destroy();
    assert!(!handle.is_valid());
    assert!(handle.raw().is_none());
    assert!(!handle.destroy());
}

#[test]
fn test_dc_guard_null_hdc_handling() {
    let hwnd = HWND(std::ptr::null_mut());
    let mut guard = DcGuard::new(hwnd, HDC(std::ptr::null_mut()));
    assert!(guard.raw().is_none());
    assert!(!guard.release(), "Release on null HDC must return false");
    assert!(!guard.release(), "Second release must return false");
}

#[test]
fn test_dc_guard_takes_ownership() {
    let hwnd = HWND(std::ptr::null_mut());
    let fake_hdc = HDC(0xDEADBEEF as *mut _);
    let mut guard = DcGuard::new(hwnd, fake_hdc);
    assert_eq!(guard.raw(), Some(fake_hdc));

    let _ = guard.release();
    assert!(guard.raw().is_none());
    assert!(!guard.release());
}

#[test]
fn test_window_class_guard_atomic_unregister() {
    let class_name: Vec<u16> = "TestClass\0".encode_utf16().collect();
    let instance = HINSTANCE(std::ptr::null_mut());
    let guard = WindowClassGuard::new(class_name, instance);

    // First call performs the unregister attempt
    let _ = guard.unregister();
    // Second call is guaranteed to return false due to AtomicBool swap
    assert!(
        !guard.unregister(),
        "Second unregister call must return false"
    );
}

#[test]
fn test_handle_ownership_thread_safety_send_sync() {
    fn assert_send<T: Send>() {}
    fn assert_sync<T: Sync>() {}

    assert_send::<HookHandle>();
    assert_sync::<HookHandle>();
    assert_send::<WindowHandle>();
    assert_sync::<WindowHandle>();
    assert_send::<WindowClassGuard>();
    assert_sync::<WindowClassGuard>();
    assert_send::<DcGuard>();
}
