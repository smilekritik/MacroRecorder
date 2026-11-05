//! Win32 Raw Input device registration and relative mouse parsing.
//!
//! Captures true physical relative deltas direct from hardware without screen coordinate clamping,
//! working accurately even when the visible cursor is locked, hidden, or recentered.

use std::mem::size_of;
use windows::Win32::Foundation::{BOOL, HANDLE, HWND, WPARAM};

use crate::api::events::NativeRawInputEvent;
use crate::error::{NativeError, NativeResult};
use crate::hotkeys::binding::{MouseButton, WheelDirection};

/// Flag indicating that input sink receives input when in background.
pub const RIDEV_INPUTSINK: u32 = 0x00000100;
/// Command flag to query raw input data.
pub const RID_INPUT: u32 = 0x10000003;
/// Raw input device type indicating a mouse device.
pub const RIM_TYPEMOUSE: u32 = 0;

/// Win32 raw input mouse button flags (`RI_MOUSE_*`).
pub const RI_MOUSE_LEFT_BUTTON_DOWN: u16 = 0x0001;
pub const RI_MOUSE_LEFT_BUTTON_UP: u16 = 0x0002;
pub const RI_MOUSE_RIGHT_BUTTON_DOWN: u16 = 0x0004;
pub const RI_MOUSE_RIGHT_BUTTON_UP: u16 = 0x0008;
pub const RI_MOUSE_MIDDLE_BUTTON_DOWN: u16 = 0x0010;
pub const RI_MOUSE_MIDDLE_BUTTON_UP: u16 = 0x0020;
pub const RI_MOUSE_BUTTON_4_DOWN: u16 = 0x0040;
pub const RI_MOUSE_BUTTON_4_UP: u16 = 0x0080;
pub const RI_MOUSE_BUTTON_5_DOWN: u16 = 0x0100;
pub const RI_MOUSE_BUTTON_5_UP: u16 = 0x0200;
pub const RI_MOUSE_WHEEL: u16 = 0x0400;
pub const RI_MOUSE_HORIZONTAL_WHEEL: u16 = 0x0800;

#[repr(C)]
#[derive(Debug, Clone, Copy)]
pub struct RAWINPUTDEVICE {
    pub us_usage_page: u16,
    pub us_usage: u16,
    pub dw_flags: u32,
    pub hwnd_target: HWND,
}

#[repr(C)]
#[derive(Debug, Clone, Copy)]
pub struct RAWINPUTHEADER {
    pub dw_type: u32,
    pub dw_size: u32,
    pub h_device: HANDLE,
    pub w_param: WPARAM,
}

#[repr(C)]
#[derive(Debug, Clone, Copy)]
pub struct RAWMOUSE {
    pub us_flags: u16,
    pub _padding: u16,
    pub us_button_flags: u16,
    pub us_button_data: i16,
    pub ul_raw_buttons: u32,
    pub l_last_x: i32,
    pub l_last_y: i32,
    pub ul_extra_information: u32,
}

#[repr(C)]
#[derive(Debug, Clone, Copy)]
pub struct RAWINPUT {
    pub header: RAWINPUTHEADER,
    pub mouse: RAWMOUSE,
}

#[link(name = "user32")]
extern "system" {
    fn RegisterRawInputDevices(
        p_raw_input_devices: *const RAWINPUTDEVICE,
        ui_num_devices: u32,
        cb_size: u32,
    ) -> BOOL;

    fn GetRawInputData(
        h_raw_input: isize,
        ui_command: u32,
        p_data: *mut std::ffi::c_void,
        pcb_size: *mut u32,
        cb_size_header: u32,
    ) -> u32;
}

/// Parsed mouse information extracted from `WM_INPUT`.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ParsedRawMouse {
    pub delta_x: i32,
    pub delta_y: i32,
    pub button_flags: u16,
    pub wheel_delta: i16,
    pub is_horizontal_wheel: bool,
}

impl ParsedRawMouse {
    /// Returns the mouse button pressed (if any).
    pub fn button_down(&self) -> Option<MouseButton> {
        let f = self.button_flags;
        if (f & RI_MOUSE_LEFT_BUTTON_DOWN) != 0 {
            Some(MouseButton::Left)
        } else if (f & RI_MOUSE_RIGHT_BUTTON_DOWN) != 0 {
            Some(MouseButton::Right)
        } else if (f & RI_MOUSE_MIDDLE_BUTTON_DOWN) != 0 {
            Some(MouseButton::Middle)
        } else if (f & RI_MOUSE_BUTTON_4_DOWN) != 0 {
            Some(MouseButton::X1)
        } else if (f & RI_MOUSE_BUTTON_5_DOWN) != 0 {
            Some(MouseButton::X2)
        } else {
            None
        }
    }

    /// Returns the mouse button released (if any).
    pub fn button_up(&self) -> Option<MouseButton> {
        let f = self.button_flags;
        if (f & RI_MOUSE_LEFT_BUTTON_UP) != 0 {
            Some(MouseButton::Left)
        } else if (f & RI_MOUSE_RIGHT_BUTTON_UP) != 0 {
            Some(MouseButton::Right)
        } else if (f & RI_MOUSE_MIDDLE_BUTTON_UP) != 0 {
            Some(MouseButton::Middle)
        } else if (f & RI_MOUSE_BUTTON_4_UP) != 0 {
            Some(MouseButton::X1)
        } else if (f & RI_MOUSE_BUTTON_5_UP) != 0 {
            Some(MouseButton::X2)
        } else {
            None
        }
    }

    /// Returns the vertical wheel direction (if any).
    pub fn wheel_direction(&self) -> Option<WheelDirection> {
        if (self.button_flags & RI_MOUSE_WHEEL) != 0 {
            if self.wheel_delta >= 0 {
                Some(WheelDirection::Up)
            } else {
                Some(WheelDirection::Down)
            }
        } else {
            None
        }
    }

    /// Converts this parsed raw mouse reading to a typed contract event.
    pub fn to_contract_event(&self, timestamp_microseconds: i64) -> NativeRawInputEvent {
        NativeRawInputEvent {
            delta_x: self.delta_x,
            delta_y: self.delta_y,
            button_flags: self.button_flags as u32,
            timestamp_microseconds,
        }
    }
}

/// Registers the message window for Raw Input mouse events with `RIDEV_INPUTSINK`.
pub fn register_raw_mouse_device(hwnd: HWND) -> NativeResult<()> {
    let device = RAWINPUTDEVICE {
        us_usage_page: 1, // Generic Desktop Controls
        us_usage: 2,      // Mouse
        dw_flags: RIDEV_INPUTSINK,
        hwnd_target: hwnd,
    };

    let success = unsafe {
        RegisterRawInputDevices(
            &device,
            1,
            size_of::<RAWINPUTDEVICE>() as u32,
        )
    };

    if success.as_bool() {
        Ok(())
    } else {
        Err(NativeError::from_last_win32("RegisterRawInputDevices"))
    }
}

/// Reads and parses a Raw Input packet from a `WM_INPUT` `lParam` handle.
pub fn read_raw_input_mouse(lparam: isize) -> Option<ParsedRawMouse> {
    let mut size = 0u32;
    let header_size = size_of::<RAWINPUTHEADER>() as u32;

    // First call with null data pointer to retrieve the required buffer size
    unsafe {
        GetRawInputData(
            lparam,
            RID_INPUT,
            std::ptr::null_mut(),
            &mut size,
            header_size,
        );
    }

    if size == 0 {
        return None;
    }

    let mut buffer = vec![0u8; size as usize];
    let bytes_read = unsafe {
        GetRawInputData(
            lparam,
            RID_INPUT,
            buffer.as_mut_ptr() as *mut std::ffi::c_void,
            &mut size,
            header_size,
        )
    };

    if bytes_read != size || bytes_read < size_of::<RAWINPUT>() as u32 {
        return None;
    }

    let raw = unsafe { &*(buffer.as_ptr() as *const RAWINPUT) };
    if raw.header.dw_type != RIM_TYPEMOUSE {
        return None;
    }

    let mouse = &raw.mouse;
    let is_horizontal = (mouse.us_button_flags & RI_MOUSE_HORIZONTAL_WHEEL) != 0;

    Some(ParsedRawMouse {
        delta_x: mouse.l_last_x,
        delta_y: mouse.l_last_y,
        button_flags: mouse.us_button_flags,
        wheel_delta: mouse.us_button_data,
        is_horizontal_wheel: is_horizontal,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_raw_input_struct_sizes() {
        assert_eq!(size_of::<RAWINPUTDEVICE>(), 16);
        assert_eq!(size_of::<RAWINPUTHEADER>(), 24);
        assert_eq!(size_of::<RAWMOUSE>(), 24);
        assert_eq!(size_of::<RAWINPUT>(), 48);
    }

    #[test]
    fn test_parsed_raw_mouse_buttons() {
        let left_down = ParsedRawMouse {
            delta_x: 5,
            delta_y: -3,
            button_flags: RI_MOUSE_LEFT_BUTTON_DOWN,
            wheel_delta: 0,
            is_horizontal_wheel: false,
        };
        assert_eq!(left_down.button_down(), Some(MouseButton::Left));
        assert_eq!(left_down.button_up(), None);

        let x2_down = ParsedRawMouse {
            delta_x: 0,
            delta_y: 0,
            button_flags: RI_MOUSE_BUTTON_5_DOWN,
            wheel_delta: 0,
            is_horizontal_wheel: false,
        };
        assert_eq!(x2_down.button_down(), Some(MouseButton::X2));

        let wheel_up = ParsedRawMouse {
            delta_x: 0,
            delta_y: 0,
            button_flags: RI_MOUSE_WHEEL,
            wheel_delta: 120,
            is_horizontal_wheel: false,
        };
        assert_eq!(wheel_up.wheel_direction(), Some(WheelDirection::Up));

        let wheel_down = ParsedRawMouse {
            delta_x: 0,
            delta_y: 0,
            button_flags: RI_MOUSE_WHEEL,
            wheel_delta: -120,
            is_horizontal_wheel: false,
        };
        assert_eq!(wheel_down.wheel_direction(), Some(WheelDirection::Down));
    }
}
