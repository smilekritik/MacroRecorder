//! Thread-safe cancellation handles and tokens for coordinating native operations.
//!
//! Provides deterministic cancellation signaling across worker threads, Windows message
//! loops, and asynchronous JavaScript operations.

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};

use crate::error::{contain_panics, NativeError, NativeResult};

type Callback = Box<dyn FnOnce() + Send + 'static>;

struct CancellationInner {
    is_cancelled: AtomicBool,
    callbacks: Mutex<Vec<Callback>>,
}

/// A handle capable of triggering cancellation on associated tokens.
#[derive(Clone)]
pub struct CancellationHandle {
    inner: Arc<CancellationInner>,
}

/// A lightweight, clonable token used to query cancellation status.
#[derive(Clone)]
pub struct CancellationToken {
    inner: Arc<CancellationInner>,
}

impl Default for CancellationHandle {
    fn default() -> Self {
        Self::new()
    }
}

impl CancellationHandle {
    /// Creates a new cancellation handle and linked token.
    pub fn new() -> Self {
        Self {
            inner: Arc::new(CancellationInner {
                is_cancelled: AtomicBool::new(false),
                callbacks: Mutex::new(Vec::new()),
            }),
        }
    }

    /// Obtains a token linked to this handle.
    pub fn token(&self) -> CancellationToken {
        CancellationToken {
            inner: Arc::clone(&self.inner),
        }
    }

    /// Triggers cancellation, notifying any registered callbacks.
    pub fn cancel(&self) {
        if !self.inner.is_cancelled.swap(true, Ordering::SeqCst) {
            let mut callbacks = match self.inner.callbacks.lock() {
                Ok(guard) => guard,
                Err(poisoned) => poisoned.into_inner(),
            };
            let pending: Vec<Callback> = std::mem::take(&mut *callbacks);
            drop(callbacks);

            for cb in pending {
                let _ = contain_panics(|| {
                    cb();
                    Ok(())
                });
            }
        }
    }

    /// Returns `true` if cancellation has been requested.
    pub fn is_cancelled(&self) -> bool {
        self.inner.is_cancelled.load(Ordering::SeqCst)
    }
}

impl Default for CancellationToken {
    fn default() -> Self {
        Self::none()
    }
}

impl CancellationToken {
    /// Returns a non-cancellable token.
    pub fn none() -> Self {
        Self {
            inner: Arc::new(CancellationInner {
                is_cancelled: AtomicBool::new(false),
                callbacks: Mutex::new(Vec::new()),
            }),
        }
    }

    /// Returns `true` if cancellation has been requested.
    pub fn is_cancelled(&self) -> bool {
        self.inner.is_cancelled.load(Ordering::SeqCst)
    }

    /// Returns an error if cancellation has already occurred.
    pub fn throw_if_cancelled(&self) -> NativeResult<()> {
        if self.is_cancelled() {
            Err(NativeError::cancelled("Operation was cancelled"))
        } else {
            Ok(())
        }
    }

    /// Registers a callback to execute when cancellation occurs.
    /// If already cancelled, runs immediately.
    pub fn register_callback<F>(&self, callback: F)
    where
        F: FnOnce() + Send + 'static,
    {
        if self.is_cancelled() {
            let _ = contain_panics(|| {
                callback();
                Ok(())
            });
            return;
        }

        let mut guard = match self.inner.callbacks.lock() {
            Ok(g) => g,
            Err(poisoned) => poisoned.into_inner(),
        };

        if self.inner.is_cancelled.load(Ordering::SeqCst) {
            drop(guard);
            let _ = contain_panics(|| {
                callback();
                Ok(())
            });
        } else {
            guard.push(Box::new(callback));
        }
    }

    /// Creates a child token that will be cancelled if either this token or the child handle is cancelled.
    pub fn create_child(&self) -> (CancellationHandle, CancellationToken) {
        let child_handle = CancellationHandle::new();
        let child_token = child_handle.token();

        if self.is_cancelled() {
            child_handle.cancel();
        } else {
            let handle_clone = child_handle.clone();
            self.register_callback(move || {
                handle_clone.cancel();
            });
        }

        (child_handle, child_token)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::AtomicUsize;

    #[test]
    fn test_cancellation_lifecycle() {
        let handle = CancellationHandle::new();
        let token = handle.token();

        assert!(!handle.is_cancelled());
        assert!(!token.is_cancelled());
        assert!(token.throw_if_cancelled().is_ok());

        handle.cancel();

        assert!(handle.is_cancelled());
        assert!(token.is_cancelled());
        assert!(token.throw_if_cancelled().is_err());
    }

    #[test]
    fn test_cancellation_callback_registered_before() {
        let handle = CancellationHandle::new();
        let token = handle.token();
        let counter = Arc::new(AtomicUsize::new(0));

        let counter_clone = Arc::clone(&counter);
        token.register_callback(move || {
            counter_clone.fetch_add(1, Ordering::SeqCst);
        });

        assert_eq!(counter.load(Ordering::SeqCst), 0);
        handle.cancel();
        assert_eq!(counter.load(Ordering::SeqCst), 1);
        // Repeated cancel does not run callbacks again
        handle.cancel();
        assert_eq!(counter.load(Ordering::SeqCst), 1);
    }

    #[test]
    fn test_cancellation_callback_registered_after() {
        let handle = CancellationHandle::new();
        let token = handle.token();
        handle.cancel();

        let counter = Arc::new(AtomicUsize::new(0));
        let counter_clone = Arc::clone(&counter);
        token.register_callback(move || {
            counter_clone.fetch_add(1, Ordering::SeqCst);
        });

        assert_eq!(counter.load(Ordering::SeqCst), 1);
    }

    #[test]
    fn test_child_token_cancellation() {
        let parent = CancellationHandle::new();
        let (child_handle, child_token) = parent.token().create_child();

        assert!(!child_token.is_cancelled());
        parent.cancel();
        assert!(child_token.is_cancelled());
        assert!(child_handle.is_cancelled());
    }
}
