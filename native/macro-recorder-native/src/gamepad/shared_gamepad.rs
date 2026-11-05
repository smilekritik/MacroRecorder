//! Process-wide shared virtual gamepad singleton.
//!
//! Maintains a persistent virtual Xbox 360 or DualShock 4 controller while macro playback is active,
//! avoiding repeated device connection sounds and game input drops.
//! Ensures that on stop, crash recovery, and disconnect every virtual control returns to neutral.

use std::sync::Mutex;

use crate::error::NativeResult;
use crate::gamepad::hidhide::HidHideService;
use crate::gamepad::types::{GamepadAxis, GamepadButton, GamepadOutputType};
use crate::gamepad::virtual_controller::{
    VirtualDualShock4Controller, VirtualGamepadDevice, VirtualXboxController,
};

struct SharedState {
    device: Option<Box<dyn VirtualGamepadDevice>>,
    output_type: GamepadOutputType,
    hide_real_pads: bool,
    active_leases: usize,
}

static SHARED_GAMEPAD: Mutex<SharedState> = Mutex::new(SharedState {
    device: None,
    output_type: GamepadOutputType::Xbox360,
    hide_real_pads: false,
    active_leases: 0,
});

fn create_device(output_type: GamepadOutputType) -> NativeResult<Box<dyn VirtualGamepadDevice>> {
    match output_type {
        GamepadOutputType::DualShock4 => {
            let pad = VirtualDualShock4Controller::new()?;
            Ok(Box::new(pad))
        }
        GamepadOutputType::Xbox360 => {
            let pad = VirtualXboxController::new()?;
            Ok(Box::new(pad))
        }
    }
}

/// Process-wide virtual gamepad manager.
pub struct SharedVirtualGamepad;

impl SharedVirtualGamepad {
    /// Returns true if a virtual gamepad is currently connected.
    pub fn is_connected() -> bool {
        let state = SHARED_GAMEPAD.lock().unwrap();
        state.device.is_some()
    }

    /// Returns the currently configured virtual gamepad output type.
    pub fn output_type() -> GamepadOutputType {
        let state = SHARED_GAMEPAD.lock().unwrap();
        state.output_type
    }

    /// Returns whether the "hide physical gamepads" (HidHide) toggle is enabled.
    pub fn hide_real_pads() -> bool {
        let state = SHARED_GAMEPAD.lock().unwrap();
        state.hide_real_pads
    }

    /// Sets the "hide physical gamepads" toggle. If the device is currently connected,
    /// changes are applied immediately via HidHide.
    pub fn set_hide_real_pads(value: bool) {
        let mut state = SHARED_GAMEPAD.lock().unwrap();
        if state.hide_real_pads == value {
            return;
        }
        state.hide_real_pads = value;
        if state.device.is_none() {
            return; // Applied on the next connect()
        }
        if value {
            HidHideService::activate();
        } else {
            HidHideService::deactivate();
        }
    }

    /// Changes the desired virtual pad type (Xbox360 / DualShock4).
    /// If currently connected, recreates the device with the new target type.
    pub fn set_output_type(output_type: GamepadOutputType) -> NativeResult<()> {
        let mut state = SHARED_GAMEPAD.lock().unwrap();
        if state.output_type == output_type {
            return Ok(());
        }
        state.output_type = output_type;
        if state.device.is_some() {
            if let Some(mut old) = state.device.take() {
                old.disconnect();
            }
            state.device = Some(create_device(output_type)?);
        }
        Ok(())
    }

    /// Connects a virtual gamepad of the current output type. Idempotent.
    /// Emits `DriverNotFound` error if the ViGEmBus driver is not installed.
    pub fn connect() -> NativeResult<()> {
        let mut state = SHARED_GAMEPAD.lock().unwrap();
        let was_connected = state.device.is_some();
        if !was_connected {
            let dev = create_device(state.output_type)?;
            state.device = Some(dev);
            if state.hide_real_pads {
                HidHideService::activate();
            }
        }
        Ok(())
    }

    /// Tries to connect the virtual gamepad. Returns true if successful, false if driver unavailable.
    pub fn try_connect() -> bool {
        Self::connect().is_ok()
    }

    /// Disconnects the virtual gamepad, resetting all controls and deactivating HidHide.
    pub fn disconnect() {
        let mut state = SHARED_GAMEPAD.lock().unwrap();
        if let Some(mut dev) = state.device.take() {
            dev.disconnect();
        }
        state.active_leases = 0;
        HidHideService::deactivate();
    }

    /// Sets a button state on the connected virtual gamepad.
    pub fn set_button(button: GamepadButton, pressed: bool) {
        let mut state = SHARED_GAMEPAD.lock().unwrap();
        if let Some(dev) = state.device.as_mut() {
            dev.set_button(button, pressed);
        }
    }

    /// Sets an analog axis or trigger on the connected virtual gamepad.
    pub fn set_axis(axis: GamepadAxis, value: i32) {
        let mut state = SHARED_GAMEPAD.lock().unwrap();
        if let Some(dev) = state.device.as_mut() {
            dev.set_axis(axis, value);
        }
    }

    /// Pushes accumulated button and axis states to the driver.
    pub fn apply() -> NativeResult<()> {
        let mut state = SHARED_GAMEPAD.lock().unwrap();
        if let Some(dev) = state.device.as_mut() {
            dev.apply()?;
        }
        Ok(())
    }

    /// Releases all buttons, centers sticks, zeroes triggers and applies,
    /// returning every virtual control to neutral while keeping the pad connected.
    pub fn reset() -> NativeResult<()> {
        let mut state = SHARED_GAMEPAD.lock().unwrap();
        if let Some(dev) = state.device.as_mut() {
            dev.reset()?;
        }
        Ok(())
    }

    /// Acquires a session lease ensuring the virtual controller remains connected
    /// while any enabled macro or playback session needs it.
    pub fn acquire_session() -> NativeResult<()> {
        let mut state = SHARED_GAMEPAD.lock().unwrap();
        state.active_leases += 1;
        if state.device.is_none() {
            let dev = create_device(state.output_type)?;
            state.device = Some(dev);
            if state.hide_real_pads {
                HidHideService::activate();
            }
        }
        Ok(())
    }

    /// Releases a session lease. Returns the remaining number of active leases.
    pub fn release_session() -> usize {
        let mut state = SHARED_GAMEPAD.lock().unwrap();
        if state.active_leases > 0 {
            state.active_leases -= 1;
        }
        // Always reset controls to neutral on session release so nothing stays pressed
        if let Some(dev) = state.device.as_mut() {
            let _ = dev.reset();
        }
        state.active_leases
    }

    /// Emergency stop and crash recovery handler:
    /// Unconditionally returns all virtual controls to neutral, preventing stuck inputs.
    pub fn emergency_neutral() {
        let mut state = match SHARED_GAMEPAD.lock() {
            Ok(s) => s,
            Err(poisoned) => poisoned.into_inner(),
        };
        if let Some(dev) = state.device.as_mut() {
            let _ = dev.reset();
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_shared_state_initial() {
        assert!(!SharedVirtualGamepad::is_connected());
        assert_eq!(SharedVirtualGamepad::output_type(), GamepadOutputType::Xbox360);
        assert!(!SharedVirtualGamepad::hide_real_pads());
    }

    #[test]
    fn test_toggle_hide_real_pads() {
        SharedVirtualGamepad::set_hide_real_pads(true);
        assert!(SharedVirtualGamepad::hide_real_pads());
        SharedVirtualGamepad::set_hide_real_pads(false);
        assert!(!SharedVirtualGamepad::hide_real_pads());
    }

    #[test]
    fn test_output_type_switch_when_disconnected() {
        let res = SharedVirtualGamepad::set_output_type(GamepadOutputType::DualShock4);
        assert!(res.is_ok());
        assert_eq!(SharedVirtualGamepad::output_type(), GamepadOutputType::DualShock4);

        let res2 = SharedVirtualGamepad::set_output_type(GamepadOutputType::Xbox360);
        assert!(res2.is_ok());
        assert_eq!(SharedVirtualGamepad::output_type(), GamepadOutputType::Xbox360);
    }

    #[test]
    fn test_try_connect_fails_gracefully_when_no_driver() {
        // In unit test environment without ViGEmBus installed, try_connect returns false
        if !crate::gamepad::vigem::is_vigem_driver_available() {
            assert!(!SharedVirtualGamepad::try_connect());
            assert!(!SharedVirtualGamepad::is_connected());
        }
    }

    #[test]
    fn test_disconnect_idempotency() {
        SharedVirtualGamepad::disconnect();
        assert!(!SharedVirtualGamepad::is_connected());
        SharedVirtualGamepad::disconnect();
        assert!(!SharedVirtualGamepad::is_connected());
    }
}
