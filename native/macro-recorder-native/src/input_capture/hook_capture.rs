//! Low-level Windows keyboard and mouse hooks (`WH_KEYBOARD_LL`, `WH_MOUSE_LL`).
//!
//! Enforces:
//! - Sub-millisecond callback execution well below Windows `LowLevelHooksTimeout`.
//! - Detection and filtering of synthetic injected input (`LLKHF_INJECTED`, `LLMHF_INJECTED`).
//! - Marking injected key-downs to swallow matching `WM_HOTKEY` events.
//! - Hook-driven keyboard bind evaluation with pass-through and autorepeat suppression.
//! - Clean installation and deterministic release across reloads and shutdowns.

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};

use windows::Win32::Foundation::{HINSTANCE, LPARAM, LRESULT, WPARAM};
use windows::Win32::UI::WindowsAndMessaging::{
    CallNextHookEx, SetWindowsHookExW, UnhookWindowsHookEx, HHOOK, KBDLLHOOKSTRUCT, MSLLHOOKSTRUCT,
    WH_KEYBOARD_LL, WH_MOUSE_LL, WM_KEYDOWN, WM_KEYUP, WM_LBUTTONDOWN, WM_LBUTTONUP,
    WM_MBUTTONDOWN, WM_MBUTTONUP, WM_MOUSEHWHEEL, WM_MOUSEMOVE, WM_MOUSEWHEEL, WM_RBUTTONDOWN,
    WM_RBUTTONUP, WM_SYSKEYDOWN, WM_SYSKEYUP, WM_XBUTTONDOWN, WM_XBUTTONUP,
};

use crate::api::events::{NativeKeyboardHookEvent, NativeMouseHookEvent};
use crate::error::{NativeError, NativeResult};
use crate::hotkeys::binding::{MouseButton, WheelDirection};
use crate::hotkeys::manager::HotkeyManager;
use crate::input_capture::exclusion::ApplicationControlFilter;

/// Low-level keyboard hook flag indicating injected event (bit 4).
pub const LLKHF_INJECTED: u32 = 0x00000010;
/// Low-level mouse hook flag indicating injected event (bit 0).
pub const LLMHF_INJECTED: u32 = 0x00000001;

/// Callback for captured keyboard events.
pub type KeyboardEventCallback = Arc<dyn Fn(NativeKeyboardHookEvent) + Send + Sync + 'static>;
/// Callback for captured mouse events.
pub type MouseEventCallback = Arc<dyn Fn(NativeMouseHookEvent) + Send + Sync + 'static>;
/// Callback for injected input observation (marker extra info, timestamp).
pub type InjectedInputCallback = Arc<dyn Fn(usize, i64) + Send + Sync + 'static>;

/// Internal state shared between hooks and static hook procedures.
struct HookSharedState {
    keyboard_hook: HHOOK,
    mouse_hook: HHOOK,
    hotkey_manager: Arc<HotkeyManager>,
    exclusion_filter: Arc<ApplicationControlFilter>,
    keyboard_callback: Mutex<Option<KeyboardEventCallback>>,
    mouse_callback: Mutex<Option<MouseEventCallback>>,
    injected_callback: Mutex<Option<InjectedInputCallback>>,
}

// SAFETY: HookSharedState manages Win32 HHOOK handles created on the dedicated capture thread.
unsafe impl Send for HookSharedState {}
unsafe impl Sync for HookSharedState {}

static ACTIVE_HOOKS: Mutex<Option<Arc<HookSharedState>>> = Mutex::new(None);

/// High-performance container managing active Windows low-level input hooks.
pub struct LowLevelHookCapture {
    is_installed: AtomicBool,
    shared: Arc<HookSharedState>,
}

unsafe impl Send for LowLevelHookCapture {}
unsafe impl Sync for LowLevelHookCapture {}

impl LowLevelHookCapture {
    /// Installs both `WH_KEYBOARD_LL` and `WH_MOUSE_LL` on the current message-pump thread.
    pub fn install(
        hotkey_manager: Arc<HotkeyManager>,
        exclusion_filter: Arc<ApplicationControlFilter>,
    ) -> NativeResult<Self> {
        // SAFETY: SetWindowsHookExW for global low-level hooks requires a null/default HINSTANCE.
        let kbd_hook = unsafe {
            SetWindowsHookExW(
                WH_KEYBOARD_LL,
                Some(Self::keyboard_proc),
                HINSTANCE::default(),
                0,
            )
        }
        .map_err(|e| NativeError::from_win32("SetWindowsHookExW (WH_KEYBOARD_LL)", e.code().0 as u32))?;

        let mouse_hook = match unsafe {
            SetWindowsHookExW(
                WH_MOUSE_LL,
                Some(Self::mouse_proc),
                HINSTANCE::default(),
                0,
            )
        } {
            Ok(h) => h,
            Err(e) => {
                unsafe {
                    let _ = UnhookWindowsHookEx(kbd_hook);
                }
                return Err(NativeError::from_win32(
                    "SetWindowsHookExW (WH_MOUSE_LL)",
                    e.code().0 as u32,
                ));
            }
        };

        let shared = Arc::new(HookSharedState {
            keyboard_hook: kbd_hook,
            mouse_hook,
            hotkey_manager,
            exclusion_filter,
            keyboard_callback: Mutex::new(None),
            mouse_callback: Mutex::new(None),
            injected_callback: Mutex::new(None),
        });

        {
            let mut global = ACTIVE_HOOKS.lock().unwrap();
            *global = Some(Arc::clone(&shared));
        }

        Ok(Self {
            is_installed: AtomicBool::new(true),
            shared,
        })
    }

    /// Sets the callback receiving captured keyboard events.
    pub fn set_keyboard_callback(&self, callback: KeyboardEventCallback) {
        let mut guard = self.shared.keyboard_callback.lock().unwrap();
        *guard = Some(callback);
    }

    /// Sets the callback receiving captured mouse events.
    pub fn set_mouse_callback(&self, callback: MouseEventCallback) {
        let mut guard = self.shared.mouse_callback.lock().unwrap();
        *guard = Some(callback);
    }

    /// Sets the observer callback receiving injected input events.
    pub fn set_injected_callback(&self, callback: InjectedInputCallback) {
        let mut guard = self.shared.injected_callback.lock().unwrap();
        *guard = Some(callback);
    }

    /// Uninstalls both low-level hooks deterministically.
    pub fn uninstall(&self) {
        if self.is_installed.swap(false, Ordering::SeqCst) {
            unsafe {
                if !self.shared.keyboard_hook.0.is_null() {
                    let _ = UnhookWindowsHookEx(self.shared.keyboard_hook);
                }
                if !self.shared.mouse_hook.0.is_null() {
                    let _ = UnhookWindowsHookEx(self.shared.mouse_hook);
                }
            }

            let mut global = ACTIVE_HOOKS.lock().unwrap();
            *global = None;
        }
    }

    /// Returns the current timestamp in microseconds.
    pub fn now_micros() -> i64 {
        crate::timing::clock::get_microseconds()
    }

    /// Low-level keyboard hook callback procedure.
    /// Executes ultra-fast to stay well below `LowLevelHooksTimeout`.
    unsafe extern "system" fn keyboard_proc(code: i32, wparam: WPARAM, lparam: LPARAM) -> LRESULT {
        if code >= 0 {
            let msg = wparam.0 as u32;
            let is_down = msg == WM_KEYDOWN || msg == WM_SYSKEYDOWN;
            let is_up = msg == WM_KEYUP || msg == WM_SYSKEYUP;

            if is_down || is_up {
                let data = &*(lparam.0 as *const KBDLLHOOKSTRUCT);
                let is_injected = (data.flags.0 & LLKHF_INJECTED) != 0;
                let now = Self::now_micros();

                let (hotkey_mgr, exclusion, kbd_cb, inj_cb) = {
                    let global = ACTIVE_HOOKS.lock().unwrap();
                    match &*global {
                        Some(s) => (
                            Arc::clone(&s.hotkey_manager),
                            Arc::clone(&s.exclusion_filter),
                            s.keyboard_callback.lock().unwrap().clone(),
                            s.injected_callback.lock().unwrap().clone(),
                        ),
                        None => {
                            return CallNextHookEx(None, code, wparam, lparam);
                        }
                    }
                };

                if is_injected {
                    // Record injected observer notification
                    if let Some(cb) = inj_cb {
                        cb(data.dwExtraInfo, now);
                    }

                    // Synthetic keystroke from SendInput or another macro: mark key down
                    // so matching WM_HOTKEY can be swallowed by HotkeyManager!
                    if is_down {
                        hotkey_mgr.mark_injected_key_down(data.vkCode);
                    }
                } else {
                    let extended = (data.flags.0 & 1) != 0;

                    // Exclude management shortcuts (e.g. Stop, Pause) from recorded stream
                    if !exclusion.is_key_excluded(data.vkCode) {
                        if let Some(cb) = kbd_cb {
                            cb(NativeKeyboardHookEvent {
                                event_type: if is_down { "KeyDown".to_string() } else { "KeyUp".to_string() },
                                virtual_key: data.vkCode,
                                scan_code: data.scanCode,
                                extended,
                                timestamp_microseconds: now,
                                is_injected: false,
                            });
                        }
                    }

                    // Check hook-driven keyboard binds: pass-through and swallow logic
                    if hotkey_mgr.handle_keyboard_hook(data.vkCode, is_down) {
                        // Key is eaten: do NOT pass down the hook chain; foreground app never sees it!
                        return LRESULT(1);
                    }
                }
            }
        }

        CallNextHookEx(None, code, wparam, lparam)
    }

    /// Low-level mouse hook callback procedure.
    unsafe extern "system" fn mouse_proc(code: i32, wparam: WPARAM, lparam: LPARAM) -> LRESULT {
        if code >= 0 {
            let msg = wparam.0 as u32;
            let data = &*(lparam.0 as *const MSLLHOOKSTRUCT);
            let is_injected = (data.flags & LLMHF_INJECTED) != 0;
            let now = Self::now_micros();

            let (hotkey_mgr, exclusion, mouse_cb, inj_cb) = {
                let global = ACTIVE_HOOKS.lock().unwrap();
                match &*global {
                    Some(s) => (
                        Arc::clone(&s.hotkey_manager),
                        Arc::clone(&s.exclusion_filter),
                        s.mouse_callback.lock().unwrap().clone(),
                        s.injected_callback.lock().unwrap().clone(),
                    ),
                    None => {
                        return CallNextHookEx(None, code, wparam, lparam);
                    }
                }
            };

            if is_injected {
                if let Some(cb) = inj_cb {
                    cb(data.dwExtraInfo, now);
                }
            } else {
                let mut event_type = "MouseMove";
                let mut button = MouseButton::None;
                let mut wheel_delta = 0i32;

                match msg {
                    WM_MOUSEMOVE => {
                        event_type = "MouseMove";
                    }
                    WM_LBUTTONDOWN => {
                        event_type = "MouseButtonDown";
                        button = MouseButton::Left;
                    }
                    WM_LBUTTONUP => {
                        event_type = "MouseButtonUp";
                        button = MouseButton::Left;
                    }
                    WM_RBUTTONDOWN => {
                        event_type = "MouseButtonDown";
                        button = MouseButton::Right;
                    }
                    WM_RBUTTONUP => {
                        event_type = "MouseButtonUp";
                        button = MouseButton::Right;
                    }
                    WM_MBUTTONDOWN => {
                        event_type = "MouseButtonDown";
                        button = MouseButton::Middle;
                    }
                    WM_MBUTTONUP => {
                        event_type = "MouseButtonUp";
                        button = MouseButton::Middle;
                    }
                    WM_XBUTTONDOWN => {
                        event_type = "MouseButtonDown";
                        let hi = (data.mouseData >> 16) & 0xFFFF;
                        button = if hi == 1 { MouseButton::X1 } else { MouseButton::X2 };
                    }
                    WM_XBUTTONUP => {
                        event_type = "MouseButtonUp";
                        let hi = (data.mouseData >> 16) & 0xFFFF;
                        button = if hi == 1 { MouseButton::X1 } else { MouseButton::X2 };
                    }
                    WM_MOUSEWHEEL => {
                        event_type = "Wheel";
                        wheel_delta = ((data.mouseData >> 16) as i16) as i32;
                    }
                    WM_MOUSEHWHEEL => {
                        event_type = "HorizontalWheel";
                        wheel_delta = ((data.mouseData >> 16) as i16) as i32;
                    }
                    _ => {}
                }

                // Activate mouse hotkey if button down or wheel
                if button != MouseButton::None && event_type == "MouseButtonDown" {
                    if let Some(action) = hotkey_mgr.handle_mouse_button(button) {
                        action();
                    }
                } else if event_type == "Wheel" {
                    let dir = if wheel_delta >= 0 {
                        WheelDirection::Up
                    } else {
                        WheelDirection::Down
                    };
                    if let Some(action) = hotkey_mgr.handle_mouse_wheel(dir) {
                        action();
                    }
                }

                // Check exclusion filter for management buttons
                if !exclusion.is_button_excluded(button) {
                    if let Some(cb) = mouse_cb {
                        cb(NativeMouseHookEvent {
                            event_type: event_type.to_string(),
                            button: button.to_string(),
                            x: data.pt.x,
                            y: data.pt.y,
                            wheel_delta,
                            timestamp_microseconds: now,
                            is_injected: false,
                        });
                    }
                }
            }
        }

        CallNextHookEx(None, code, wparam, lparam)
    }
}

impl Drop for LowLevelHookCapture {
    fn drop(&mut self) {
        self.uninstall();
    }
}

#[cfg(test)]
mod clock_tests {
    use super::LowLevelHookCapture;
    use crate::timing::clock::get_microseconds;

    #[test]
    fn capture_timestamps_use_the_scheduler_monotonic_clock() {
        let before = get_microseconds();
        let captured = LowLevelHookCapture::now_micros();
        let after = get_microseconds();
        assert!(captured >= before && captured <= after);
    }
}
