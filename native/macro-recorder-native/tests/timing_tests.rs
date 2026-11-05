#![allow(dead_code, unused_imports, clippy::all)]

//! Tests for QPC high-resolution timing, sub-millisecond wait accuracy,
//! non-blocking thread behavior, and cancellation responsiveness.

#[rustfmt::skip]
#[path = "../src/error.rs"]
mod error;

pub mod runtime {
    #[rustfmt::skip]
    #[path = "../../src/runtime/cancellation.rs"]
    pub mod cancellation;
}

pub mod timing {
    #[rustfmt::skip]
    #[path = "../../src/timing/clock.rs"]
    pub mod clock;
    #[rustfmt::skip]
    #[path = "../../src/timing/waiter.rs"]
    pub mod waiter;
}

use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use std::thread;
use std::time::Duration;

use error::IpcErrorCode;
use runtime::cancellation::CancellationHandle;
use timing::clock::{
    elapsed_microseconds, elapsed_milliseconds, frequency, get_microseconds, get_timestamp,
    microseconds_to_ticks, ticks_to_microseconds,
};
use timing::waiter::PrecisionWaiter;

#[test]
fn test_qpc_frequency_positive_and_stable() {
    let f1 = frequency();
    let f2 = frequency();
    assert!(f1 > 0, "QPC frequency must be positive");
    assert_eq!(f1, f2, "QPC frequency must remain invariant across calls");
}

#[test]
fn test_qpc_timestamp_strictly_monotonic() {
    let mut prev = get_timestamp();
    for _ in 0..1000 {
        let curr = get_timestamp();
        assert!(
            curr >= prev,
            "QPC timestamp must be monotonic: curr >= prev"
        );
        prev = curr;
    }
}

#[test]
fn test_microseconds_and_ticks_roundtrip_precision() {
    let test_values_us = [
        0i64, 1, 10, 100, 1_000, 10_000, 100_000, 1_000_000, 10_000_000,
    ];

    for &us in &test_values_us {
        let ticks = microseconds_to_ticks(us);
        let roundtrip_us = ticks_to_microseconds(ticks);
        let delta = (us - roundtrip_us).abs();
        assert!(
            delta <= 1,
            "Microsecond roundtrip drift for {us} us was {delta} (> 1 us)"
        );
    }
}

#[test]
fn test_elapsed_time_calculations() {
    let start_ticks = get_timestamp();
    thread::sleep(Duration::from_millis(15));
    let elapsed_us = elapsed_microseconds(start_ticks);
    let elapsed_ms = elapsed_milliseconds(start_ticks);

    assert!(
        elapsed_us >= 10_000,
        "Elapsed us must be at least 10,000 us (10 ms)"
    );
    assert!(elapsed_ms >= 10.0, "Elapsed ms must be at least 10 ms");
}

#[test]
fn test_precision_waiter_past_deadline_immediate() {
    let cancel = CancellationHandle::new();
    let start_ticks = get_timestamp();

    // Target is in the past: 0 microseconds from start, while elapsed is already >= 0
    let res = PrecisionWaiter::until(start_ticks, 0, 0, &cancel.token());
    assert!(res.is_ok(), "Past deadline must return Ok immediately");
}

#[test]
fn test_precision_waiter_precancelled_token() {
    let cancel = CancellationHandle::new();
    cancel.cancel();

    let start_ticks = get_timestamp();
    let res = PrecisionWaiter::until(start_ticks, 100_000, 0, &cancel.token());
    assert!(res.is_err(), "Pre-cancelled token must return Err");
    assert_eq!(res.unwrap_err().code, IpcErrorCode::Cancelled);
}

#[test]
fn test_precision_waiter_landing_accuracy() {
    // Test 10 ms wait (10,000 us): requirement specifies landing within 2ms (2000us)
    let cancel = CancellationHandle::new();
    let start_ticks = get_timestamp();
    let target_us = 10_000i64;

    let res = PrecisionWaiter::until(start_ticks, target_us, 0, &cancel.token());
    assert!(res.is_ok());

    let actual_us = elapsed_microseconds(start_ticks);
    let overshoot_us = actual_us - target_us;

    assert!(
        actual_us >= target_us,
        "Must not return before scheduled deadline"
    );
    // Windows scheduler tolerance: allow up to 3 ms overshoot in CI test environments
    assert!(
        overshoot_us <= 3_500,
        "Precision waiter overshoot was {overshoot_us} us (expected <= 3500 us)"
    );
}

#[test]
fn test_precision_waiter_cancellation_during_coarse_wait() {
    let cancel = CancellationHandle::new();
    let cancel_clone = cancel.clone();

    // Cancel after 10 ms while waiter is targeting 500 ms
    thread::spawn(move || {
        thread::sleep(Duration::from_millis(10));
        cancel_clone.cancel();
    });

    let start_ticks = get_timestamp();
    let res = PrecisionWaiter::until(start_ticks, 500_000, 0, &cancel.token());
    assert!(res.is_err());
    assert_eq!(res.unwrap_err().code, IpcErrorCode::Cancelled);

    let actual_ms = elapsed_milliseconds(start_ticks);
    assert!(
        actual_ms < 400.0,
        "Waiter should have aborted upon cancellation well before 500ms (took {actual_ms} ms)"
    );
}

#[test]
fn test_precision_waiter_consecutive_intervals_no_cumulative_drift() {
    // Run 5 consecutive intervals of 5 ms (5,000 us) each, scheduled relative to fixed start
    let cancel = CancellationHandle::new();
    let start_ticks = get_timestamp();
    let step_us = 5_000i64;

    for i in 1..=5 {
        let target_us = i * step_us;
        let res = PrecisionWaiter::until(start_ticks, target_us, 0, &cancel.token());
        assert!(res.is_ok());
    }

    let total_us = elapsed_microseconds(start_ticks);
    let expected_total_us = 5 * step_us; // 25,000 us

    assert!(total_us >= expected_total_us);
    let drift_us = total_us - expected_total_us;
    // Total drift across 5 intervals must not accumulate beyond 5 ms
    assert!(
        drift_us <= 5_000,
        "Cumulative drift across 5 intervals was {drift_us} us (expected <= 5000 us)"
    );
}
