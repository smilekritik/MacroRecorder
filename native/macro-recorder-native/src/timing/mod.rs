//! Monotonic microsecond timing and absolute precision waiting.
//!
//! Provides high-resolution clocks and deadline-driven waiting mechanisms
//! for sub-millisecond scheduling.

pub mod clock;
pub mod waiter;

pub use clock::{
    elapsed_milliseconds, elapsed_microseconds, frequency, get_microseconds, get_timestamp,
    microseconds_to_ticks, ticks_to_microseconds,
};
pub use waiter::PrecisionWaiter;
