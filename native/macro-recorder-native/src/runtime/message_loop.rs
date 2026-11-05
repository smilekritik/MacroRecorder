//! Dedicated Windows message-loop thread with single-owner lifetime and deterministic shutdown.
//!
//! Provides an isolated Win32 message pump for SetWindowsHookEx, RegisterHotKey,
//! and RegisterRawInputDevices, ensuring callbacks never block Node.js and repeated
//! start-shutdown cycles leak no resources.

use std::collections::VecDeque;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{mpsc, Arc, Mutex};
use std::thread::{self, JoinHandle};
use std::time::{Duration, Instant};

use windows::core::PCWSTR;
use windows::Win32::Foundation::{HINSTANCE, HWND, LPARAM, LRESULT, WPARAM};
use windows::Win32::System::Threading::GetCurrentThreadId;
use windows::Win32::UI::WindowsAndMessaging::{
    CreateWindowExW, DefWindowProcW, DestroyWindow, DispatchMessageW, GetMessageW, PostMessageW,
    PostQuitMessage, PostThreadMessageW, RegisterClassExW, TranslateMessage, UnregisterClassW,
    HWND_MESSAGE, MSG, WINDOW_EX_STYLE, WINDOW_STYLE, WM_APP, WM_CLOSE, WM_DESTROY, WM_QUIT,
    WNDCLASSEXW,
};

use crate::error::{contain_panics, NativeError, NativeResult};
use crate::runtime::cancellation::{CancellationHandle, CancellationToken};

extern "system" {
    fn GetModuleHandleW(lp_module_name: *const u16) -> isize;
}

/// Custom window message used to dispatch tasks onto the message loop thread.
const WM_DISPATCH_TASK: u32 = WM_APP + 101;

type MessageLoopTask = Box<dyn FnOnce(&MessageLoopContext) + Send + 'static>;

static NEXT_LOOP_ID: AtomicU64 = AtomicU64::new(1);

/// Context passed to tasks executed inside the message loop thread.
pub struct MessageLoopContext {
    pub hwnd: HWND,
    pub thread_id: u32,
    pub cancellation_token: CancellationToken,
}

struct MessageLoopShared {
    tasks: Mutex<VecDeque<MessageLoopTask>>,
    is_shutdown: AtomicBool,
}

/// Handle to an active, dedicated Win32 message loop thread.
pub struct WinMessageLoopThread {
    hwnd: HWND,
    thread_id: u32,
    join_handle: Option<JoinHandle<()>>,
    shared: Arc<MessageLoopShared>,
    cancellation_handle: CancellationHandle,
}

// SAFETY: WinMessageLoopThread manages inter-thread synchronization via atomic flags
// and Win32 PostMessage/PostThreadMessage. Moving the handle across threads is thread-safe.
unsafe impl Send for WinMessageLoopThread {}
unsafe impl Sync for WinMessageLoopThread {}

impl WinMessageLoopThread {
    /// Spawns a dedicated Windows message-loop thread, waits until the message-only
    /// window is created and pump is running, and returns the handle.
    pub fn spawn() -> NativeResult<Self> {
        let (ready_tx, ready_rx) = mpsc::channel();
        let loop_id = NEXT_LOOP_ID.fetch_add(1, Ordering::Relaxed);
        let cancellation_handle = CancellationHandle::new();
        let cancel_token = cancellation_handle.token();

        let shared = Arc::new(MessageLoopShared {
            tasks: Mutex::new(VecDeque::new()),
            is_shutdown: AtomicBool::new(false),
        });

        let shared_for_thread = Arc::clone(&shared);

        let join_handle = thread::Builder::new()
            .name(format!("MacroRecorder.MsgLoop.{loop_id}"))
            .spawn(move || {
                Self::run_thread(loop_id, shared_for_thread, cancel_token, ready_tx);
            })
            .map_err(|e| {
                NativeError::internal(format!("Failed to spawn message loop thread: {e}"))
            })?;

        // Wait with timeout for thread to complete window setup
        match ready_rx.recv_timeout(Duration::from_secs(5)) {
            Ok(Ok((raw_hwnd, thread_id))) => {
                let hwnd = HWND(raw_hwnd as *mut _);
                Ok(Self {
                    hwnd,
                    thread_id,
                    join_handle: Some(join_handle),
                    shared,
                    cancellation_handle,
                })
            }
            Ok(Err(err)) => {
                let _ = join_handle.join();
                Err(err)
            }
            Err(_) => {
                let _ = join_handle.join();
                Err(NativeError::unavailable(
                    "Message loop thread initialization timed out",
                ))
            }
        }
    }

    /// Returns the HWND of the hidden message-only window.
    pub fn hwnd(&self) -> HWND {
        self.hwnd
    }

    /// Returns the Win32 Thread ID.
    pub fn thread_id(&self) -> u32 {
        self.thread_id
    }

    /// Returns `true` if the message loop is currently running.
    pub fn is_running(&self) -> bool {
        !self.shared.is_shutdown.load(Ordering::SeqCst)
    }

    /// Posts an asynchronous closure to be executed on the message loop thread.
    ///
    /// This is non-blocking and safe to call from any thread.
    pub fn post_task<F>(&self, task: F) -> NativeResult<()>
    where
        F: FnOnce(&MessageLoopContext) + Send + 'static,
    {
        if self.shared.is_shutdown.load(Ordering::SeqCst) {
            return Err(NativeError::unavailable("Message loop is shut down"));
        }

        {
            let mut queue = match self.shared.tasks.lock() {
                Ok(g) => g,
                Err(p) => p.into_inner(),
            };
            queue.push_back(Box::new(task));
        }

        // SAFETY: Posting WM_DISPATCH_TASK to our own message-only window is asynchronous and non-blocking.
        let posted = unsafe { PostMessageW(self.hwnd, WM_DISPATCH_TASK, WPARAM(0), LPARAM(0)) };

        if posted.is_err() {
            // SAFETY: If window message fails, fall back to posting to the thread message queue.
            let thread_posted = unsafe {
                PostThreadMessageW(self.thread_id, WM_DISPATCH_TASK, WPARAM(0), LPARAM(0))
            };
            if thread_posted.is_err() {
                return Err(NativeError::from_last_win32("PostMessage to message loop"));
            }
        }

        Ok(())
    }

    /// Dispatches a task to the message loop thread and synchronously waits for its completion.
    pub fn dispatch_sync<R, F>(&self, f: F, timeout: Duration) -> NativeResult<R>
    where
        R: Send + 'static,
        F: FnOnce(&MessageLoopContext) -> R + Send + 'static,
    {
        let (tx, rx) = mpsc::channel();
        self.post_task(move |ctx| {
            let res = contain_panics(|| Ok(f(ctx)));
            let _ = tx.send(res);
        })?;

        match rx.recv_timeout(timeout) {
            Ok(res) => res,
            Err(_) => Err(NativeError::unavailable(
                "Task dispatched to message loop timed out",
            )),
        }
    }

    /// Deterministically shuts down the message loop, destroys the window,
    /// unregisters the window class, and joins the thread.
    pub fn shutdown(&mut self, timeout: Duration) -> NativeResult<()> {
        if self.shared.is_shutdown.swap(true, Ordering::SeqCst) {
            return Ok(());
        }

        self.cancellation_handle.cancel();

        // SAFETY: Signaling WM_CLOSE and WM_QUIT breaks the GetMessageW pump on the target thread.
        unsafe {
            let _ = PostMessageW(self.hwnd, WM_CLOSE, WPARAM(0), LPARAM(0));
            let _ = PostThreadMessageW(self.thread_id, WM_QUIT, WPARAM(0), LPARAM(0));
        }

        if let Some(handle) = self.join_handle.take() {
            let start = Instant::now();
            while !handle.is_finished() {
                if start.elapsed() >= timeout {
                    return Err(NativeError::internal(
                        "Timed out waiting for message loop thread to join",
                    ));
                }
                thread::sleep(Duration::from_millis(5));
            }
            let _ = handle.join();
        }

        Ok(())
    }

    fn run_thread(
        loop_id: u64,
        shared: Arc<MessageLoopShared>,
        cancel_token: CancellationToken,
        ready_tx: mpsc::Sender<NativeResult<(isize, u32)>>,
    ) {
        // SAFETY: GetCurrentThreadId is safe to call on the newly spawned OS thread.
        let thread_id = unsafe { GetCurrentThreadId() };
        let class_name_str = format!("MacroRecorder_Loop_{loop_id}_{thread_id}\0");
        let class_name_wide: Vec<u16> = class_name_str.encode_utf16().collect();

        // SAFETY: Passing null to GetModuleHandleW retrieves the base module handle of the current process.
        let raw_hinstance = unsafe { GetModuleHandleW(std::ptr::null()) };
        let hinstance = HINSTANCE(raw_hinstance as *mut _);

        // Window class registration
        let wnd_class = WNDCLASSEXW {
            cbSize: std::mem::size_of::<WNDCLASSEXW>() as u32,
            lpfnWndProc: Some(Self::wnd_proc),
            hInstance: hinstance,
            lpszClassName: PCWSTR(class_name_wide.as_ptr()),
            ..Default::default()
        };

        // SAFETY: wnd_class points to a valid WNDCLASSEXW structure in this frame.
        let atom = unsafe { RegisterClassExW(&wnd_class) };
        if atom == 0 {
            let err = NativeError::from_last_win32("RegisterClassExW");
            let _ = ready_tx.send(Err(err));
            return;
        }

        // Message-only window creation (HWND_MESSAGE parent)
        // SAFETY: Valid class name registered above, HWND_MESSAGE parent creates a message-only window.
        let hwnd_res = unsafe {
            CreateWindowExW(
                WINDOW_EX_STYLE::default(),
                PCWSTR(class_name_wide.as_ptr()),
                PCWSTR::null(),
                WINDOW_STYLE::default(),
                0,
                0,
                0,
                0,
                HWND_MESSAGE,
                None,
                hinstance,
                None,
            )
        };

        let hwnd = match hwnd_res {
            Ok(h) => h,
            Err(e) => {
                let err = NativeError::from_win32("CreateWindowExW", e.code().0 as u32);
                // SAFETY: Clean up registered class upon window creation failure.
                unsafe {
                    let _ = UnregisterClassW(PCWSTR(class_name_wide.as_ptr()), hinstance);
                }
                let _ = ready_tx.send(Err(err));
                return;
            }
        };

        // Window is ready
        let _ = ready_tx.send(Ok((hwnd.0 as isize, thread_id)));

        let ctx = MessageLoopContext {
            hwnd,
            thread_id,
            cancellation_token: cancel_token,
        };

        // Standard Win32 message pump
        let mut msg = MSG::default();
        loop {
            if shared.is_shutdown.load(Ordering::SeqCst) {
                break;
            }

            // SAFETY: GetMessageW is called with None HWND to pump all thread messages.
            let ret = unsafe { GetMessageW(&mut msg, None, 0, 0) };
            if ret.0 <= 0 {
                // 0 means WM_QUIT; -1 means error
                break;
            }

            if msg.message == WM_DISPATCH_TASK {
                Self::drain_tasks(&shared, &ctx);
            } else {
                // SAFETY: TranslateMessage and DispatchMessageW dispatch to wnd_proc.
                unsafe {
                    let _ = TranslateMessage(&msg);
                    DispatchMessageW(&msg);
                }
            }
        }

        // Cleanup: destroy window and unregister class deterministically
        // SAFETY: Window handle and class were created on this thread and are destroyed here on exit.
        unsafe {
            if !hwnd.0.is_null() {
                let _ = DestroyWindow(hwnd);
            }
            let _ = UnregisterClassW(PCWSTR(class_name_wide.as_ptr()), hinstance);
        }
    }

    fn drain_tasks(shared: &Arc<MessageLoopShared>, ctx: &MessageLoopContext) {
        let tasks: Vec<MessageLoopTask> = {
            let mut queue = match shared.tasks.lock() {
                Ok(g) => g,
                Err(p) => p.into_inner(),
            };
            queue.drain(..).collect()
        };

        for task in tasks {
            let _ = contain_panics(|| {
                task(ctx);
                Ok(())
            });
        }
    }

    extern "system" fn wnd_proc(hwnd: HWND, msg: u32, wparam: WPARAM, lparam: LPARAM) -> LRESULT {
        match msg {
            WM_CLOSE => {
                // SAFETY: Exits message loop on WM_CLOSE.
                unsafe {
                    PostQuitMessage(0);
                }
                LRESULT(0)
            }
            WM_DESTROY => {
                // SAFETY: Exits message loop on WM_DESTROY.
                unsafe {
                    PostQuitMessage(0);
                }
                LRESULT(0)
            }
            // SAFETY: Default message handling for unhandled window messages.
            _ => unsafe { DefWindowProcW(hwnd, msg, wparam, lparam) },
        }
    }
}

impl Drop for WinMessageLoopThread {
    fn drop(&mut self) {
        let _ = self.shutdown(Duration::from_secs(3));
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_message_loop_spawn_and_shutdown() {
        let mut loop_thread = WinMessageLoopThread::spawn().expect("spawn message loop");
        assert!(loop_thread.is_running());
        assert!(!loop_thread.hwnd().0.is_null());
        assert!(loop_thread.thread_id() != 0);

        loop_thread
            .shutdown(Duration::from_secs(2))
            .expect("shutdown message loop");
        assert!(!loop_thread.is_running());
    }

    #[test]
    fn test_message_loop_task_dispatch_sync() {
        let loop_thread = WinMessageLoopThread::spawn().expect("spawn message loop");

        let result = loop_thread
            .dispatch_sync(
                |ctx| {
                    assert!(!ctx.hwnd.0.is_null());
                    100 + 42
                },
                Duration::from_secs(2),
            )
            .expect("sync dispatch");

        assert_eq!(result, 142);
    }

    #[test]
    fn test_repeated_spawn_shutdown_cycles() {
        for _ in 0..5 {
            let mut loop_thread = WinMessageLoopThread::spawn().expect("spawn message loop");
            assert!(loop_thread.is_running());
            loop_thread
                .shutdown(Duration::from_secs(1))
                .expect("shutdown");
        }
    }
}
