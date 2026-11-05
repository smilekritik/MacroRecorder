#![allow(dead_code, unused_imports, clippy::all)]

#[rustfmt::skip]
#[path = "../src/error.rs"]
pub mod error;

pub mod gamepad {
    #[rustfmt::skip]
    #[path = "../../src/gamepad/ds4_mapping.rs"]
    pub mod ds4_mapping;
    #[rustfmt::skip]
    #[path = "../../src/gamepad/types.rs"]
    pub mod types;
}

pub mod input_capture {
    #[rustfmt::skip]
    #[path = "../../src/input_capture/keyboard_mapping.rs"]
    pub mod keyboard_mapping;

    pub use keyboard_mapping::{KeyScanInfo, KeyboardMapping};
}

pub struct KeyboardMappingHelper;
impl KeyboardMappingHelper {
    pub fn from_virtual_key(&self, virtual_key: u32) -> input_capture::KeyScanInfo {
        input_capture::KeyboardMapping::from_virtual_key(virtual_key)
    }
    pub fn name_from_scan_code(&self, scan_code: u32, extended: bool) -> String {
        input_capture::KeyboardMapping::name_from_scan_code(scan_code, extended)
    }
}
impl std::ops::Deref for input_capture::KeyboardMapping {
    type Target = KeyboardMappingHelper;
    fn deref(&self) -> &Self::Target {
        &KeyboardMappingHelper
    }
}

pub mod input_injection {
    #[rustfmt::skip]
    #[path = "../../src/input_injection/scan_code.rs"]
    pub mod scan_code;
    #[rustfmt::skip]
    #[path = "../../src/input_injection/state_tracker.rs"]
    pub mod state_tracker;
}

pub mod api {
    #[rustfmt::skip]
    #[path = "../../src/api/commands.rs"]
    pub mod commands;
    #[rustfmt::skip]
    #[path = "../../src/api/events.rs"]
    pub mod events;
}

use gamepad::ds4_mapping::{
    STICK_DEADZONE, STICK_STEP, TRIGGER_THRESHOLD, apply_stick_deadzone, apply_trigger_threshold,
    convert_wgi_axis, ds4_hat_buttons, map_ds4_button_label, should_emit_axis,
};
use gamepad::types::{GamepadAxis, GamepadBits, GamepadButton, GamepadOutputType};
use input_capture::KeyboardMapping;
use input_injection::scan_code::{compute_send_input_keyboard_params, resolve_scan_code};
use input_injection::state_tracker::MouseButton;

use windows::Win32::UI::Input::KeyboardAndMouse::{
    KEYEVENTF_EXTENDEDKEY, KEYEVENTF_KEYUP, KEYEVENTF_SCANCODE,
};

#[test]
fn test_keyboard_mapping_standard_keys() {
    let enter = KeyboardMapping::from_virtual_key(0x0D);
    assert_eq!(enter.scan_code, 0x1C);
    assert!(!enter.extended);

    let esc = KeyboardMapping::from_virtual_key(0x1B);
    assert_eq!(esc.scan_code, 0x01);
    assert!(!esc.extended);

    let space = KeyboardMapping::from_virtual_key(0x20);
    assert_eq!(space.scan_code, 0x39);
    assert!(!space.extended);

    let tab = KeyboardMapping::from_virtual_key(0x09);
    assert_eq!(tab.scan_code, 0x0F);
    assert!(!tab.extended);

    let backspace = KeyboardMapping::from_virtual_key(0x08);
    assert_eq!(backspace.scan_code, 0x0E);
    assert!(!backspace.extended);
}

#[test]
fn test_keyboard_mapping_extended_navigational_keys() {
    let left = KeyboardMapping::from_virtual_key(0x25);
    assert!(left.extended, "Left arrow must be extended");
    assert!(left.scan_code > 0);

    let up = KeyboardMapping::from_virtual_key(0x26);
    assert!(up.extended, "Up arrow must be extended");
    assert!(up.scan_code > 0);

    let right = KeyboardMapping::from_virtual_key(0x27);
    assert!(right.extended, "Right arrow must be extended");
    assert!(right.scan_code > 0);

    let down = KeyboardMapping::from_virtual_key(0x28);
    assert!(down.extended, "Down arrow must be extended");
    assert!(down.scan_code > 0);

    let home = KeyboardMapping::from_virtual_key(0x24);
    assert!(home.extended, "Home must be extended");

    let end = KeyboardMapping::from_virtual_key(0x23);
    assert!(end.extended, "End must be extended");

    let page_up = KeyboardMapping::from_virtual_key(0x21);
    assert!(page_up.extended, "PageUp must be extended");

    let page_down = KeyboardMapping::from_virtual_key(0x22);
    assert!(page_down.extended, "PageDown must be extended");

    let insert = KeyboardMapping::from_virtual_key(0x2D);
    assert!(insert.extended, "Insert must be extended");

    let delete = KeyboardMapping::from_virtual_key(0x2E);
    assert!(delete.extended, "Delete must be extended");

    let lwin = KeyboardMapping::from_virtual_key(0x5B);
    assert!(lwin.extended, "LWin must be extended");

    let rwin = KeyboardMapping::from_virtual_key(0x5C);
    assert!(rwin.extended, "RWin must be extended");
}

#[test]
fn test_keyboard_mapping_key_name_localization() {
    let enter_name = KeyboardMapping::name_from_scan_code(0x1C, false);
    assert!(!enter_name.is_empty(), "Enter key name should not be empty");

    let space_name = KeyboardMapping::name_from_scan_code(0x39, false);
    assert!(!space_name.is_empty(), "Space key name should not be empty");

    let esc_name = KeyboardMapping::name_from_scan_code(0x01, false);
    assert!(!esc_name.is_empty(), "Escape key name should not be empty");
}

#[test]
fn test_scan_code_resolution_policy() {
    assert_eq!(resolve_scan_code(0x41, 0x1E), 0x1E);
    assert_eq!(resolve_scan_code(0x42, 0x99), 0x99);

    let resolved = resolve_scan_code(0x41, 0);
    assert_eq!(resolved, 0x1E);
}

#[test]
fn test_send_input_params_computation() {
    let (w_vk, w_scan, flags) = compute_send_input_keyboard_params(0x41, 0x1E, false, false, true);
    assert_eq!(w_vk, 0, "wVk must be 0 when using scan codes");
    assert_eq!(w_scan, 0x1E);
    assert_ne!(flags & KEYEVENTF_SCANCODE.0, 0);
    assert_eq!(flags & KEYEVENTF_KEYUP.0, 0);
    assert_eq!(flags & KEYEVENTF_EXTENDEDKEY.0, 0);

    let (w_vk, w_scan, flags) = compute_send_input_keyboard_params(0x41, 0x1E, false, false, false);
    assert_eq!(
        w_vk, 0x41,
        "wVk must hold virtual key when scan codes disabled"
    );
    assert_eq!(w_scan, 0);
    assert_eq!(flags & KEYEVENTF_SCANCODE.0, 0);

    let (w_vk, _, flags) = compute_send_input_keyboard_params(0x25, 0x4B, true, true, false);
    assert_eq!(w_vk, 0x25);
    assert_ne!(flags & KEYEVENTF_KEYUP.0, 0);
    assert_ne!(flags & KEYEVENTF_EXTENDEDKEY.0, 0);
}

#[test]
fn test_mouse_button_mapping_and_parsing() {
    let cases = [
        ("left", MouseButton::Left),
        ("Left", MouseButton::Left),
        ("right", MouseButton::Right),
        ("Right", MouseButton::Right),
        ("middle", MouseButton::Middle),
        ("Middle", MouseButton::Middle),
        ("x1", MouseButton::X1),
        ("xbutton1", MouseButton::X1),
        ("x2", MouseButton::X2),
        ("xbutton2", MouseButton::X2),
    ];

    for (name, expected) in cases {
        assert_eq!(MouseButton::parse(name), Some(expected));
        assert_eq!(name.parse::<MouseButton>(), Ok(expected));
    }

    assert_eq!(MouseButton::parse("unknown_button"), None);
    assert_eq!("invalid".parse::<MouseButton>(), Err(()));
}

#[test]
fn test_gamepad_ds4_button_labels() {
    assert_eq!(map_ds4_button_label(43), GamepadButton::A); // Cross
    assert_eq!(map_ds4_button_label(44), GamepadButton::B); // Circle
    assert_eq!(map_ds4_button_label(45), GamepadButton::X); // Square
    assert_eq!(map_ds4_button_label(46), GamepadButton::Y); // Triangle
    assert_eq!(map_ds4_button_label(47), GamepadButton::LeftBumper);
    assert_eq!(map_ds4_button_label(53), GamepadButton::RightBumper);
    assert_eq!(map_ds4_button_label(49), GamepadButton::LeftStick);
    assert_eq!(map_ds4_button_label(55), GamepadButton::RightStick);
    assert_eq!(map_ds4_button_label(30), GamepadButton::Back); // Share
    assert_eq!(map_ds4_button_label(29), GamepadButton::Start); // Options
    assert_eq!(map_ds4_button_label(23), GamepadButton::Guide); // PS Button
    assert_eq!(map_ds4_button_label(9999), GamepadButton::None);
}

#[test]
fn test_gamepad_ds4_hat_switch_cardinals_and_diagonals() {
    assert_eq!(ds4_hat_buttons(1), &[GamepadButton::DPadUp]);
    assert_eq!(ds4_hat_buttons(5), &[GamepadButton::DPadDown]);
    assert_eq!(ds4_hat_buttons(7), &[GamepadButton::DPadLeft]);
    assert_eq!(ds4_hat_buttons(3), &[GamepadButton::DPadRight]);

    assert_eq!(
        ds4_hat_buttons(8),
        &[GamepadButton::DPadUp, GamepadButton::DPadLeft]
    );
    assert_eq!(
        ds4_hat_buttons(2),
        &[GamepadButton::DPadUp, GamepadButton::DPadRight]
    );
    assert_eq!(
        ds4_hat_buttons(6),
        &[GamepadButton::DPadDown, GamepadButton::DPadLeft]
    );
    assert_eq!(
        ds4_hat_buttons(4),
        &[GamepadButton::DPadDown, GamepadButton::DPadRight]
    );

    assert_eq!(ds4_hat_buttons(0), &[]);
    assert_eq!(ds4_hat_buttons(-1), &[]);
}

#[test]
fn test_gamepad_wgi_axis_conversion_and_deadzones() {
    assert_eq!(convert_wgi_axis(GamepadAxis::LeftTrigger, 0.0), 0);
    assert_eq!(convert_wgi_axis(GamepadAxis::LeftTrigger, 1.0), 255);
    assert_eq!(convert_wgi_axis(GamepadAxis::LeftTrigger, 0.5), 128);

    assert_eq!(convert_wgi_axis(GamepadAxis::LeftTrigger, -0.5), 0);
    assert_eq!(convert_wgi_axis(GamepadAxis::LeftTrigger, 1.5), 255);

    assert_eq!(convert_wgi_axis(GamepadAxis::LeftStickX, 0.5), 0);
    assert_eq!(convert_wgi_axis(GamepadAxis::LeftStickX, 0.0), -32767);
    assert_eq!(convert_wgi_axis(GamepadAxis::LeftStickX, 1.0), 32767);

    assert_eq!(convert_wgi_axis(GamepadAxis::LeftStickY, 0.5), 0);
    assert_eq!(convert_wgi_axis(GamepadAxis::LeftStickY, 0.0), 32767);
    assert_eq!(convert_wgi_axis(GamepadAxis::LeftStickY, 1.0), -32767);

    assert_eq!(apply_stick_deadzone(STICK_DEADZONE - 1), 0);
    assert_eq!(apply_stick_deadzone(-STICK_DEADZONE + 1), 0);
    assert_eq!(apply_stick_deadzone(STICK_DEADZONE), STICK_DEADZONE);
    assert_eq!(apply_stick_deadzone(-STICK_DEADZONE), -STICK_DEADZONE);

    assert_eq!(apply_trigger_threshold(TRIGGER_THRESHOLD - 1), 0);
    assert_eq!(
        apply_trigger_threshold(TRIGGER_THRESHOLD),
        TRIGGER_THRESHOLD
    );

    assert!(!should_emit_axis(1000, 500, STICK_STEP));
    assert!(should_emit_axis(2100, 500, STICK_STEP));
    assert!(should_emit_axis(0, 500, STICK_STEP));
    assert!(!should_emit_axis(0, 0, STICK_STEP));
}

#[test]
fn test_gamepad_bits_and_button_flags_roundtrip() {
    for &btn in &GamepadBits::ALL {
        let flag = GamepadBits::flag(btn);
        assert_ne!(flag, 0, "Flag for {btn:?} must not be zero");
        assert_eq!(
            GamepadBits::from_flag(flag),
            Some(btn),
            "Flag roundtrip for {btn:?}"
        );
    }

    assert_eq!(GamepadBits::flag(GamepadButton::None), 0);
    assert_eq!(GamepadBits::from_flag(0), None);
}

#[test]
fn test_gamepad_output_type_parsing() {
    assert_eq!(
        GamepadOutputType::from_str_name("Xbox360"),
        GamepadOutputType::Xbox360
    );
    assert_eq!(
        GamepadOutputType::from_str_name("xbox360"),
        GamepadOutputType::Xbox360
    );
    assert_eq!(
        GamepadOutputType::from_str_name("DualShock4"),
        GamepadOutputType::DualShock4
    );
    assert_eq!(
        GamepadOutputType::from_str_name("ds4"),
        GamepadOutputType::DualShock4
    );
    assert_eq!(
        GamepadOutputType::from_str_name("DS4"),
        GamepadOutputType::DualShock4
    );
    assert_eq!(
        GamepadOutputType::from_str_name("other"),
        GamepadOutputType::Xbox360
    );
}
