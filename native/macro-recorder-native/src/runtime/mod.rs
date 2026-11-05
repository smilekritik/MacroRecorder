//! Safe native runtime infrastructure for Macro Recorder.
//!
//! Provides dedicated worker and Windows message-loop threads, bounded queues,
//! cancellation tokens, resource ownership primitives, and panic containment.

pub mod cancellation;
pub mod channel;
pub mod event_dispatcher;
pub mod message_loop;
pub mod resource;
pub mod worker;

pub use cancellation::{CancellationHandle, CancellationToken};
pub use channel::{
    bounded_channel, BoundedQueue, OverflowStrategy, PushResult, QueueStats,
    DEFAULT_COMMAND_CAPACITY, DEFAULT_HOOK_EVENT_CAPACITY, DEFAULT_HOTKEY_CAPACITY,
    DEFAULT_LIFECYCLE_CAPACITY, DEFAULT_RAW_INPUT_CAPACITY,
};
pub use event_dispatcher::{EventDispatcher, JsEventCallback};
pub use message_loop::{MessageLoopContext, WinMessageLoopThread};
pub use resource::{DcGuard, HookHandle, ResourceGuard, WindowClassGuard, WindowHandle};
pub use worker::WorkerThread;
