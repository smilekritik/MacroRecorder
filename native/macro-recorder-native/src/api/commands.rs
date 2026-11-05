//! Strongly-typed command contracts passed across N-API from Node.js to Rust.

use napi_derive::napi;

/// Command to inject a keyboard keystroke (via SendInput or target message).
#[napi(object)]
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct InjectKeyboardCommand {
    pub virtual_key: u32,
    pub scan_code: u32,
    pub extended: bool,
    pub is_up: bool,
    pub is_unicode: Option<bool>,
    pub unicode_char: Option<String>,
    pub target_window: Option<i64>,
}

/// Command to inject relative or absolute mouse cursor movement and button clicks.
#[napi(object)]
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct InjectMouseCommand {
    pub delta_x: i32,
    pub delta_y: i32,
    pub flags: u32,
    pub wheel_delta: i32,
    pub is_absolute: bool,
    pub button: Option<String>,
    pub target_window: Option<i64>,
}

/// Command to deliver a targeted Win32 message directly to a target window (HWND).
#[napi(object)]
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct InjectTargetedWindowMessageCommand {
    pub hwnd: i64,
    pub msg: u32,
    pub w_param: i64,
    pub l_param: i64,
}

/// Command to release all currently held inputs globally or for a specific window.
#[napi(object)]
#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct ReleaseAllInputsCommand {
    pub hwnd: Option<i64>,
}

/// Command to register a global native hotkey shortcut.
#[napi(object)]
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RegisterNativeHotkeyCommand {
    pub id: u32,
    pub virtual_key: u32,
    pub modifiers: u32,
    pub mouse_button: Option<String>,
    pub wheel: Option<String>,
    pub pass_through: Option<bool>,
    pub scope_process: Option<String>,
    pub scope_title: Option<String>,
    pub macro_id: Option<String>,
    pub emergency: Option<bool>,
}

/// Command to unregister a previously registered global native hotkey.
#[napi(object)]
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct UnregisterNativeHotkeyCommand {
    pub id: u32,
}

/// Command to sample the RGB pixel color at screen coordinates (X, Y).
#[napi(object)]
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SamplePixelColorCommand {
    pub x: i32,
    pub y: i32,
}

/// State snapshot for a virtual controller.
#[napi(object)]
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct GamepadSnapshotPayload {
    pub connected: bool,
    pub buttons: u32,
    pub left_x: i32,
    pub left_y: i32,
    pub right_x: i32,
    pub right_y: i32,
    pub left_trigger: u32,
    pub right_trigger: u32,
}

/// Command to update the synthetic state of an emulated virtual gamepad.
#[napi(object)]
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct UpdateVirtualGamepadCommand {
    pub output_type: String,
    pub snapshot: GamepadSnapshotPayload,
}

/// Command to update the HidHide device concealment state.
#[napi(object)]
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SetHidHideStateCommand {
    pub hide: bool,
}
