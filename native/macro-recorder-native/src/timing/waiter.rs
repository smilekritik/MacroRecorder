//! High-resolution precision waiter.
//!
//! Employs a hybrid strategy: a Win32 high-resolution waitable timer for coarse delays
//! (> 2 ms), followed by a CPU spin-wait with `spin_loop` for sub-millisecond precision,
//! preventing timer drift and landing on absolute deadlines within microseconds.

use std::ptr;
use std::time::Duration;
use windows::core::PCWSTR;
use windows::Win32::Foundation::{CloseHandle, BOOL, HANDLE, WAIT_OBJECT_0, WAIT_TIMEOUT};

use crate::error::{NativeError, NativeResult};
use crate::runtime::cancellation::CancellationToken;
use crate::timing::clock::{frequency, get_timestamp, microseconds_to_ticks};

const CREATE_WAITABLE_TIMER_HIGH_RESOLUTION: u32 = 0x00000002;
const TIMER_ALL_ACCESS: u32 = 0x001F0003;

#[link(name = "kernel32")]
extern "system" {
    fn CreateWaitableTimerExW(
        lpTimerAttributes: *const std::ffi::c_void,
        lpTimerName: PCWSTR,
        dwFlags: u32,
        dwDesiredAccess: u32,
    ) -> HANDLE;

    fn SetWaitableTimerEx(
        hTimer: HANDLE,
        lpDueTime: *const i64,
        lPeriod: i32,
        pfnCompletionRoutine: *const std::ffi::c_void,
        lpArgToCompletionRoutine: *const std::ffi::c_void,
        wakeContext: *const std::ffi::c_void,
        tolerableDelay: u32,
    ) -> BOOL;

    fn WaitForSingleObject(hHandle: HANDLE, dwMilliseconds: u32) -> u32;
}

/// RAII wrapper for a Win32 waitable timer handle.
struct WaitableTimerGuard {
    handle: HANDLE,
}

impl WaitableTimerGuard {
    fn new_high_resolution() -> Option<Self> {
        let handle = unsafe {
            CreateWaitableTimerExW(
                ptr::null(),
                PCWSTR::null(),
                CREATE_WAITABLE_TIMER_HIGH_RESOLUTION,
                TIMER_ALL_ACCESS,
            )
        };
        if handle.is_invalid() || handle.0.is_null() {
            None
        } else {
            Some(Self { handle })
        }
    }

    fn raw(&self) -> HANDLE {
        self.handle
    }
}

impl Drop for WaitableTimerGuard {
    fn drop(&mut self) {
        if !self.handle.is_invalid() && !self.handle.0.is_null() {
            unsafe {
                let _ = CloseHandle(self.handle);
            }
        }
    }
}

/// Precision waiter providing monotonic microsecond scheduling with zero cumulative delay.
pub struct PrecisionWaiter;

impl PrecisionWaiter {
    /// Synchronously waits until the absolute monotonic deadline specified by
    /// `start_timestamp + paused_ticks + target_microseconds`.
    ///
    pub fn until(
        start_timestamp: i64,
        target_microseconds: i64,
        paused_ticks: i64,
        token: &CancellationToken,
    ) -> NativeResult<()> {
        token.throw_if_cancelled()?;

        let freq = frequency();
        let target_ticks =
            start_timestamp + paused_ticks + microseconds_to_ticks(target_microseconds);

        let remaining_ticks = target_ticks - get_timestamp();
        let remaining_ms = (remaining_ticks as f64 * 1000.0) / freq as f64;

        // If more than 2 ms remaining, sleep/wait for (remaining_ms - 1)
        if remaining_ms > 2.0 {
            let wait_ms = (remaining_ms - 1.0).max(0.1);
            Self::wait_coarse(wait_ms, token)?;
        }

        // Spin-wait for remaining duration until absolute target ticks are reached
        while get_timestamp() < target_ticks {
            token.throw_if_cancelled()?;
            for _ in 0..64 {
                std::hint::spin_loop();
            }
        }

        token.throw_if_cancelled()?;
        Ok(())
    }

    /// Asynchronous variant of `until` suitable for offloaded async execution.
    pub async fn until_async(
        start_timestamp: i64,
        target_microseconds: i64,
        paused_ticks: i64,
        token: &CancellationToken,
    ) -> NativeResult<()> {
        let token_clone = token.clone();
        let (tx, rx) = std::sync::mpsc::channel();
        std::thread::spawn(move || {
            let res = Self::until(start_timestamp, target_microseconds, paused_ticks, &token_clone);
            let _ = tx.send(res);
        });

        match rx.recv() {
            Ok(res) => res,
            Err(_) => Err(NativeError::internal(
                "PrecisionWaiter worker thread terminated unexpectedly",
            )),
        }
    }

    /// Waits for coarse duration using Win32 high-resolution waitable timer or thread sleep fallback.
    fn wait_coarse(milliseconds: f64, token: &CancellationToken) -> NativeResult<()> {
        if let Some(timer) = WaitableTimerGuard::new_high_resolution() {
            // Negative due time in 100-nanosecond units indicates relative delay
            let due_time = -((milliseconds * 10_000.0) as i64);
            let set_ok = unsafe {
                SetWaitableTimerEx(
                    timer.raw(),
                    &due_time,
                    0,
                    ptr::null(),
                    ptr::null(),
                    ptr::null(),
                    0,
                )
            };

            if set_ok.as_bool() {
                // Wait on timer in slices of at most 15 ms to remain responsive to cancellation
                let mut remaining_ms = milliseconds.ceil() as u32;
                while remaining_ms > 0 {
                    token.throw_if_cancelled()?;
                    let slice = remaining_ms.min(15);
                    let res = unsafe { WaitForSingleObject(timer.raw(), slice) };
                    if res == WAIT_OBJECT_0.0 {
                        // Timer signalled
                        return Ok(());
                    } else if res == WAIT_TIMEOUT.0 {
                        remaining_ms = remaining_ms.saturating_sub(slice);
                    } else {
                        // Unexpected wait error, break to fallback
                        break;
                    }
                }
                return Ok(());
            }
        }

        // Fallback to thread sleep if high-res timer is unavailable
        let total_duration = Duration::from_millis(milliseconds.max(1.0) as u64);
        let slice = Duration::from_millis(15);
        let mut elapsed = Duration::ZERO;
        while elapsed < total_duration {
            token.throw_if_cancelled()?;
            let step = (total_duration - elapsed).min(slice);
            std::thread::sleep(step);
            elapsed += step;
        }

        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::runtime::cancellation::CancellationHandle;
    use crate::timing::clock::elapsed_milliseconds;

    #[test]
    fn test_precision_waiter_reaches_absolute_deadline() {
        // Target: 20,000 microseconds (20 ms). Expected in range: [18ms, 100ms]
        let token = CancellationToken::none();
        let start = get_timestamp();
        let target_us = 20_000i64;

        let result = PrecisionWaiter::until(start, target_us, 0, &token);
        assert!(result.is_ok(), "Wait should succeed");

        let elapsed_ms = elapsed_milliseconds(start);
        assert!(
            elapsed_ms >= 18.0 && elapsed_ms <= 100.0,
            "Elapsed ms {elapsed_ms} was not in range [18.0, 100.0]"
        );
    }

    #[test]
    fn test_precision_waiter_immediate_for_past_deadline() {
        let token = CancellationToken::none();
        let start = get_timestamp() - 100_000; // In the past
        let target_us = 10_000i64;

        let result = PrecisionWaiter::until(start, target_us, 0, &token);
        assert!(result.is_ok());
    }

    #[test]
    fn test_precision_waiter_cancellation_before_start() {
        let handle = CancellationHandle::new();
        let token = handle.token();
        handle.cancel();

        let start = get_timestamp();
        let result = PrecisionWaiter::until(start, 50_000, 0, &token);
        assert!(result.is_err());
        assert_eq!(result.unwrap_err().code, crate::error::IpcErrorCode::Cancelled);
    }

    #[test]
    fn test_precision_waiter_cancellation_during_coarse_wait() {
        let handle = CancellationHandle::new();
        let token = handle.token();

        // Spawn thread that cancels after 15 ms
        let handle_clone = handle.clone();
        std::thread::spawn(move || {
            std::thread::sleep(Duration::from_millis(15));
            handle_clone.cancel();
        });

        let start = get_timestamp();
        let result = PrecisionWaiter::until(start, 500_000, 0, &token); // 500 ms target
        assert!(result.is_err());
        assert_eq!(result.unwrap_err().code, crate::error::IpcErrorCode::Cancelled);
    }
}
