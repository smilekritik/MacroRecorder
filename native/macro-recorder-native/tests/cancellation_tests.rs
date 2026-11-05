//! Tests for thread-safe cancellation handles, tokens, child hierarchies, and panic containment.

#![allow(dead_code)]

#[rustfmt::skip]
#[path = "../src/error.rs"]
mod error;

#[rustfmt::skip]
#[path = "../src/runtime/cancellation.rs"]
mod cancellation;

use cancellation::{CancellationHandle, CancellationToken};
use error::IpcErrorCode;
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::thread;

#[test]
fn test_cancellation_handle_and_token_defaults() {
    let handle = CancellationHandle::default();
    let token = handle.token();

    assert!(!handle.is_cancelled());
    assert!(!token.is_cancelled());
    assert!(token.throw_if_cancelled().is_ok());
}

#[test]
fn test_cancellation_token_none() {
    let token = CancellationToken::none();
    assert!(!token.is_cancelled());
    assert!(token.throw_if_cancelled().is_ok());

    let default_token = CancellationToken::default();
    assert!(!default_token.is_cancelled());
}

#[test]
fn test_cancellation_trigger_and_throw() {
    let handle = CancellationHandle::new();
    let token = handle.token();

    assert!(!token.is_cancelled());
    handle.cancel();

    assert!(handle.is_cancelled());
    assert!(token.is_cancelled());

    let res = token.throw_if_cancelled();
    assert!(res.is_err());
    let err = res.unwrap_err();
    assert_eq!(err.code, IpcErrorCode::Cancelled);
}

#[test]
fn test_multiple_cancel_calls_are_idempotent() {
    let handle = CancellationHandle::new();
    let token = handle.token();

    let counter = Arc::new(AtomicUsize::new(0));
    let c_clone = Arc::clone(&counter);

    token.register_callback(move || {
        c_clone.fetch_add(1, Ordering::SeqCst);
    });

    handle.cancel();
    assert_eq!(counter.load(Ordering::SeqCst), 1);

    handle.cancel();
    handle.cancel();
    assert_eq!(
        counter.load(Ordering::SeqCst),
        1,
        "Callbacks must not run more than once"
    );
}

#[test]
fn test_callback_registered_before_cancellation() {
    let handle = CancellationHandle::new();
    let token = handle.token();

    let executed = Arc::new(AtomicBool::new(false));
    let exec_clone = Arc::clone(&executed);

    token.register_callback(move || {
        exec_clone.store(true, Ordering::SeqCst);
    });

    assert!(!executed.load(Ordering::SeqCst));
    handle.cancel();
    assert!(executed.load(Ordering::SeqCst));
}

#[test]
fn test_callback_registered_after_cancellation_runs_immediately() {
    let handle = CancellationHandle::new();
    let token = handle.token();

    handle.cancel();
    assert!(token.is_cancelled());

    let executed = Arc::new(AtomicBool::new(false));
    let exec_clone = Arc::clone(&executed);

    token.register_callback(move || {
        exec_clone.store(true, Ordering::SeqCst);
    });

    assert!(
        executed.load(Ordering::SeqCst),
        "Callback registered after cancel must run immediately"
    );
}

#[test]
fn test_callback_panic_is_contained_and_other_callbacks_run() {
    let handle = CancellationHandle::new();
    let token = handle.token();

    let executed_first = Arc::new(AtomicBool::new(false));
    let executed_third = Arc::new(AtomicBool::new(false));

    let first_clone = Arc::clone(&executed_first);
    let third_clone = Arc::clone(&executed_third);

    token.register_callback(move || {
        first_clone.store(true, Ordering::SeqCst);
    });
    token.register_callback(|| {
        panic!("Deliberate panic in cancellation callback");
    });
    token.register_callback(move || {
        third_clone.store(true, Ordering::SeqCst);
    });

    // Cancelling should contain the panic in callback 2 and still execute callback 3
    handle.cancel();

    assert!(executed_first.load(Ordering::SeqCst));
    assert!(
        executed_third.load(Ordering::SeqCst),
        "Third callback must run despite panic in second"
    );
}

#[test]
fn test_child_token_cancelled_when_parent_cancels() {
    let parent = CancellationHandle::new();
    let (child_handle, child_token) = parent.token().create_child();

    assert!(!parent.is_cancelled());
    assert!(!child_handle.is_cancelled());
    assert!(!child_token.is_cancelled());

    parent.cancel();

    assert!(parent.is_cancelled());
    assert!(child_handle.is_cancelled());
    assert!(child_token.is_cancelled());
}

#[test]
fn test_child_cancellation_does_not_cancel_parent() {
    let parent = CancellationHandle::new();
    let (child_handle, child_token) = parent.token().create_child();

    child_handle.cancel();

    assert!(child_handle.is_cancelled());
    assert!(child_token.is_cancelled());
    assert!(
        !parent.is_cancelled(),
        "Cancelling child must not cancel parent"
    );
    assert!(!parent.token().is_cancelled());
}

#[test]
fn test_child_created_from_already_cancelled_parent() {
    let parent = CancellationHandle::new();
    parent.cancel();

    let (child_handle, child_token) = parent.token().create_child();
    assert!(child_handle.is_cancelled());
    assert!(child_token.is_cancelled());
}

#[test]
fn test_concurrent_cancellation_race() {
    let handle = Arc::new(CancellationHandle::new());
    let token = handle.token();

    let counter = Arc::new(AtomicUsize::new(0));
    let num_threads = 8;
    let mut joins = Vec::new();

    for _ in 0..num_threads {
        let t_token = token.clone();
        let c_clone = Arc::clone(&counter);
        let h_clone = Arc::clone(&handle);

        joins.push(thread::spawn(move || {
            t_token.register_callback(move || {
                c_clone.fetch_add(1, Ordering::SeqCst);
            });
            // Some threads try to cancel concurrently
            h_clone.cancel();
        }));
    }

    for j in joins {
        j.join().unwrap();
    }

    assert!(handle.is_cancelled());
    assert!(token.is_cancelled());
    // All registered callbacks must have run exactly once
    assert_eq!(counter.load(Ordering::SeqCst), num_threads);
}

#[test]
fn test_cancellation_token_clone_shares_state() {
    let handle = CancellationHandle::new();
    let token1 = handle.token();
    let token2 = token1.clone();

    assert!(!token1.is_cancelled());
    assert!(!token2.is_cancelled());

    handle.cancel();

    assert!(token1.is_cancelled());
    assert!(token2.is_cancelled());
}

#[test]
fn test_cancellation_thread_safety_send_sync() {
    fn assert_send<T: Send>() {}
    fn assert_sync<T: Sync>() {}

    assert_send::<CancellationHandle>();
    assert_sync::<CancellationHandle>();
    assert_send::<CancellationToken>();
    assert_sync::<CancellationToken>();
}
