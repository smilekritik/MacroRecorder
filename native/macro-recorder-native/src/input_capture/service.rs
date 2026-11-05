//! Comprehensive InputCaptureService managing low-level hooks, Raw Input, and hotkeys.
//!
//! Provides an isolated, dedicated Windows message pump thread with:
//! - Low-level keyboard hook (`WH_KEYBOARD_LL`) with injected-input filtering and bind pass-through.
//! - Low-level mouse hook (`WH_MOUSE_LL`).
//! - Win32 Raw Input (`WM_INPUT`) mouse device registration and parsing for unclamped relative movement.
//! - Win32 `RegisterHotKey` / `UnregisterHotKey` dispatch and availability probing.
//! - Autorepeat suppression and exact swallowed key-up tracking.
//! - Configurable application-control exclusion filter.

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
    HWND_MESSAGE, MSG, WINDOW_EX_STYLE, WINDOW_STYLE, WM_APP, WM_CLOSE, WM_HOTKEY, WM_INPUT,
    WM_QUIT, WNDCLASSEXW,
};

extern "system" {
    fn GetModuleHandleW(lp_module_name: *const u16) -> isize;
}

use crate::api::callbacks::NativeHotkeyTriggerCallback;
use crate::api::events::NativeRawInputEvent;
use crate::error::{contain_panics, NativeError, NativeResult};
use crate::hotkeys::binding::HotkeyBinding;
use crate::hotkeys::manager::{HotkeyAction, HotkeyManager, HotkeyPolicy};
use crate::input_capture::exclusion::ApplicationControlFilter;
use crate::input_capture::hook_capture::{
    InjectedInputCallback, KeyboardEventCallback, LowLevelHookCapture, MouseEventCallback,
};
use crate::input_capture::raw_input::{
    read_raw_input_mouse, register_raw_mouse_device, ParsedRawMouse,
};

const WM_DISPATCH_CAPTURE_TASK: u32 = WM_APP + 201;

static NEXT_SERVICE_ID: AtomicU64 = AtomicU64::new(1);

type CaptureTask = Box<dyn FnOnce(&CaptureLoopContext) + Send + 'static>;

/// Context passed to tasks executed on the input capture message thread.
pub struct CaptureLoopContext {
    pub hwnd: HWND,
    pub thread_id: u32,
    pub hotkey_manager: Arc<HotkeyManager>,
    pub exclusion_filter: Arc<ApplicationControlFilter>,
}

pub type RawInputEventCallback = Arc<dyn Fn(NativeRawInputEvent) + Send + Sync + 'static>;
pub type HotkeyTriggerEventCallback =
    Arc<dyn Fn(NativeHotkeyTriggerCallback) + Send + Sync + 'static>;

struct CaptureShared {
    hwnd: Mutex<HWND>,
    thread_id: Mutex<u32>,
    hotkey_manager: Arc<HotkeyManager>,
    exclusion_filter: Arc<ApplicationControlFilter>,
    tasks: Mutex<VecDeque<CaptureTask>>,
    is_running: AtomicBool,
    raw_input_callback: Mutex<Option<RawInputEventCallback>>,
    hotkey_trigger_callback: Mutex<Option<HotkeyTriggerEventCallback>>,
}

// SAFETY: CaptureShared synchronizes access via Mutex and atomics.
unsafe impl Send for CaptureShared {}
unsafe impl Sync for CaptureShared {}

static ACTIVE_CAPTURE_SHARED: Mutex<Option<Arc<CaptureShared>>> = Mutex::new(None);

/// Safe, robust input capture service coordinating hooks, raw input, and global hotkeys.
pub struct InputCaptureService {
    join_handle: Option<JoinHandle<()>>,
    shared: Arc<CaptureShared>,
    hooks: Mutex<Option<LowLevelHookCapture>>,
}

unsafe impl Send for InputCaptureService {}
unsafe impl Sync for InputCaptureService {}

impl InputCaptureService {
    /// Creates and initializes a new input capture service, spawning the dedicated message thread.
    pub fn new() -> NativeResult<Self> {
        let (ready_tx, ready_rx) = mpsc::channel();
        let service_id = NEXT_SERVICE_ID.fetch_add(1, Ordering::Relaxed);

        let hotkey_manager = Arc::new(HotkeyManager::new());
        let exclusion_filter = Arc::new(ApplicationControlFilter::new());

        let shared = Arc::new(CaptureShared {
            hwnd: Mutex::new(HWND::default()),
            thread_id: Mutex::new(0),
            hotkey_manager: Arc::clone(&hotkey_manager),
            exclusion_filter: Arc::clone(&exclusion_filter),
            tasks: Mutex::new(VecDeque::new()),
            is_running: AtomicBool::new(false),
            raw_input_callback: Mutex::new(None),
            hotkey_trigger_callback: Mutex::new(None),
        });

        let shared_for_thread = Arc::clone(&shared);

        let join_handle = thread::Builder::new()
            .name(format!("MacroRecorder.InputCapture.{service_id}"))
            .spawn(move || {
                Self::run_capture_thread(service_id, shared_for_thread, ready_tx);
            })
            .map_err(|e| NativeError::internal(format!("Failed to spawn input capture thread: {e}")))?;

        match ready_rx.recv_timeout(Duration::from_secs(5)) {
            Ok(Ok((hwnd_raw, thread_id, hooks))) => {
                let hwnd = HWND(hwnd_raw as *mut _);
                {
                    let mut hwnd_guard = shared.hwnd.lock().unwrap();
                    *hwnd_guard = hwnd;
                    let mut thread_guard = shared.thread_id.lock().unwrap();
                    *thread_guard = thread_id;
                }

                Ok(Self {
                    join_handle: Some(join_handle),
                    shared,
                    hooks: Mutex::new(Some(hooks)),
                })
            }
            Ok(Err(err)) => {
                let _ = join_handle.join();
                Err(err)
            }
            Err(_) => {
                let _ = join_handle.join();
                Err(NativeError::unavailable(
                    "Input capture thread initialization timed out",
                ))
            }
        }
    }

    /// Returns whether the input capture service and hooks are currently active.
    pub fn is_running(&self) -> bool {
        self.shared.is_running.load(Ordering::SeqCst)
    }

    /// Sets the callback for low-level keyboard hook events.
    pub fn set_keyboard_callback(&self, callback: KeyboardEventCallback) {
        if let Some(ref hooks) = *self.hooks.lock().unwrap() {
            hooks.set_keyboard_callback(callback);
        }
    }

    /// Sets the callback for low-level mouse hook events.
    pub fn set_mouse_callback(&self, callback: MouseEventCallback) {
        if let Some(ref hooks) = *self.hooks.lock().unwrap() {
            hooks.set_mouse_callback(callback);
        }
    }

    /// Sets the callback for Raw Input mouse events.
    pub fn set_raw_input_callback(&self, callback: RawInputEventCallback) {
        let mut guard = self.shared.raw_input_callback.lock().unwrap();
        *guard = Some(callback);
    }

    /// Sets the callback for hotkey trigger notifications.
    pub fn set_hotkey_trigger_callback(&self, callback: HotkeyTriggerEventCallback) {
        let mut guard = self.shared.hotkey_trigger_callback.lock().unwrap();
        *guard = Some(callback);
    }

    /// Sets the callback for observed synthetic injected input.
    pub fn set_injected_callback(&self, callback: InjectedInputCallback) {
        if let Some(ref hooks) = *self.hooks.lock().unwrap() {
            hooks.set_injected_callback(callback);
        }
    }

    /// Configures the management hotkey exclusion list.
    pub fn set_control_exclusions(&self, bindings: &[HotkeyBinding]) {
        self.shared.exclusion_filter.set_exclusions(bindings);
    }

    /// Registers a hotkey binding.
    ///
    /// Synchronously executes on the dedicated message thread to register Win32 shortcuts.
    pub fn register_hotkey(
        &self,
        binding: HotkeyBinding,
        action: HotkeyAction,
        policy: Option<HotkeyPolicy>,
    ) -> NativeResult<u32> {
        self.dispatch_sync(
            move |ctx| ctx.hotkey_manager.register_hotkey(ctx.hwnd, binding, action, policy),
            Duration::from_secs(3),
        )
    }

    /// Registers a hotkey while preserving the public caller identifier.
    pub fn register_hotkey_with_id(
        &self,
        binding: HotkeyBinding,
        action: HotkeyAction,
        policy: Option<HotkeyPolicy>,
        id: u32,
    ) -> NativeResult<u32> {
        self.dispatch_sync(
            move |ctx| {
                ctx.hotkey_manager
                    .register_hotkey_with_id(ctx.hwnd, binding, action, policy, Some(id))
            },
            Duration::from_secs(3),
        )
    }

    /// Unregisters a previously registered hotkey.
    pub fn unregister_hotkey(&self, id: u32) -> NativeResult<()> {
        self.dispatch_sync(
            move |ctx| {
                ctx.hotkey_manager.unregister_hotkey(ctx.hwnd, id);
                Ok(())
            },
            Duration::from_secs(3),
        )
    }

    /// Probes availability for multiple bindings simultaneously on the dedicated message thread.
    pub fn probe_availability(&self, bindings: Vec<HotkeyBinding>) -> NativeResult<Vec<bool>> {
        self.dispatch_sync(
            move |ctx| Ok(ctx.hotkey_manager.probe_availability(ctx.hwnd, &bindings)),
            Duration::from_secs(5),
        )
    }

    /// Posts a task to be executed on the capture thread.
    fn post_task<F>(&self, task: F) -> NativeResult<()>
    where
        F: FnOnce(&CaptureLoopContext) + Send + 'static,
    {
        if !self.is_running() {
            return Err(NativeError::unavailable("Input capture service is shut down"));
        }

        {
            let mut queue = self.shared.tasks.lock().unwrap();
            queue.push_back(Box::new(task));
        }

        let hwnd = *self.shared.hwnd.lock().unwrap();
        let thread_id = *self.shared.thread_id.lock().unwrap();

        let posted = unsafe {
            PostMessageW(hwnd, WM_DISPATCH_CAPTURE_TASK, WPARAM(0), LPARAM(0))
        };

        if posted.is_err() {
            unsafe {
                let _ = PostThreadMessageW(thread_id, WM_DISPATCH_CAPTURE_TASK, WPARAM(0), LPARAM(0));
            }
        }

        Ok(())
    }

    /// Dispatches a task to the message thread and synchronously awaits the result.
    fn dispatch_sync<R, F>(&self, f: F, timeout: Duration) -> NativeResult<R>
    where
        R: Send + 'static,
        F: FnOnce(&CaptureLoopContext) -> NativeResult<R> + Send + 'static,
    {
        let (tx, rx) = mpsc::channel();
        self.post_task(move |ctx| {
            let res = contain_panics(|| f(ctx));
            let _ = tx.send(res);
        })?;

        match rx.recv_timeout(timeout) {
            Ok(res) => res,
            Err(_) => Err(NativeError::unavailable(
                "Task dispatched to input capture thread timed out",
            )),
        }
    }

    /// Deterministically shuts down hooks, message loop, window, and thread.
    pub fn shutdown(&mut self, timeout: Duration) -> NativeResult<()> {
        if !self.shared.is_running.swap(false, Ordering::SeqCst) {
            return Ok(());
        }

        // Uninstall hooks
        if let Some(hooks) = self.hooks.lock().unwrap().take() {
            hooks.uninstall();
        }

        let hwnd = *self.shared.hwnd.lock().unwrap();
        let thread_id = *self.shared.thread_id.lock().unwrap();

        // Unregister all hotkeys
        self.shared.hotkey_manager.shutdown(hwnd);

        // Signal window close and thread quit
        unsafe {
            if !hwnd.0.is_null() {
                let _ = PostMessageW(hwnd, WM_CLOSE, WPARAM(0), LPARAM(0));
            }
            if thread_id != 0 {
                let _ = PostThreadMessageW(thread_id, WM_QUIT, WPARAM(0), LPARAM(0));
            }
        }

        if let Some(handle) = self.join_handle.take() {
            let start = Instant::now();
            while !handle.is_finished() {
                if start.elapsed() >= timeout {
                    return Err(NativeError::internal(
                        "Timed out waiting for input capture thread to join",
                    ));
                }
                thread::sleep(Duration::from_millis(5));
            }
            let _ = handle.join();
        }

        let mut global = ACTIVE_CAPTURE_SHARED.lock().unwrap();
        *global = None;

        Ok(())
    }

    fn run_capture_thread(
        service_id: u64,
        shared: Arc<CaptureShared>,
        ready_tx: mpsc::Sender<NativeResult<(isize, u32, LowLevelHookCapture)>>,
    ) {
        let thread_id = unsafe { GetCurrentThreadId() };
        let class_name_str = format!("MacroRecorder_InputCapture_{service_id}_{thread_id}\0");
        let class_name_wide: Vec<u16> = class_name_str.encode_utf16().collect();

        let raw_hinstance = unsafe { GetModuleHandleW(std::ptr::null()) };
        let hinstance = HINSTANCE(raw_hinstance as *mut _);

        let wnd_class = WNDCLASSEXW {
            cbSize: std::mem::size_of::<WNDCLASSEXW>() as u32,
            lpfnWndProc: Some(Self::capture_wnd_proc),
            hInstance: hinstance,
            lpszClassName: PCWSTR(class_name_wide.as_ptr()),
            ..Default::default()
        };

        let atom = unsafe { RegisterClassExW(&wnd_class) };
        if atom == 0 {
            let err = NativeError::from_last_win32("RegisterClassExW (InputCapture)");
            let _ = ready_tx.send(Err(err));
            return;
        }

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
                let err = NativeError::from_win32("CreateWindowExW (InputCapture)", e.code().0 as u32);
                unsafe {
                    let _ = UnregisterClassW(PCWSTR(class_name_wide.as_ptr()), hinstance);
                }
                let _ = ready_tx.send(Err(err));
                return;
            }
        };

        // Register for Raw Input mouse events
        if let Err(e) = register_raw_mouse_device(hwnd) {
            unsafe {
                let _ = DestroyWindow(hwnd);
                let _ = UnregisterClassW(PCWSTR(class_name_wide.as_ptr()), hinstance);
            }
            let _ = ready_tx.send(Err(e));
            return;
        }

        // Install WH_KEYBOARD_LL and WH_MOUSE_LL hooks on this thread
        let hooks = match LowLevelHookCapture::install(
            Arc::clone(&shared.hotkey_manager),
            Arc::clone(&shared.exclusion_filter),
        ) {
            Ok(h) => h,
            Err(e) => {
                unsafe {
                    let _ = DestroyWindow(hwnd);
                    let _ = UnregisterClassW(PCWSTR(class_name_wide.as_ptr()), hinstance);
                }
                let _ = ready_tx.send(Err(e));
                return;
            }
        };

        {
            let mut global = ACTIVE_CAPTURE_SHARED.lock().unwrap();
            *global = Some(Arc::clone(&shared));
        }

        // Mark as running before signaling readiness so message pump loop doesn't exit prematurely
        shared.is_running.store(true, Ordering::SeqCst);

        let _ = ready_tx.send(Ok((hwnd.0 as isize, thread_id, hooks)));

        let ctx = CaptureLoopContext {
            hwnd,
            thread_id,
            hotkey_manager: Arc::clone(&shared.hotkey_manager),
            exclusion_filter: Arc::clone(&shared.exclusion_filter),
        };

        // Standard Win32 message pump
        let mut msg = MSG::default();
        loop {
            if !shared.is_running.load(Ordering::SeqCst) {
                break;
            }

            let ret = unsafe { GetMessageW(&mut msg, None, 0, 0) };
            if ret.0 <= 0 {
                break;
            }

            if msg.message == WM_DISPATCH_CAPTURE_TASK {
                Self::drain_capture_tasks(&shared, &ctx);
            } else {
                unsafe {
                    let _ = TranslateMessage(&msg);
                    DispatchMessageW(&msg);
                }
            }
        }

        // Cleanup window and class on thread exit
        unsafe {
            if !hwnd.0.is_null() {
                let _ = DestroyWindow(hwnd);
            }
            let _ = UnregisterClassW(PCWSTR(class_name_wide.as_ptr()), hinstance);
        }
    }

    fn drain_capture_tasks(shared: &Arc<CaptureShared>, ctx: &CaptureLoopContext) {
        let tasks: Vec<CaptureTask> = {
            let mut queue = shared.tasks.lock().unwrap();
            queue.drain(..).collect()
        };

        for task in tasks {
            let _ = contain_panics(|| {
                task(ctx);
                Ok(())
            });
        }
    }

    /// Windows procedure for the message-only capture window.
    unsafe extern "system" fn capture_wnd_proc(
        hwnd: HWND,
        msg: u32,
        wparam: WPARAM,
        lparam: LPARAM,
    ) -> LRESULT {
        let shared_opt = {
            let global = ACTIVE_CAPTURE_SHARED.lock().unwrap();
            global.as_ref().map(Arc::clone)
        };

        let shared = match shared_opt {
            Some(s) => s,
            None => return DefWindowProcW(hwnd, msg, wparam, lparam),
        };

        match msg {
            WM_INPUT => {
                // Parse Raw Input mouse message
                if let Some(parsed) = read_raw_input_mouse(lparam.0) {
                    Self::handle_raw_mouse(&shared, parsed);
                }
                LRESULT(0)
            }
            WM_HOTKEY => {
                let id = wparam.0 as u32;
                // Dispatch hotkey through HotkeyManager (swallows synthetic injected keys)
                if let Some(action) = shared.hotkey_manager.handle_wm_hotkey(id) {
                    action();

                    // Deliver hotkey trigger callback if registered
                    let cb_opt = {
                        let guard = shared.hotkey_trigger_callback.lock().unwrap();
                        guard.clone()
                    };
                    if let Some(cb) = cb_opt {
                        let now = LowLevelHookCapture::now_micros();

                        cb(NativeHotkeyTriggerCallback {
                            kind: "hotkeyTrigger".to_string(),
                            id,
                            virtual_key: (lparam.0 >> 16) as u32 & 0xFFFF,
                            modifiers: lparam.0 as u32 & 0xFFFF,
                            timestamp_microseconds: now,
                        });
                    }
                }
                LRESULT(0)
            }
            WM_CLOSE => {
                PostQuitMessage(0);
                LRESULT(0)
            }
            _ => DefWindowProcW(hwnd, msg, wparam, lparam),
        }
    }

    fn handle_raw_mouse(shared: &Arc<CaptureShared>, mouse: ParsedRawMouse) {
        let now = LowLevelHookCapture::now_micros();

        // Deliver raw input event to subscriber
        let cb_opt = {
            let guard = shared.raw_input_callback.lock().unwrap();
            guard.clone()
        };
        if let Some(cb) = cb_opt {
            let event = mouse.to_contract_event(now);
            cb(event);
        }
    }
}

impl Drop for InputCaptureService {
    fn drop(&mut self) {
        let _ = self.shutdown(Duration::from_secs(3));
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_capture_service_lifecycle() {
        let mut service = InputCaptureService::new().expect("create capture service");
        assert!(service.is_running());

        // Register a test hotkey
        let binding = HotkeyBinding::mouse(
            crate::hotkeys::binding::MouseButton::X1,
            true,
            false,
            false,
            false,
        );
        let action = Arc::new(|| {});
        let id = service
            .register_hotkey(binding, action, None)
            .expect("register hotkey");
        assert!(id > 0);

        service.unregister_hotkey(id).expect("unregister hotkey");

        service
            .shutdown(Duration::from_secs(2))
            .expect("shutdown service");
        assert!(!service.is_running());
    }

    #[test]
    fn test_repeated_capture_service_cycles() {
        for _ in 0..3 {
            let mut service = InputCaptureService::new().expect("create capture service");
            assert!(service.is_running());
            service
                .shutdown(Duration::from_secs(1))
                .expect("shutdown service");
            assert!(!service.is_running());
        }
    }
}
