//! Gamepad data types, button masks, state snapshots, and event definitions.
//!
//! `GamepadPadReading`, and TypeScript contracts in `@macro-recorder/contracts`.

use napi_derive::napi;
use crate::api::commands::GamepadSnapshotPayload;
use crate::api::events::NativeGamepadStateEvent;

/// Canonical gamepad buttons.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum GamepadButton {
    None,
    A,
    B,
    X,
    Y,
    LeftBumper,
    RightBumper,
    Back,
    Start,
    Guide,
    LeftStick,
    RightStick,
    DPadUp,
    DPadDown,
    DPadLeft,
    DPadRight,
}

impl GamepadButton {
    /// String identifier matching the contract schema.
    pub const fn as_str(&self) -> &'static str {
        match self {
            Self::None => "None",
            Self::A => "A",
            Self::B => "B",
            Self::X => "X",
            Self::Y => "Y",
            Self::LeftBumper => "LeftBumper",
            Self::RightBumper => "RightBumper",
            Self::Back => "Back",
            Self::Start => "Start",
            Self::Guide => "Guide",
            Self::LeftStick => "LeftStick",
            Self::RightStick => "RightStick",
            Self::DPadUp => "DPadUp",
            Self::DPadDown => "DPadDown",
            Self::DPadLeft => "DPadLeft",
            Self::DPadRight => "DPadRight",
        }
    }

    /// Parses a string into a `GamepadButton`.
    pub fn from_str_name(name: &str) -> Option<Self> {
        match name {
            "None" => Some(Self::None),
            "A" => Some(Self::A),
            "B" => Some(Self::B),
            "X" => Some(Self::X),
            "Y" => Some(Self::Y),
            "LeftBumper" => Some(Self::LeftBumper),
            "RightBumper" => Some(Self::RightBumper),
            "Back" => Some(Self::Back),
            "Start" => Some(Self::Start),
            "Guide" => Some(Self::Guide),
            "LeftStick" => Some(Self::LeftStick),
            "RightStick" => Some(Self::RightStick),
            "DPadUp" => Some(Self::DPadUp),
            "DPadDown" => Some(Self::DPadDown),
            "DPadLeft" => Some(Self::DPadLeft),
            "DPadRight" => Some(Self::DPadRight),
            _ => None,
        }
    }
}

/// Canonical gamepad axes.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum GamepadAxis {
    None,
    LeftStickX,
    LeftStickY,
    RightStickX,
    RightStickY,
    LeftTrigger,
    RightTrigger,
}

impl GamepadAxis {
    /// String identifier matching the contract schema.
    pub const fn as_str(&self) -> &'static str {
        match self {
            Self::None => "None",
            Self::LeftStickX => "LeftStickX",
            Self::LeftStickY => "LeftStickY",
            Self::RightStickX => "RightStickX",
            Self::RightStickY => "RightStickY",
            Self::LeftTrigger => "LeftTrigger",
            Self::RightTrigger => "RightTrigger",
        }
    }

    /// Parses a string into a `GamepadAxis`.
    pub fn from_str_name(name: &str) -> Option<Self> {
        match name {
            "None" => Some(Self::None),
            "LeftStickX" => Some(Self::LeftStickX),
            "LeftStickY" => Some(Self::LeftStickY),
            "RightStickX" => Some(Self::RightStickX),
            "RightStickY" => Some(Self::RightStickY),
            "LeftTrigger" => Some(Self::LeftTrigger),
            "RightTrigger" => Some(Self::RightTrigger),
            _ => None,
        }
    }
}

/// Supported virtual gamepad emulation target types.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Default)]
pub enum GamepadOutputType {
    #[default]
    Xbox360,
    DualShock4,
}

impl GamepadOutputType {
    pub const fn as_str(&self) -> &'static str {
        match self {
            Self::Xbox360 => "Xbox360",
            Self::DualShock4 => "DualShock4",
        }
    }

    pub fn from_str_name(s: &str) -> Self {
        if s.eq_ignore_ascii_case("DualShock4") || s.eq_ignore_ascii_case("DS4") {
            Self::DualShock4
        } else {
            Self::Xbox360
        }
    }
}

/// Bit flags for gamepad buttons matching XInput reading and ViGEm XUSB output.
pub struct GamepadBits;

impl GamepadBits {
    pub const DPAD_UP: u16 = 0x0001;
    pub const DPAD_DOWN: u16 = 0x0002;
    pub const DPAD_LEFT: u16 = 0x0004;
    pub const DPAD_RIGHT: u16 = 0x0008;
    pub const START: u16 = 0x0010;
    pub const BACK: u16 = 0x0020;
    pub const LEFT_STICK: u16 = 0x0040;
    pub const RIGHT_STICK: u16 = 0x0080;
    pub const LEFT_BUMPER: u16 = 0x0100;
    pub const RIGHT_BUMPER: u16 = 0x0200;
    pub const GUIDE: u16 = 0x0400;
    pub const A: u16 = 0x1000;
    pub const B: u16 = 0x2000;
    pub const X: u16 = 0x4000;
    pub const Y: u16 = 0x8000;

    /// All 15 buttons in the exact order used when diffing state in `GamepadBits.All`.
    pub const ALL: [GamepadButton; 15] = [
        GamepadButton::A,
        GamepadButton::B,
        GamepadButton::X,
        GamepadButton::Y,
        GamepadButton::LeftBumper,
        GamepadButton::RightBumper,
        GamepadButton::Back,
        GamepadButton::Start,
        GamepadButton::Guide,
        GamepadButton::LeftStick,
        GamepadButton::RightStick,
        GamepadButton::DPadUp,
        GamepadButton::DPadDown,
        GamepadButton::DPadLeft,
        GamepadButton::DPadRight,
    ];

    /// Returns the XInput bitmask flag for the specified button.
    pub const fn flag(button: GamepadButton) -> u16 {
        match button {
            GamepadButton::A => Self::A,
            GamepadButton::B => Self::B,
            GamepadButton::X => Self::X,
            GamepadButton::Y => Self::Y,
            GamepadButton::LeftBumper => Self::LEFT_BUMPER,
            GamepadButton::RightBumper => Self::RIGHT_BUMPER,
            GamepadButton::Back => Self::BACK,
            GamepadButton::Start => Self::START,
            GamepadButton::Guide => Self::GUIDE,
            GamepadButton::LeftStick => Self::LEFT_STICK,
            GamepadButton::RightStick => Self::RIGHT_STICK,
            GamepadButton::DPadUp => Self::DPAD_UP,
            GamepadButton::DPadDown => Self::DPAD_DOWN,
            GamepadButton::DPadLeft => Self::DPAD_LEFT,
            GamepadButton::DPadRight => Self::DPAD_RIGHT,
            GamepadButton::None => 0,
        }
    }

    /// Converts an XInput bitmask flag to a GamepadButton if exactly one bit matches.
    pub const fn from_flag(flag: u16) -> Option<GamepadButton> {
        match flag {
            Self::A => Some(GamepadButton::A),
            Self::B => Some(GamepadButton::B),
            Self::X => Some(GamepadButton::X),
            Self::Y => Some(GamepadButton::Y),
            Self::LEFT_BUMPER => Some(GamepadButton::LeftBumper),
            Self::RIGHT_BUMPER => Some(GamepadButton::RightBumper),
            Self::BACK => Some(GamepadButton::Back),
            Self::START => Some(GamepadButton::Start),
            Self::GUIDE => Some(GamepadButton::Guide),
            Self::LEFT_STICK => Some(GamepadButton::LeftStick),
            Self::RIGHT_STICK => Some(GamepadButton::RightStick),
            Self::DPAD_UP => Some(GamepadButton::DPadUp),
            Self::DPAD_DOWN => Some(GamepadButton::DPadDown),
            Self::DPAD_LEFT => Some(GamepadButton::DPadLeft),
            Self::DPAD_RIGHT => Some(GamepadButton::DPadRight),
            _ => None,
        }
    }
}

/// Instant snapshot of an XInput pad state.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub struct GamepadSnapshot {
    pub connected: bool,
    pub buttons: u16,
    pub left_x: i16,
    pub left_y: i16,
    pub right_x: i16,
    pub right_y: i16,
    pub left_trigger: u8,
    pub right_trigger: u8,
}

impl GamepadSnapshot {
    /// Returns true if the given button is currently pressed in the snapshot.
    pub const fn is_pressed(&self, button: GamepadButton) -> bool {
        let flag = GamepadBits::flag(button);
        (self.buttons & flag) != 0
    }

    /// Converts to the N-API transfer payload.
    pub fn to_payload(&self) -> GamepadSnapshotPayload {
        GamepadSnapshotPayload {
            connected: self.connected,
            buttons: self.buttons as u32,
            left_x: self.left_x as i32,
            left_y: self.left_y as i32,
            right_x: self.right_x as i32,
            right_y: self.right_y as i32,
            left_trigger: self.left_trigger as u32,
            right_trigger: self.right_trigger as u32,
        }
    }

    /// Constructs from the N-API transfer payload.
    pub fn from_payload(payload: &GamepadSnapshotPayload) -> Self {
        Self {
            connected: payload.connected,
            buttons: (payload.buttons & 0xFFFF) as u16,
            left_x: payload.left_x.clamp(-32768, 32767) as i16,
            left_y: payload.left_y.clamp(-32768, 32767) as i16,
            right_x: payload.right_x.clamp(-32768, 32767) as i16,
            right_y: payload.right_y.clamp(-32768, 32767) as i16,
            left_trigger: payload.left_trigger.clamp(0, 255) as u8,
            right_trigger: payload.right_trigger.clamp(0, 255) as u8,
        }
    }

    /// Converts to an event struct for N-API callbacks.
    pub fn to_event(&self, slot: u32, timestamp_microseconds: i64) -> NativeGamepadStateEvent {
        NativeGamepadStateEvent {
            slot,
            connected: self.connected,
            buttons: self.buttons as u32,
            left_x: self.left_x as i32,
            left_y: self.left_y as i32,
            right_x: self.right_x as i32,
            right_y: self.right_y as i32,
            left_trigger: self.left_trigger as u32,
            right_trigger: self.right_trigger as u32,
            timestamp_microseconds,
        }
    }
}

/// Normalized reading of any gamepad (XInput or WGI) for tester snapshots.
#[napi(object)]
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct GamepadPadReading {
    pub source: String,
    pub pressed: Vec<String>,
    pub left_x: i32,
    pub left_y: i32,
    pub right_x: i32,
    pub right_y: i32,
    pub left_trigger: i32,
    pub right_trigger: i32,
    pub raw_axes: Option<String>,
}

/// Internal gamepad event emitted by capture poller.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum GamepadEvent {
    ButtonDown {
        pad_index: u32,
        button: GamepadButton,
        timestamp_microseconds: i64,
    },
    ButtonUp {
        pad_index: u32,
        button: GamepadButton,
        timestamp_microseconds: i64,
    },
    Axis {
        pad_index: u32,
        axis: GamepadAxis,
        value: i32,
        timestamp_microseconds: i64,
    },
    State(NativeGamepadStateEvent),
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_button_flag_round_trip() {
        for &button in &GamepadBits::ALL {
            let flag = GamepadBits::flag(button);
            assert_ne!(flag, 0);
            let parsed = GamepadBits::from_flag(flag);
            assert_eq!(parsed, Some(button));
        }
    }

    #[test]
    fn test_snapshot_is_pressed() {
        let snapshot = GamepadSnapshot {
            connected: true,
            buttons: GamepadBits::A | GamepadBits::START | GamepadBits::DPAD_UP,
            ..Default::default()
        };
        assert!(snapshot.is_pressed(GamepadButton::A));
        assert!(snapshot.is_pressed(GamepadButton::Start));
        assert!(snapshot.is_pressed(GamepadButton::DPadUp));
        assert!(!snapshot.is_pressed(GamepadButton::B));
        assert!(!snapshot.is_pressed(GamepadButton::Back));
    }

    #[test]
    fn test_output_type_parsing() {
        assert_eq!(GamepadOutputType::from_str_name("Xbox360"), GamepadOutputType::Xbox360);
        assert_eq!(GamepadOutputType::from_str_name("DualShock4"), GamepadOutputType::DualShock4);
        assert_eq!(GamepadOutputType::from_str_name("ds4"), GamepadOutputType::DualShock4);
        assert_eq!(GamepadOutputType::from_str_name("unknown"), GamepadOutputType::Xbox360);
    }
}
