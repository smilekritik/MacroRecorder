//! Global input injection via Win32 SendInput.
//!
//! Delivers physical-like keyboard, mouse, wheel, and layout-independent Unicode
//! text events to the active foreground application, attaching diagnostic markers
//! for low-level hook confirmation roundtrip measurement.

use windows::Win32::UI::Input::KeyboardAndMouse::{
    SendInput, INPUT, INPUT_0, INPUT_KEYBOARD, INPUT_MOUSE, KEYBDINPUT, KEYEVENTF_KEYUP,
    KEYEVENTF_UNICODE, MOUSEEVENTF_ABSOLUTE, MOUSEEVENTF_HWHEEL, MOUSEEVENTF_LEFTDOWN,
    MOUSEEVENTF_LEFTUP, MOUSEEVENTF_MIDDLEDOWN, MOUSEEVENTF_MIDDLEUP, MOUSEEVENTF_MOVE,
    MOUSEEVENTF_RIGHTDOWN, MOUSEEVENTF_RIGHTUP, MOUSEEVENTF_VIRTUALDESK, MOUSEEVENTF_WHEEL,
    MOUSEEVENTF_XDOWN, MOUSEEVENTF_XUP, MOUSEINPUT,
};

use crate::error::{NativeError, NativeResult};
use crate::input_injection::scan_code::compute_send_input_keyboard_params;
use crate::input_injection::state_tracker::MouseButton;
use crate::input_injection::text_expansion::expand_text_to_key_units;

/// Dispatches an array of Win32 `INPUT` structs atomically via `SendInput`.
pub fn dispatch_inputs(inputs: &[INPUT]) -> NativeResult<u32> {
    if inputs.is_empty() {
        return Ok(0);
    }

    let count = inputs.len() as u32;
    let sent = unsafe {
        SendInput(
            inputs,
            std::mem::size_of::<INPUT>() as i32,
        )
    };

    if sent != count {
        Err(NativeError::from_last_win32(format!(
            "SendInput failed: sent {sent} of {count} inputs"
        )))
    } else {
        Ok(sent)
    }
}

/// Builds a single keyboard `INPUT` struct.
pub fn build_keyboard_input(
    virtual_key: u32,
    scan_code: u32,
    extended: bool,
    is_up: bool,
    prefer_scan_codes: bool,
    marker: usize,
) -> INPUT {
    let (w_vk, w_scan, flags) = compute_send_input_keyboard_params(
        virtual_key,
        scan_code,
        extended,
        is_up,
        prefer_scan_codes,
    );

    INPUT {
        r#type: INPUT_KEYBOARD,
        Anonymous: INPUT_0 {
            ki: KEYBDINPUT {
                wVk: windows::Win32::UI::Input::KeyboardAndMouse::VIRTUAL_KEY(w_vk),
                wScan: w_scan,
                dwFlags: windows::Win32::UI::Input::KeyboardAndMouse::KEYBD_EVENT_FLAGS(flags),
                time: 0,
                dwExtraInfo: marker,
            },
        },
    }
}

/// Builds a mouse movement `INPUT` struct.
pub fn build_mouse_move_input(
    delta_x: i32,
    delta_y: i32,
    is_absolute: bool,
    marker: usize,
) -> INPUT {
    let mut flags = MOUSEEVENTF_MOVE.0;
    if is_absolute {
        flags |= MOUSEEVENTF_ABSOLUTE.0 | MOUSEEVENTF_VIRTUALDESK.0;
    }

    INPUT {
        r#type: INPUT_MOUSE,
        Anonymous: INPUT_0 {
            mi: MOUSEINPUT {
                dx: delta_x,
                dy: delta_y,
                mouseData: 0,
                dwFlags: windows::Win32::UI::Input::KeyboardAndMouse::MOUSE_EVENT_FLAGS(flags),
                time: 0,
                dwExtraInfo: marker,
            },
        },
    }
}

/// Builds a mouse button `INPUT` struct.
pub fn build_mouse_button_input(button: MouseButton, is_down: bool, marker: usize) -> INPUT {
    let (flags, mouse_data) = match (button, is_down) {
        (MouseButton::Left, true) => (MOUSEEVENTF_LEFTDOWN.0, 0),
        (MouseButton::Left, false) => (MOUSEEVENTF_LEFTUP.0, 0),
        (MouseButton::Right, true) => (MOUSEEVENTF_RIGHTDOWN.0, 0),
        (MouseButton::Right, false) => (MOUSEEVENTF_RIGHTUP.0, 0),
        (MouseButton::Middle, true) => (MOUSEEVENTF_MIDDLEDOWN.0, 0),
        (MouseButton::Middle, false) => (MOUSEEVENTF_MIDDLEUP.0, 0),
        (MouseButton::X1, true) => (MOUSEEVENTF_XDOWN.0, 1),
        (MouseButton::X1, false) => (MOUSEEVENTF_XUP.0, 1),
        (MouseButton::X2, true) => (MOUSEEVENTF_XDOWN.0, 2),
        (MouseButton::X2, false) => (MOUSEEVENTF_XUP.0, 2),
    };

    INPUT {
        r#type: INPUT_MOUSE,
        Anonymous: INPUT_0 {
            mi: MOUSEINPUT {
                dx: 0,
                dy: 0,
                mouseData: mouse_data,
                dwFlags: windows::Win32::UI::Input::KeyboardAndMouse::MOUSE_EVENT_FLAGS(flags),
                time: 0,
                dwExtraInfo: marker,
            },
        },
    }
}

/// Builds a mouse wheel or horizontal wheel `INPUT` struct.
pub fn build_mouse_wheel_input(wheel_delta: i32, is_horizontal: bool, marker: usize) -> INPUT {
    let flags = if is_horizontal {
        MOUSEEVENTF_HWHEEL.0
    } else {
        MOUSEEVENTF_WHEEL.0
    };

    INPUT {
        r#type: INPUT_MOUSE,
        Anonymous: INPUT_0 {
            mi: MOUSEINPUT {
                dx: 0,
                dy: 0,
                mouseData: wheel_delta as u32,
                dwFlags: windows::Win32::UI::Input::KeyboardAndMouse::MOUSE_EVENT_FLAGS(flags),
                time: 0,
                dwExtraInfo: marker,
            },
        },
    }
}

/// Builds the complete sequence of `INPUT` structs for typing Unicode text.
///
/// Diagnostics marker is attached to the very last input in the chain.
pub fn build_text_inputs(text: Option<&str>, marker: usize) -> Vec<INPUT> {
    let units = expand_text_to_key_units(text);
    if units.is_empty() {
        return Vec::new();
    }

    let count = units.len();
    let mut inputs = Vec::with_capacity(count);

    for (index, unit) in units.into_iter().enumerate() {
        let is_last = index == count - 1;
        let extra_info = if is_last { marker } else { 0 };

        let (vk, scan, flags) = if unit.is_virtual_key {
            // Virtual key (e.g. Enter for newlines)
            let mut f = 0u32;
            if unit.key_up {
                f |= KEYEVENTF_KEYUP.0;
            }
            (unit.value, 0u16, f)
        } else {
            // Unicode character code unit
            let mut f = KEYEVENTF_UNICODE.0;
            if unit.key_up {
                f |= KEYEVENTF_KEYUP.0;
            }
            (0u16, unit.value, f)
        };

        inputs.push(INPUT {
            r#type: INPUT_KEYBOARD,
            Anonymous: INPUT_0 {
                ki: KEYBDINPUT {
                    wVk: windows::Win32::UI::Input::KeyboardAndMouse::VIRTUAL_KEY(vk),
                    wScan: scan,
                    dwFlags: windows::Win32::UI::Input::KeyboardAndMouse::KEYBD_EVENT_FLAGS(flags),
                    time: 0,
                    dwExtraInfo: extra_info,
                },
            },
        });
    }

    inputs
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_build_keyboard_input() {
        let input = build_keyboard_input(0x41, 0, false, false, false, 0x4D520001);
        assert_eq!(input.r#type, INPUT_KEYBOARD);
        unsafe {
            assert_eq!(input.Anonymous.ki.wVk.0, 0x41);
            assert_eq!(input.Anonymous.ki.dwExtraInfo, 0x4D520001);
        }
    }

    #[test]
    fn test_build_text_inputs_marker_on_last_element() {
        let marker = 0x4D520042;
        let inputs = build_text_inputs(Some("Hi"), marker);
        assert_eq!(inputs.len(), 4);
        unsafe {
            assert_eq!(inputs[0].Anonymous.ki.dwExtraInfo, 0);
            assert_eq!(inputs[1].Anonymous.ki.dwExtraInfo, 0);
            assert_eq!(inputs[2].Anonymous.ki.dwExtraInfo, 0);
            assert_eq!(inputs[3].Anonymous.ki.dwExtraInfo, marker);
        }
    }
}
