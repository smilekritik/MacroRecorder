//! Pixel sampling, display DPI awareness, multi-monitor geometry, and coordinate scaling.
//!
//! and import DPI coordinate transformation rules.

pub mod capture;
pub mod dpi;
pub mod monitor;
pub mod scaling;

pub use capture::{
    capture_pixel_at, capture_pixel_at_cursor, colors_match, get_pixel_color_rgb,
    ScreenPixelSample,
};
pub use dpi::{
    get_dpi_for_point, get_dpi_for_window, get_effective_system_dpi, DEFAULT_SYSTEM_DPI,
};
pub use monitor::{
    get_all_monitors, get_primary_monitor_bounds, get_virtual_screen_bounds, MonitorInfo,
    ScreenRect,
};
pub use scaling::{
    clamp_to_bounds, rescale_points_for_dpi, scale_coordinate, scale_point, scale_rect,
};
