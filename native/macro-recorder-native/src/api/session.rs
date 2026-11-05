//! Safe N-API boundary class managing the lifecycle of native runtime threads and callbacks.
//!
//! Enforces panic containment on all exposed boundaries, guarantees deterministic shutdown,
//! and provides asynchronous callback delivery to Node.js outside native hook contexts.

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::time::Duration;

use napi::threadsafe_function::{ErrorStrategy, ThreadsafeFunction};
use napi::{Env, JsFunction};
use napi_derive::napi;

use crate::api::callbacks::NativeCallbackPayload;
use crate::error::catch_unwind_napi;
use crate::runtime::cancellation::CancellationHandle;
use crate::runtime::channel::QueueStats;
use crate::runtime::event_dispatcher::EventDispatcher;
use crate::runtime::message_loop::WinMessageLoopThread;
use crate::runtime::worker::WorkerThread;

/// Diagnostic queue statistics exposed across N-API to JavaScript.
#[napi(object)]
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct QueueStatsPayload {
    pub capacity: u32,
    pub current_len: u32,
    pub total_enqueued: i64,
    pub total_dropped: i64,
    pub is_closed: bool,
}

impl From<QueueStats> for QueueStatsPayload {
    fn from(stats: QueueStats) -> Self {
        Self {
            capacity: stats.capacity as u32,
            current_len: stats.current_len as u32,
            total_enqueued: stats.total_enqueued as i64,
            total_dropped: stats.total_dropped as i64,
            is_closed: stats.is_closed,
        }
    }
}

/// N-API session coordinating dedicated threads, queues, and asynchronous event delivery.
#[napi]
pub struct NativeFoundationSession {
    message_loop: Mutex<Option<WinMessageLoopThread>>,
    worker: Mutex<Option<WorkerThread>>,
    dispatcher: EventDispatcher,
    cancellation_handle: CancellationHandle,
    is_running: AtomicBool,
}

#[napi]
impl NativeFoundationSession {
    /// Creates a new uninitialized native foundation session.
    #[napi(constructor)]
    pub fn new() -> napi::Result<Self> {
        catch_unwind_napi(|| {
            Ok(Self {
                message_loop: Mutex::new(None),
                worker: Mutex::new(None),
                dispatcher: EventDispatcher::new(None),
                cancellation_handle: CancellationHandle::new(),
                is_running: AtomicBool::new(false),
            })
        })
    }

    /// Initializes and starts the dedicated message-loop thread, worker thread, and event dispatcher.
    #[napi]
    pub fn initialize(&self) -> napi::Result<()> {
        catch_unwind_napi(|| {
            if self.is_running.swap(true, Ordering::SeqCst) {
                return Ok(());
            }

            // Start event dispatcher pump
            self.dispatcher.start()?;

            // Spawn dedicated Windows message-loop thread
            let msg_loop = WinMessageLoopThread::spawn()?;
            {
                let mut guard = self.message_loop.lock().unwrap();
                *guard = Some(msg_loop);
            }

            // Spawn dedicated native worker thread
            let worker = WorkerThread::spawn(None)?;
            {
                let mut guard = self.worker.lock().unwrap();
                *guard = Some(worker);
            }

            Ok(())
        })
    }

    /// Registers a JavaScript callback to receive asynchronous native events.
    #[napi]
    pub fn register_event_callback(&self, _env: Env, callback: JsFunction) -> napi::Result<()> {
        catch_unwind_napi(|| {
            let tsfn: ThreadsafeFunction<NativeCallbackPayload, ErrorStrategy::Fatal> =
                callback.create_threadsafe_function(0, |ctx| Ok(vec![ctx.value]))?;

            self.dispatcher.set_callback(tsfn);
            Ok(())
        })
    }

    /// Emits an event into the asynchronous dispatcher pipeline.
    #[napi]
    pub fn emit_event(&self, payload: NativeCallbackPayload) -> napi::Result<()> {
        catch_unwind_napi(|| {
            self.dispatcher.emit(payload)?;
            Ok(())
        })
    }

    /// Returns queue statistics and overflow diagnostic counts.
    #[napi]
    pub fn get_queue_stats(&self) -> napi::Result<QueueStatsPayload> {
        catch_unwind_napi(|| {
            let stats = self.dispatcher.stats();
            Ok(QueueStatsPayload::from(stats))
        })
    }

    /// Returns whether the native foundation session and threads are active.
    #[napi]
    pub fn is_running(&self) -> bool {
        self.is_running.load(Ordering::SeqCst)
    }

    /// Triggers deterministic shutdown of all native threads, handles, and queues.
    #[napi]
    pub fn shutdown(&self) -> napi::Result<()> {
        catch_unwind_napi(|| {
            if !self.is_running.swap(false, Ordering::SeqCst) {
                return Ok(());
            }

            self.cancellation_handle.cancel();

            // Shutdown dispatcher
            let _ = self.dispatcher.shutdown(Duration::from_secs(2));

            // Shutdown message loop thread
            let msg_loop = {
                let mut guard = self.message_loop.lock().unwrap();
                guard.take()
            };
            if let Some(mut ml) = msg_loop {
                let _ = ml.shutdown(Duration::from_secs(2));
            }

            // Shutdown worker thread
            let worker = {
                let mut guard = self.worker.lock().unwrap();
                guard.take()
            };
            if let Some(mut w) = worker {
                let _ = w.shutdown(Duration::from_secs(2));
            }

            Ok(())
        })
    }
}

impl Drop for NativeFoundationSession {
    fn drop(&mut self) {
        let _ = self.shutdown();
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::api::events::NativeEmergencyStopEvent;

    #[test]
    fn test_foundation_session_lifecycle() {
        let session = NativeFoundationSession::new().expect("create session");
        assert!(!session.is_running());

        session.initialize().expect("initialize session");
        assert!(session.is_running());

        // Emit an event through the pipeline
        let event = NativeEmergencyStopEvent {
            timestamp_microseconds: 12345,
            reason: "Emergency stop signal".to_string(),
        };
        session
            .emit_event(NativeCallbackPayload::emergency_stop(event))
            .expect("emit event");

        let stats = session.get_queue_stats().expect("get stats");
        assert!(stats.capacity > 0);
        assert_eq!(stats.total_enqueued, 1);
        assert_eq!(stats.total_dropped, 0);

        session.shutdown().expect("shutdown session");
        assert!(!session.is_running());
    }

    #[test]
    fn test_foundation_session_repeated_cycles() {
        for _ in 0..3 {
            let session = NativeFoundationSession::new().expect("create session");
            session.initialize().expect("initialize");
            assert!(session.is_running());
            session.shutdown().expect("shutdown");
            assert!(!session.is_running());
        }
    }
}
