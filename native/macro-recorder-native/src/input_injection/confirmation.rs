//! Low-level hook confirmation tracking for SendInput injection.
//!
//! Generates unique diagnostics markers embedded in `dwExtraInfo` and coordinates
//! asynchronous observation by WH_KEYBOARD_LL / WH_MOUSE_LL hooks to measure true OS roundtrip delay.

use std::collections::HashMap;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::mpsc::{channel, Receiver, Sender};
use std::sync::Mutex;
use std::time::Duration;

use crate::timing::clock::{microseconds_to_ticks, ticks_to_microseconds};

/// Base diagnostics marker prefix (ASCII 'MR\0\0').
pub const INJECTION_MARKER_BASE: usize = 0x4D520000;

/// Global monotonic sequence generator for SendInput extra info markers.
static SEQUENCE: AtomicUsize = AtomicUsize::new(INJECTION_MARKER_BASE);

/// Generates the next unique diagnostics marker for an injected event.
#[inline]
pub fn next_marker() -> usize {
    SEQUENCE.fetch_add(1, Ordering::Relaxed)
}

/// Thread-safe tracker coordinating pending hook confirmations between injector and hook callbacks.
pub struct ConfirmationTracker {
    pending: Mutex<HashMap<usize, Sender<i64>>>,
}

impl Default for ConfirmationTracker {
    fn default() -> Self {
        Self::new()
    }
}

impl ConfirmationTracker {
    /// Creates a new confirmation tracker.
    pub fn new() -> Self {
        Self {
            pending: Mutex::new(HashMap::new()),
        }
    }

    /// Registers a pending confirmation for the specified marker.
    ///
    /// Returns a receiver that will yield the hook observation timestamp in ticks.
    pub fn register(&self, marker: usize) -> Receiver<i64> {
        let (tx, rx) = channel();
        let mut guard = self.pending.lock().unwrap();
        guard.insert(marker, tx);
        rx
    }

    /// Called by low-level hooks when an injected event carrying a marker is observed.
    ///
    /// Returns `true` if a pending confirmation was waiting for this marker.
    pub fn notify_observed(&self, marker: usize, timestamp_ticks: i64) -> bool {
        let sender = {
            let mut guard = self.pending.lock().unwrap();
            guard.remove(&marker)
        };

        if let Some(tx) = sender {
            let _ = tx.send(timestamp_ticks);
            true
        } else {
            false
        }
    }

    /// Same as `notify_observed`, for a hook timestamp in microseconds on the same clock.
    pub fn notify_observed_at_microseconds(&self, marker: usize, timestamp_us: i64) -> bool {
        self.notify_observed(marker, microseconds_to_ticks(timestamp_us))
    }

    /// Removes a pending marker without notifying (e.g. on cancellation or error).
    pub fn unregister(&self, marker: usize) {
        let mut guard = self.pending.lock().unwrap();
        guard.remove(&marker);
    }

    /// Reads confirmation and always retires the pending marker, including on timeout.
    ///
    /// Low-level hooks normally run before `SendInput` returns. The injection facade
    /// uses a zero timeout so missing diagnostics cannot delay the next action.
    pub fn wait_confirmation(
        &self,
        marker: usize,
        rx: Receiver<i64>,
        clock_start_timestamp: i64,
        timeout: Duration,
    ) -> Option<i64> {
        let observed = if timeout.is_zero() {
            rx.try_recv().ok()
        } else {
            rx.recv_timeout(timeout).ok()
        };
        self.unregister(marker);
        observed.map(|hook_ticks| {
            ticks_to_microseconds(hook_ticks.saturating_sub(clock_start_timestamp))
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::timing::clock::{get_microseconds, get_timestamp};

    #[test]
    fn hook_timestamp_in_microseconds_gives_a_small_positive_delay() {
        let tracker = ConfirmationTracker::new();
        let marker = next_marker();
        let rx = tracker.register(marker);
        let clock_start = get_timestamp();

        assert!(tracker.notify_observed_at_microseconds(marker, get_microseconds()));

        let confirmed_us = tracker
            .wait_confirmation(marker, rx, clock_start, Duration::ZERO)
            .expect("confirmation");
        assert!((0..1_000_000).contains(&confirmed_us), "got {confirmed_us}");
    }

    #[test]
    fn test_marker_generation_is_monotonic() {
        let m1 = next_marker();
        let m2 = next_marker();
        assert!(m2 > m1);
        assert!(m1 >= INJECTION_MARKER_BASE);
    }

    #[test]
    fn test_confirmation_roundtrip_success() {
        let tracker = ConfirmationTracker::new();
        let marker = next_marker();
        let rx = tracker.register(marker);

        let now = get_timestamp();
        let observed = tracker.notify_observed(marker, now + 1000);
        assert!(observed);

        let confirmed_us = tracker.wait_confirmation(marker, rx, now, Duration::ZERO);
        assert!(confirmed_us.is_some());
    }

    #[test]
    fn test_confirmation_timeout_returns_none() {
        let tracker = ConfirmationTracker::new();
        let marker = next_marker();
        let rx = tracker.register(marker);

        let now = get_timestamp();
        // Do not notify
        let confirmed_us = tracker.wait_confirmation(marker, rx, now, Duration::ZERO);
        assert!(confirmed_us.is_none());
    }

    #[test]
    fn test_missing_confirmation_removes_its_pending_marker() {
        let tracker = ConfirmationTracker::new();
        let marker = next_marker();
        let rx = tracker.register(marker);
        assert!(tracker
            .wait_confirmation(marker, rx, get_timestamp(), Duration::ZERO)
            .is_none());
        assert!(!tracker.notify_observed(marker, get_timestamp()));
    }

    #[test]
    fn test_unobserved_burst_does_not_accumulate_pending_markers() {
        let tracker = ConfirmationTracker::new();
        for _ in 0..10_000 {
            let marker = next_marker();
            let rx = tracker.register(marker);
            let _ = tracker.wait_confirmation(marker, rx, get_timestamp(), Duration::ZERO);
        }
        assert!(tracker.pending.lock().unwrap().is_empty());
    }
}
