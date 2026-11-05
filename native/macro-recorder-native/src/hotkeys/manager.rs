//! Comprehensive native hotkey and bind manager.
//!
//! Handles:
//! - Standard Win32 `RegisterHotKey` / `UnregisterHotKey` shortcuts.
//! - Hook-driven keyboard binds with pass-through and target window scope policy.
//! - Mouse button and wheel scroll hotkeys.
//! - Conflict rejection for duplicate gestures.
//! - Suppression of synthetic injected keystrokes (`WM_HOTKEY` swallow within 250 ms window).
//! - Autorepeat suppression and exact swallowed key-up tracking.

use std::collections::{HashMap, HashSet};
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use windows::Win32::Foundation::HWND;
use windows::Win32::UI::Input::KeyboardAndMouse::{
    RegisterHotKey, UnregisterHotKey, HOT_KEY_MODIFIERS,
};

use crate::error::{NativeError, NativeResult};
use crate::hotkeys::binding::{HotkeyBinding, MouseButton, WheelDirection};
use crate::hotkeys::decision::decide_keyboard_down;
use crate::hotkeys::probe::probe_availability;

/// Callback action invoked when a hotkey triggers.
pub type HotkeyAction = Arc<dyn Fn() + Send + Sync + 'static>;

/// Condition predicate evaluating whether a scoped hotkey should fire.
pub type ScopePredicate = Arc<dyn Fn() -> bool + Send + Sync + 'static>;

/// Policy configuration for a keyboard or mouse bind.
#[derive(Clone, Default)]
pub struct HotkeyPolicy {
    /// If `true`, the initial key press passes through to the foreground application.
    /// Subsequent OS auto-repeats are swallowed.
    pub pass_through: bool,
    /// Optional scope predicate. If present and returns `false`, the hotkey passes through
    /// without firing.
    pub should_fire: Option<ScopePredicate>,
}

impl HotkeyPolicy {
    pub fn new(pass_through: bool, should_fire: Option<ScopePredicate>) -> Self {
        Self {
            pass_through,
            should_fire,
        }
    }
}

/// Registration record for a standard Win32 `RegisterHotKey` shortcut.
struct StandardHotkeyRegistration {
    binding: HotkeyBinding,
    action: HotkeyAction,
}

/// Registration record for a mouse button or wheel scroll hotkey.
struct MouseHotkeyRegistration {
    binding: HotkeyBinding,
    action: HotkeyAction,
    should_fire: Option<ScopePredicate>,
}

/// Registration record for a hook-driven keyboard bind (pass-through / scoped).
struct KeyboardBindRegistration {
    binding: HotkeyBinding,
    action: HotkeyAction,
    pass_through: bool,
    should_fire: Option<ScopePredicate>,
}

/// Manager coordinating global hotkeys, mouse binds, hook-driven binds, and injected-event suppression.
pub struct HotkeyManager {
    next_id: AtomicU32,
    standard_hotkeys: Mutex<HashMap<u32, StandardHotkeyRegistration>>,
    mouse_hotkeys: Mutex<HashMap<u32, MouseHotkeyRegistration>>,
    keyboard_binds: Mutex<HashMap<u32, KeyboardBindRegistration>>,
    // Set of IDs currently pressed down (to suppress auto-repeats).
    keyboard_down: Mutex<HashSet<u32>>,
    // Set of IDs whose press was eaten (so release is eaten too).
    eaten_down: Mutex<HashSet<u32>>,
    // Injection timestamps for virtual keys to swallow matching synthetic WM_HOTKEY events.
    injected_key_down_ticks: Mutex<HashMap<u32, Instant>>,
}

impl HotkeyManager {
    /// Invalidation time window for synthetic injected input (~250 ms).
    pub const INJECTION_WINDOW: Duration = Duration::from_millis(250);

    pub fn new() -> Self {
        Self {
            next_id: AtomicU32::new(100),
            standard_hotkeys: Mutex::new(HashMap::new()),
            mouse_hotkeys: Mutex::new(HashMap::new()),
            keyboard_binds: Mutex::new(HashMap::new()),
            keyboard_down: Mutex::new(HashSet::new()),
            eaten_down: Mutex::new(HashSet::new()),
            injected_key_down_ticks: Mutex::new(HashMap::new()),
        }
    }

    /// Allocates a unique hotkey ID.
    pub fn next_id(&self) -> u32 {
        self.next_id.fetch_add(1, Ordering::SeqCst)
    }

    /// Registers a hotkey binding using a manager-assigned identifier.
    pub fn register_hotkey(
        &self,
        hwnd: HWND,
        binding: HotkeyBinding,
        action: HotkeyAction,
        policy: Option<HotkeyPolicy>,
    ) -> NativeResult<u32> {
        self.register_hotkey_with_id(hwnd, binding, action, policy, None)
    }

    /// Registers a hotkey binding, preserving a caller-provided identifier when supplied.
    /// This keeps N-API callbacks and unregister calls in the same identifier namespace as
    /// the TypeScript application while retaining manager-assigned IDs for native callers.
    pub fn register_hotkey_with_id(
        &self,
        hwnd: HWND,
        binding: HotkeyBinding,
        action: HotkeyAction,
        policy: Option<HotkeyPolicy>,
        requested_id: Option<u32>,
    ) -> NativeResult<u32> {
        if binding.is_empty() {
            return Err(NativeError::invalid_argument("Cannot register an empty hotkey binding"));
        }

        let id = requested_id.unwrap_or_else(|| self.next_id());
        if self.standard_hotkeys.lock().unwrap().contains_key(&id)
            || self.mouse_hotkeys.lock().unwrap().contains_key(&id)
            || self.keyboard_binds.lock().unwrap().contains_key(&id)
        {
            return Err(NativeError::hotkey_conflict(format!(
                "Hotkey identifier {id} is already registered."
            )));
        }

        // 1. Mouse or wheel binding
        if binding.is_mouse() {
            let mut mouse_guard = self.mouse_hotkeys.lock().unwrap();
            for existing in mouse_guard.values() {
                if existing.binding.same_gesture(&binding) {
                    return Err(NativeError::hotkey_conflict(format!(
                        "Shortcut {binding} is already in use."
                    )));
                }
            }

            mouse_guard.insert(
                id,
                MouseHotkeyRegistration {
                    binding,
                    action,
                    should_fire: policy.and_then(|p| p.should_fire),
                },
            );
            return Ok(id);
        }

        // 2. Hook-driven keyboard binding (Pass-through or Scoped to target window)
        // Standard Win32 RegisterHotKey swallows the key down globally; pass-through / scope
        // cannot be implemented via RegisterHotKey, so we drive them via WH_KEYBOARD_LL.
        let policy_ref = policy.as_ref();
        let is_hook_driven = policy_ref.map_or(false, |p| p.pass_through || p.should_fire.is_some());

        if is_hook_driven {
            let mut kbd_guard = self.keyboard_binds.lock().unwrap();
            for existing in kbd_guard.values() {
                if existing.binding.same_gesture(&binding) {
                    return Err(NativeError::hotkey_conflict(format!(
                        "Shortcut {binding} is already in use."
                    )));
                }
            }

            let pass_through = policy_ref.map_or(false, |p| p.pass_through);
            let should_fire = policy.and_then(|p| p.should_fire);

            kbd_guard.insert(
                id,
                KeyboardBindRegistration {
                    binding,
                    action,
                    pass_through,
                    should_fire,
                },
            );
            return Ok(id);
        }

        // 3. Standard global RegisterHotKey
        {
            let mut std_guard = self.standard_hotkeys.lock().unwrap();
            for existing in std_guard.values() {
                if existing.binding.same_gesture(&binding) {
                    return Err(NativeError::hotkey_conflict(format!(
                        "Shortcut {binding} is already in use."
                    )));
                }
            }

            let mod_flags = HOT_KEY_MODIFIERS(binding.modifier_flags());
            let reg_res = unsafe { RegisterHotKey(hwnd, id as i32, mod_flags, binding.virtual_key) };

            if let Err(e) = reg_res {
                return Err(NativeError::hotkey_conflict(format!(
                    "Could not register {binding} (Win32 error: {e})"
                )));
            }

            std_guard.insert(id, StandardHotkeyRegistration { binding, action });
        }

        Ok(id)
    }

    /// Unregisters a previously registered hotkey ID across all registries.
    pub fn unregister_hotkey(&self, hwnd: HWND, id: u32) {
        // Remove from mouse hotkeys
        let removed_mouse = {
            let mut guard = self.mouse_hotkeys.lock().unwrap();
            guard.remove(&id).is_some()
        };

        // Remove from hook-driven keyboard binds
        let removed_kbd_bind = {
            let mut guard = self.keyboard_binds.lock().unwrap();
            let mut down_guard = self.keyboard_down.lock().unwrap();
            let mut eaten_guard = self.eaten_down.lock().unwrap();
            down_guard.remove(&id);
            eaten_guard.remove(&id);
            guard.remove(&id).is_some()
        };

        // Remove from standard RegisterHotKey
        let removed_standard = {
            let mut guard = self.standard_hotkeys.lock().unwrap();
            guard.remove(&id).is_some()
        };

        if removed_standard && !removed_mouse && !removed_kbd_bind {
            unsafe {
                let _ = UnregisterHotKey(hwnd, id as i32);
            }
        }
    }

    /// Probes availability for a list of candidate bindings.
    pub fn probe_availability(&self, hwnd: HWND, bindings: &[HotkeyBinding]) -> Vec<bool> {
        let owned = self.all_registered_bindings();
        probe_availability(hwnd, bindings, &owned)
    }

    /// Collects all currently registered gestures across all registries.
    pub fn all_registered_bindings(&self) -> Vec<HotkeyBinding> {
        let mut list = Vec::new();
        {
            let guard = self.standard_hotkeys.lock().unwrap();
            list.extend(guard.values().map(|r| r.binding.clone()));
        }
        {
            let guard = self.mouse_hotkeys.lock().unwrap();
            list.extend(guard.values().map(|r| r.binding.clone()));
        }
        {
            let guard = self.keyboard_binds.lock().unwrap();
            list.extend(guard.values().map(|r| r.binding.clone()));
        }
        list
    }

    /// Marks that a virtual key was pressed synthetically via injection (e.g. SendInput).
    /// Used to swallow synthetic `WM_HOTKEY` arrivals.
    pub fn mark_injected_key_down(&self, virtual_key: u32) {
        let mut guard = self.injected_key_down_ticks.lock().unwrap();
        guard.insert(virtual_key, Instant::now());
    }

    /// Returns `true` if `virtual_key` was pressed by synthetic injection within the 250 ms window.
    /// Consumes the mark on match so one injection swallows exactly one `WM_HOTKEY`.
    pub fn was_injected(&self, virtual_key: u32) -> bool {
        let mut guard = self.injected_key_down_ticks.lock().unwrap();
        if let Some(tick) = guard.remove(&virtual_key) {
            tick.elapsed() <= Self::INJECTION_WINDOW
        } else {
            false
        }
    }

    /// Handles a `WM_HOTKEY` message received by the window procedure.
    /// Returns the action to execute if valid and not injected.
    pub fn handle_wm_hotkey(&self, id: u32) -> Option<HotkeyAction> {
        let registration = {
            let guard = self.standard_hotkeys.lock().unwrap();
            guard.get(&id).map(|r| (r.binding.virtual_key, Arc::clone(&r.action)))
        };

        if let Some((vk, action)) = registration {
            // If this WM_HOTKEY was caused by synthetic injection (SendInput from playback or macro),
            // swallow it to prevent loop re-triggering!
            if self.was_injected(vk) {
                return None;
            }
            Some(action)
        } else {
            None
        }
    }

    /// Evaluates a keyboard hook event against hook-driven binds.
    ///
    /// Returns `true` if the event should be eaten (swallowed) and NOT forwarded to the OS.
    pub fn handle_keyboard_hook(&self, virtual_key: u32, is_down: bool) -> bool {
        let match_info = {
            let guard = self.keyboard_binds.lock().unwrap();
            guard.iter().find_map(|(&id, r)| {
                if r.binding.virtual_key == virtual_key && r.binding.modifiers_match() {
                    Some((
                        id,
                        Arc::clone(&r.action),
                        r.pass_through,
                        r.should_fire.as_ref().map(Arc::clone),
                    ))
                } else {
                    None
                }
            })
        };

        let (id, action, pass_through, should_fire) = match match_info {
            Some(m) => m,
            None => return false,
        };

        if !is_down {
            let mut down_guard = self.keyboard_down.lock().unwrap();
            let mut eaten_guard = self.eaten_down.lock().unwrap();
            down_guard.remove(&id);
            // Key release is eaten exactly when the original key press was eaten!
            return eaten_guard.remove(&id);
        }

        let fire = should_fire.map_or(true, |f| f());
        let first_press = {
            let mut down_guard = self.keyboard_down.lock().unwrap();
            down_guard.insert(id)
        };

        let decision = decide_keyboard_down(first_press, fire, pass_through);

        if decision.run_action {
            action();
        }

        if first_press {
            let mut eaten_guard = self.eaten_down.lock().unwrap();
            if decision.eat {
                eaten_guard.insert(id);
            } else {
                eaten_guard.remove(&id);
            }
        }

        decision.eat
    }

    /// Evaluates a mouse button event against registered mouse hotkeys.
    /// Returns the action to execute if a matching hotkey is triggered.
    pub fn handle_mouse_button(&self, button: MouseButton) -> Option<HotkeyAction> {
        let guard = self.mouse_hotkeys.lock().unwrap();
        for r in guard.values() {
            if r.binding.mouse_button == button
                && r.binding.wheel == WheelDirection::None
                && r.binding.modifiers_match()
            {
                if let Some(ref scope) = r.should_fire {
                    if !scope() {
                        continue;
                    }
                }
                return Some(Arc::clone(&r.action));
            }
        }
        None
    }

    /// Evaluates a wheel scroll event against registered wheel hotkeys.
    /// Returns the action to execute if a matching hotkey is triggered.
    pub fn handle_mouse_wheel(&self, direction: WheelDirection) -> Option<HotkeyAction> {
        let guard = self.mouse_hotkeys.lock().unwrap();
        for r in guard.values() {
            if r.binding.wheel == direction && r.binding.modifiers_match() {
                if let Some(ref scope) = r.should_fire {
                    if !scope() {
                        continue;
                    }
                }
                return Some(Arc::clone(&r.action));
            }
        }
        None
    }

    /// Cleans up all hotkey registrations upon shutdown.
    pub fn shutdown(&self, hwnd: HWND) {
        {
            let mut std_guard = self.standard_hotkeys.lock().unwrap();
            for &id in std_guard.keys() {
                unsafe {
                    let _ = UnregisterHotKey(hwnd, id as i32);
                }
            }
            std_guard.clear();
        }
        {
            let mut mouse_guard = self.mouse_hotkeys.lock().unwrap();
            mouse_guard.clear();
        }
        {
            let mut kbd_guard = self.keyboard_binds.lock().unwrap();
            kbd_guard.clear();
        }
        {
            let mut down_guard = self.keyboard_down.lock().unwrap();
            down_guard.clear();
        }
        {
            let mut eaten_guard = self.eaten_down.lock().unwrap();
            eaten_guard.clear();
        }
        {
            let mut inj_guard = self.injected_key_down_ticks.lock().unwrap();
            inj_guard.clear();
        }
    }
}

impl Default for HotkeyManager {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::AtomicBool;

    /// LEGACY-TEST-026 / NATIVE-INPUT-026: InputCaptureService_RegistersMouseHotkeysAndRejectsConflicts
    #[test]
    fn test_registers_mouse_hotkeys_and_rejects_conflicts() {
        let manager = HotkeyManager::new();
        let hwnd = HWND::default();

        let binding1 = HotkeyBinding::mouse(MouseButton::X2, true, false, false, false);
        let action1: HotkeyAction = Arc::new(|| {});
        let id1 = manager
            .register_hotkey(hwnd, binding1, action1, None)
            .expect("register mouse hotkey 1");
        assert!(id1 > 0);

        // Attempt duplicate registration
        let binding2 = HotkeyBinding::mouse(MouseButton::X2, true, false, false, false);
        let action2: HotkeyAction = Arc::new(|| {});
        let err = manager
            .register_hotkey(hwnd, binding2, action2, None)
            .expect_err("should reject conflicting mouse hotkey");
        assert_eq!(err.code, crate::error::IpcErrorCode::HotkeyConflict);

        manager.unregister_hotkey(hwnd, id1);
    }

    #[test]
    fn test_injected_input_suppression_window() {
        let manager = HotkeyManager::new();

        // Mark VK 0x41 as injected
        manager.mark_injected_key_down(0x41);

        // First query within 250ms must be true and consume mark
        assert!(manager.was_injected(0x41));

        // Subsequent query must be false (mark consumed)
        assert!(!manager.was_injected(0x41));
    }

    #[test]
    fn test_hook_driven_keyboard_bind_lifecycle() {
        let manager = HotkeyManager::new();
        let hwnd = HWND::default();
        let triggered = Arc::new(AtomicBool::new(false));
        let triggered_clone = Arc::clone(&triggered);

        let binding = HotkeyBinding::keyboard(0x5A, false, false, false, false); // 'Z'
        let action: HotkeyAction = Arc::new(move || {
            triggered_clone.store(true, Ordering::SeqCst);
        });

        // Pass-through = false (eats press and release), scoped predicate enables hook-driven bind
        let policy = HotkeyPolicy::new(false, Some(Arc::new(|| true)));
        let id = manager
            .register_hotkey(hwnd, binding, action, Some(policy))
            .expect("register kbd bind");

        // Simulate initial press
        let eat_press = manager.handle_keyboard_hook(0x5A, true);
        assert!(eat_press);
        assert!(triggered.load(Ordering::SeqCst));

        // Simulate auto-repeat
        let eat_repeat = manager.handle_keyboard_hook(0x5A, true);
        assert!(eat_repeat);

        // Simulate release: must be eaten because press was eaten
        let eat_release = manager.handle_keyboard_hook(0x5A, false);
        assert!(eat_release);

        // Subsequent release: not eaten
        let eat_release2 = manager.handle_keyboard_hook(0x5A, false);
        assert!(!eat_release2);

        manager.unregister_hotkey(hwnd, id);
    }
}
