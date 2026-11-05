//! Low-level keyboard and mouse hooks, Raw Input registration, and input capture service.
//!
//! Provides:
//! - Low-level keyboard hook (`WH_KEYBOARD_LL`) with injected-event filtering and bind pass-through.
//! - Low-level mouse hook (`WH_MOUSE_LL`).
//! - Win32 Raw Input (`WM_INPUT`) mouse device registration and relative delta parsing.
//! - Layout-independent virtual key to scan code and extended flag mapping.
//! - Lightweight keyboard probe (`KeyboardProbe`) for key codes inspection.
//! - Application-control management hotkey exclusion filter.
//! - High-level `InputCaptureService` coordinating all capture mechanisms.

pub mod exclusion;
pub mod hook_capture;
pub mod keyboard_mapping;
pub mod keyboard_probe;
pub mod raw_input;
pub mod service;

pub use exclusion::{ApplicationControlFilter, CONTROL_VIRTUAL_KEYS};
pub use hook_capture::{
    InjectedInputCallback, KeyboardEventCallback, LowLevelHookCapture, MouseEventCallback,
    LLKHF_INJECTED, LLMHF_INJECTED,
};
pub use keyboard_mapping::{KeyScanInfo, KeyboardMapping};
pub use keyboard_probe::{KeyProbeCallback, KeyProbeSample, KeyboardProbe};
pub use raw_input::{
    read_raw_input_mouse, register_raw_mouse_device, ParsedRawMouse, RAWINPUT, RAWINPUTDEVICE,
    RAWINPUTHEADER, RAWMOUSE, RIDEV_INPUTSINK, RID_INPUT, RIM_TYPEMOUSE,
    RI_MOUSE_BUTTON_4_DOWN, RI_MOUSE_BUTTON_4_UP, RI_MOUSE_BUTTON_5_DOWN, RI_MOUSE_BUTTON_5_UP,
    RI_MOUSE_HORIZONTAL_WHEEL, RI_MOUSE_LEFT_BUTTON_DOWN, RI_MOUSE_LEFT_BUTTON_UP,
    RI_MOUSE_MIDDLE_BUTTON_DOWN, RI_MOUSE_MIDDLE_BUTTON_UP, RI_MOUSE_RIGHT_BUTTON_DOWN,
    RI_MOUSE_RIGHT_BUTTON_UP, RI_MOUSE_WHEEL,
};
pub use service::{
    CaptureLoopContext, HotkeyTriggerEventCallback, InputCaptureService, RawInputEventCallback,
};
