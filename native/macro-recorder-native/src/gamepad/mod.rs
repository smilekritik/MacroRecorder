//! Gamepad capture, normalization, tester reading, virtual emulation, and driver integration.
//!
//! Covers:
//! - `GamepadBits.cs`: Bit masks for standard XInput and ViGEm buttons.
//! - `GamepadCaptureService.cs`: High-rate polling (125 Hz), edge diffing, deadzone quantization, and duplicate filtering.
//! - `GamepadReader.cs`: Unified snapshot reader for Xbox (XInput) and DS4 (WGI) controllers for the tester window.
//! - `Ds4Mapping.cs`: Normalization of DualShock 4 axes, button labels, and hat positions from Windows.Gaming.Input.
//! - `XInputNative.cs`: Dynamic loading and polling of XInput devices (slots 0..3).
//! - `ViGEmClientNative.cs`, `VirtualXboxController.cs`, `VirtualDualShock4Controller.cs`: Virtual gamepad output on ViGEmBus.
//! - `SharedVirtualGamepad.cs`: Process-wide persistent virtual controller with neutral reset on stop/disconnect.
//! - `HidHideService.cs`: Physical HID game controller concealment during playback with strict exclusion of keyboards and mice.

pub mod capture;
pub mod ds4_mapping;
pub mod hidhide;
pub mod reader;
pub mod shared_gamepad;
pub mod types;
pub mod vigem;
pub mod virtual_controller;
pub mod wgi;
pub mod xinput;

pub use capture::{GamepadCaptureService, GamepadEventCallback};
pub use ds4_mapping::{
    apply_stick_deadzone, apply_trigger_threshold, convert_wgi_axis, ds4_hat_buttons,
    map_ds4_button_label, should_emit_axis, DS4_AXIS_MAP, STICK_DEADZONE, STICK_STEP,
    TRIGGER_STEP, TRIGGER_THRESHOLD,
};
pub use hidhide::{
    enumerate_game_controller_instance_ids, is_eligible_game_controller, multi_sz_to_strings,
    strings_to_multi_sz, HidHideService, HidpCaps,
};
pub use reader::GamepadReader;
pub use shared_gamepad::SharedVirtualGamepad;
pub use types::{
    GamepadAxis, GamepadBits, GamepadButton, GamepadEvent, GamepadOutputType, GamepadPadReading,
    GamepadSnapshot,
};
pub use vigem::{
    get_vigem_api, is_vigem_driver_available, vigem_driver_unavailable_error, vigem_success,
    Ds4Report, ViGEmApi, XusbReport,
};
pub use virtual_controller::{
    VirtualDualShock4Controller, VirtualGamepadDevice, VirtualXboxController,
};
pub use wgi::{any_wgi_connected, enumerate_wgi_controllers, WgiRawController};
pub use xinput::{
    any_xinput_connected, first_connected_xinput, get_xinput_state, is_xinput_available,
    read_xinput_snapshot, XInputGamepad, XInputState,
};
