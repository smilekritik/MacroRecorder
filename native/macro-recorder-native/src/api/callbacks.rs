//! Strongly-typed callback payloads delivered asynchronously to Node.js.

use napi_derive::napi;

use crate::api::events::{
    NativeEmergencyStopEvent, NativeGamepadStateEvent, NativeKeyboardHookEvent,
    NativeLifecycleEvent, NativeMouseHookEvent, NativeRawInputEvent,
};

/// Payload delivered when a registered native hotkey is triggered.
#[napi(object)]
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct NativeHotkeyTriggerCallback {
    pub kind: String,
    pub id: u32,
    pub virtual_key: u32,
    pub modifiers: u32,
    pub timestamp_microseconds: i64,
}

/// Unified callback payload passed across the N-API asynchronous boundary to Node.js.
///
/// Implements the discriminated union described in `@macro-recorder/contracts`:
/// - `kind: 'keyboardHook'`
/// - `kind: 'mouseHook'`
/// - `kind: 'rawInput'`
/// - `kind: 'gamepad'`
/// - `kind: 'hotkeyTrigger'`
/// - `kind: 'emergencyStop'`
/// - `kind: 'lifecycle'`
#[napi(object)]
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct NativeCallbackPayload {
    /// Discriminated union discriminator tag.
    pub kind: String,

    // KeyboardHook fields
    pub event_type: Option<String>,
    pub virtual_key: Option<u32>,
    pub scan_code: Option<u32>,
    pub extended: Option<bool>,
    pub is_injected: Option<bool>,

    // MouseHook fields
    pub button: Option<String>,
    pub x: Option<i32>,
    pub y: Option<i32>,
    pub wheel_delta: Option<i32>,

    // RawInput fields
    pub delta_x: Option<i32>,
    pub delta_y: Option<i32>,
    pub button_flags: Option<u32>,

    // Gamepad fields
    pub slot: Option<u32>,
    pub connected: Option<bool>,
    pub buttons: Option<u32>,
    pub left_x: Option<i32>,
    pub left_y: Option<i32>,
    pub right_x: Option<i32>,
    pub right_y: Option<i32>,
    pub left_trigger: Option<u32>,
    pub right_trigger: Option<u32>,

    // Hotkey fields
    pub id: Option<u32>,
    pub modifiers: Option<u32>,

    // EmergencyStop fields
    pub reason: Option<String>,

    // Lifecycle fields
    pub r#type: Option<String>,

    // Common timestamp in microseconds
    pub timestamp_microseconds: i64,
}

impl NativeCallbackPayload {
    /// Creates a payload for a keyboard hook event.
    pub fn keyboard_hook(event: NativeKeyboardHookEvent) -> Self {
        Self {
            kind: "keyboardHook".to_string(),
            event_type: Some(event.event_type),
            virtual_key: Some(event.virtual_key),
            scan_code: Some(event.scan_code),
            extended: Some(event.extended),
            is_injected: Some(event.is_injected),
            button: None,
            x: None,
            y: None,
            wheel_delta: None,
            delta_x: None,
            delta_y: None,
            button_flags: None,
            slot: None,
            connected: None,
            buttons: None,
            left_x: None,
            left_y: None,
            right_x: None,
            right_y: None,
            left_trigger: None,
            right_trigger: None,
            id: None,
            modifiers: None,
            reason: None,
            r#type: None,
            timestamp_microseconds: event.timestamp_microseconds,
        }
    }

    /// Creates a payload for a mouse hook event.
    pub fn mouse_hook(event: NativeMouseHookEvent) -> Self {
        Self {
            kind: "mouseHook".to_string(),
            event_type: Some(event.event_type),
            virtual_key: None,
            scan_code: None,
            extended: None,
            is_injected: Some(event.is_injected),
            button: Some(event.button),
            x: Some(event.x),
            y: Some(event.y),
            wheel_delta: Some(event.wheel_delta),
            delta_x: None,
            delta_y: None,
            button_flags: None,
            slot: None,
            connected: None,
            buttons: None,
            left_x: None,
            left_y: None,
            right_x: None,
            right_y: None,
            left_trigger: None,
            right_trigger: None,
            id: None,
            modifiers: None,
            reason: None,
            r#type: None,
            timestamp_microseconds: event.timestamp_microseconds,
        }
    }

    /// Creates a payload for a Raw Input event.
    pub fn raw_input(event: NativeRawInputEvent) -> Self {
        Self {
            kind: "rawInput".to_string(),
            event_type: None,
            virtual_key: None,
            scan_code: None,
            extended: None,
            is_injected: None,
            button: None,
            x: None,
            y: None,
            wheel_delta: None,
            delta_x: Some(event.delta_x),
            delta_y: Some(event.delta_y),
            button_flags: Some(event.button_flags),
            slot: None,
            connected: None,
            buttons: None,
            left_x: None,
            left_y: None,
            right_x: None,
            right_y: None,
            left_trigger: None,
            right_trigger: None,
            id: None,
            modifiers: None,
            reason: None,
            r#type: None,
            timestamp_microseconds: event.timestamp_microseconds,
        }
    }

    /// Creates a payload for a gamepad state event.
    pub fn gamepad(event: NativeGamepadStateEvent) -> Self {
        Self {
            kind: "gamepad".to_string(),
            event_type: None,
            virtual_key: None,
            scan_code: None,
            extended: None,
            is_injected: None,
            button: None,
            x: None,
            y: None,
            wheel_delta: None,
            delta_x: None,
            delta_y: None,
            button_flags: None,
            slot: Some(event.slot),
            connected: Some(event.connected),
            buttons: Some(event.buttons),
            left_x: Some(event.left_x),
            left_y: Some(event.left_y),
            right_x: Some(event.right_x),
            right_y: Some(event.right_y),
            left_trigger: Some(event.left_trigger),
            right_trigger: Some(event.right_trigger),
            id: None,
            modifiers: None,
            reason: None,
            r#type: None,
            timestamp_microseconds: event.timestamp_microseconds,
        }
    }

    /// Creates a payload for a hotkey trigger callback.
    pub fn hotkey_trigger(callback: NativeHotkeyTriggerCallback) -> Self {
        Self {
            kind: "hotkeyTrigger".to_string(),
            event_type: None,
            virtual_key: Some(callback.virtual_key),
            scan_code: None,
            extended: None,
            is_injected: None,
            button: None,
            x: None,
            y: None,
            wheel_delta: None,
            delta_x: None,
            delta_y: None,
            button_flags: None,
            slot: None,
            connected: None,
            buttons: None,
            left_x: None,
            left_y: None,
            right_x: None,
            right_y: None,
            left_trigger: None,
            right_trigger: None,
            id: Some(callback.id),
            modifiers: Some(callback.modifiers),
            reason: None,
            r#type: None,
            timestamp_microseconds: callback.timestamp_microseconds,
        }
    }

    /// Creates a payload for an emergency stop event.
    pub fn emergency_stop(event: NativeEmergencyStopEvent) -> Self {
        Self {
            kind: "emergencyStop".to_string(),
            event_type: None,
            virtual_key: None,
            scan_code: None,
            extended: None,
            is_injected: None,
            button: None,
            x: None,
            y: None,
            wheel_delta: None,
            delta_x: None,
            delta_y: None,
            button_flags: None,
            slot: None,
            connected: None,
            buttons: None,
            left_x: None,
            left_y: None,
            right_x: None,
            right_y: None,
            left_trigger: None,
            right_trigger: None,
            id: None,
            modifiers: None,
            reason: Some(event.reason),
            r#type: None,
            timestamp_microseconds: event.timestamp_microseconds,
        }
    }

    /// Creates a payload for a lifecycle event.
    pub fn lifecycle(event: NativeLifecycleEvent) -> Self {
        Self {
            kind: "lifecycle".to_string(),
            event_type: None,
            virtual_key: None,
            scan_code: None,
            extended: None,
            is_injected: None,
            button: None,
            x: None,
            y: None,
            wheel_delta: None,
            delta_x: None,
            delta_y: None,
            button_flags: None,
            slot: None,
            connected: None,
            buttons: None,
            left_x: None,
            left_y: None,
            right_x: None,
            right_y: None,
            left_trigger: None,
            right_trigger: None,
            id: None,
            modifiers: None,
            reason: None,
            r#type: Some(event.r#type),
            timestamp_microseconds: event.timestamp_microseconds,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_keyboard_hook_payload() {
        let event = NativeKeyboardHookEvent {
            event_type: "KeyDown".to_string(),
            virtual_key: 65,
            scan_code: 30,
            extended: false,
            timestamp_microseconds: 1_000_000,
            is_injected: false,
        };
        let payload = NativeCallbackPayload::keyboard_hook(event);
        assert_eq!(payload.kind, "keyboardHook");
        assert_eq!(payload.event_type.as_deref(), Some("KeyDown"));
        assert_eq!(payload.virtual_key, Some(65));
        assert_eq!(payload.scan_code, Some(30));
        assert_eq!(payload.extended, Some(false));
        assert_eq!(payload.is_injected, Some(false));
        assert_eq!(payload.timestamp_microseconds, 1_000_000);
    }

    #[test]
    fn test_mouse_hook_payload() {
        let event = NativeMouseHookEvent {
            event_type: "MouseMove".to_string(),
            button: "None".to_string(),
            x: 1920,
            y: 1080,
            wheel_delta: 0,
            timestamp_microseconds: 2_500_000,
            is_injected: false,
        };
        let payload = NativeCallbackPayload::mouse_hook(event);
        assert_eq!(payload.kind, "mouseHook");
        assert_eq!(payload.x, Some(1920));
        assert_eq!(payload.y, Some(1080));
    }

    #[test]
    fn test_raw_input_payload() {
        let event = NativeRawInputEvent {
            delta_x: -12,
            delta_y: 8,
            button_flags: 0,
            timestamp_microseconds: 3_000_000,
        };
        let payload = NativeCallbackPayload::raw_input(event);
        assert_eq!(payload.kind, "rawInput");
        assert_eq!(payload.delta_x, Some(-12));
        assert_eq!(payload.delta_y, Some(8));
    }

    #[test]
    fn test_gamepad_payload() {
        let event = NativeGamepadStateEvent {
            slot: 0,
            connected: true,
            buttons: 0x1000, // Button A
            left_x: 1000,
            left_y: -2000,
            right_x: 0,
            right_y: 0,
            left_trigger: 128,
            right_trigger: 255,
            timestamp_microseconds: 4_000_000,
        };
        let payload = NativeCallbackPayload::gamepad(event);
        assert_eq!(payload.kind, "gamepad");
        assert_eq!(payload.slot, Some(0));
        assert_eq!(payload.connected, Some(true));
        assert_eq!(payload.buttons, Some(0x1000));
    }

    #[test]
    fn test_hotkey_trigger_payload() {
        let callback = NativeHotkeyTriggerCallback {
            kind: "hotkeyTrigger".to_string(),
            id: 101,
            virtual_key: 121, // F10
            modifiers: 0,
            timestamp_microseconds: 5_000_000,
        };
        let payload = NativeCallbackPayload::hotkey_trigger(callback);
        assert_eq!(payload.kind, "hotkeyTrigger");
        assert_eq!(payload.id, Some(101));
        assert_eq!(payload.virtual_key, Some(121));
    }

    #[test]
    fn test_emergency_stop_payload() {
        let event = NativeEmergencyStopEvent {
            timestamp_microseconds: 6_000_000,
            reason: "User emergency stop pressed".to_string(),
        };
        let payload = NativeCallbackPayload::emergency_stop(event);
        assert_eq!(payload.kind, "emergencyStop");
        assert_eq!(
            payload.reason.as_deref(),
            Some("User emergency stop pressed")
        );
    }

    #[test]
    fn test_lifecycle_payload() {
        let event = NativeLifecycleEvent {
            r#type: "sessionEnding".to_string(),
            timestamp_microseconds: 7_000_000,
        };
        let payload = NativeCallbackPayload::lifecycle(event);
        assert_eq!(payload.kind, "lifecycle");
        assert_eq!(payload.r#type.as_deref(), Some("sessionEnding"));
    }
}
