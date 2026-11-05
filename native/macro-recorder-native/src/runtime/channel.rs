//! Bounded channels and queues with documented capacities and explicit overflow policies.
//!
//! Designed to decouple real-time Win32 hook callbacks from asynchronous Node.js
//! and renderer execution, ensuring native callbacks never block under load.

use std::collections::VecDeque;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Condvar, Mutex};
use std::time::Duration;

use crate::error::{NativeError, NativeResult};

/// Documented default capacity for high-frequency input hook events (keyboard / mouse).
pub const DEFAULT_HOOK_EVENT_CAPACITY: usize = 4096;

/// Documented default capacity for high-frequency Raw Input relative mouse events.
pub const DEFAULT_RAW_INPUT_CAPACITY: usize = 4096;

/// Documented default capacity for global hotkey trigger callbacks.
pub const DEFAULT_HOTKEY_CAPACITY: usize = 256;

/// Documented default capacity for system lifecycle and emergency stop events.
pub const DEFAULT_LIFECYCLE_CAPACITY: usize = 64;

/// Documented default capacity for inbound commands directed to native worker threads.
pub const DEFAULT_COMMAND_CAPACITY: usize = 512;

/// Strategy defining behavior when pushing into a bounded queue that is at full capacity.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum OverflowStrategy {
    /// Drops the oldest element in the queue to make room for the new element.
    /// Recommended for real-time input streams (e.g. mouse movement) where the
    /// latest position is more critical than stale intermediate positions.
    DropOldest,

    /// Discards the incoming element immediately.
    /// Useful when earliest events must be preserved in causal order.
    DropNewest,

    /// Returns a `ResourceExhausted` error without modifying queue contents.
    Reject,
}

/// Result of an enqueue operation on a bounded queue.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PushResult {
    /// The item was enqueued successfully without dropping any items.
    Enqueued,
    /// The oldest item in the queue was dropped to accommodate the new item.
    DroppedOldest,
    /// The new item was dropped because the queue was full.
    DroppedNewest,
}

/// Diagnostic statistics for queue utilization and drop tracking.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct QueueStats {
    /// Maximum capacity of the bounded queue.
    pub capacity: usize,
    /// Current number of items in the queue.
    pub current_len: usize,
    /// Total items successfully enqueued since creation.
    pub total_enqueued: u64,
    /// Total items dropped due to capacity overflow.
    pub total_dropped: u64,
    /// Whether the queue has been closed to new items.
    pub is_closed: bool,
}

struct QueueInner<T> {
    buffer: VecDeque<T>,
    capacity: usize,
    strategy: OverflowStrategy,
    is_closed: bool,
}

/// A thread-safe bounded queue with documented capacity, overflow behavior,
/// and non-blocking producers.
pub struct BoundedQueue<T> {
    state: Mutex<QueueInner<T>>,
    notifier: Condvar,
    total_enqueued: AtomicU64,
    total_dropped: AtomicU64,
    closed_flag: AtomicBool,
}

impl<T> BoundedQueue<T> {
    /// Creates a new bounded queue with the given capacity and overflow strategy.
    pub fn new(capacity: usize, strategy: OverflowStrategy) -> Self {
        let capacity = capacity.max(1);
        Self {
            state: Mutex::new(QueueInner {
                buffer: VecDeque::with_capacity(capacity),
                capacity,
                strategy,
                is_closed: false,
            }),
            notifier: Condvar::new(),
            total_enqueued: AtomicU64::new(0),
            total_dropped: AtomicU64::new(0),
            closed_flag: AtomicBool::new(false),
        }
    }

    /// Pushes an item into the queue.
    ///
    /// This method NEVER blocks. In high-frequency Win32 callbacks, this ensures
    /// completion well within OS timeout limits (< 1ms).
    pub fn push(&self, item: T) -> NativeResult<PushResult> {
        if self.closed_flag.load(Ordering::SeqCst) {
            return Err(NativeError::unavailable("Queue is closed"));
        }

        let mut inner = match self.state.lock() {
            Ok(g) => g,
            Err(poisoned) => poisoned.into_inner(),
        };

        if inner.is_closed {
            return Err(NativeError::unavailable("Queue is closed"));
        }

        if inner.buffer.len() < inner.capacity {
            inner.buffer.push_back(item);
            self.total_enqueued.fetch_add(1, Ordering::Relaxed);
            drop(inner);
            self.notifier.notify_one();
            Ok(PushResult::Enqueued)
        } else {
            match inner.strategy {
                OverflowStrategy::DropOldest => {
                    inner.buffer.pop_front();
                    inner.buffer.push_back(item);
                    self.total_enqueued.fetch_add(1, Ordering::Relaxed);
                    self.total_dropped.fetch_add(1, Ordering::Relaxed);
                    drop(inner);
                    self.notifier.notify_one();
                    Ok(PushResult::DroppedOldest)
                }
                OverflowStrategy::DropNewest => {
                    self.total_dropped.fetch_add(1, Ordering::Relaxed);
                    Ok(PushResult::DroppedNewest)
                }
                OverflowStrategy::Reject => {
                    self.total_dropped.fetch_add(1, Ordering::Relaxed);
                    Err(NativeError::resource_exhausted(format!(
                        "Queue capacity of {} reached",
                        inner.capacity
                    )))
                }
            }
        }
    }

    /// Attempts to pop an item from the queue without blocking.
    pub fn try_pop(&self) -> Option<T> {
        let mut inner = match self.state.lock() {
            Ok(g) => g,
            Err(poisoned) => poisoned.into_inner(),
        };
        inner.buffer.pop_front()
    }

    /// Blocks until an item is available or the queue is closed.
    pub fn pop(&self) -> Option<T> {
        let mut inner = match self.state.lock() {
            Ok(g) => g,
            Err(poisoned) => poisoned.into_inner(),
        };

        loop {
            if let Some(item) = inner.buffer.pop_front() {
                return Some(item);
            }
            if inner.is_closed {
                return None;
            }
            inner = match self.notifier.wait(inner) {
                Ok(g) => g,
                Err(poisoned) => poisoned.into_inner(),
            };
        }
    }

    /// Blocks until an item is available, timeout elapses, or the queue is closed.
    pub fn pop_timeout(&self, timeout: Duration) -> Option<T> {
        let mut inner = match self.state.lock() {
            Ok(g) => g,
            Err(poisoned) => poisoned.into_inner(),
        };

        let mut remaining = timeout;
        let start = std::time::Instant::now();

        loop {
            if let Some(item) = inner.buffer.pop_front() {
                return Some(item);
            }
            if inner.is_closed {
                return None;
            }

            let (next_inner, wait_res) = match self.notifier.wait_timeout(inner, remaining) {
                Ok(pair) => pair,
                Err(poisoned) => poisoned.into_inner(),
            };
            inner = next_inner;

            if wait_res.timed_out() {
                return inner.buffer.pop_front();
            }

            let elapsed = start.elapsed();
            if elapsed >= timeout {
                return inner.buffer.pop_front();
            }
            remaining = timeout - elapsed;
        }
    }

    /// Closes the queue, preventing future pushes and waking any blocked consumers.
    pub fn close(&self) {
        self.closed_flag.store(true, Ordering::SeqCst);
        let mut inner = match self.state.lock() {
            Ok(g) => g,
            Err(poisoned) => poisoned.into_inner(),
        };
        inner.is_closed = true;
        drop(inner);
        self.notifier.notify_all();
    }

    /// Drains all remaining items from the queue.
    pub fn drain(&self) -> Vec<T> {
        let mut inner = match self.state.lock() {
            Ok(g) => g,
            Err(poisoned) => poisoned.into_inner(),
        };
        inner.buffer.drain(..).collect()
    }

    /// Returns queue diagnostic statistics.
    pub fn stats(&self) -> QueueStats {
        let inner = match self.state.lock() {
            Ok(g) => g,
            Err(poisoned) => poisoned.into_inner(),
        };
        QueueStats {
            capacity: inner.capacity,
            current_len: inner.buffer.len(),
            total_enqueued: self.total_enqueued.load(Ordering::Relaxed),
            total_dropped: self.total_dropped.load(Ordering::Relaxed),
            is_closed: inner.is_closed,
        }
    }

    /// Returns the capacity of the queue.
    pub fn capacity(&self) -> usize {
        let inner = match self.state.lock() {
            Ok(g) => g,
            Err(poisoned) => poisoned.into_inner(),
        };
        inner.capacity
    }

    /// Returns the current number of items in the queue.
    pub fn len(&self) -> usize {
        let inner = match self.state.lock() {
            Ok(g) => g,
            Err(poisoned) => poisoned.into_inner(),
        };
        inner.buffer.len()
    }

    /// Returns `true` if the queue contains no items.
    pub fn is_empty(&self) -> bool {
        self.len() == 0
    }
}

/// A sender-receiver pair for bounded cross-thread communication.
pub fn bounded_channel<T>(
    capacity: usize,
    strategy: OverflowStrategy,
) -> (Arc<BoundedQueue<T>>, Arc<BoundedQueue<T>>) {
    let queue = Arc::new(BoundedQueue::new(capacity, strategy));
    (Arc::clone(&queue), queue)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::thread;

    #[test]
    fn test_bounded_queue_drop_oldest() {
        let queue = BoundedQueue::new(2, OverflowStrategy::DropOldest);
        assert_eq!(queue.push(1).unwrap(), PushResult::Enqueued);
        assert_eq!(queue.push(2).unwrap(), PushResult::Enqueued);
        assert_eq!(queue.push(3).unwrap(), PushResult::DroppedOldest);

        assert_eq!(queue.try_pop(), Some(2));
        assert_eq!(queue.try_pop(), Some(3));
        assert_eq!(queue.try_pop(), None);

        let stats = queue.stats();
        assert_eq!(stats.total_enqueued, 3);
        assert_eq!(stats.total_dropped, 1);
    }

    #[test]
    fn test_bounded_queue_drop_newest() {
        let queue = BoundedQueue::new(2, OverflowStrategy::DropNewest);
        assert_eq!(queue.push(10).unwrap(), PushResult::Enqueued);
        assert_eq!(queue.push(20).unwrap(), PushResult::Enqueued);
        assert_eq!(queue.push(30).unwrap(), PushResult::DroppedNewest);

        assert_eq!(queue.try_pop(), Some(10));
        assert_eq!(queue.try_pop(), Some(20));
        assert_eq!(queue.try_pop(), None);

        let stats = queue.stats();
        assert_eq!(stats.total_dropped, 1);
    }

    #[test]
    fn test_bounded_queue_reject() {
        let queue = BoundedQueue::new(2, OverflowStrategy::Reject);
        assert_eq!(queue.push("A").unwrap(), PushResult::Enqueued);
        assert_eq!(queue.push("B").unwrap(), PushResult::Enqueued);

        let err = queue.push("C").unwrap_err();
        assert_eq!(err.code, crate::error::IpcErrorCode::ResourceExhausted);

        assert_eq!(queue.try_pop(), Some("A"));
        assert_eq!(queue.try_pop(), Some("B"));
    }

    #[test]
    fn test_bounded_queue_cross_thread_pop() {
        let (sender, receiver) = bounded_channel(16, OverflowStrategy::Reject);

        let handle = thread::spawn(move || {
            let mut sum = 0;
            while let Some(val) = receiver.pop() {
                sum += val;
            }
            sum
        });

        for i in 1..=5 {
            sender.push(i).unwrap();
        }
        sender.close();

        let total = handle.join().unwrap();
        assert_eq!(total, 15);
    }

    #[test]
    fn test_bounded_queue_pop_timeout() {
        let queue = BoundedQueue::<i32>::new(4, OverflowStrategy::DropOldest);
        let item = queue.pop_timeout(Duration::from_millis(20));
        assert_eq!(item, None);
    }
}
