//! Safe input injection subsystem for Macro Recorder.
//!
//! Implements:
//! - SendInput keyboard, mouse, wheel, and text events.
//! - UTF-16 code-unit text expansion with surrogate pairs and newline handling.
//! - Scan-code policy for layout-independent keystrokes.
//! - Hook confirmation tracking and timing diagnostics.
//! - HWND-targeted background message delivery (never steals focus).
//! - Focused child resolution via ControlSend thread-attaching technique.
//! - Virtual client cursor for target window bounds.
//! - UIPI elevation and Chromium/UWP limitation detection.
//! - Universal held-input release on every exit path.

pub mod confirmation;
pub mod facade;
pub mod focused_child;
pub mod global_injector;
pub mod limitations;
pub mod receipt;
pub mod scan_code;
pub mod state_tracker;
pub mod targeted_injector;
pub mod text_expansion;
pub mod virtual_cursor;

pub use confirmation::{next_marker, ConfirmationTracker, INJECTION_MARKER_BASE};
pub use facade::WindowsInputInjector;
pub use focused_child::{find_editable_child, resolve_keyboard_target};
pub use global_injector::{
    build_keyboard_input, build_mouse_button_input, build_mouse_move_input,
    build_mouse_wheel_input, build_text_inputs, dispatch_inputs,
};
pub use limitations::{
    get_window_class_name, ignores_posted_background_input, read_process_integrity,
    validate_targeted_window,
};
pub use receipt::DispatchReceipt;
pub use scan_code::{
    compute_send_input_keyboard_params, make_keyboard_lparam, resolve_scan_code,
};
pub use state_tracker::{InputStateTracker, MouseButton, OwnershipChange};
pub use targeted_injector::{
    make_lparam, make_wparam, post_targeted_key, post_targeted_mouse_button,
    post_targeted_mouse_move, post_targeted_text, post_targeted_wheel,
    release_window_held_inputs,
};
pub use text_expansion::{expand_text_to_key_units, TextKeyUnit, VK_RETURN};
pub use virtual_cursor::VirtualCursorManager;
