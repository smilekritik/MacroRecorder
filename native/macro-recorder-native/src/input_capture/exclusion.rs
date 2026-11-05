//! Configurable application-control hotkey exclusion filter.
//!
//! Excludes recording management shortcuts (Stop, Pause) and unbalanced modifier
//! keys from pollutional entry into captured macro event recordings.

use std::collections::HashSet;
use std::sync::RwLock;

use crate::hotkeys::binding::{HotkeyBinding, MouseButton};

/// Win32 virtual key codes for modifier keys:
/// Shift (0x10), Ctrl (0x11), Alt (0x12), LWin (0x5B), RWin (0x5C),
/// LShift (0xA0), RShift (0xA1), LCtrl (0xA2), RCtrl (0xA3), LAlt (0xA4), RAlt (0xA5).
pub const CONTROL_VIRTUAL_KEYS: &[u32] = &[
    0x10, 0x11, 0x12, 0x5B, 0x5C, 0xA0, 0xA1, 0xA2, 0xA3, 0xA4, 0xA5,
];

/// Thread-safe filter tracking excluded application management shortcuts.
#[derive(Debug, Default)]
pub struct ApplicationControlFilter {
    excluded_keys: RwLock<HashSet<u32>>,
    excluded_buttons: RwLock<HashSet<MouseButton>>,
}

impl ApplicationControlFilter {
    pub fn new() -> Self {
        Self::default()
    }

    /// Adds a hotkey binding to the exclusion list.
    pub fn add_exclusion(&self, binding: &HotkeyBinding) {
        if binding.virtual_key != 0 {
            let mut keys = self.excluded_keys.write().unwrap();
            keys.insert(binding.virtual_key);
        }
        if binding.mouse_button != MouseButton::None {
            let mut buttons = self.excluded_buttons.write().unwrap();
            buttons.insert(binding.mouse_button);
        }
    }

    /// Sets the full list of excluded management hotkeys.
    pub fn set_exclusions(&self, bindings: &[HotkeyBinding]) {
        let mut keys = self.excluded_keys.write().unwrap();
        let mut buttons = self.excluded_buttons.write().unwrap();
        keys.clear();
        buttons.clear();

        for binding in bindings {
            if binding.virtual_key != 0 {
                keys.insert(binding.virtual_key);
            }
            if binding.mouse_button != MouseButton::None {
                buttons.insert(binding.mouse_button);
            }
        }
    }

    /// Checks if a keyboard virtual key is an excluded management key.
    pub fn is_key_excluded(&self, virtual_key: u32) -> bool {
        let keys = self.excluded_keys.read().unwrap();
        keys.contains(&virtual_key)
    }

    /// Checks if a mouse button is an excluded management button.
    pub fn is_button_excluded(&self, button: MouseButton) -> bool {
        let buttons = self.excluded_buttons.read().unwrap();
        buttons.contains(&button)
    }

    /// Returns `true` if the key is a standard Win32 control modifier key.
    pub fn is_modifier_key(virtual_key: u32) -> bool {
        CONTROL_VIRTUAL_KEYS.contains(&virtual_key)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_application_control_exclusion() {
        let filter = ApplicationControlFilter::new();

        // Stop shortcut: Ctrl + Shift + F10 (0x79)
        let stop_shortcut = HotkeyBinding::keyboard(0x79, true, false, true, false);
        // Pause shortcut: Mouse X1
        let pause_shortcut = HotkeyBinding::mouse(MouseButton::X1, false, false, false, false);

        filter.set_exclusions(&[stop_shortcut, pause_shortcut]);

        // F10 is excluded
        assert!(filter.is_key_excluded(0x79));
        // Normal key 'A' is NOT excluded
        assert!(!filter.is_key_excluded(0x41));

        // Mouse X1 is excluded
        assert!(filter.is_button_excluded(MouseButton::X1));
        // Left click is NOT excluded
        assert!(!filter.is_button_excluded(MouseButton::Left));
    }

    #[test]
    fn test_modifier_key_detection() {
        assert!(ApplicationControlFilter::is_modifier_key(0x10)); // Shift
        assert!(ApplicationControlFilter::is_modifier_key(0x11)); // Ctrl
        assert!(ApplicationControlFilter::is_modifier_key(0x12)); // Alt
        assert!(ApplicationControlFilter::is_modifier_key(0x5B)); // LWin
        assert!(!ApplicationControlFilter::is_modifier_key(0x41)); // 'A'
    }
}
