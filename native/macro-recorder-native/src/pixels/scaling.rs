//! Display coordinate scaling primitives and DPI transformations.
//!
//! Covers:
//! - Rescales pixel coordinates between arbitrary source and target DPI values
//! - Reproduces golden import rescaling fixtures (e.g. 96 DPI -> 144 DPI maps (100, 200) to (150, 300))
//! - Clamps coordinates to monitor or desktop boundaries

use crate::pixels::monitor::ScreenRect;

/// Rescales an individual scalar coordinate or dimension from `source_dpi` to `target_dpi`.
///
/// Uses standard midpoint rounding `Math.Round(val * target / source)`.
/// If source or target DPI is 0, or if both are equal, returns `val` untouched.
#[inline]
pub fn scale_coordinate(val: i32, source_dpi: u32, target_dpi: u32) -> i32 {
    if source_dpi == 0 || target_dpi == 0 || source_dpi == target_dpi {
        return val;
    }

    let factor = (target_dpi as f64) / (source_dpi as f64);
    (val as f64 * factor).round() as i32
}

/// Rescales a screen point `(x, y)` from `source_dpi` to `target_dpi`.
#[inline]
pub fn scale_point(x: i32, y: i32, source_dpi: u32, target_dpi: u32) -> (i32, i32) {
    (
        scale_coordinate(x, source_dpi, target_dpi),
        scale_coordinate(y, source_dpi, target_dpi),
    )
}

/// Rescales a bounding rectangle `(left, top, width, height)` from `source_dpi` to `target_dpi`.
#[inline]
pub fn scale_rect(
    left: i32,
    top: i32,
    width: i32,
    height: i32,
    source_dpi: u32,
    target_dpi: u32,
) -> (i32, i32, i32, i32) {
    (
        scale_coordinate(left, source_dpi, target_dpi),
        scale_coordinate(top, source_dpi, target_dpi),
        scale_coordinate(width, source_dpi, target_dpi),
        scale_coordinate(height, source_dpi, target_dpi),
    )
}

/// Batch rescales a sequence of points `(x, y)` from `source_dpi` to `target_dpi`.
pub fn rescale_points_for_dpi(
    points: &[(i32, i32)],
    source_dpi: u32,
    target_dpi: u32,
) -> Vec<(i32, i32)> {
    if source_dpi == 0 || target_dpi == 0 || source_dpi == target_dpi {
        return points.to_vec();
    }

    points
        .iter()
        .map(|&(x, y)| scale_point(x, y, source_dpi, target_dpi))
        .collect()
}

/// Clamps coordinates `(x, y)` to stay within the bounds of a given `ScreenRect`.
pub fn clamp_to_bounds(x: i32, y: i32, bounds: &ScreenRect) -> (i32, i32) {
    let clamped_x = x.clamp(bounds.left, (bounds.right - 1).max(bounds.left));
    let clamped_y = y.clamp(bounds.top, (bounds.bottom - 1).max(bounds.top));
    (clamped_x, clamped_y)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_spec_dpi_golden_fixture_96_to_144() {
        // Spec requirement:
        // "Package exported at 96 DPI imported at 144 DPI rescales (100, 200) to (150, 300)."
        let (scaled_x, scaled_y) = scale_point(100, 200, 96, 144);
        assert_eq!(scaled_x, 150);
        assert_eq!(scaled_y, 300);
    }

    #[test]
    fn test_identity_scaling_when_dpi_equal() {
        let (x, y) = scale_point(123, 456, 96, 96);
        assert_eq!(x, 123);
        assert_eq!(y, 456);

        let (x, y) = scale_point(123, 456, 144, 144);
        assert_eq!(x, 123);
        assert_eq!(y, 456);
    }

    #[test]
    fn test_scaling_when_dpi_zero_is_noop() {
        assert_eq!(scale_point(100, 200, 0, 144), (100, 200));
        assert_eq!(scale_point(100, 200, 96, 0), (100, 200));
        assert_eq!(scale_coordinate(50, 0, 0), 50);
    }

    #[test]
    fn test_scale_rect() {
        let (l, t, w, h) = scale_rect(100, 200, 400, 600, 96, 144);
        assert_eq!(l, 150);
        assert_eq!(t, 300);
        assert_eq!(w, 600);
        assert_eq!(h, 900);
    }

    #[test]
    fn test_clamp_to_bounds() {
        let bounds = ScreenRect::new(0, 0, 1920, 1080);
        assert_eq!(clamp_to_bounds(500, 500, &bounds), (500, 500));
        assert_eq!(clamp_to_bounds(-50, 2000, &bounds), (0, 1079));
        assert_eq!(clamp_to_bounds(2500, -100, &bounds), (1919, 0));
    }
}
