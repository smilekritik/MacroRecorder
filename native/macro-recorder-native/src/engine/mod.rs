//! Native macro execution engine.
//!
//! Every playback session owns a dedicated high-priority thread. JavaScript hands over complete
//! plans and observes state; it is never on the path of a macro event, so a blocked renderer or
//! main process cannot delay input, pauses, stops, or the emergency release.

pub mod api;
pub mod control;
pub mod manager;
pub mod plan;
pub mod runner;
pub mod thread_priority;
