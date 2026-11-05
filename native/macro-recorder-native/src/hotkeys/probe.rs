//! Win32 availability probing for global shortcuts.
//!
//! Checks whether gestures can be registered globally without conflict with other applications
//! (e.g. overlays, game bars, screen capture utilities).

use windows::Win32::Foundation::HWND;
use windows::Win32::UI::Input::KeyboardAndMouse::{
    RegisterHotKey, UnregisterHotKey, HOT_KEY_MODIFIERS,
};

use crate::hotkeys::binding::HotkeyBinding;

/// Reserved hotkey identifier used for probing availability.
pub const PROBE_HOTKEY_ID: i32 = 0x3FFF;

/// Probes availability for a list of candidate hotkey bindings.
///
/// Returns a boolean for each binding in `bindings`:
/// - `true`: Available (not taken by a foreign application, or already owned by us, or is a mouse binding).
/// - `false`: Unavailable (conflicts with another running application that registered the shortcut).
pub fn probe_availability(
    hwnd: HWND,
    bindings: &[HotkeyBinding],
    owned_bindings: &[HotkeyBinding],
) -> Vec<bool> {
    if bindings.is_empty() {
        return Vec::new();
    }

    let mut results = Vec::with_capacity(bindings.len());

    for binding in bindings {
        // Mouse and wheel hotkeys are caught by low-level hooks; they have no global Win32 queue,
        // so there is nothing foreign to conflict with.
        if binding.is_empty() || binding.is_mouse() {
            results.push(true);
            continue;
        }

        // If the binding is already registered by our own application, it is considered available.
        let is_ours = owned_bindings.iter().any(|registered| registered.same_gesture(binding));
        if is_ours {
            results.push(true);
            continue;
        }

        // Safety net: ensure leftover probe ID is unregistered before attempting.
        unsafe {
            let _ = UnregisterHotKey(hwnd, PROBE_HOTKEY_ID);
        }

        let modifiers = HOT_KEY_MODIFIERS(binding.modifier_flags());
        let registered = unsafe {
            RegisterHotKey(hwnd, PROBE_HOTKEY_ID, modifiers, binding.virtual_key)
        };

        if registered.is_ok() {
            // Successfully registered; immediately unregister and mark as free.
            unsafe {
                let _ = UnregisterHotKey(hwnd, PROBE_HOTKEY_ID);
            }
            results.push(true);
        } else {
            // Registration failed: another window or application currently holds this hotkey.
            results.push(false);
        }
    }

    results
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_probe_empty_and_mouse_always_available() {
        let hwnd = HWND::default();
        let bindings = vec![
            HotkeyBinding::empty(),
            HotkeyBinding::mouse(
                crate::hotkeys::binding::MouseButton::Left,
                true,
                false,
                false,
                false,
            ),
            HotkeyBinding::wheel(
                crate::hotkeys::binding::WheelDirection::Up,
                true,
                false,
                false,
                false,
            ),
        ];

        let results = probe_availability(hwnd, &bindings, &[]);
        assert_eq!(results, vec![true, true, true]);
    }

    #[test]
    fn test_probe_own_registered_binding_is_available() {
        let hwnd = HWND::default();
        let kbd = HotkeyBinding::keyboard(0x41, true, false, false, false);
        let bindings = vec![kbd.clone()];
        let owned = vec![kbd];

        let results = probe_availability(hwnd, &bindings, &owned);
        assert_eq!(results, vec![true]);
    }
}
