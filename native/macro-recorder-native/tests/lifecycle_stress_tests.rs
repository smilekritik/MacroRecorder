//! Stress tests for repeated thread and window lifecycle cycles, message pump reliability,
//! and panic containment across Win32 message loops and native worker threads.

#![allow(dead_code)]

#[rustfmt::skip]
#[path = "../src/error.rs"]
mod error;

pub mod runtime {
    #[rustfmt::skip]
    #[path = "../../src/runtime/cancellation.rs"]
    pub mod cancellation;
    #[rustfmt::skip]
    #[path = "../../src/runtime/channel.rs"]
    pub mod channel;
    #[rustfmt::skip]
    #[path = "../../src/runtime/message_loop.rs"]
    pub mod message_loop;
    #[rustfmt::skip]
    #[path = "../../src/runtime/worker.rs"]
    pub mod worker;
}

use error::IpcErrorCode;
use runtime::cancellation::CancellationToken;
use runtime::message_loop::WinMessageLoopThread;
use runtime::worker::WorkerThread;
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use std::thread;
use std::time::Duration;

#[test]
fn test_message_loop_lifecycle_single() {
    let mut loop_thread = WinMessageLoopThread::spawn().expect("Spawn message loop");
    assert!(loop_thread.is_running());
    assert!(!loop_thread.hwnd().0.is_null());
    assert!(loop_thread.thread_id() != 0);

    loop_thread
        .shutdown(Duration::from_secs(3))
        .expect("Shutdown message loop");
    assert!(!loop_thread.is_running());
}

#[test]
fn test_message_loop_stress_repeated_cycles() {
    // Stress test: 30 repeated spawn-and-shutdown cycles to prove window class registration
    // and HWND unregistration are leak-free and do not collide.
    for i in 0..30 {
        let mut loop_thread = WinMessageLoopThread::spawn()
            .unwrap_or_else(|e| panic!("Cycle {i} failed to spawn: {e}"));
        assert!(loop_thread.is_running());
        assert!(!loop_thread.hwnd().0.is_null());

        // Dispatch a lightweight ping task to ensure message pump is processing
        let pong = loop_thread
            .dispatch_sync(move |_| 42 + i, Duration::from_secs(2))
            .expect("Task dispatch");
        assert_eq!(pong, 42 + i);

        loop_thread
            .shutdown(Duration::from_secs(2))
            .unwrap_or_else(|e| panic!("Cycle {i} failed to shutdown: {e}"));
        assert!(!loop_thread.is_running());
    }
}

#[test]
fn test_message_loop_panic_containment() {
    let loop_thread = WinMessageLoopThread::spawn().expect("Spawn message loop");

    // Post a task that intentionally panics
    loop_thread
        .post_task(|_| {
            panic!("Deliberate panic inside message loop task");
        })
        .expect("Post panicking task");

    thread::sleep(Duration::from_millis(50));

    // Message loop MUST remain alive and healthy
    assert!(loop_thread.is_running());

    // Subsequent task must execute successfully
    let result = loop_thread
        .dispatch_sync(|_| 999, Duration::from_secs(2))
        .expect("Dispatch sync after panic");
    assert_eq!(result, 999);
}

#[test]
fn test_message_loop_post_after_shutdown_fails() {
    let mut loop_thread = WinMessageLoopThread::spawn().expect("Spawn message loop");
    loop_thread
        .shutdown(Duration::from_secs(2))
        .expect("Shutdown");

    let res = loop_thread.post_task(|_| {});
    assert!(res.is_err());
    assert_eq!(res.unwrap_err().code, IpcErrorCode::Unavailable);
}

#[test]
fn test_worker_thread_lifecycle_single() {
    let mut worker = WorkerThread::spawn(None).expect("Spawn worker");
    assert!(worker.is_running());
    assert!(worker.id() > 0);

    worker.shutdown(Duration::from_secs(2)).expect("Shutdown");
    assert!(!worker.is_running());
}

#[test]
fn test_worker_thread_stress_repeated_cycles() {
    // Stress test: 30 repeated worker thread spawn & shutdown cycles
    for i in 0..30 {
        let mut worker =
            WorkerThread::spawn(None).unwrap_or_else(|e| panic!("Cycle {i} worker spawn: {e}"));
        assert!(worker.is_running());

        let res = worker
            .submit_sync(move || i * 10, Duration::from_secs(2))
            .expect("Worker submit_sync");
        assert_eq!(res, i * 10);

        worker
            .shutdown(Duration::from_secs(2))
            .unwrap_or_else(|e| panic!("Cycle {i} worker shutdown: {e}"));
        assert!(!worker.is_running());
    }
}

#[test]
fn test_worker_thread_panic_containment() {
    let mut worker = WorkerThread::spawn(None).expect("Spawn worker");

    // Submit a task that panics
    worker
        .submit(|_| {
            panic!("Deliberate panic in worker task");
        })
        .expect("Submit panicking task");

    thread::sleep(Duration::from_millis(50));

    // Worker must remain alive
    assert!(worker.is_running());

    // Next task must succeed
    let val = worker
        .submit_sync(|| 12345, Duration::from_secs(2))
        .expect("Submit sync after panic");
    assert_eq!(val, 12345);

    worker.shutdown(Duration::from_secs(2)).expect("Shutdown");
}

#[test]
fn test_worker_thread_submit_after_shutdown_fails() {
    let mut worker = WorkerThread::spawn(None).expect("Spawn worker");
    worker.shutdown(Duration::from_secs(2)).expect("Shutdown");

    let res = worker.submit(|_| {});
    assert!(res.is_err());
    assert_eq!(res.unwrap_err().code, IpcErrorCode::Unavailable);
}

#[test]
fn test_worker_thread_cancellation_on_shutdown() {
    let mut worker = WorkerThread::spawn(None).expect("Spawn worker");
    let token_cancelled = Arc::new(AtomicBool::new(false));
    let tc_clone = Arc::clone(&token_cancelled);

    worker
        .submit(move |token: CancellationToken| {
            // Wait until cancellation occurs
            while !token.is_cancelled() {
                thread::sleep(Duration::from_millis(10));
            }
            tc_clone.store(true, Ordering::SeqCst);
        })
        .expect("Submit task");

    thread::sleep(Duration::from_millis(30));
    worker.shutdown(Duration::from_secs(2)).expect("Shutdown");

    assert!(
        token_cancelled.load(Ordering::SeqCst),
        "Worker shutdown must cancel active task token"
    );
}
