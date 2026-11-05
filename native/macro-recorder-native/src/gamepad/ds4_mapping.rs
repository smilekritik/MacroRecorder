//! DualShock 4 mapping from Windows.Gaming.Input (WGI) to normalized gamepad model.
//!
//! Single source of truth for both recording capture and gamepad tester snapshots.

use crate::gamepad::types::{GamepadAxis, GamepadButton};

/// Standard DS4 axis mapping: maps canonical GamepadAxis to WGI RawGameController axis index.
pub const DS4_AXIS_MAP: [(GamepadAxis, usize); 6] = [
    (GamepadAxis::LeftStickX, 0),
    (GamepadAxis::LeftStickY, 1),
    (GamepadAxis::RightStickX, 2),
    (GamepadAxis::RightStickY, 5),
    (GamepadAxis::LeftTrigger, 3),
    (GamepadAxis::RightTrigger, 4),
];

/// Deadzone and step thresholds.
pub const STICK_DEADZONE: i32 = 7000;
pub const TRIGGER_THRESHOLD: i32 = 30;
pub const STICK_STEP: i32 = 1500;
pub const TRIGGER_STEP: i32 = 8;

/// Maps a Windows.Gaming.Input `GameControllerButtonLabel` integer value to a normalized `GamepadButton`.
pub fn map_ds4_button_label(label: i32) -> GamepadButton {
    match label {
        43 => GamepadButton::A,           // Cross
        44 => GamepadButton::B,           // Circle
        45 => GamepadButton::X,           // Square
        46 => GamepadButton::Y,           // Triangle
        47 => GamepadButton::LeftBumper,   // LeftBumper
        53 => GamepadButton::RightBumper,  // RightBumper
        49 => GamepadButton::LeftStick,   // LeftStickButton
        55 => GamepadButton::RightStick,  // RightStickButton
        30 => GamepadButton::Back,        // Share
        29 => GamepadButton::Start,       // Options
        23 => GamepadButton::Guide,       // Mode (PS button)
        _ => GamepadButton::None,
    }
}

/// Maps a WGI `GameControllerSwitchPosition` integer value to D-pad buttons.
/// Diagonals produce two buttons simultaneously (e.g. UpLeft -> [DPadUp, DPadLeft]).
pub fn ds4_hat_buttons(hat: i32) -> &'static [GamepadButton] {
    match hat {
        1 => &[GamepadButton::DPadUp],
        5 => &[GamepadButton::DPadDown],
        7 => &[GamepadButton::DPadLeft],
        3 => &[GamepadButton::DPadRight],
        8 => &[GamepadButton::DPadUp, GamepadButton::DPadLeft],
        2 => &[GamepadButton::DPadUp, GamepadButton::DPadRight],
        6 => &[GamepadButton::DPadDown, GamepadButton::DPadLeft],
        4 => &[GamepadButton::DPadDown, GamepadButton::DPadRight],
        _ => &[],
    }
}

/// Converts a WGI raw axis (0.0..1.0, centre 0.5) to the standard XInput scale:
/// - Sticks: i16 range (-32768..32767), Y axis inverted so Up is positive.
/// - Triggers: 0..255.
pub fn convert_wgi_axis(axis: GamepadAxis, raw: f64) -> i32 {
    let clamped_raw = raw.clamp(0.0, 1.0);
    match axis {
        GamepadAxis::LeftTrigger | GamepadAxis::RightTrigger => {
            (clamped_raw * 255.0).round() as i32
        }
        GamepadAxis::LeftStickY | GamepadAxis::RightStickY => {
            // Invert Y: raw 1.0 is bottom in WGI, top in XInput/model
            (-(clamped_raw * 2.0 - 1.0) * 32767.0).round().clamp(-32768.0, 32767.0) as i32
        }
        _ => {
            ((clamped_raw * 2.0 - 1.0) * 32767.0).round().clamp(-32768.0, 32767.0) as i32
        }
    }
}

/// Applies the stick deadzone (values within +/- 7000 become 0).
pub fn apply_stick_deadzone(value: i32) -> i32 {
    if value.abs() < STICK_DEADZONE {
        0
    } else {
        value
    }
}

/// Applies the trigger threshold (values below 30 become 0).
pub fn apply_trigger_threshold(value: i32) -> i32 {
    if value < TRIGGER_THRESHOLD {
        0
    } else {
        value
    }
}

/// Determines whether a new axis reading represents a noticeable change
/// that should be emitted to the timeline, including return to rest (0).
pub fn should_emit_axis(value: i32, last: i32, step: i32) -> bool {
    // Report a change on a noticeable step, and also any return to rest (0) to catch the release.
    (value - last).abs() >= step || (value == 0 && last != 0)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_button_label_mapping() {
        assert_eq!(map_ds4_button_label(43), GamepadButton::A);
        assert_eq!(map_ds4_button_label(44), GamepadButton::B);
        assert_eq!(map_ds4_button_label(45), GamepadButton::X);
        assert_eq!(map_ds4_button_label(46), GamepadButton::Y);
        assert_eq!(map_ds4_button_label(47), GamepadButton::LeftBumper);
        assert_eq!(map_ds4_button_label(53), GamepadButton::RightBumper);
        assert_eq!(map_ds4_button_label(49), GamepadButton::LeftStick);
        assert_eq!(map_ds4_button_label(55), GamepadButton::RightStick);
        assert_eq!(map_ds4_button_label(30), GamepadButton::Back);
        assert_eq!(map_ds4_button_label(29), GamepadButton::Start);
        assert_eq!(map_ds4_button_label(23), GamepadButton::Guide);
        assert_eq!(map_ds4_button_label(999), GamepadButton::None);
    }

    #[test]
    fn test_hat_directions() {
        assert_eq!(ds4_hat_buttons(1), &[GamepadButton::DPadUp]);
        assert_eq!(ds4_hat_buttons(5), &[GamepadButton::DPadDown]);
        assert_eq!(ds4_hat_buttons(7), &[GamepadButton::DPadLeft]);
        assert_eq!(ds4_hat_buttons(3), &[GamepadButton::DPadRight]);
        assert_eq!(ds4_hat_buttons(8), &[GamepadButton::DPadUp, GamepadButton::DPadLeft]);
        assert_eq!(ds4_hat_buttons(2), &[GamepadButton::DPadUp, GamepadButton::DPadRight]);
        assert_eq!(ds4_hat_buttons(6), &[GamepadButton::DPadDown, GamepadButton::DPadLeft]);
        assert_eq!(ds4_hat_buttons(4), &[GamepadButton::DPadDown, GamepadButton::DPadRight]);
        assert_eq!(ds4_hat_buttons(0), &[]);
    }

    #[test]
    fn test_axis_conversions() {
        // Triggers: 0.0 -> 0, 1.0 -> 255, 0.5 -> 128
        assert_eq!(convert_wgi_axis(GamepadAxis::LeftTrigger, 0.0), 0);
        assert_eq!(convert_wgi_axis(GamepadAxis::LeftTrigger, 1.0), 255);
        assert_eq!(convert_wgi_axis(GamepadAxis::LeftTrigger, 0.5), 128);

        // Stick X: 0.5 -> 0, 1.0 -> 32767, 0.0 -> -32767
        assert_eq!(convert_wgi_axis(GamepadAxis::LeftStickX, 0.5), 0);
        assert_eq!(convert_wgi_axis(GamepadAxis::LeftStickX, 1.0), 32767);
        assert_eq!(convert_wgi_axis(GamepadAxis::LeftStickX, 0.0), -32767);

        // Stick Y (inverted): 0.5 -> 0, 1.0 -> -32767, 0.0 -> 32767
        assert_eq!(convert_wgi_axis(GamepadAxis::LeftStickY, 0.5), 0);
        assert_eq!(convert_wgi_axis(GamepadAxis::LeftStickY, 1.0), -32767);
        assert_eq!(convert_wgi_axis(GamepadAxis::LeftStickY, 0.0), 32767);
    }

    #[test]
    fn test_deadzones_and_step_filtering() {
        assert_eq!(apply_stick_deadzone(6999), 0);
        assert_eq!(apply_stick_deadzone(-6999), 0);
        assert_eq!(apply_stick_deadzone(7000), 7000);
        assert_eq!(apply_stick_deadzone(-7000), -7000);

        assert_eq!(apply_trigger_threshold(29), 0);
        assert_eq!(apply_trigger_threshold(30), 30);

        // Within step threshold, not zero
        assert!(!should_emit_axis(1000, 500, STICK_STEP));
        // Exceeds step threshold
        assert!(should_emit_axis(2100, 500, STICK_STEP));
        // Return to 0 always emits to catch release
        assert!(should_emit_axis(0, 500, STICK_STEP));
        // Staying at 0 does not emit
        assert!(!should_emit_axis(0, 0, STICK_STEP));
    }
}
