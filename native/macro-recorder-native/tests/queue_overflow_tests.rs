//! Tests for bounded queues, documented capacities, overflow strategies, and cross-thread messaging.

#![allow(dead_code)]

#[rustfmt::skip]
#[path = "../src/error.rs"]
mod error;

#[rustfmt::skip]
#[path = "../src/runtime/channel.rs"]
mod channel;

use channel::{
    BoundedQueue, DEFAULT_COMMAND_CAPACITY, DEFAULT_HOOK_EVENT_CAPACITY, DEFAULT_HOTKEY_CAPACITY,
    DEFAULT_LIFECYCLE_CAPACITY, DEFAULT_RAW_INPUT_CAPACITY, OverflowStrategy, PushResult,
    bounded_channel,
};
use error::IpcErrorCode;
use std::sync::Arc;
use std::thread;
use std::time::Duration;

#[test]
fn test_documented_default_capacities() {
    assert_eq!(DEFAULT_HOOK_EVENT_CAPACITY, 4096);
    assert_eq!(DEFAULT_RAW_INPUT_CAPACITY, 4096);
    assert_eq!(DEFAULT_HOTKEY_CAPACITY, 256);
    assert_eq!(DEFAULT_LIFECYCLE_CAPACITY, 64);
    assert_eq!(DEFAULT_COMMAND_CAPACITY, 512);
}

#[test]
fn test_queue_capacity_minimum_clamp() {
    let queue = BoundedQueue::<i32>::new(0, OverflowStrategy::Reject);
    assert_eq!(
        queue.capacity(),
        1,
        "Zero capacity should clamp to at least 1"
    );
}

#[test]
fn test_queue_overflow_drop_oldest() {
    let queue = BoundedQueue::new(3, OverflowStrategy::DropOldest);

    assert_eq!(queue.push(1).unwrap(), PushResult::Enqueued);
    assert_eq!(queue.push(2).unwrap(), PushResult::Enqueued);
    assert_eq!(queue.push(3).unwrap(), PushResult::Enqueued);
    assert_eq!(queue.len(), 3);

    // Pushing 4 should drop 1 (the oldest)
    assert_eq!(queue.push(4).unwrap(), PushResult::DroppedOldest);
    // Pushing 5 should drop 2
    assert_eq!(queue.push(5).unwrap(), PushResult::DroppedOldest);

    assert_eq!(queue.len(), 3);
    assert_eq!(queue.try_pop(), Some(3));
    assert_eq!(queue.try_pop(), Some(4));
    assert_eq!(queue.try_pop(), Some(5));
    assert_eq!(queue.try_pop(), None);

    let stats = queue.stats();
    assert_eq!(stats.total_enqueued, 5);
    assert_eq!(stats.total_dropped, 2);
    assert_eq!(stats.current_len, 0);
}

#[test]
fn test_queue_overflow_drop_newest() {
    let queue = BoundedQueue::new(2, OverflowStrategy::DropNewest);

    assert_eq!(queue.push("first").unwrap(), PushResult::Enqueued);
    assert_eq!(queue.push("second").unwrap(), PushResult::Enqueued);

    // Pushing third should drop third immediately
    assert_eq!(queue.push("third").unwrap(), PushResult::DroppedNewest);
    assert_eq!(queue.push("fourth").unwrap(), PushResult::DroppedNewest);

    assert_eq!(queue.try_pop(), Some("first"));
    assert_eq!(queue.try_pop(), Some("second"));
    assert_eq!(queue.try_pop(), None);

    let stats = queue.stats();
    assert_eq!(stats.total_enqueued, 2);
    assert_eq!(stats.total_dropped, 2);
}

#[test]
fn test_queue_overflow_reject() {
    let queue = BoundedQueue::new(2, OverflowStrategy::Reject);

    assert_eq!(queue.push(100).unwrap(), PushResult::Enqueued);
    assert_eq!(queue.push(200).unwrap(), PushResult::Enqueued);

    let err = queue.push(300).unwrap_err();
    assert_eq!(err.code, IpcErrorCode::ResourceExhausted);
    assert!(err.message.contains("Queue capacity of 2 reached"));

    assert_eq!(queue.try_pop(), Some(100));
    assert_eq!(queue.try_pop(), Some(200));
    assert_eq!(queue.try_pop(), None);

    let stats = queue.stats();
    assert_eq!(stats.total_enqueued, 2);
    assert_eq!(stats.total_dropped, 1);
}

#[test]
fn test_queue_try_pop_empty_and_non_empty() {
    let queue = BoundedQueue::<String>::new(5, OverflowStrategy::Reject);
    assert!(queue.is_empty());
    assert_eq!(queue.try_pop(), None);

    queue.push("item".to_string()).unwrap();
    assert!(!queue.is_empty());
    assert_eq!(queue.len(), 1);

    assert_eq!(queue.try_pop(), Some("item".to_string()));
    assert!(queue.is_empty());
}

#[test]
fn test_queue_pop_timeout_expires_on_empty() {
    let queue = BoundedQueue::<i32>::new(5, OverflowStrategy::Reject);
    let start = std::time::Instant::now();
    let res = queue.pop_timeout(Duration::from_millis(30));
    let elapsed = start.elapsed();

    assert_eq!(res, None);
    assert!(elapsed >= Duration::from_millis(25));
}

#[test]
fn test_queue_pop_timeout_receives_item() {
    let queue = Arc::new(BoundedQueue::<i32>::new(5, OverflowStrategy::Reject));
    let q_clone = Arc::clone(&queue);

    thread::spawn(move || {
        thread::sleep(Duration::from_millis(15));
        let _ = q_clone.push(777);
    });

    let res = queue.pop_timeout(Duration::from_millis(500));
    assert_eq!(res, Some(777));
}

#[test]
fn test_queue_close_behavior() {
    let queue = Arc::new(BoundedQueue::<i32>::new(5, OverflowStrategy::Reject));
    let q_clone = Arc::clone(&queue);

    let handle = thread::spawn(move || {
        // This pop should block until close is called
        q_clone.pop()
    });

    thread::sleep(Duration::from_millis(20));
    queue.close();

    let res = handle.join().unwrap();
    assert_eq!(res, None, "Pop on closed empty queue must return None");

    // Subsequent pushes must fail with Unavailable
    let push_res = queue.push(10);
    assert!(push_res.is_err());
    assert_eq!(push_res.unwrap_err().code, IpcErrorCode::Unavailable);

    let stats = queue.stats();
    assert!(stats.is_closed);
}

#[test]
fn test_queue_drain() {
    let queue = BoundedQueue::new(10, OverflowStrategy::Reject);
    for i in 1..=5 {
        queue.push(i).unwrap();
    }
    assert_eq!(queue.len(), 5);

    let drained = queue.drain();
    assert_eq!(drained, vec![1, 2, 3, 4, 5]);
    assert!(queue.is_empty());
    assert_eq!(queue.len(), 0);
}

#[test]
fn test_bounded_channel_producer_consumer() {
    let (sender, receiver) = bounded_channel::<usize>(100, OverflowStrategy::Reject);

    let sender_handle = thread::spawn(move || {
        for i in 0..100 {
            sender.push(i).unwrap();
        }
        sender.close();
    });

    let mut count = 0;
    while let Some(val) = receiver.pop() {
        assert_eq!(val, count);
        count += 1;
    }

    sender_handle.join().unwrap();
    assert_eq!(count, 100);
}

#[test]
fn test_multi_producer_single_consumer_drop_oldest() {
    let capacity = 50;
    let queue = Arc::new(BoundedQueue::<usize>::new(
        capacity,
        OverflowStrategy::DropOldest,
    ));
    let num_producers = 4;
    let items_per_producer = 250;

    let mut handles = Vec::new();
    for p in 0..num_producers {
        let q = Arc::clone(&queue);
        handles.push(thread::spawn(move || {
            for i in 0..items_per_producer {
                let _ = q.push(p * 1000 + i);
            }
        }));
    }

    for h in handles {
        h.join().unwrap();
    }

    // Queue capacity invariant: length must not exceed capacity
    assert!(queue.len() <= capacity);
    let stats = queue.stats();
    assert_eq!(
        stats.total_enqueued,
        (num_producers * items_per_producer) as u64
    );
    assert_eq!(
        stats.total_dropped,
        ((num_producers * items_per_producer) - queue.len()) as u64
    );
}

#[test]
fn test_queue_thread_safety_send_sync() {
    fn assert_send<T: Send>() {}
    fn assert_sync<T: Sync>() {}

    assert_send::<BoundedQueue<i32>>();
    assert_sync::<BoundedQueue<i32>>();
}
