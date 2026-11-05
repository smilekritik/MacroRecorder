//! Monotonic microsecond clocks for Macro Recorder native runtime.
//!
//! Provides high-precision time sampling based on Win32 `QueryPerformanceCounter`
//! and `QueryPerformanceFrequency`, matching the timing model of the .NET `Stopwatch`
//! class and guaranteeing monotonic microsecond progression without timer drift.

use std::sync::atomic::{AtomicI64, Ordering};
use std::sync::OnceLock;
use windows::Win32::Foundation::BOOL;

#[link(name = "kernel32")]
extern "system" {
    fn QueryPerformanceCounter(lpPerformanceCount: *mut i64) -> BOOL;
    fn QueryPerformanceFrequency(lpFrequency: *mut i64) -> BOOL;
}

static CACHED_FREQUENCY: OnceLock<i64> = OnceLock::new();
static LAST_TIMESTAMP: AtomicI64 = AtomicI64::new(0);

/// Returns the hardware high-resolution timer frequency in counts per second (Hz).
///
/// This value is fixed at system boot and remains constant across all processors.
#[inline]
pub fn frequency() -> i64 {
    *CACHED_FREQUENCY.get_or_init(|| {
        let mut freq = 0i64;
        let success = unsafe { QueryPerformanceFrequency(&mut freq) };
        if success.as_bool() && freq > 0 {
            freq
        } else {
            // Standard Windows 10MHz QPC frequency fallback
            10_000_000
        }
    })
}

/// Queries the current raw monotonic timestamp from `QueryPerformanceCounter`.
///
/// Guaranteed to be strictly monotonic (never steps backward).
#[inline]
pub fn get_timestamp() -> i64 {
    let mut count = 0i64;
    unsafe {
        let _ = QueryPerformanceCounter(&mut count);
    }
    // Ensure monotonicity across CPU cores
    LAST_TIMESTAMP.fetch_max(count, Ordering::Relaxed).max(count)
}

/// Converts raw QPC tick counts to microseconds.
#[inline]
pub fn ticks_to_microseconds(ticks: i64) -> i64 {
    let freq = frequency();
    if freq == 0 {
        return 0;
    }
    ((ticks as i128 * 1_000_000) / freq as i128) as i64
}

/// Converts microseconds to raw QPC tick counts.
#[inline]
pub fn microseconds_to_ticks(microseconds: i64) -> i64 {
    let freq = frequency();
    ((microseconds as i128 * freq as i128) / 1_000_000) as i64
}

/// Returns the current monotonic time in microseconds since system boot.
#[inline]
pub fn get_microseconds() -> i64 {
    ticks_to_microseconds(get_timestamp())
}

/// Calculates elapsed microseconds since `start_ticks`.
#[inline]
pub fn elapsed_microseconds(start_ticks: i64) -> i64 {
    let current = get_timestamp();
    ticks_to_microseconds(current.saturating_sub(start_ticks))
}

/// Calculates elapsed milliseconds as a floating point number since `start_ticks`.
#[inline]
pub fn elapsed_milliseconds(start_ticks: i64) -> f64 {
    let current = get_timestamp();
    let delta = current.saturating_sub(start_ticks);
    (delta as f64 * 1000.0) / frequency() as f64
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_frequency_positive() {
        let freq = frequency();
        assert!(freq > 0, "Frequency must be positive");
    }

    #[test]
    fn test_timestamp_monotonic() {
        let t1 = get_timestamp();
        let t2 = get_timestamp();
        assert!(t2 >= t1, "Timestamps must be monotonic: t2 >= t1");
    }

    #[test]
    fn test_ticks_microseconds_roundtrip() {
        let us_in = 123_456i64;
        let ticks = microseconds_to_ticks(us_in);
        let us_out = ticks_to_microseconds(ticks);
        // Roundtrip tolerance within 1 microsecond due to integer division
        assert!((us_in - us_out).abs() <= 1);
    }

    #[test]
    fn test_elapsed_calculations() {
        let start = get_timestamp();
        std::thread::sleep(std::time::Duration::from_millis(10));
        let elapsed_us = elapsed_microseconds(start);
        let elapsed_ms = elapsed_milliseconds(start);
        assert!(elapsed_us >= 5_000, "Elapsed us should be >= 5ms");
        assert!(elapsed_ms >= 5.0, "Elapsed ms should be >= 5ms");
    }
}
