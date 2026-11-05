//! Per-session control block: cancellation, pause accounting, and interruptible precise waits.

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;

use windows::core::PCWSTR;
use windows::Win32::Foundation::{CloseHandle, HANDLE, WAIT_FAILED};
use windows::Win32::System::Threading::{
    CreateEventW, CreateWaitableTimerExW, SetEvent, SetWaitableTimerEx, WaitForMultipleObjects,
    WaitForSingleObject, CREATE_WAITABLE_TIMER_HIGH_RESOLUTION, INFINITE, TIMER_ALL_ACCESS,
};

use crate::runtime::cancellation::{CancellationHandle, CancellationToken};
use crate::timing::clock::{frequency, get_timestamp};

/// Below this the thread spins; above it, it sleeps until this margin before the deadline.
const SPIN_MARGIN_US: i64 = 1_500;

/// Signals that the session was cancelled and must unwind.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Cancelled;

#[derive(Default)]
struct PauseClock {
    total_ticks: i64,
    started_at: Option<i64>,
}

pub struct SessionControl {
    cancel: CancellationHandle,
    cancelled: AtomicBool,
    paused: AtomicBool,
    pause_clock: Mutex<PauseClock>,
    /// Auto-reset event that interrupts any wait after a flag changes.
    wake: HANDLE,
    timer: Option<HANDLE>,
}

// The handles are kernel objects that are safe to signal and wait on from any thread.
unsafe impl Send for SessionControl {}
unsafe impl Sync for SessionControl {}

impl Default for SessionControl {
    fn default() -> Self {
        Self::new()
    }
}

impl SessionControl {
    pub fn new() -> Self {
        let wake = unsafe { CreateEventW(None, false, false, PCWSTR::null()) }
            .expect("CreateEventW failed for a playback session");
        let timer = unsafe {
            CreateWaitableTimerExW(
                None,
                PCWSTR::null(),
                CREATE_WAITABLE_TIMER_HIGH_RESOLUTION,
                TIMER_ALL_ACCESS.0,
            )
        }
        .ok();
        Self {
            cancel: CancellationHandle::new(),
            cancelled: AtomicBool::new(false),
            paused: AtomicBool::new(false),
            pause_clock: Mutex::new(PauseClock::default()),
            wake,
            timer,
        }
    }

    pub fn token(&self) -> CancellationToken {
        self.cancel.token()
    }

    pub fn cancel(&self) {
        self.cancelled.store(true, Ordering::SeqCst);
        self.cancel.cancel();
        self.signal();
    }

    #[inline]
    pub fn is_cancelled(&self) -> bool {
        self.cancelled.load(Ordering::Relaxed)
    }

    #[inline]
    pub fn is_paused(&self) -> bool {
        self.paused.load(Ordering::Relaxed)
    }

    /// Returns `true` only when this call changed the state.
    pub fn pause(&self) -> bool {
        let mut clock = self.pause_clock.lock().unwrap();
        if clock.started_at.is_some() || self.is_cancelled() {
            return false;
        }
        clock.started_at = Some(get_timestamp());
        self.paused.store(true, Ordering::SeqCst);
        drop(clock);
        self.signal();
        true
    }

    /// Returns `true` only when this call changed the state.
    pub fn resume(&self) -> bool {
        let mut clock = self.pause_clock.lock().unwrap();
        let Some(started) = clock.started_at.take() else {
            return false;
        };
        clock.total_ticks += get_timestamp() - started;
        self.paused.store(false, Ordering::SeqCst);
        drop(clock);
        self.signal();
        true
    }

    /// Total paused time, including a pause that is still in progress.
    pub fn paused_ticks(&self) -> i64 {
        let clock = self.pause_clock.lock().unwrap();
        clock.total_ticks
            + clock
                .started_at
                .map_or(0, |started| get_timestamp() - started)
    }

    fn signal(&self) {
        unsafe {
            let _ = SetEvent(self.wake);
        }
    }

    #[inline]
    pub fn check(&self) -> Result<(), Cancelled> {
        if self.is_cancelled() {
            Err(Cancelled)
        } else {
            Ok(())
        }
    }

    /// Blocks without consuming CPU until the session is resumed or cancelled.
    pub fn wait_while_paused(&self) -> Result<(), Cancelled> {
        loop {
            self.check()?;
            if !self.is_paused() {
                return Ok(());
            }
            unsafe {
                WaitForSingleObject(self.wake, INFINITE);
            }
        }
    }

    /// Sleeps for `microseconds` unless the session is paused or cancelled first.
    pub fn sleep_interruptible(&self, microseconds: i64) -> Result<(), Cancelled> {
        let target = get_timestamp() + us_to_ticks(microseconds);
        loop {
            self.check()?;
            let remaining_us = ticks_to_us(target - get_timestamp());
            if remaining_us <= 0 || self.is_paused() {
                return Ok(());
            }
            self.block_for(remaining_us);
        }
    }

    /// Waits until the absolute `target` tick, returning as close to it as the OS allows.
    /// Returns early on a pause so the caller can recompute the deadline.
    pub fn wait_until(&self, target: i64) -> Result<(), Cancelled> {
        loop {
            self.check()?;
            if self.is_paused() {
                return Ok(());
            }
            let remaining = target - get_timestamp();
            if remaining <= 0 {
                return Ok(());
            }
            let remaining_us = ticks_to_us(remaining);
            if remaining_us > SPIN_MARGIN_US {
                self.block_for(remaining_us - SPIN_MARGIN_US);
                continue;
            }
            while get_timestamp() < target {
                if self.is_cancelled() || self.is_paused() {
                    break;
                }
                std::hint::spin_loop();
            }
        }
    }

    fn block_for(&self, microseconds: i64) {
        if let Some(timer) = self.timer {
            // A negative due time is relative, in 100-nanosecond units.
            let due = -(microseconds * 10);
            let armed = unsafe { SetWaitableTimerEx(timer, &due, 0, None, None, None, 0) };
            if armed.is_ok() {
                let handles = [timer, self.wake];
                let result = unsafe { WaitForMultipleObjects(&handles, false, INFINITE) };
                if result != WAIT_FAILED {
                    return;
                }
            }
        }
        let milliseconds = (microseconds / 1000).clamp(1, i64::from(u32::MAX - 1)) as u32;
        unsafe {
            WaitForSingleObject(self.wake, milliseconds);
        }
    }
}

impl Drop for SessionControl {
    fn drop(&mut self) {
        unsafe {
            let _ = CloseHandle(self.wake);
            if let Some(timer) = self.timer {
                let _ = CloseHandle(timer);
            }
        }
    }
}

#[inline]
pub fn us_to_ticks(microseconds: i64) -> i64 {
    ((i128::from(microseconds) * i128::from(frequency())) / 1_000_000) as i64
}

#[inline]
pub fn ticks_to_us(ticks: i64) -> i64 {
    ((i128::from(ticks) * 1_000_000) / i128::from(frequency())) as i64
}
