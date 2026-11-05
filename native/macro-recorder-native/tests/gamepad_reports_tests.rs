//! Tests for gamepad reports, state snapshots, payload conversions, clamping,
//! and virtual gamepad lifecycle / emergency neutral guarantees.

#![allow(
    dead_code,
    clippy::missing_transmute_annotations,
    clippy::if_same_then_else,
    clashing_extern_declarations,
    clippy::upper_case_acronyms
)]

pub mod api {
    #[rustfmt::skip]
    #[path = "../../src/api/commands.rs"]
    pub mod commands;
    #[rustfmt::skip]
    #[path = "../../src/api/events.rs"]
    pub mod events;
}

#[rustfmt::skip]
#[path = "../src/error.rs"]
mod error;

pub mod gamepad {
    #[rustfmt::skip]
    #[path = "../../src/gamepad/hidhide.rs"]
    pub mod hidhide;
    #[rustfmt::skip]
    #[path = "../../src/gamepad/shared_gamepad.rs"]
    pub mod shared_gamepad;
    #[rustfmt::skip]
    #[path = "../../src/gamepad/types.rs"]
    pub mod types;
    #[rustfmt::skip]
    #[path = "../../src/gamepad/vigem.rs"]
    pub mod vigem;
    #[rustfmt::skip]
    #[path = "../../src/gamepad/virtual_controller.rs"]
    pub mod virtual_controller;
}

use api::commands::GamepadSnapshotPayload;
use gamepad::shared_gamepad::SharedVirtualGamepad;
use gamepad::types::{GamepadAxis, GamepadBits, GamepadButton, GamepadOutputType, GamepadSnapshot};
use gamepad::vigem::{Ds4Report, XusbReport};

#[test]
fn test_gamepad_snapshot_default_is_neutral() {
    let snapshot = GamepadSnapshot::default();
    assert!(!snapshot.connected);
    assert_eq!(snapshot.buttons, 0);
    assert_eq!(snapshot.left_x, 0);
    assert_eq!(snapshot.left_y, 0);
    assert_eq!(snapshot.right_x, 0);
    assert_eq!(snapshot.right_y, 0);
    assert_eq!(snapshot.left_trigger, 0);
    assert_eq!(snapshot.right_trigger, 0);

    for &btn in &GamepadBits::ALL {
        assert!(!snapshot.is_pressed(btn));
    }
}

#[test]
fn test_gamepad_snapshot_is_pressed() {
    let snapshot = GamepadSnapshot {
        buttons: GamepadBits::A | GamepadBits::DPAD_UP | GamepadBits::RIGHT_BUMPER,
        ..Default::default()
    };

    assert!(snapshot.is_pressed(GamepadButton::A));
    assert!(snapshot.is_pressed(GamepadButton::DPadUp));
    assert!(snapshot.is_pressed(GamepadButton::RightBumper));

    assert!(!snapshot.is_pressed(GamepadButton::B));
    assert!(!snapshot.is_pressed(GamepadButton::X));
    assert!(!snapshot.is_pressed(GamepadButton::DPadDown));
}

#[test]
fn test_gamepad_snapshot_to_payload_roundtrip() {
    let snapshot = GamepadSnapshot {
        connected: true,
        buttons: GamepadBits::X | GamepadBits::START,
        left_x: 12000,
        left_y: -8000,
        right_x: -16000,
        right_y: 24000,
        left_trigger: 128,
        right_trigger: 255,
    };

    let payload = snapshot.to_payload();
    assert!(payload.connected);
    assert_eq!(
        payload.buttons,
        (GamepadBits::X | GamepadBits::START) as u32
    );
    assert_eq!(payload.left_x, 12000);
    assert_eq!(payload.left_y, -8000);
    assert_eq!(payload.right_x, -16000);
    assert_eq!(payload.right_y, 24000);
    assert_eq!(payload.left_trigger, 128);
    assert_eq!(payload.right_trigger, 255);

    let reconstructed = GamepadSnapshot::from_payload(&payload);
    assert_eq!(snapshot, reconstructed);
}

#[test]
fn test_gamepad_snapshot_payload_clamping() {
    let overflown_payload = GamepadSnapshotPayload {
        connected: true,
        buttons: 0x1_FFFF, // Exceeds 16 bits
        left_x: 50_000,    // Exceeds i16::MAX (32767)
        left_y: -60_000,   // Below i16::MIN (-32768)
        right_x: 32_767,
        right_y: -32_768,
        left_trigger: 500, // Exceeds 255
        right_trigger: 0,
    };

    let clamped = GamepadSnapshot::from_payload(&overflown_payload);
    assert_eq!(clamped.buttons, 0xFFFF);
    assert_eq!(clamped.left_x, 32767);
    assert_eq!(clamped.left_y, -32768);
    assert_eq!(clamped.right_x, 32767);
    assert_eq!(clamped.right_y, -32768);
    assert_eq!(clamped.left_trigger, 255);
    assert_eq!(clamped.right_trigger, 0);
}

#[test]
fn test_gamepad_snapshot_to_event() {
    let snapshot = GamepadSnapshot {
        connected: true,
        buttons: GamepadBits::GUIDE,
        left_x: 500,
        left_y: -500,
        right_x: 100,
        right_y: -100,
        left_trigger: 50,
        right_trigger: 75,
    };

    let event = snapshot.to_event(2, 9876543210);
    assert_eq!(event.slot, 2);
    assert!(event.connected);
    assert_eq!(event.buttons, GamepadBits::GUIDE as u32);
    assert_eq!(event.timestamp_microseconds, 9876543210);
}

#[test]
fn test_xusb_report_default_neutral() {
    let report = XusbReport::default();
    assert_eq!(report.w_buttons, 0);
    assert_eq!(report.b_left_trigger, 0);
    assert_eq!(report.b_right_trigger, 0);
    assert_eq!(report.s_thumb_lx, 0);
    assert_eq!(report.s_thumb_ly, 0);
    assert_eq!(report.s_thumb_rx, 0);
    assert_eq!(report.s_thumb_ry, 0);
}

#[test]
fn test_ds4_report_default_neutral() {
    let report = Ds4Report::default();
    // DS4 sticks center at 128 (0..255)
    assert_eq!(report.b_thumb_lx, 128);
    assert_eq!(report.b_thumb_ly, 128);
    assert_eq!(report.b_thumb_rx, 128);
    assert_eq!(report.b_thumb_ry, 128);
    // D-Pad neutral bit is 0x0008
    assert_eq!(report.w_buttons, 0x0008);
    assert_eq!(report.b_trigger_l, 0);
    assert_eq!(report.b_trigger_r, 0);
}

#[test]
fn test_shared_virtual_gamepad_lifecycle() {
    // Ensure clean initial state
    SharedVirtualGamepad::disconnect();
    assert!(!SharedVirtualGamepad::is_connected());

    // Toggle HidHide
    SharedVirtualGamepad::set_hide_real_pads(true);
    assert!(SharedVirtualGamepad::hide_real_pads());
    SharedVirtualGamepad::set_hide_real_pads(false);
    assert!(!SharedVirtualGamepad::hide_real_pads());

    // Switch output types
    assert_eq!(
        SharedVirtualGamepad::output_type(),
        GamepadOutputType::Xbox360
    );
    let res = SharedVirtualGamepad::set_output_type(GamepadOutputType::DualShock4);
    assert!(res.is_ok());
    assert_eq!(
        SharedVirtualGamepad::output_type(),
        GamepadOutputType::DualShock4
    );

    let res2 = SharedVirtualGamepad::set_output_type(GamepadOutputType::Xbox360);
    assert!(res2.is_ok());
    assert_eq!(
        SharedVirtualGamepad::output_type(),
        GamepadOutputType::Xbox360
    );
}

#[test]
fn test_shared_virtual_gamepad_emergency_neutral() {
    // Calling emergency_neutral must always be safe and never panic even when disconnected
    SharedVirtualGamepad::emergency_neutral();
    assert!(!SharedVirtualGamepad::is_connected());
}

#[test]
fn test_shared_virtual_gamepad_disconnect_idempotency() {
    SharedVirtualGamepad::disconnect();
    SharedVirtualGamepad::disconnect();
    assert!(!SharedVirtualGamepad::is_connected());
}

#[test]
fn test_gamepad_axis_str_roundtrips() {
    let axes = [
        GamepadAxis::None,
        GamepadAxis::LeftStickX,
        GamepadAxis::LeftStickY,
        GamepadAxis::RightStickX,
        GamepadAxis::RightStickY,
        GamepadAxis::LeftTrigger,
        GamepadAxis::RightTrigger,
    ];

    for axis in axes {
        let name = axis.as_str();
        let parsed = GamepadAxis::from_str_name(name).expect("Parsing axis");
        assert_eq!(axis, parsed);
    }
}

#[test]
fn test_gamepad_button_str_roundtrips() {
    for &btn in &GamepadBits::ALL {
        let name = btn.as_str();
        let parsed = GamepadButton::from_str_name(name).expect("Parsing button");
        assert_eq!(btn, parsed);
    }
}
