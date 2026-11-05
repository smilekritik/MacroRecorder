//! Universal held-state tracking and release coordination across global and targeted modes.
//!
//! Maintains exact reference counting and destination tracking for:
//! - Globally pressed virtual keys and mouse buttons.
//! - Per-window held keys and buttons (in targeted mode).
//!
//! Guarantees that all held inputs are released to their respective destinations
//! on normal termination, cancellation, panic, or emergency stop.

use std::collections::{HashMap, HashSet};
use std::str::FromStr;
use std::sync::Mutex;
use windows::Win32::Foundation::HWND;

/// Supported mouse buttons for injection and state tracking.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum MouseButton {
    Left,
    Right,
    Middle,
    X1,
    X2,
}

impl FromStr for MouseButton {
    type Err = ();

    fn from_str(name: &str) -> Result<Self, Self::Err> {
        match name.to_ascii_lowercase().as_str() {
            "left" => Ok(Self::Left),
            "right" => Ok(Self::Right),
            "middle" => Ok(Self::Middle),
            "x1" | "xbutton1" => Ok(Self::X1),
            "x2" | "xbutton2" => Ok(Self::X2),
            _ => Err(()),
        }
    }
}

impl MouseButton {
    /// Parses a mouse button identifier string.
    pub fn parse(name: &str) -> Option<Self> {
        name.parse().ok()
    }
}

/// Represents an ownership delta for rollback on injection failure.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum OwnershipChange {
    None,
    AddedKey(u32),
    RemovedKey(u32),
    AddedButton(MouseButton),
    RemovedButton(MouseButton),
}

use std::sync::OnceLock;

/// Global shared state synchronizer across all instances and macros.
struct GlobalHeldState {
    global_keys: HashMap<u32, usize>,
    global_buttons: HashMap<MouseButton, usize>,
}

static GLOBAL_STATE: OnceLock<Mutex<GlobalHeldState>> = OnceLock::new();

fn global_state() -> &'static Mutex<GlobalHeldState> {
    GLOBAL_STATE.get_or_init(|| {
        Mutex::new(GlobalHeldState {
            global_keys: HashMap::new(),
            global_buttons: HashMap::new(),
        })
    })
}

/// Tracks held keys and buttons globally and per window for an injector instance.
pub struct InputStateTracker {
    instance_keys: Mutex<HashSet<u32>>,
    instance_buttons: Mutex<HashSet<MouseButton>>,
    window_keys: Mutex<HashMap<isize, HashSet<u32>>>,
    window_buttons: Mutex<HashMap<isize, HashSet<MouseButton>>>,
}

impl Default for InputStateTracker {
    fn default() -> Self {
        Self::new()
    }
}

impl InputStateTracker {
    /// Creates a new state tracker.
    pub fn new() -> Self {
        Self {
            instance_keys: Mutex::new(HashSet::new()),
            instance_buttons: Mutex::new(HashSet::new()),
            window_keys: Mutex::new(HashMap::new()),
            window_buttons: Mutex::new(HashMap::new()),
        }
    }

    /// Prepares global key ownership before SendInput dispatch.
    ///
    /// Returns `(OwnershipChange, should_send)`.
    pub fn prepare_key_ownership(&self, vk: u32, is_down: bool) -> (OwnershipChange, bool) {
        let mut inst_keys = self.instance_keys.lock().unwrap();
        let mut global_guard = global_state().lock().unwrap();

        if is_down {
            if inst_keys.insert(vk) {
                let count = global_guard.global_keys.entry(vk).or_insert(0);
                *count += 1;
                let should_send = *count == 1;
                (OwnershipChange::AddedKey(vk), should_send)
            } else {
                // Key is already pressed by this macro instance
                let count = *global_guard.global_keys.get(&vk).unwrap_or(&0);
                (OwnershipChange::None, count == 0)
            }
        } else if inst_keys.remove(&vk) {
            let count = global_guard.global_keys.entry(vk).or_insert(1);
            if *count <= 1 {
                global_guard.global_keys.remove(&vk);
                (OwnershipChange::RemovedKey(vk), true)
            } else {
                *count -= 1;
                (OwnershipChange::RemovedKey(vk), false)
            }
        } else {
            let should_send = !global_guard.global_keys.contains_key(&vk);
            (OwnershipChange::None, should_send)
        }
    }

    /// Rolls back an ownership change if `SendInput` fails.
    pub fn rollback_key_ownership(&self, change: OwnershipChange) {
        let mut inst_keys = self.instance_keys.lock().unwrap();
        let mut global_guard = global_state().lock().unwrap();

        match change {
            OwnershipChange::AddedKey(vk) => {
                inst_keys.remove(&vk);
                if let Some(count) = global_guard.global_keys.get_mut(&vk) {
                    if *count <= 1 {
                        global_guard.global_keys.remove(&vk);
                    } else {
                        *count -= 1;
                    }
                }
            }
            OwnershipChange::RemovedKey(vk) => {
                inst_keys.insert(vk);
                *global_guard.global_keys.entry(vk).or_insert(0) += 1;
            }
            _ => {}
        }
    }

    /// Prepares global mouse button ownership before SendInput dispatch.
    pub fn prepare_button_ownership(
        &self,
        button: MouseButton,
        is_down: bool,
    ) -> (OwnershipChange, bool) {
        let mut inst_buttons = self.instance_buttons.lock().unwrap();
        let mut global_guard = global_state().lock().unwrap();

        if is_down {
            if inst_buttons.insert(button) {
                let count = global_guard.global_buttons.entry(button).or_insert(0);
                *count += 1;
                let should_send = *count == 1;
                (OwnershipChange::AddedButton(button), should_send)
            } else {
                let count = *global_guard.global_buttons.get(&button).unwrap_or(&0);
                (OwnershipChange::None, count == 0)
            }
        } else if inst_buttons.remove(&button) {
            let count = global_guard.global_buttons.entry(button).or_insert(1);
            if *count <= 1 {
                global_guard.global_buttons.remove(&button);
                (OwnershipChange::RemovedButton(button), true)
            } else {
                *count -= 1;
                (OwnershipChange::RemovedButton(button), false)
            }
        } else {
            let should_send = !global_guard.global_buttons.contains_key(&button);
            (OwnershipChange::None, should_send)
        }
    }

    /// Rolls back button ownership if `SendInput` fails.
    pub fn rollback_button_ownership(&self, change: OwnershipChange) {
        let mut inst_buttons = self.instance_buttons.lock().unwrap();
        let mut global_guard = global_state().lock().unwrap();

        match change {
            OwnershipChange::AddedButton(btn) => {
                inst_buttons.remove(&btn);
                if let Some(count) = global_guard.global_buttons.get_mut(&btn) {
                    if *count <= 1 {
                        global_guard.global_buttons.remove(&btn);
                    } else {
                        *count -= 1;
                    }
                }
            }
            OwnershipChange::RemovedButton(btn) => {
                inst_buttons.insert(btn);
                *global_guard.global_buttons.entry(btn).or_insert(0) += 1;
            }
            _ => {}
        }
    }

    /// Tracks key press/release state for targeted window delivery.
    pub fn track_window_key(&self, hwnd: HWND, vk: u32, is_down: bool) {
        let key = hwnd.0 as isize;
        let mut guard = self.window_keys.lock().unwrap();
        if is_down {
            guard.entry(key).or_default().insert(vk);
        } else if let Some(set) = guard.get_mut(&key) {
            set.remove(&vk);
        }
    }

    /// Tracks button press/release state for targeted window delivery.
    pub fn track_window_button(&self, hwnd: HWND, button: MouseButton, is_down: bool) {
        let key = hwnd.0 as isize;
        let mut guard = self.window_buttons.lock().unwrap();
        if is_down {
            guard.entry(key).or_default().insert(button);
        } else if let Some(set) = guard.get_mut(&key) {
            set.remove(&button);
        }
    }

    /// Drains and returns all currently held global keys and buttons for release.
    pub fn drain_global_held(&self) -> (Vec<u32>, Vec<MouseButton>) {
        let mut inst_keys = self.instance_keys.lock().unwrap();
        let mut inst_buttons = self.instance_buttons.lock().unwrap();
        let mut global_guard = global_state().lock().unwrap();

        let keys: Vec<u32> = inst_keys.drain().collect();
        for &vk in &keys {
            if let Some(count) = global_guard.global_keys.get_mut(&vk) {
                if *count <= 1 {
                    global_guard.global_keys.remove(&vk);
                } else {
                    *count -= 1;
                }
            }
        }

        let buttons: Vec<MouseButton> = inst_buttons.drain().collect();
        for &btn in &buttons {
            if let Some(count) = global_guard.global_buttons.get_mut(&btn) {
                if *count <= 1 {
                    global_guard.global_buttons.remove(&btn);
                } else {
                    *count -= 1;
                }
            }
        }

        (keys, buttons)
    }

    /// Drains and returns held inputs for a specific window.
    pub fn drain_window_held(&self, hwnd: HWND) -> (Vec<u32>, Vec<MouseButton>) {
        let key = hwnd.0 as isize;
        let mut wk = self.window_keys.lock().unwrap();
        let mut wb = self.window_buttons.lock().unwrap();

        let keys = wk.remove(&key).map(|s| s.into_iter().collect()).unwrap_or_default();
        let buttons = wb.remove(&key).map(|s| s.into_iter().collect()).unwrap_or_default();

        (keys, buttons)
    }

    /// Drains and returns held inputs for all windows.
    pub fn drain_all_windows_held(&self) -> Vec<(HWND, Vec<u32>, Vec<MouseButton>)> {
        let mut wk = self.window_keys.lock().unwrap();
        let mut wb = self.window_buttons.lock().unwrap();

        let mut window_ids: HashSet<isize> = HashSet::new();
        window_ids.extend(wk.keys().copied());
        window_ids.extend(wb.keys().copied());

        let mut results = Vec::new();
        for id in window_ids {
            let hwnd = HWND(id as *mut _);
            let keys: Vec<u32> = wk.remove(&id).map(|s| s.into_iter().collect()).unwrap_or_default();
            let buttons: Vec<MouseButton> = wb.remove(&id).map(|s| s.into_iter().collect()).unwrap_or_default();
            if !keys.is_empty() || !buttons.is_empty() {
                results.push((hwnd, keys, buttons));
            }
        }

        results
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_global_key_ownership_and_drain() {
        let tracker = InputStateTracker::new();
        let (change, send) = tracker.prepare_key_ownership(0x41, true);
        assert_eq!(change, OwnershipChange::AddedKey(0x41));
        assert!(send);

        // Second press by same tracker should not re-send
        let (_, send2) = tracker.prepare_key_ownership(0x41, true);
        assert!(!send2);

        // Drain should return the pressed key and clean state
        let (keys, _) = tracker.drain_global_held();
        assert_eq!(keys, vec![0x41]);

        let (keys_after, _) = tracker.drain_global_held();
        assert!(keys_after.is_empty());
    }

    #[test]
    fn test_window_tracking_and_drain() {
        let tracker = InputStateTracker::new();
        let fake_hwnd = HWND(0x5678 as *mut _);

        tracker.track_window_key(fake_hwnd, 0x42, true);
        tracker.track_window_button(fake_hwnd, MouseButton::Left, true);

        let (keys, buttons) = tracker.drain_window_held(fake_hwnd);
        assert_eq!(keys, vec![0x42]);
        assert_eq!(buttons, vec![MouseButton::Left]);

        // After drain, window state is empty
        let (keys2, buttons2) = tracker.drain_window_held(fake_hwnd);
        assert!(keys2.is_empty());
        assert!(buttons2.is_empty());
    }
}
