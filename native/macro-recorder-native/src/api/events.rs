//! Strongly-typed event contracts produced by low-level hooks and hardware readers.

use napi_derive::napi;

/// Event emitted by the low-level keyboard hook (`WH_KEYBOARD_LL`).
#[napi(object)]
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct NativeKeyboardHookEvent {
    pub event_type: String,
    pub virtual_key: u32,
    pub scan_code: u32,
    pub extended: bool,
    pub timestamp_microseconds: i64,
    pub is_injected: bool,
}

/// Event emitted by the low-level mouse hook (`WH_MOUSE_LL`).
#[napi(object)]
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct NativeMouseHookEvent {
    pub event_type: String,
    pub button: String,
    pub x: i32,
    pub y: i32,
    pub wheel_delta: i32,
    pub timestamp_microseconds: i64,
    pub is_injected: bool,
}

/// Event emitted by Raw Input (`WM_INPUT`) mouse device listeners.
#[napi(object)]
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct NativeRawInputEvent {
    pub delta_x: i32,
    pub delta_y: i32,
    pub button_flags: u32,
    pub timestamp_microseconds: i64,
}

/// Event emitted by gamepad hardware pollers (XInput / Windows.Gaming.Input).
#[napi(object)]
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct NativeGamepadStateEvent {
    pub slot: u32,
    pub connected: bool,
    pub buttons: u32,
    pub left_x: i32,
    pub left_y: i32,
    pub right_x: i32,
    pub right_y: i32,
    pub left_trigger: u32,
    pub right_trigger: u32,
    pub timestamp_microseconds: i64,
}

/// Event emitted when the native emergency stop shortcut (F10) is triggered.
#[napi(object)]
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct NativeEmergencyStopEvent {
    pub timestamp_microseconds: i64,
    pub reason: String,
}

/// Event emitted upon Windows power/session lifecycle notifications.
#[napi(object)]
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct NativeLifecycleEvent {
    pub r#type: String,
    pub timestamp_microseconds: i64,
}
