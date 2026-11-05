//! Multi-monitor topology, desktop bounds, and coordinate boundaries.
//!
//! Provides data structures and queries for multi-monitor desktop spaces:
//! - Primary monitor bounds and virtual desktop spanning all displays
//! - Individual monitor boundaries, usable work areas, primary status, and DPI scales

use napi_derive::napi;
use windows::Win32::Foundation::{BOOL, LPARAM, RECT, TRUE};
use windows::Win32::Graphics::Gdi::{
    EnumDisplayMonitors, GetMonitorInfoW, HDC, HMONITOR, MONITORINFOEXW,
};
use windows::Win32::UI::WindowsAndMessaging::{
    GetSystemMetrics, SM_CXSCREEN, SM_CXVIRTUALSCREEN, SM_CYSCREEN, SM_CYVIRTUALSCREEN,
    SM_XVIRTUALSCREEN, SM_YVIRTUALSCREEN,
};

use crate::error::NativeResult;
use crate::pixels::dpi::get_dpi_for_point;

/// Rectangle describing a screen, monitor, or work-area bounding box.
#[napi(object)]
#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct ScreenRect {
    pub left: i32,
    pub top: i32,
    pub right: i32,
    pub bottom: i32,
    pub width: i32,
    pub height: i32,
}

impl ScreenRect {
    /// Constructs a `ScreenRect` from Win32 `RECT`.
    pub fn from_rect(r: &RECT) -> Self {
        Self {
            left: r.left,
            top: r.top,
            right: r.right,
            bottom: r.bottom,
            width: (r.right - r.left).max(0),
            height: (r.bottom - r.top).max(0),
        }
    }

    /// Constructs a `ScreenRect` from origin and dimensions.
    pub fn new(left: i32, top: i32, width: i32, height: i32) -> Self {
        Self {
            left,
            top,
            right: left + width,
            bottom: top + height,
            width,
            height,
        }
    }

    /// Returns `true` if the point `(x, y)` lies within this rectangle.
    pub fn contains(&self, x: i32, y: i32) -> bool {
        x >= self.left && x < self.right && y >= self.top && y < self.bottom
    }
}

/// Metadata describing a physical or virtual display monitor.
#[napi(object)]
#[derive(Debug, Clone, PartialEq)]
pub struct MonitorInfo {
    pub handle: i64,
    pub bounds: ScreenRect,
    pub work_area: ScreenRect,
    pub is_primary: bool,
    pub dpi: u32,
    pub scale_factor: f64,
    pub device_name: String,
}

/// Enumerates all active display monitors in the system.
pub fn get_all_monitors() -> NativeResult<Vec<MonitorInfo>> {
    let mut monitors: Vec<MonitorInfo> = Vec::new();

    unsafe extern "system" fn enum_proc(
        hmonitor: HMONITOR,
        _hdc: HDC,
        _rect: *mut RECT,
        lparam: LPARAM,
    ) -> BOOL {
        let list = &mut *(lparam.0 as *mut Vec<MonitorInfo>);

        let mut info = MONITORINFOEXW::default();
        info.monitorInfo.cbSize = std::mem::size_of::<MONITORINFOEXW>() as u32;

        let ok = GetMonitorInfoW(hmonitor, &mut info as *mut _ as *mut _);
        if ok.as_bool() {
            let bounds = ScreenRect::from_rect(&info.monitorInfo.rcMonitor);
            let work_area = ScreenRect::from_rect(&info.monitorInfo.rcWork);

            // MONITORINFOF_PRIMARY = 1
            let is_primary = (info.monitorInfo.dwFlags & 1) != 0;

            // Sample DPI at center of monitor bounds
            let center_x = bounds.left + bounds.width / 2;
            let center_y = bounds.top + bounds.height / 2;
            let dpi = get_dpi_for_point(center_x, center_y);
            let scale_factor = (dpi as f64) / 96.0;

            let device_name = {
                let null_pos = info
                    .szDevice
                    .iter()
                    .position(|&c| c == 0)
                    .unwrap_or(info.szDevice.len());
                String::from_utf16_lossy(&info.szDevice[..null_pos])
            };

            list.push(MonitorInfo {
                handle: hmonitor.0 as i64,
                bounds,
                work_area,
                is_primary,
                dpi,
                scale_factor,
                device_name,
            });
        }

        TRUE
    }

    unsafe {
        let _ = EnumDisplayMonitors(
            HDC::default(),
            None,
            Some(enum_proc),
            LPARAM(&mut monitors as *mut Vec<MonitorInfo> as isize),
        );
    }

    Ok(monitors)
}

/// Returns the virtual screen bounds spanning all connected display monitors.
pub fn get_virtual_screen_bounds() -> ScreenRect {
    let left = unsafe { GetSystemMetrics(SM_XVIRTUALSCREEN) };
    let top = unsafe { GetSystemMetrics(SM_YVIRTUALSCREEN) };
    let width = unsafe { GetSystemMetrics(SM_CXVIRTUALSCREEN) };
    let height = unsafe { GetSystemMetrics(SM_CYVIRTUALSCREEN) };

    ScreenRect::new(left, top, width, height)
}

/// Returns the screen bounds of the primary monitor.
pub fn get_primary_monitor_bounds() -> ScreenRect {
    let width = unsafe { GetSystemMetrics(SM_CXSCREEN) };
    let height = unsafe { GetSystemMetrics(SM_CYSCREEN) };

    ScreenRect::new(0, 0, width, height)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_screen_rect_contains() {
        let rect = ScreenRect::new(100, 100, 200, 200);
        assert!(rect.contains(150, 150));
        assert!(rect.contains(100, 100)); // Inclusive top-left
        assert!(!rect.contains(300, 300)); // Exclusive bottom-right
        assert!(!rect.contains(50, 50));
    }

    #[test]
    fn test_primary_monitor_bounds_non_zero() {
        let primary = get_primary_monitor_bounds();
        assert!(primary.width > 0);
        assert!(primary.height > 0);
        assert_eq!(primary.left, 0);
        assert_eq!(primary.top, 0);
    }

    #[test]
    fn test_virtual_screen_bounds_contains_primary() {
        let primary = get_primary_monitor_bounds();
        let virtual_screen = get_virtual_screen_bounds();
        assert!(virtual_screen.width >= primary.width);
        assert!(virtual_screen.height >= primary.height);
    }

    #[test]
    fn test_get_all_monitors_at_least_one() {
        let monitors = get_all_monitors().expect("get_all_monitors must succeed");
        assert!(!monitors.is_empty(), "Must detect at least one monitor");
        let has_primary = monitors.iter().any(|m| m.is_primary);
        assert!(has_primary, "At least one monitor must be marked primary");
    }
}
