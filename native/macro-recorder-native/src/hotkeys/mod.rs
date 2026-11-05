//! Hotkey management, availability probing, and hook-driven bind decision engine.
//!
//! Provides:
//! - Standard Win32 `RegisterHotKey` / `UnregisterHotKey` global shortcuts.
//! - Hook-driven keyboard binds with pass-through and target window scope policy.
//! - Mouse button and wheel scroll hotkeys.
//! - Foreign application hotkey conflict detection and availability probing.
//! - Autorepeat suppression and exact swallowed key-up tracking.
//! - Injected synthetic event suppression to prevent playback re-trigger loops.

pub mod binding;
pub mod decision;
pub mod manager;
pub mod probe;

pub use binding::{
    is_key_pressed, HotkeyBinding, MouseButton, WheelDirection, MOD_ALT, MOD_CONTROL, MOD_NOREPEAT,
    MOD_SHIFT, MOD_WIN, VK_CONTROL, VK_LWIN, VK_MENU, VK_RWIN, VK_SHIFT,
};
pub use decision::{decide_keyboard_down, KeyboardBindDecision};
pub use manager::{HotkeyAction, HotkeyManager, HotkeyPolicy, ScopePredicate};
pub use probe::{probe_availability, PROBE_HOTKEY_ID};
