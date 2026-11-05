//! Dedicated native worker thread for offloading CPU-bound tasks and async operations.
//!
//! Provides panic containment, bounded command queuing, and deterministic shutdown.

use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Arc;
use std::thread::{self, JoinHandle};
use std::time::Duration;

use crate::error::{contain_panics, NativeError, NativeResult};
use crate::runtime::cancellation::{CancellationHandle, CancellationToken};
use crate::runtime::channel::{BoundedQueue, OverflowStrategy, DEFAULT_COMMAND_CAPACITY};

type WorkerTask = Box<dyn FnOnce(CancellationToken) + Send + 'static>;

static NEXT_WORKER_ID: AtomicU64 = AtomicU64::new(1);

/// A dedicated native worker thread with bounded task queue and deterministic shutdown.
pub struct WorkerThread {
    id: u64,
    queue: Arc<BoundedQueue<WorkerTask>>,
    cancellation_handle: CancellationHandle,
    join_handle: Option<JoinHandle<()>>,
    is_running: Arc<AtomicBool>,
}

unsafe impl Send for WorkerThread {}
unsafe impl Sync for WorkerThread {}

impl WorkerThread {
    /// Spawns a new dedicated worker thread with the specified queue capacity.
    pub fn spawn(capacity: Option<usize>) -> NativeResult<Self> {
        let id = NEXT_WORKER_ID.fetch_add(1, Ordering::Relaxed);
        let cap = capacity.unwrap_or(DEFAULT_COMMAND_CAPACITY);
        let queue = Arc::new(BoundedQueue::new(cap, OverflowStrategy::Reject));
        let cancellation_handle = CancellationHandle::new();
        let is_running = Arc::new(AtomicBool::new(true));

        let queue_clone = Arc::clone(&queue);
        let token = cancellation_handle.token();
        let running_clone = Arc::clone(&is_running);

        let join_handle = thread::Builder::new()
            .name(format!("MacroRecorder.Worker.{id}"))
            .spawn(move || {
                Self::run(queue_clone, token, running_clone);
            })
            .map_err(|e| NativeError::internal(format!("Failed to spawn worker thread: {e}")))?;

        Ok(Self {
            id,
            queue,
            cancellation_handle,
            join_handle: Some(join_handle),
            is_running,
        })
    }

    /// Returns the unique worker ID.
    pub fn id(&self) -> u64 {
        self.id
    }

    /// Returns whether the worker thread is currently running.
    pub fn is_running(&self) -> bool {
        self.is_running.load(Ordering::SeqCst)
    }

    /// Submits a task to the worker queue.
    pub fn submit<F>(&self, task: F) -> NativeResult<()>
    where
        F: FnOnce(CancellationToken) + Send + 'static,
    {
        if !self.is_running() {
            return Err(NativeError::unavailable("Worker thread is shut down"));
        }
        self.queue.push(Box::new(task))?;
        Ok(())
    }

    /// Submits a synchronous-wait task to the worker thread.
    pub fn submit_sync<R, F>(&self, f: F, timeout: Duration) -> NativeResult<R>
    where
        R: Send + 'static,
        F: FnOnce() -> R + Send + 'static,
    {
        let (tx, rx) = std::sync::mpsc::channel();
        self.submit(move |_token| {
            let res = contain_panics(|| Ok(f()));
            let _ = tx.send(res);
        })?;

        match rx.recv_timeout(timeout) {
            Ok(res) => res,
            Err(_) => Err(NativeError::unavailable("Worker task timed out")),
        }
    }

    /// Deterministically shuts down the worker thread, waiting for termination.
    pub fn shutdown(&mut self, timeout: Duration) -> NativeResult<()> {
        if !self.is_running.swap(false, Ordering::SeqCst) {
            return Ok(());
        }

        self.cancellation_handle.cancel();
        self.queue.close();

        if let Some(handle) = self.join_handle.take() {
            let start = std::time::Instant::now();
            while !handle.is_finished() {
                if start.elapsed() >= timeout {
                    return Err(NativeError::internal(
                        "Timed out waiting for worker thread to terminate",
                    ));
                }
                thread::sleep(Duration::from_millis(5));
            }
            let _ = handle.join();
        }

        Ok(())
    }

    fn run(
        queue: Arc<BoundedQueue<WorkerTask>>,
        token: CancellationToken,
        is_running: Arc<AtomicBool>,
    ) {
        while is_running.load(Ordering::SeqCst) {
            if let Some(task) = queue.pop() {
                let task_token = token.clone();
                let _ = contain_panics(move || {
                    task(task_token);
                    Ok(())
                });
            } else {
                // Queue closed
                break;
            }
        }
        is_running.store(false, Ordering::SeqCst);
    }
}

impl Drop for WorkerThread {
    fn drop(&mut self) {
        let _ = self.shutdown(Duration::from_secs(2));
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::AtomicU32;

    #[test]
    fn test_worker_thread_lifecycle() {
        let mut worker = WorkerThread::spawn(None).expect("spawn worker");
        assert!(worker.is_running());

        let executed = Arc::new(AtomicBool::new(false));
        let exec_clone = Arc::clone(&executed);

        worker
            .submit(move |_token| {
                exec_clone.store(true, Ordering::SeqCst);
            })
            .expect("submit task");

        // A FIFO barrier verifies completion without relying on host scheduling speed.
        worker
            .submit_sync(|| (), Duration::from_secs(1))
            .expect("task barrier");
        assert!(executed.load(Ordering::SeqCst));

        worker.shutdown(Duration::from_secs(1)).expect("shutdown");
        assert!(!worker.is_running());
    }

    #[test]
    fn test_worker_panic_containment() {
        let mut worker = WorkerThread::spawn(None).expect("spawn worker");

        worker
            .submit(|_token| {
                panic!("Worker deliberate panic");
            })
            .expect("submit panic task");

        // Worker must still be running even after panic
        assert!(worker.is_running());

        let result = worker
            .submit_sync(|| 42, Duration::from_secs(1))
            .expect("submit after panic");
        assert_eq!(result, 42);

        worker.shutdown(Duration::from_secs(1)).expect("shutdown");
    }

    #[test]
    fn test_worker_sync_call() {
        let mut worker = WorkerThread::spawn(None).expect("spawn worker");
        let counter = Arc::new(AtomicU32::new(10));
        let c_clone = Arc::clone(&counter);

        let res = worker
            .submit_sync(
                move || c_clone.fetch_add(5, Ordering::SeqCst),
                Duration::from_secs(1),
            )
            .expect("sync call");

        assert_eq!(res, 10);
        assert_eq!(counter.load(Ordering::SeqCst), 15);
        worker.shutdown(Duration::from_secs(1)).expect("shutdown");
    }
}
