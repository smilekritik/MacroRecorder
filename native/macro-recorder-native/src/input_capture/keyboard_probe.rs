//! Lightweight low-level keyboard probe for key code inspection.
//!
//! Listens to `WH_KEYBOARD_LL` on a dedicated message-loop thread, captures
//! VK/scan/extended without swallowing input, and discards synthetic injected events.

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{mpsc, Arc, Mutex};
use std::thread::{self, JoinHandle};
use std::time::Duration;

use windows::Win32::Foundation::{HINSTANCE, HWND, LPARAM, LRESULT, WPARAM};
use windows::Win32::System::Threading::GetCurrentThreadId;
use windows::Win32::UI::WindowsAndMessaging::{
    CallNextHookEx, DispatchMessageW, GetMessageW, PostThreadMessageW, SetWindowsHookExW,
    TranslateMessage, UnhookWindowsHookEx, HHOOK, KBDLLHOOKSTRUCT, MSG, WH_KEYBOARD_LL,
    WM_KEYDOWN, WM_KEYUP, WM_QUIT, WM_SYSKEYDOWN, WM_SYSKEYUP,
};

use crate::error::{NativeError, NativeResult};

/// Injected key flag in KBDLLHOOKSTRUCT.flags (bit 4 / 0x10).
const LLKHF_INJECTED: u32 = 0x00000010;

/// Snapshot of an observed keystroke.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct KeyProbeSample {
    pub virtual_key: u32,
    pub scan_code: u32,
    pub extended: bool,
    pub is_down: bool,
}

pub type KeyProbeCallback = Arc<dyn Fn(KeyProbeSample) + Send + Sync + 'static>;

struct ProbeState {
    hook: HHOOK,
    callback: Mutex<Option<KeyProbeCallback>>,
}

unsafe impl Send for ProbeState {}
unsafe impl Sync for ProbeState {}

static CURRENT_PROBE_STATE: Mutex<Option<Arc<ProbeState>>> = Mutex::new(None);

/// Lightweight keyboard probe operating on a dedicated message loop.
pub struct KeyboardProbe {
    thread_id: u32,
    join_handle: Option<JoinHandle<()>>,
    is_disposed: AtomicBool,
    state: Arc<ProbeState>,
}

unsafe impl Send for KeyboardProbe {}
unsafe impl Sync for KeyboardProbe {}

impl KeyboardProbe {
    /// Spawns a dedicated thread, registers `WH_KEYBOARD_LL`, and returns the probe handle.
    pub fn spawn() -> NativeResult<Self> {
        let (ready_tx, ready_rx) = mpsc::channel();

        let join_handle = thread::Builder::new()
            .name("MacroRecorder.KeyProbe".to_string())
            .spawn(move || {
                Self::run_thread(ready_tx);
            })
            .map_err(|e| NativeError::internal(format!("Failed to spawn KeyProbe thread: {e}")))?;

        match ready_rx.recv_timeout(Duration::from_secs(5)) {
            Ok(Ok((thread_id, state))) => Ok(Self {
                thread_id,
                join_handle: Some(join_handle),
                is_disposed: AtomicBool::new(false),
                state,
            }),
            Ok(Err(err)) => {
                let _ = join_handle.join();
                Err(err)
            }
            Err(_) => {
                let _ = join_handle.join();
                Err(NativeError::unavailable("KeyProbe initialization timed out"))
            }
        }
    }

    /// Sets the callback to receive observed key probe samples.
    pub fn set_callback(&self, callback: KeyProbeCallback) {
        let mut guard = self.state.callback.lock().unwrap();
        *guard = Some(callback);
    }

    /// Shuts down the probe thread and unhooks the Windows hook.
    pub fn shutdown(&mut self, timeout: Duration) -> NativeResult<()> {
        if self.is_disposed.swap(true, Ordering::SeqCst) {
            return Ok(());
        }

        if self.thread_id != 0 {
            unsafe {
                let _ = PostThreadMessageW(self.thread_id, WM_QUIT, WPARAM(0), LPARAM(0));
            }
        }

        if let Some(handle) = self.join_handle.take() {
            let start = std::time::Instant::now();
            while !handle.is_finished() {
                if start.elapsed() >= timeout {
                    return Err(NativeError::internal("KeyProbe thread join timed out"));
                }
                thread::sleep(Duration::from_millis(5));
            }
            let _ = handle.join();
        }

        Ok(())
    }

    fn run_thread(ready_tx: mpsc::Sender<NativeResult<(u32, Arc<ProbeState>)>>) {
        let thread_id = unsafe { GetCurrentThreadId() };

        let state = Arc::new(ProbeState {
            hook: HHOOK::default(),
            callback: Mutex::new(None),
        });

        // Set global reference for static hook procedure
        {
            let mut global_state = CURRENT_PROBE_STATE.lock().unwrap();
            *global_state = Some(Arc::clone(&state));
        }

        let hook_res = unsafe {
            SetWindowsHookExW(
                WH_KEYBOARD_LL,
                Some(Self::hook_proc),
                HINSTANCE::default(),
                0,
            )
        };

        let hook = match hook_res {
            Ok(h) => h,
            Err(e) => {
                let err = NativeError::from_win32("SetWindowsHookExW (KeyProbe)", e.code().0 as u32);
                let _ = ready_tx.send(Err(err));
                return;
            }
        };

        // SAFETY: Update hook in state struct
        let state_with_hook = Arc::new(ProbeState {
            hook,
            callback: Mutex::new(None),
        });

        {
            let mut global_state = CURRENT_PROBE_STATE.lock().unwrap();
            *global_state = Some(Arc::clone(&state_with_hook));
        }

        let _ = ready_tx.send(Ok((thread_id, Arc::clone(&state_with_hook))));

        // Win32 message loop
        let mut msg = MSG::default();
        loop {
            let ret = unsafe { GetMessageW(&mut msg, HWND::default(), 0, 0) };
            if ret.0 <= 0 {
                break;
            }
            unsafe {
                let _ = TranslateMessage(&msg);
                DispatchMessageW(&msg);
            }
        }

        // Cleanup hook
        unsafe {
            let _ = UnhookWindowsHookEx(hook);
        }

        {
            let mut global_state = CURRENT_PROBE_STATE.lock().unwrap();
            *global_state = None;
        }
    }

    unsafe extern "system" fn hook_proc(code: i32, wparam: WPARAM, lparam: LPARAM) -> LRESULT {
        if code >= 0 {
            let msg = wparam.0 as u32;
            if msg == WM_KEYDOWN || msg == WM_SYSKEYDOWN || msg == WM_KEYUP || msg == WM_SYSKEYUP {
                let data = &*(lparam.0 as *const KBDLLHOOKSTRUCT);
                let is_injected = (data.flags.0 & LLKHF_INJECTED) != 0;

                // Inspect only physical hardware input
                if !is_injected {
                    let is_down = msg == WM_KEYDOWN || msg == WM_SYSKEYDOWN;
                    let sample = KeyProbeSample {
                        virtual_key: data.vkCode,
                        scan_code: data.scanCode,
                        extended: (data.flags.0 & 1) != 0,
                        is_down,
                    };

                    let callback_opt = {
                        let global = CURRENT_PROBE_STATE.lock().unwrap();
                        global.as_ref().and_then(|s| s.callback.lock().unwrap().clone())
                    };

                    if let Some(cb) = callback_opt {
                        cb(sample);
                    }
                }
            }
        }

        // Never eat or suppress input; always pass down hook chain!
        CallNextHookEx(None, code, wparam, lparam)
    }
}

impl Drop for KeyboardProbe {
    fn drop(&mut self) {
        let _ = self.shutdown(Duration::from_secs(2));
    }
}
