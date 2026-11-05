//! Pixel color sampling at coordinates or cursor.
//!
//! Covers:
//! - Samples RGB pixels from desktop device context
//! - Converts Win32 COLORREF (0x00BBGGRR) to RGB (0x00RRGGBB)
//! - Guarantees RAII release of device contexts with bounded overhead

use napi_derive::napi;
use windows::Win32::Foundation::{HWND, POINT};
use windows::Win32::Graphics::Gdi::{GetDC, GetPixel, ReleaseDC, CLR_INVALID, HDC};
use windows::Win32::UI::WindowsAndMessaging::GetCursorPos;

use crate::error::{NativeError, NativeResult};

/// RAII guard releasing desktop HDC automatically upon drop.
struct DcGuard {
    hwnd: HWND,
    hdc: HDC,
}

impl Drop for DcGuard {
    fn drop(&mut self) {
        if !self.hdc.is_invalid() && !self.hdc.0.is_null() {
            unsafe {
                let _ = ReleaseDC(self.hwnd, self.hdc);
            }
        }
    }
}

/// A captured pixel sample with coordinates and RGB color representations.
#[napi(object)]
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ScreenPixelSample {
    pub x: i32,
    pub y: i32,
    pub rgb: i32,
    pub hex: String,
    pub r: u8,
    pub g: u8,
    pub b: u8,
}

impl ScreenPixelSample {
    /// Constructs a sample from coordinates and RGB integer.
    pub fn new(x: i32, y: i32, rgb: i32) -> Self {
        let (r, g, b) = if rgb >= 0 {
            (
                ((rgb >> 16) & 0xFF) as u8,
                ((rgb >> 8) & 0xFF) as u8,
                (rgb & 0xFF) as u8,
            )
        } else {
            (0, 0, 0)
        };

        let hex = if rgb >= 0 {
            format!("#{:06X}", rgb & 0xFFFFFF)
        } else {
            "—".to_string()
        };

        Self {
            x,
            y,
            rgb,
            hex,
            r,
            g,
            b,
        }
    }
}

/// Samples the RGB color of the pixel at desktop coordinates `(x, y)`.
///
/// Converts Win32 COLORREF (0x00bbggrr) to standard RGB format (0x00rrggbb).
pub fn get_pixel_color_rgb(x: i32, y: i32) -> NativeResult<i32> {
    let dc = unsafe { GetDC(HWND(std::ptr::null_mut())) };
    if dc.is_invalid() || dc.0.is_null() {
        return Err(NativeError::from_last_win32("GetDC"));
    }

    let _guard = DcGuard {
        hwnd: HWND(std::ptr::null_mut()),
        hdc: dc,
    };

    let color_ref = unsafe { GetPixel(dc, x, y) };
    if color_ref.0 == CLR_INVALID {
        return Err(NativeError::from_win32("GetPixel returned CLR_INVALID", 0));
    }

    let r = (color_ref.0 & 0xFF) as i32;
    let g = ((color_ref.0 >> 8) & 0xFF) as i32;
    let b = ((color_ref.0 >> 16) & 0xFF) as i32;
    Ok((r << 16) | (g << 8) | b)
}

/// Captures the pixel sample at specified screen coordinates `(x, y)`.
pub fn capture_pixel_at(x: i32, y: i32) -> NativeResult<ScreenPixelSample> {
    let rgb = get_pixel_color_rgb(x, y)?;
    Ok(ScreenPixelSample::new(x, y, rgb))
}

/// Captures the pixel sample at current mouse cursor position.
pub fn capture_pixel_at_cursor() -> NativeResult<ScreenPixelSample> {
    let mut point = POINT { x: 0, y: 0 };
    if unsafe { GetCursorPos(&mut point) }.is_err() {
        return Err(NativeError::from_last_win32("GetCursorPos"));
    }

    capture_pixel_at(point.x, point.y)
}

/// Compares two RGB colors, optionally with per-channel color tolerance.
pub fn colors_match(rgb1: i32, rgb2: i32, tolerance: Option<u8>) -> bool {
    if rgb1 < 0 || rgb2 < 0 {
        return false;
    }

    match tolerance {
        None | Some(0) => rgb1 == rgb2,
        Some(tol) => {
            let tol_i = tol as i32;
            let r1 = (rgb1 >> 16) & 0xFF;
            let g1 = (rgb1 >> 8) & 0xFF;
            let b1 = rgb1 & 0xFF;

            let r2 = (rgb2 >> 16) & 0xFF;
            let g2 = (rgb2 >> 8) & 0xFF;
            let b2 = rgb2 & 0xFF;

            (r1 - r2).abs() <= tol_i && (g1 - g2).abs() <= tol_i && (b1 - b2).abs() <= tol_i
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_screen_pixel_sample_formatting() {
        let sample = ScreenPixelSample::new(100, 200, 0xFF55AA);
        assert_eq!(sample.x, 100);
        assert_eq!(sample.y, 200);
        assert_eq!(sample.rgb, 0xFF55AA);
        assert_eq!(sample.r, 0xFF);
        assert_eq!(sample.g, 0x55);
        assert_eq!(sample.b, 0xAA);
        assert_eq!(sample.hex, "#FF55AA");
    }

    #[test]
    fn test_colors_match_exact() {
        assert!(colors_match(0x112233, 0x112233, None));
        assert!(colors_match(0x112233, 0x112233, Some(0)));
        assert!(!colors_match(0x112233, 0x112234, None));
        assert!(!colors_match(-1, -1, None));
    }

    #[test]
    fn test_colors_match_tolerance() {
        assert!(colors_match(0x102030, 0x122232, Some(2)));
        assert!(!colors_match(0x102030, 0x142030, Some(3)));
    }

    #[test]
    fn test_capture_at_cursor_smoke() {
        // In interactive desktop this reads the pixel under cursor
        if let Ok(sample) = capture_pixel_at_cursor() {
            assert!(sample.rgb >= 0);
            assert_eq!(sample.hex.len(), 7);
        }
    }
}
