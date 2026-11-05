//! Virtual Xbox 360 and DualShock 4 controller implementations.
//!
//! `VirtualDualShock4Controller.cs`, and `IVirtualGamepadDevice.cs`.

use crate::error::{NativeError, NativeResult};
use crate::gamepad::types::{GamepadAxis, GamepadBits, GamepadButton};
use crate::gamepad::vigem::{
    get_vigem_api, vigem_driver_unavailable_error, vigem_success, Ds4Report, PVIGEM_CLIENT,
    PVIGEM_TARGET, XusbReport,
};

/// Common trait for a virtual controller device.
pub trait VirtualGamepadDevice: Send + Sync {
    fn set_button(&mut self, button: GamepadButton, pressed: bool);
    fn set_axis(&mut self, axis: GamepadAxis, value: i32);
    fn apply(&mut self) -> NativeResult<()>;
    fn reset(&mut self) -> NativeResult<()>;
    fn disconnect(&mut self);
}

/// Virtual Xbox 360 controller backed by ViGEmBus.
pub struct VirtualXboxController {
    client: PVIGEM_CLIENT,
    target: PVIGEM_TARGET,
    report: XusbReport,
}

unsafe impl Send for VirtualXboxController {}
unsafe impl Sync for VirtualXboxController {}

impl VirtualXboxController {
    /// Creates and connects a new virtual Xbox 360 controller.
    /// Returns `DriverNotFound` error if ViGEmBus is not installed or unavailable.
    pub fn new() -> NativeResult<Self> {
        let api = match get_vigem_api() {
            Some(a) => a,
            None => return Err(vigem_driver_unavailable_error()),
        };

        let client = unsafe { (api.alloc)() };
        if client.is_null() {
            return Err(vigem_driver_unavailable_error());
        }

        let conn_res = unsafe { (api.connect)(client) };
        if !vigem_success(conn_res) {
            unsafe { (api.free)(client) };
            return Err(vigem_driver_unavailable_error());
        }

        let target = unsafe { (api.target_x360_alloc)() };
        if target.is_null() {
            unsafe {
                (api.disconnect)(client);
                (api.free)(client);
            }
            return Err(vigem_driver_unavailable_error());
        }

        let add_res = unsafe { (api.target_add)(client, target) };
        if !vigem_success(add_res) {
            unsafe {
                (api.target_free)(target);
                (api.disconnect)(client);
                (api.free)(client);
            }
            return Err(vigem_driver_unavailable_error());
        }

        let mut controller = Self {
            client,
            target,
            report: XusbReport::default(),
        };
        let _ = controller.apply();
        Ok(controller)
    }
}

impl VirtualGamepadDevice for VirtualXboxController {
    fn set_button(&mut self, button: GamepadButton, pressed: bool) {
        let flag = GamepadBits::flag(button);
        if pressed {
            self.report.w_buttons |= flag;
        } else {
            self.report.w_buttons &= !flag;
        }
    }

    fn set_axis(&mut self, axis: GamepadAxis, value: i32) {
        match axis {
            GamepadAxis::LeftStickX => {
                self.report.s_thumb_lx = value.clamp(-32768, 32767) as i16;
            }
            GamepadAxis::LeftStickY => {
                self.report.s_thumb_ly = value.clamp(-32768, 32767) as i16;
            }
            GamepadAxis::RightStickX => {
                self.report.s_thumb_rx = value.clamp(-32768, 32767) as i16;
            }
            GamepadAxis::RightStickY => {
                self.report.s_thumb_ry = value.clamp(-32768, 32767) as i16;
            }
            GamepadAxis::LeftTrigger => {
                self.report.b_left_trigger = value.clamp(0, 255) as u8;
            }
            GamepadAxis::RightTrigger => {
                self.report.b_right_trigger = value.clamp(0, 255) as u8;
            }
            GamepadAxis::None => {}
        }
    }

    fn apply(&mut self) -> NativeResult<()> {
        let api = match get_vigem_api() {
            Some(a) => a,
            None => return Err(vigem_driver_unavailable_error()),
        };
        let res = unsafe { (api.target_x360_update)(self.client, self.target, self.report) };
        if vigem_success(res) {
            Ok(())
        } else {
            Err(NativeError::from_win32("ViGEm Xbox update", res))
        }
    }

    fn reset(&mut self) -> NativeResult<()> {
        self.report = XusbReport::default();
        self.apply()
    }

    fn disconnect(&mut self) {
        let _ = self.reset();
        if let Some(api) = get_vigem_api() {
            unsafe {
                if !self.target.is_null() {
                    let _ = (api.target_remove)(self.client, self.target);
                    (api.target_free)(self.target);
                    self.target = std::ptr::null_mut();
                }
                if !self.client.is_null() {
                    (api.disconnect)(self.client);
                    (api.free)(self.client);
                    self.client = std::ptr::null_mut();
                }
            }
        }
    }
}

impl Drop for VirtualXboxController {
    fn drop(&mut self) {
        self.disconnect();
    }
}

/// Virtual DualShock 4 controller backed by ViGEmBus.
pub struct VirtualDualShock4Controller {
    client: PVIGEM_CLIENT,
    target: PVIGEM_TARGET,
    report: Ds4Report,
    dpad_up: bool,
    dpad_down: bool,
    dpad_left: bool,
    dpad_right: bool,
}

unsafe impl Send for VirtualDualShock4Controller {}
unsafe impl Sync for VirtualDualShock4Controller {}

impl VirtualDualShock4Controller {
    /// Creates and connects a new virtual DualShock 4 controller.
    /// Returns `DriverNotFound` error if ViGEmBus is not installed or unavailable.
    pub fn new() -> NativeResult<Self> {
        let api = match get_vigem_api() {
            Some(a) => a,
            None => return Err(vigem_driver_unavailable_error()),
        };

        let client = unsafe { (api.alloc)() };
        if client.is_null() {
            return Err(vigem_driver_unavailable_error());
        }

        let conn_res = unsafe { (api.connect)(client) };
        if !vigem_success(conn_res) {
            unsafe { (api.free)(client) };
            return Err(vigem_driver_unavailable_error());
        }

        let target = unsafe { (api.target_ds4_alloc)() };
        if target.is_null() {
            unsafe {
                (api.disconnect)(client);
                (api.free)(client);
            }
            return Err(vigem_driver_unavailable_error());
        }

        let add_res = unsafe { (api.target_add)(client, target) };
        if !vigem_success(add_res) {
            unsafe {
                (api.target_free)(target);
                (api.disconnect)(client);
                (api.free)(client);
            }
            return Err(vigem_driver_unavailable_error());
        }

        let mut controller = Self {
            client,
            target,
            report: Ds4Report::default(),
            dpad_up: false,
            dpad_down: false,
            dpad_left: false,
            dpad_right: false,
        };
        let _ = controller.apply();
        Ok(controller)
    }

    fn update_dpad(&mut self) {
        let dpad = if self.dpad_up && self.dpad_right {
            0x1 // Northeast
        } else if self.dpad_up && self.dpad_left {
            0x7 // Northwest
        } else if self.dpad_down && self.dpad_right {
            0x3 // Southeast
        } else if self.dpad_down && self.dpad_left {
            0x5 // Southwest
        } else if self.dpad_up {
            0x0 // North
        } else if self.dpad_down {
            0x4 // South
        } else if self.dpad_left {
            0x6 // West
        } else if self.dpad_right {
            0x2 // East
        } else {
            0x8 // None / neutral
        };

        self.report.w_buttons = (self.report.w_buttons & !0x000F) | (dpad & 0x000F);
    }

    /// Converts stick value (-32768..32767) to DS4 byte (0..255, center 128).
    fn stick_to_byte(value: i32, invert: bool) -> u8 {
        let scaled = ((value + 32768) / 256).clamp(0, 255) as u8;
        if invert {
            255 - scaled
        } else {
            scaled
        }
    }
}

impl VirtualGamepadDevice for VirtualDualShock4Controller {
    fn set_button(&mut self, button: GamepadButton, pressed: bool) {
        // Bitmask definitions from ViGEm DS4_BUTTONS
        const DS4_SQUARE: u16 = 1 << 4;
        const DS4_CROSS: u16 = 1 << 5;
        const DS4_CIRCLE: u16 = 1 << 6;
        const DS4_TRIANGLE: u16 = 1 << 7;
        const DS4_SHOULDER_L: u16 = 1 << 8;
        const DS4_SHOULDER_R: u16 = 1 << 9;
        const DS4_SHARE: u16 = 1 << 12;
        const DS4_OPTIONS: u16 = 1 << 13;
        const DS4_THUMB_L: u16 = 1 << 14;
        const DS4_THUMB_R: u16 = 1 << 15;

        let set_bit = |val: &mut u16, mask: u16, set: bool| {
            if set {
                *val |= mask;
            } else {
                *val &= !mask;
            }
        };

        match button {
            GamepadButton::A => set_bit(&mut self.report.w_buttons, DS4_CROSS, pressed),
            GamepadButton::B => set_bit(&mut self.report.w_buttons, DS4_CIRCLE, pressed),
            GamepadButton::X => set_bit(&mut self.report.w_buttons, DS4_SQUARE, pressed),
            GamepadButton::Y => set_bit(&mut self.report.w_buttons, DS4_TRIANGLE, pressed),
            GamepadButton::LeftBumper => set_bit(&mut self.report.w_buttons, DS4_SHOULDER_L, pressed),
            GamepadButton::RightBumper => set_bit(&mut self.report.w_buttons, DS4_SHOULDER_R, pressed),
            GamepadButton::Back => set_bit(&mut self.report.w_buttons, DS4_SHARE, pressed),
            GamepadButton::Start => set_bit(&mut self.report.w_buttons, DS4_OPTIONS, pressed),
            GamepadButton::LeftStick => set_bit(&mut self.report.w_buttons, DS4_THUMB_L, pressed),
            GamepadButton::RightStick => set_bit(&mut self.report.w_buttons, DS4_THUMB_R, pressed),
            GamepadButton::Guide => {
                // PS special button
                if pressed {
                    self.report.b_special |= 0x01;
                } else {
                    self.report.b_special &= !0x01;
                }
            }
            GamepadButton::DPadUp => {
                self.dpad_up = pressed;
                self.update_dpad();
            }
            GamepadButton::DPadDown => {
                self.dpad_down = pressed;
                self.update_dpad();
            }
            GamepadButton::DPadLeft => {
                self.dpad_left = pressed;
                self.update_dpad();
            }
            GamepadButton::DPadRight => {
                self.dpad_right = pressed;
                self.update_dpad();
            }
            GamepadButton::None => {}
        }
    }

    fn set_axis(&mut self, axis: GamepadAxis, value: i32) {
        const DS4_TRIGGER_L: u16 = 1 << 10;
        const DS4_TRIGGER_R: u16 = 1 << 11;

        match axis {
            GamepadAxis::LeftStickX => {
                self.report.b_thumb_lx = Self::stick_to_byte(value, false);
            }
            GamepadAxis::LeftStickY => {
                self.report.b_thumb_ly = Self::stick_to_byte(value, true);
            }
            GamepadAxis::RightStickX => {
                self.report.b_thumb_rx = Self::stick_to_byte(value, false);
            }
            GamepadAxis::RightStickY => {
                self.report.b_thumb_ry = Self::stick_to_byte(value, true);
            }
            GamepadAxis::LeftTrigger => {
                let analog = value.clamp(0, 255) as u8;
                self.report.b_trigger_l = analog;
                // Digital L2 button press on noticeable travel (>= 30)
                if analog >= 30 {
                    self.report.w_buttons |= DS4_TRIGGER_L;
                } else {
                    self.report.w_buttons &= !DS4_TRIGGER_L;
                }
            }
            GamepadAxis::RightTrigger => {
                let analog = value.clamp(0, 255) as u8;
                self.report.b_trigger_r = analog;
                // Digital R2 button press on noticeable travel (>= 30)
                if analog >= 30 {
                    self.report.w_buttons |= DS4_TRIGGER_R;
                } else {
                    self.report.w_buttons &= !DS4_TRIGGER_R;
                }
            }
            GamepadAxis::None => {}
        }
    }

    fn apply(&mut self) -> NativeResult<()> {
        let api = match get_vigem_api() {
            Some(a) => a,
            None => return Err(vigem_driver_unavailable_error()),
        };
        let res = unsafe { (api.target_ds4_update)(self.client, self.target, self.report) };
        if vigem_success(res) {
            Ok(())
        } else {
            Err(NativeError::from_win32("ViGEm DS4 update", res))
        }
    }

    fn reset(&mut self) -> NativeResult<()> {
        self.dpad_up = false;
        self.dpad_down = false;
        self.dpad_left = false;
        self.dpad_right = false;
        self.report = Ds4Report::default();
        self.apply()
    }

    fn disconnect(&mut self) {
        let _ = self.reset();
        if let Some(api) = get_vigem_api() {
            unsafe {
                if !self.target.is_null() {
                    let _ = (api.target_remove)(self.client, self.target);
                    (api.target_free)(self.target);
                    self.target = std::ptr::null_mut();
                }
                if !self.client.is_null() {
                    (api.disconnect)(self.client);
                    (api.free)(self.client);
                    self.client = std::ptr::null_mut();
                }
            }
        }
    }
}

impl Drop for VirtualDualShock4Controller {
    fn drop(&mut self) {
        self.disconnect();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_stick_to_byte_conversion() {
        assert_eq!(VirtualDualShock4Controller::stick_to_byte(0, false), 128);
        assert_eq!(VirtualDualShock4Controller::stick_to_byte(0, true), 127);
        assert_eq!(VirtualDualShock4Controller::stick_to_byte(32767, false), 255);
        assert_eq!(VirtualDualShock4Controller::stick_to_byte(32767, true), 0);
        assert_eq!(VirtualDualShock4Controller::stick_to_byte(-32768, false), 0);
        assert_eq!(VirtualDualShock4Controller::stick_to_byte(-32768, true), 255);
    }
}
