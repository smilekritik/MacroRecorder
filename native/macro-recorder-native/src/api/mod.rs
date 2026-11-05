//! Strongly-typed command and event boundaries for Macro Recorder native addon.
//!
//! Provides typed definitions for commands from Node.js and events from Win32
//! hooks, along with the high-level NativeFoundationSession boundary.

pub mod callbacks;
pub mod commands;
pub mod events;
pub mod session;

pub use callbacks::{NativeCallbackPayload, NativeHotkeyTriggerCallback};
pub use commands::{
    GamepadSnapshotPayload, InjectKeyboardCommand, InjectMouseCommand,
    InjectTargetedWindowMessageCommand, RegisterNativeHotkeyCommand, ReleaseAllInputsCommand,
    SamplePixelColorCommand, SetHidHideStateCommand, UnregisterNativeHotkeyCommand,
    UpdateVirtualGamepadCommand,
};
pub use events::{
    NativeEmergencyStopEvent, NativeGamepadStateEvent, NativeKeyboardHookEvent,
    NativeLifecycleEvent, NativeMouseHookEvent, NativeRawInputEvent,
};
pub use session::{NativeFoundationSession, QueueStatsPayload};
