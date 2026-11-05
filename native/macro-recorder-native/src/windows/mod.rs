//! Windows services: window enumeration, focus targeting, integrity checks, and inspection.
//!
//! Exposes strongly-typed native primitives corresponding to `WindowCatalog`,
//! `WindowInspector`, `IntegrityLevelGuard`, `WindowTheming`, and `WindowsInputInjector`.

pub mod enumeration;
pub mod focus;
pub mod foreground;
pub mod inspector;
pub mod integrity;
pub mod process;
pub mod theming;

pub use enumeration::{
    class_name_of, find_handle, get_open_windows, ignores_posted_input, match_window,
    try_activate, OpenWindowInfo,
};
pub use focus::{find_editable_child, resolve_keyboard_target};
pub use foreground::{
    get_foreground_window, get_foreground_window_info, is_foreground_window, matches_foreground,
    ForegroundWindowSnapshot,
};
pub use inspector::{
    capture_window_inspection, process_under_cursor, WindowInspectionSnapshot,
};
pub use integrity::{
    check_window_injection_integrity, is_current_process_elevated, read_process_integrity_level,
    IntegrityCheckResult, SECURITY_MANDATORY_HIGH_RID, SECURITY_MANDATORY_LOW_RID,
    SECURITY_MANDATORY_MEDIUM_RID, SECURITY_MANDATORY_SYSTEM_RID, SECURITY_MANDATORY_UNTRUSTED_RID,
};
pub use process::{get_process_image_path, get_process_name, is_process_alive, AutoHandle};
pub use theming::{apply_window_theme, to_colorref, WindowThemeOptions};
