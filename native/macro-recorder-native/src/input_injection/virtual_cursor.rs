//! Virtual client cursor management for HWND-targeted mouse delivery.
//!
//! Maintains synthetic cursor coordinates in client-space for background windows,
//! clamping movements to client boundaries and initializing to client center.

use std::collections::HashMap;
use std::sync::Mutex;
use windows::Win32::Foundation::{HWND, RECT};
use windows::Win32::UI::WindowsAndMessaging::GetClientRect;

/// Thread-safe manager for virtual client cursors across multiple target HWNDs.
pub struct VirtualCursorManager {
    positions: Mutex<HashMap<isize, (i32, i32)>>,
}

impl Default for VirtualCursorManager {
    fn default() -> Self {
        Self::new()
    }
}

impl VirtualCursorManager {
    /// Creates a new virtual cursor manager.
    pub fn new() -> Self {
        Self {
            positions: Mutex::new(HashMap::new()),
        }
    }

    /// Queries the current virtual cursor position for `hwnd`, initializing to client center if not set.
    pub fn get_or_init(&self, hwnd: HWND) -> (i32, i32) {
        let key = hwnd.0 as isize;
        let mut guard = self.positions.lock().unwrap();
        if let Some(&pos) = guard.get(&key) {
            pos
        } else {
            let center = Self::query_client_center(hwnd);
            guard.insert(key, center);
            center
        }
    }

    /// Shifts the window's virtual cursor by `(delta_x, delta_y)`, clamping within client bounds.
    pub fn move_cursor(&self, hwnd: HWND, delta_x: i32, delta_y: i32) -> (i32, i32) {
        let key = hwnd.0 as isize;
        let mut guard = self.positions.lock().unwrap();
        let current = guard.get(&key).copied().unwrap_or_else(|| Self::query_client_center(hwnd));

        let mut x = current.0.saturating_add(delta_x);
        let mut y = current.1.saturating_add(delta_y);

        let mut rect = RECT::default();
        if unsafe { GetClientRect(hwnd, &mut rect).is_ok() } {
            let max_x = (rect.right - 1).max(0);
            let max_y = (rect.bottom - 1).max(0);
            x = x.clamp(0, max_x);
            y = y.clamp(0, max_y);
        }

        let updated = (x, y);
        guard.insert(key, updated);
        updated
    }

    /// Resets the virtual cursor for `hwnd` to the center of its client area.
    pub fn reset(&self, hwnd: HWND) -> (i32, i32) {
        let key = hwnd.0 as isize;
        let center = Self::query_client_center(hwnd);
        let mut guard = self.positions.lock().unwrap();
        guard.insert(key, center);
        center
    }

    /// Removes tracking for a specific window upon closure or release.
    pub fn remove(&self, hwnd: HWND) {
        let key = hwnd.0 as isize;
        let mut guard = self.positions.lock().unwrap();
        guard.remove(&key);
    }

    /// Clears all tracked virtual cursors.
    pub fn clear(&self) {
        let mut guard = self.positions.lock().unwrap();
        guard.clear();
    }

    /// Queries the client center coordinates for `hwnd`.
    fn query_client_center(hwnd: HWND) -> (i32, i32) {
        let mut rect = RECT::default();
        if unsafe { GetClientRect(hwnd, &mut rect).is_ok() } {
            (rect.right / 2, rect.bottom / 2)
        } else {
            (0, 0)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_virtual_cursor_initialization_and_removal() {
        let manager = VirtualCursorManager::new();
        let fake_hwnd = HWND(0x1234 as *mut _);

        // For non-existent window handle, center defaults to (0, 0)
        let pos = manager.get_or_init(fake_hwnd);
        assert_eq!(pos, (0, 0));

        manager.remove(fake_hwnd);
        let guard = manager.positions.lock().unwrap();
        assert!(!guard.contains_key(&(fake_hwnd.0 as isize)));
    }
}
