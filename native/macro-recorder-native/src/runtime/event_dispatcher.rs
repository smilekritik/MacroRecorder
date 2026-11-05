//! Asynchronous event dispatcher decoupling native OS threads from Node.js execution.
//!
//! Emits events from Win32 hooks and hardware readers into bounded queues, and dispatches
//! them to JavaScript callbacks outside native callback contexts via N-API ThreadsafeFunction.

use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::thread::{self, JoinHandle};
use std::time::Duration;

use napi::threadsafe_function::{ErrorStrategy, ThreadsafeFunction, ThreadsafeFunctionCallMode};

use crate::api::callbacks::NativeCallbackPayload;
use crate::error::{NativeError, NativeResult};
use crate::runtime::cancellation::{CancellationHandle, CancellationToken};
use crate::runtime::channel::{
    BoundedQueue, OverflowStrategy, QueueStats, DEFAULT_HOOK_EVENT_CAPACITY,
};

/// Type alias for the threadsafe JavaScript event callback.
pub type JsEventCallback = ThreadsafeFunction<NativeCallbackPayload, ErrorStrategy::Fatal>;

struct DispatcherInner {
    queue: Arc<BoundedQueue<NativeCallbackPayload>>,
    js_callback: Mutex<Option<JsEventCallback>>,
    is_running: AtomicBool,
    cancellation_handle: CancellationHandle,
    pump_join_handle: Mutex<Option<JoinHandle<()>>>,
    dispatched_count: AtomicU64,
}

/// Dispatches native events asynchronously to Node.js without blocking native callbacks.
#[derive(Clone)]
pub struct EventDispatcher {
    inner: Arc<DispatcherInner>,
}

impl EventDispatcher {
    /// Creates a new event dispatcher with the specified capacity.
    pub fn new(capacity: Option<usize>) -> Self {
        let cap = capacity.unwrap_or(DEFAULT_HOOK_EVENT_CAPACITY);
        let queue = Arc::new(BoundedQueue::new(cap, OverflowStrategy::DropOldest));
        let cancellation_handle = CancellationHandle::new();

        Self {
            inner: Arc::new(DispatcherInner {
                queue,
                js_callback: Mutex::new(None),
                is_running: AtomicBool::new(false),
                cancellation_handle,
                pump_join_handle: Mutex::new(None),
                dispatched_count: AtomicU64::new(0),
            }),
        }
    }

    /// Starts the background dispatch pump thread.
    pub fn start(&self) -> NativeResult<()> {
        if self.inner.is_running.swap(true, Ordering::SeqCst) {
            return Ok(());
        }

        let inner_clone = Arc::clone(&self.inner);
        let cancel_token = self.inner.cancellation_handle.token();

        let handle = thread::Builder::new()
            .name("MacroRecorder.EventPump".to_string())
            .spawn(move || {
                Self::run_pump(inner_clone, cancel_token);
            })
            .map_err(|e| {
                NativeError::internal(format!("Failed to spawn event pump thread: {e}"))
            })?;

        let mut lock = self.inner.pump_join_handle.lock().unwrap();
        *lock = Some(handle);
        Ok(())
    }

    /// Emits a native event into the bounded queue.
    ///
    /// This method is NON-BLOCKING (< 1µs) and safe to call from Win32 hook procedures
    /// (WH_KEYBOARD_LL, WH_MOUSE_LL) without causing timeout violations.
    pub fn emit(&self, event: NativeCallbackPayload) -> NativeResult<()> {
        self.inner.queue.push(event)?;
        Ok(())
    }

    /// Attaches the JavaScript callback function across N-API.
    pub fn set_callback(&self, callback: JsEventCallback) {
        let mut guard = self.inner.js_callback.lock().unwrap();
        *guard = Some(callback);
    }

    /// Removes the current JavaScript callback.
    pub fn clear_callback(&self) {
        let mut guard = self.inner.js_callback.lock().unwrap();
        *guard = None;
    }

    /// Shuts down the dispatcher, terminates the pump thread, and releases resources.
    pub fn shutdown(&self, timeout: Duration) -> NativeResult<()> {
        if !self.inner.is_running.swap(false, Ordering::SeqCst) {
            return Ok(());
        }

        self.inner.cancellation_handle.cancel();
        self.inner.queue.close();
        self.clear_callback();

        let handle = {
            let mut lock = self.inner.pump_join_handle.lock().unwrap();
            lock.take()
        };

        if let Some(h) = handle {
            let start = std::time::Instant::now();
            while !h.is_finished() {
                if start.elapsed() >= timeout {
                    return Err(NativeError::internal(
                        "Timed out waiting for event pump thread to join",
                    ));
                }
                thread::sleep(Duration::from_millis(5));
            }
            let _ = h.join();
        }

        Ok(())
    }

    /// Returns queue utilization statistics.
    pub fn stats(&self) -> QueueStats {
        self.inner.queue.stats()
    }

    /// Returns the total count of events successfully handed off to Node.js.
    pub fn total_dispatched(&self) -> u64 {
        self.inner.dispatched_count.load(Ordering::Relaxed)
    }

    /// Returns whether the dispatcher is currently active.
    pub fn is_running(&self) -> bool {
        self.inner.is_running.load(Ordering::SeqCst)
    }

    fn run_pump(inner: Arc<DispatcherInner>, cancel_token: CancellationToken) {
        while inner.is_running.load(Ordering::SeqCst) && !cancel_token.is_cancelled() {
            if let Some(event) = inner.queue.pop_timeout(Duration::from_millis(50)) {
                let maybe_cb = {
                    let guard = inner.js_callback.lock().unwrap();
                    guard.clone()
                };

                if let Some(cb) = maybe_cb {
                    let status = cb.call(event, ThreadsafeFunctionCallMode::NonBlocking);
                    if status == napi::Status::Ok {
                        inner.dispatched_count.fetch_add(1, Ordering::Relaxed);
                    }
                }
            }
        }
    }
}
