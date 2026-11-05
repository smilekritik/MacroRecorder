//! Targeted Win32 message delivery directly to background HWND targets.
//!
//! Delivers keyboard, Unicode text, and mouse messages directly into the destination window's
//! message queue:
//! - Never activates or steals focus from the foreground window.
//! - Resolves focused child controls (Edit/RichEdit/Scintilla) for keyboard input.
//! - Uses virtual client coordinates for mouse movements and clicks.
//! - Surfaces immediate UIPI and Chromium/UWP incompatibility errors without looping.

use windows::Win32::Foundation::{HWND, LPARAM, POINT, WPARAM};
use windows::Win32::UI::WindowsAndMessaging::{
    GetCursorPos, PostMessageW, WM_CHAR, WM_KEYDOWN, WM_KEYUP, WM_LBUTTONDOWN, WM_LBUTTONUP,
    WM_MBUTTONDOWN, WM_MBUTTONUP, WM_MOUSEHWHEEL, WM_MOUSEMOVE, WM_MOUSEWHEEL, WM_RBUTTONDOWN,
    WM_RBUTTONUP, WM_XBUTTONDOWN, WM_XBUTTONUP,
};

use crate::error::{NativeError, NativeResult};
use crate::input_injection::focused_child::resolve_keyboard_target;
use crate::input_injection::limitations::validate_targeted_window;
use crate::input_injection::scan_code::make_keyboard_lparam;
use crate::input_injection::state_tracker::MouseButton;
use crate::input_injection::text_expansion::expand_text_to_key_units;
use crate::input_injection::virtual_cursor::VirtualCursorManager;

/// Packs `(low, high)` 16-bit values into an `LPARAM`.
#[inline]
pub fn make_lparam(low: i32, high: i32) -> LPARAM {
    LPARAM((((high as i64) << 16) | ((low as i64) & 0xFFFF)) as isize)
}

/// Packs `(low, high)` 16-bit values into a `WPARAM`.
#[inline]
pub fn make_wparam(low: i32, high: i32) -> WPARAM {
    WPARAM(((((high as i64) & 0xFFFF) << 16) | ((low as i64) & 0xFFFF)) as usize)
}

/// Posts a targeted keyboard event to the target window (or its focused child).
pub fn post_targeted_key(
    hwnd: HWND,
    virtual_key: u32,
    scan_code: u32,
    extended: bool,
    is_up: bool,
) -> NativeResult<()> {
    validate_targeted_window(hwnd)?;

    let target = resolve_keyboard_target(hwnd);
    let msg = if is_up { WM_KEYUP } else { WM_KEYDOWN };
    let l_param = make_keyboard_lparam(virtual_key, scan_code, extended, is_up);

    let posted = unsafe {
        PostMessageW(
            target,
            msg,
            WPARAM(virtual_key as usize),
            LPARAM(l_param),
        )
    };

    if posted.is_ok() {
        Ok(())
    } else {
        Err(NativeError::from_last_win32("PostMessageW for targeted key"))
    }
}

/// Posts targeted TypeText characters and newlines to the target window's focused child.
pub fn post_targeted_text(hwnd: HWND, text: Option<&str>) -> NativeResult<()> {
    validate_targeted_window(hwnd)?;

    let units = expand_text_to_key_units(text);
    if units.is_empty() {
        return Ok(());
    }

    let target = resolve_keyboard_target(hwnd);

    for unit in units {
        if unit.is_virtual_key {
            let msg = if unit.key_up { WM_KEYUP } else { WM_KEYDOWN };
            let l_param = make_keyboard_lparam(unit.value as u32, 0, false, unit.key_up);
            let _ = unsafe {
                PostMessageW(
                    target,
                    msg,
                    WPARAM(unit.value as usize),
                    LPARAM(l_param),
                )
            };
        } else if !unit.key_up {
            // WM_CHAR is posted on key down only for Unicode characters
            let _ = unsafe {
                PostMessageW(
                    target,
                    WM_CHAR,
                    WPARAM(unit.value as usize),
                    LPARAM(1),
                )
            };
        }
    }

    Ok(())
}

/// Posts a targeted mouse move event using the window's virtual client cursor.
pub fn post_targeted_mouse_move(
    hwnd: HWND,
    delta_x: i32,
    delta_y: i32,
    cursor_manager: &VirtualCursorManager,
) -> NativeResult<(i32, i32)> {
    validate_targeted_window(hwnd)?;

    let pos = cursor_manager.move_cursor(hwnd, delta_x, delta_y);
    let l_param = make_lparam(pos.0, pos.1);

    let posted = unsafe {
        PostMessageW(
            hwnd,
            WM_MOUSEMOVE,
            WPARAM(0),
            l_param,
        )
    };

    if posted.is_ok() {
        Ok(pos)
    } else {
        Err(NativeError::from_last_win32("PostMessageW for targeted mouse move"))
    }
}

/// Posts a targeted mouse button event at the virtual client cursor position.
pub fn post_targeted_mouse_button(
    hwnd: HWND,
    button: MouseButton,
    is_down: bool,
    cursor_manager: &VirtualCursorManager,
) -> NativeResult<()> {
    validate_targeted_window(hwnd)?;

    let pos = cursor_manager.get_or_init(hwnd);
    let l_param = make_lparam(pos.0, pos.1);

    let (msg, w_param) = match (button, is_down) {
        (MouseButton::Left, true) => (WM_LBUTTONDOWN, WPARAM(0)),
        (MouseButton::Left, false) => (WM_LBUTTONUP, WPARAM(0)),
        (MouseButton::Right, true) => (WM_RBUTTONDOWN, WPARAM(0)),
        (MouseButton::Right, false) => (WM_RBUTTONUP, WPARAM(0)),
        (MouseButton::Middle, true) => (WM_MBUTTONDOWN, WPARAM(0)),
        (MouseButton::Middle, false) => (WM_MBUTTONUP, WPARAM(0)),
        (MouseButton::X1, true) => (WM_XBUTTONDOWN, make_wparam(0, 1)),
        (MouseButton::X1, false) => (WM_XBUTTONUP, make_wparam(0, 1)),
        (MouseButton::X2, true) => (WM_XBUTTONDOWN, make_wparam(0, 2)),
        (MouseButton::X2, false) => (WM_XBUTTONUP, make_wparam(0, 2)),
    };

    let posted = unsafe {
        PostMessageW(
            hwnd,
            msg,
            w_param,
            l_param,
        )
    };

    if posted.is_ok() {
        Ok(())
    } else {
        Err(NativeError::from_last_win32("PostMessageW for targeted mouse button"))
    }
}

/// Posts a targeted mouse wheel or horizontal wheel event.
pub fn post_targeted_wheel(
    hwnd: HWND,
    wheel_delta: i32,
    is_horizontal: bool,
) -> NativeResult<()> {
    validate_targeted_window(hwnd)?;

    let mut screen_pt = POINT::default();
    unsafe {
        let _ = GetCursorPos(&mut screen_pt);
    }

    let msg = if is_horizontal {
        WM_MOUSEHWHEEL
    } else {
        WM_MOUSEWHEEL
    };

    let w_param = make_wparam(0, wheel_delta);
    let l_param = make_lparam(screen_pt.x, screen_pt.y);

    let posted = unsafe {
        PostMessageW(
            hwnd,
            msg,
            w_param,
            l_param,
        )
    };

    if posted.is_ok() {
        Ok(())
    } else {
        Err(NativeError::from_last_win32("PostMessageW for targeted mouse wheel"))
    }
}

/// Posts release messages (WM_KEYUP and button up) to release held inputs for a target window.
pub fn release_window_held_inputs(
    hwnd: HWND,
    keys: &[u32],
    buttons: &[MouseButton],
    cursor_manager: &VirtualCursorManager,
) {
    if unsafe { !windows::Win32::UI::WindowsAndMessaging::IsWindow(hwnd).as_bool() } {
        return;
    }

    let target = resolve_keyboard_target(hwnd);

    // Release all held keyboard keys with WM_KEYUP
    for &vk in keys {
        let l_param = make_keyboard_lparam(vk, 0, false, true);
        let _ = unsafe {
            PostMessageW(
                target,
                WM_KEYUP,
                WPARAM(vk as usize),
                LPARAM(l_param),
            )
        };
    }

    // Release all held mouse buttons with corresponding UP messages
    let pos = cursor_manager.get_or_init(hwnd);
    let l_param = make_lparam(pos.0, pos.1);

    for &button in buttons {
        let (msg, w_param) = match button {
            MouseButton::Left => (WM_LBUTTONUP, WPARAM(0)),
            MouseButton::Right => (WM_RBUTTONUP, WPARAM(0)),
            MouseButton::Middle => (WM_MBUTTONUP, WPARAM(0)),
            MouseButton::X1 => (WM_XBUTTONUP, make_wparam(0, 1)),
            MouseButton::X2 => (WM_XBUTTONUP, make_wparam(0, 2)),
        };
        let _ = unsafe {
            PostMessageW(
                hwnd,
                msg,
                w_param,
                l_param,
            )
        };
    }

    cursor_manager.remove(hwnd);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_make_lparam_and_wparam() {
        let lp = make_lparam(100, 200);
        assert_eq!(lp.0 & 0xFFFF, 100);
        assert_eq!((lp.0 >> 16) & 0xFFFF, 200);

        let wp = make_wparam(1, 2);
        assert_eq!(wp.0 & 0xFFFF, 1);
        assert_eq!((wp.0 >> 16) & 0xFFFF, 2);
    }
}
