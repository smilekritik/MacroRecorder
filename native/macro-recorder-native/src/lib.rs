//! Macro Recorder Native Core Addon.
//!
//! Exposes audited N-API boundaries connecting Node.js / Electron main process
//! to Windows low-level input hooks, Raw Input, SendInput injection, precision clocks,
//! display geometry, window inspection, hardware performance telemetry, and gamepad emulation.

pub mod api;
pub mod engine;
pub mod error;
pub mod gamepad;
pub mod generated;
pub mod hotkeys;
pub mod input_capture;
pub mod input_injection;
pub mod performance;
pub mod pixels;
pub mod runtime;
pub mod timing;
pub mod windows;

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, OnceLock};
use std::time::Duration;

use ::windows::Win32::Foundation::HWND;
use ::windows::Win32::UI::Input::KeyboardAndMouse::{
    MOUSEEVENTF_HWHEEL, MOUSEEVENTF_LEFTDOWN, MOUSEEVENTF_LEFTUP, MOUSEEVENTF_MIDDLEDOWN,
    MOUSEEVENTF_MIDDLEUP, MOUSEEVENTF_RIGHTDOWN, MOUSEEVENTF_RIGHTUP, MOUSEEVENTF_XDOWN,
    MOUSEEVENTF_XUP,
};
use ::windows::Win32::UI::WindowsAndMessaging::{IsWindow, SetForegroundWindow};
use napi::{Env, JsFunction};
use napi_derive::napi;

pub use api::callbacks::{NativeCallbackPayload, NativeHotkeyTriggerCallback};
pub use api::commands::{
    GamepadSnapshotPayload, InjectKeyboardCommand, InjectMouseCommand,
    InjectTargetedWindowMessageCommand, RegisterNativeHotkeyCommand, ReleaseAllInputsCommand,
    SamplePixelColorCommand, SetHidHideStateCommand, UnregisterNativeHotkeyCommand,
    UpdateVirtualGamepadCommand,
};
pub use api::events::{
    NativeEmergencyStopEvent, NativeGamepadStateEvent, NativeKeyboardHookEvent,
    NativeLifecycleEvent, NativeMouseHookEvent, NativeRawInputEvent,
};
pub use api::session::{NativeFoundationSession, QueueStatsPayload};
pub use gamepad::types::GamepadPadReading;
pub use performance::discrete_gpu::GpuAdapterInfo;
pub use performance::memory::RamMetrics;
pub use performance::probe::SystemLoadSnapshot;
pub use pixels::capture::ScreenPixelSample;
pub use pixels::monitor::{MonitorInfo, ScreenRect};
pub use windows::enumeration::OpenWindowInfo;
pub use windows::foreground::ForegroundWindowSnapshot;
pub use windows::inspector::WindowInspectionSnapshot;
pub use windows::integrity::IntegrityCheckResult;
pub use windows::theming::WindowThemeOptions;

use crate::error::{catch_unwind_napi, NativeError, NativeResult};
use crate::gamepad::capture::GamepadCaptureService;
use crate::gamepad::hidhide::HidHideService;
use crate::gamepad::reader::GamepadReader;
use crate::gamepad::shared_gamepad::SharedVirtualGamepad;
use crate::gamepad::types::{GamepadAxis, GamepadBits, GamepadEvent, GamepadOutputType};
use crate::hotkeys::binding::HotkeyBinding;
use crate::hotkeys::manager::HotkeyAction;
use crate::input_capture::service::InputCaptureService;
use crate::input_injection::facade::WindowsInputInjector;
use crate::input_injection::state_tracker::MouseButton;
use crate::runtime::cancellation::CancellationToken;
use crate::timing::clock::{get_microseconds, get_timestamp};
use crate::timing::waiter::PrecisionWaiter;

// ============================================================================
// Compatibility Deref for KeyboardMapping associated function / method
// ============================================================================

pub struct KeyboardMappingHelper;
impl KeyboardMappingHelper {
    pub fn from_virtual_key(&self, virtual_key: u32) -> crate::input_capture::KeyScanInfo {
        crate::input_capture::KeyboardMapping::from_virtual_key(virtual_key)
    }
    pub fn name_from_scan_code(&self, scan_code: u32, extended: bool) -> String {
        crate::input_capture::KeyboardMapping::name_from_scan_code(scan_code, extended)
    }
}

impl std::ops::Deref for crate::input_capture::KeyboardMapping {
    type Target = KeyboardMappingHelper;
    fn deref(&self) -> &Self::Target {
        &KeyboardMappingHelper
    }
}

// ============================================================================
// Dispatch Receipt Contract
// ============================================================================

/// Receipt capturing injection execution timestamps and confirmation diagnostics.
#[napi(object)]
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct NativeDispatchReceipt {
    pub id: String,
    pub scheduled_microseconds: i64,
    pub started_microseconds: i64,
    pub completed_microseconds: i64,
    pub confirmed_microseconds: Option<i64>,
    pub success: bool,
    pub error: Option<String>,
}

impl From<crate::input_injection::DispatchReceipt> for NativeDispatchReceipt {
    fn from(r: crate::input_injection::DispatchReceipt) -> Self {
        Self {
            id: r.id,
            scheduled_microseconds: r.scheduled_microseconds,
            started_microseconds: r.started_microseconds,
            completed_microseconds: r.completed_microseconds,
            confirmed_microseconds: r.confirmed_microseconds,
            success: r.success,
            error: r.error,
        }
    }
}

// ============================================================================
// Centralized Runtime Manager
// ============================================================================

struct CentralNativeRuntime {
    injector: Arc<WindowsInputInjector>,
    input_capture: Mutex<Option<InputCaptureService>>,
    gamepad_capture: Mutex<Option<GamepadCaptureService>>,
    session: Mutex<Option<Arc<NativeFoundationSession>>>,
    is_running: AtomicBool,
}

static CENTRAL_RUNTIME: OnceLock<CentralNativeRuntime> = OnceLock::new();

fn get_runtime() -> &'static CentralNativeRuntime {
    CENTRAL_RUNTIME.get_or_init(|| CentralNativeRuntime {
        injector: Arc::new(WindowsInputInjector::new()),
        input_capture: Mutex::new(None),
        gamepad_capture: Mutex::new(None),
        session: Mutex::new(None),
        is_running: AtomicBool::new(false),
    })
}

// ============================================================================
// Range and Contract Validation Helpers
// ============================================================================

fn validate_virtual_key(vk: u32) -> NativeResult<()> {
    if vk > 255 {
        Err(NativeError::invalid_argument(format!(
            "Virtual key {vk} out of range (expected 0..=255)"
        )))
    } else {
        Ok(())
    }
}

fn validate_scan_code(sc: u32) -> NativeResult<()> {
    if sc > 65535 {
        Err(NativeError::invalid_argument(format!(
            "Scan code {sc} out of range (expected 0..=65535)"
        )))
    } else {
        Ok(())
    }
}

fn validate_hotkey_id(id: u32) -> NativeResult<()> {
    if id == 0 {
        Err(NativeError::invalid_argument(
            "Hotkey ID must be greater than or equal to 1",
        ))
    } else {
        Ok(())
    }
}

fn validate_window_handle(handle: i64) -> NativeResult<HWND> {
    if handle == 0 {
        return Err(NativeError::invalid_argument(
            "Target window handle must be non-zero",
        ));
    }
    let hwnd = HWND(handle as usize as *mut _);
    if !unsafe { IsWindow(hwnd).as_bool() } {
        return Err(NativeError::window_not_found(format!(
            "HWND 0x{handle:X} is not a valid window"
        )));
    }
    Ok(hwnd)
}

fn validate_gamepad_snapshot(s: &GamepadSnapshotPayload) -> NativeResult<()> {
    if s.buttons > 65535 {
        return Err(NativeError::invalid_argument(
            "Gamepad buttons out of range (0..=65535)",
        ));
    }
    if !(-32768..=32767).contains(&s.left_x)
        || !(-32768..=32767).contains(&s.left_y)
        || !(-32768..=32767).contains(&s.right_x)
        || !(-32768..=32767).contains(&s.right_y)
    {
        return Err(NativeError::invalid_argument(
            "Gamepad stick axes must be in range -32768..=32767",
        ));
    }
    if s.left_trigger > 255 || s.right_trigger > 255 {
        return Err(NativeError::invalid_argument(
            "Gamepad triggers must be in range 0..=255",
        ));
    }
    Ok(())
}

// ============================================================================
// Centralized Initialization and Shutdown (Audited N-API Entry Points)
// ============================================================================

/// Initializes the centralized native runtime with dedicated threads, queues, and hooks.
#[napi]
pub fn initialize_native_runtime(env: Env, callback: Option<JsFunction>) -> napi::Result<()> {
    catch_unwind_napi(|| {
        let rt = get_runtime();
        if rt.is_running.swap(true, Ordering::SeqCst) {
            return Ok(());
        }

        // 1. Create and initialize foundational session
        let session = Arc::new(NativeFoundationSession::new()?);
        session.initialize()?;

        if let Some(cb) = callback {
            session.register_event_callback(env, cb)?;
        }

        // 2. Initialize InputCaptureService on its dedicated message pump thread
        let input_capture = InputCaptureService::new()?;

        // Wire input capture events into the session event dispatcher
        let sess_kbd = Arc::clone(&session);
        input_capture.set_keyboard_callback(Arc::new(move |evt| {
            let engine = crate::engine::manager::engine();
            if evt.event_type == "KeyUp" {
                engine.notify_input_released(evt.virtual_key, None);
            }
            // Without a recording, physical input never crosses into JavaScript.
            if engine.is_recording() {
                let _ = sess_kbd.emit_event(NativeCallbackPayload::keyboard_hook(evt));
            }
        }));

        let sess_mouse = Arc::clone(&session);
        input_capture.set_mouse_callback(Arc::new(move |evt| {
            let engine = crate::engine::manager::engine();
            if evt.event_type == "MouseButtonUp" {
                engine.notify_input_released(0, Some(evt.button.as_str()));
            }
            // Relative motion is recorded from Raw Input, so hook moves are never forwarded.
            if engine.is_recording() && evt.event_type != "MouseMove" {
                let _ = sess_mouse.emit_event(NativeCallbackPayload::mouse_hook(evt));
            }
        }));

        let sess_raw = Arc::clone(&session);
        input_capture.set_raw_input_callback(Arc::new(move |evt| {
            if crate::engine::manager::engine().is_recording() {
                let _ = sess_raw.emit_event(NativeCallbackPayload::raw_input(evt));
            }
        }));

        let injector_clone = Arc::clone(&rt.injector);
        input_capture.set_injected_callback(Arc::new(move |marker, ts| {
            injector_clone.on_hook_observed(marker, ts);
            crate::engine::manager::engine().on_injected_observed(marker, ts);
        }));

        {
            let mut guard = rt.input_capture.lock().unwrap();
            *guard = Some(input_capture);
        }

        {
            let mut guard = rt.session.lock().unwrap();
            *guard = Some(session);
        }

        Ok(())
    })
}

/// Centralized deterministic shutdown.
///
/// Order of operations:
/// 1. Stop producers: gamepad polling, input capture hooks, and raw input listeners.
/// 2. Universal input release: release all globally held keys/buttons and targeted windows.
/// 3. Neutralize virtual gamepad controllers and disable HidHide.
/// 4. Drain event queues and stop dispatcher and worker threads.
#[napi]
pub fn shutdown_native_runtime() -> napi::Result<()> {
    catch_unwind_napi(|| {
        let rt = get_runtime();
        if !rt.is_running.swap(false, Ordering::SeqCst) {
            return Ok(());
        }

        // Macro sessions are the main producers of input; end them before anything else.
        crate::engine::manager::engine().shutdown();

        // 1. Stop producers first: gamepad capture thread
        {
            let mut guard = rt.gamepad_capture.lock().unwrap();
            if let Some(mut gp) = guard.take() {
                gp.stop();
            }
        }

        // Stop input capture hooks and message pump
        {
            let mut guard = rt.input_capture.lock().unwrap();
            if let Some(mut ic) = guard.take() {
                let _ = ic.shutdown(Duration::from_secs(2));
            }
        }

        // 2. Release all held inputs before closing queues and unloading
        rt.injector.release_all(None);

        // Reset and disconnect virtual gamepad
        let _ = SharedVirtualGamepad::reset();
        SharedVirtualGamepad::disconnect();

        // 3. Stop consumers and close dispatcher queues
        {
            let mut guard = rt.session.lock().unwrap();
            if let Some(sess) = guard.take() {
                let _ = sess.shutdown();
            }
        }

        Ok(())
    })
}

/// Returns whether the centralized native runtime is currently initialized and running.
#[napi]
pub fn is_native_runtime_running() -> bool {
    get_runtime().is_running.load(Ordering::SeqCst)
}

/// Registers or updates the JavaScript callback for asynchronous runtime events.
#[napi]
pub fn register_runtime_event_callback(env: Env, callback: JsFunction) -> napi::Result<()> {
    catch_unwind_napi(|| {
        let rt = get_runtime();
        let guard = rt.session.lock().unwrap();
        if let Some(ref sess) = *guard {
            sess.register_event_callback(env, callback)
        } else {
            Err(NativeError::failed_precondition(
                "Cannot register event callback: native runtime is not initialized",
            )
            .into())
        }
    })
}

/// Returns queue statistics and diagnostic overflow counts for the active session.
#[napi]
pub fn get_runtime_queue_stats() -> napi::Result<QueueStatsPayload> {
    catch_unwind_napi(|| {
        let rt = get_runtime();
        let guard = rt.session.lock().unwrap();
        if let Some(ref sess) = *guard {
            sess.get_queue_stats()
        } else {
            Ok(QueueStatsPayload {
                capacity: 0,
                current_len: 0,
                total_enqueued: 0,
                total_dropped: 0,
                is_closed: true,
            })
        }
    })
}

// ============================================================================
// Audited N-API Command Surface (Inputs, Hotkeys, Gamepad, Pixels, Windows)
// ============================================================================

/// Injects a keyboard event (press or release) globally or layout-independent Unicode text.
#[napi]
pub fn inject_keyboard(command: InjectKeyboardCommand) -> napi::Result<NativeDispatchReceipt> {
    catch_unwind_napi(|| {
        validate_virtual_key(command.virtual_key)?;
        validate_scan_code(command.scan_code)?;
        let target_window = command
            .target_window
            .filter(|value| *value != 0)
            .map(validate_window_handle)
            .transpose()?;

        let rt = get_runtime();
        let clock_start = get_timestamp();
        let token = CancellationToken::none();

        let receipt = if command.is_unicode.unwrap_or(false) {
            let text = command.unicode_char.as_deref().unwrap_or("");
            rt.injector.send_text(
                "inject_keyboard",
                text,
                target_window,
                0,
                clock_start,
                &token,
            )
        } else {
            rt.injector.send_keyboard(
                "inject_keyboard",
                command.virtual_key,
                command.scan_code,
                command.extended,
                command.is_up,
                command.scan_code > 0,
                target_window,
                0,
                clock_start,
                &token,
            )
        };

        Ok(NativeDispatchReceipt::from(receipt))
    })
}

/// Injects mouse cursor movement, clicks, or wheel scroll events.
#[napi]
pub fn inject_mouse(command: InjectMouseCommand) -> napi::Result<NativeDispatchReceipt> {
    catch_unwind_napi(|| {
        let target_window = command
            .target_window
            .filter(|value| *value != 0)
            .map(validate_window_handle)
            .transpose()?;
        let rt = get_runtime();
        let clock_start = get_timestamp();
        let token = CancellationToken::none();

        let (button, is_button_down) = if (command.flags & MOUSEEVENTF_LEFTDOWN.0) != 0 {
            (Some(MouseButton::Left), Some(true))
        } else if (command.flags & MOUSEEVENTF_LEFTUP.0) != 0 {
            (Some(MouseButton::Left), Some(false))
        } else if (command.flags & MOUSEEVENTF_RIGHTDOWN.0) != 0 {
            (Some(MouseButton::Right), Some(true))
        } else if (command.flags & MOUSEEVENTF_RIGHTUP.0) != 0 {
            (Some(MouseButton::Right), Some(false))
        } else if (command.flags & MOUSEEVENTF_MIDDLEDOWN.0) != 0 {
            (Some(MouseButton::Middle), Some(true))
        } else if (command.flags & MOUSEEVENTF_MIDDLEUP.0) != 0 {
            (Some(MouseButton::Middle), Some(false))
        } else if (command.flags & MOUSEEVENTF_XDOWN.0) != 0 {
            (
                Some(resolve_x_button(command.button.as_deref())?),
                Some(true),
            )
        } else if (command.flags & MOUSEEVENTF_XUP.0) != 0 {
            (
                Some(resolve_x_button(command.button.as_deref())?),
                Some(false),
            )
        } else {
            (None, None)
        };

        let is_horizontal = (command.flags & MOUSEEVENTF_HWHEEL.0) != 0;
        let receipt = rt.injector.send_mouse(
            "inject_mouse",
            command.delta_x,
            command.delta_y,
            button,
            is_button_down,
            command.wheel_delta,
            is_horizontal,
            command.is_absolute,
            target_window,
            0,
            clock_start,
            &token,
        );

        Ok(NativeDispatchReceipt::from(receipt))
    })
}

fn resolve_x_button(button: Option<&str>) -> NativeResult<MouseButton> {
    match button {
        None | Some("X1") => Ok(MouseButton::X1),
        Some("X2") => Ok(MouseButton::X2),
        _ => Err(NativeError::invalid_argument("Expected X1 or X2 mouse button")),
    }
}

/// Delivers a targeted Win32 message directly to a target window (HWND) without activating it.
#[napi]
pub fn inject_targeted_window_message(
    command: InjectTargetedWindowMessageCommand,
) -> napi::Result<()> {
    catch_unwind_napi(|| {
        let hwnd = validate_window_handle(command.hwnd)?;
        let rt = get_runtime();
        rt.injector
            .send_targeted_message(
                hwnd,
                command.msg,
                command.w_param as usize,
                command.l_param as isize,
            )
            .map_err(napi::Error::from)
    })
}

/// Releases all held inputs globally or for a specific window handle.
#[napi]
pub fn release_all_inputs(command: Option<ReleaseAllInputsCommand>) -> napi::Result<()> {
    catch_unwind_napi(|| {
        let rt = get_runtime();
        let target_hwnd = if let Some(cmd) = command {
            if let Some(h) = cmd.hwnd {
                Some(validate_window_handle(h)?)
            } else {
                None
            }
        } else {
            None
        };

        rt.injector.release_all(target_hwnd);
        Ok(())
    })
}

/// Registers a global shortcut: keyboard, extra mouse button, or wheel.
///
/// A bind carrying `macro_id` starts its macro on the capture thread, and an emergency bind
/// stops everything there, so neither depends on JavaScript being responsive.
#[napi]
pub fn register_native_hotkey(command: RegisterNativeHotkeyCommand) -> napi::Result<u32> {
    catch_unwind_napi(|| {
        validate_hotkey_id(command.id)?;
        validate_virtual_key(command.virtual_key)?;

        let binding = binding_from_command(&command);
        let action = hotkey_action(&command);
        let policy = hotkey_policy(&command);
        let rt = get_runtime();
        let guard = rt.input_capture.lock().unwrap();
        if let Some(ref ic) = *guard {
            ic.register_hotkey_with_id(binding, action, policy, command.id)
                .map_err(napi::Error::from)
        } else {
            Err(NativeError::failed_precondition("Input capture service is not active").into())
        }
    })
}

fn binding_from_command(command: &RegisterNativeHotkeyCommand) -> HotkeyBinding {
    let mods = command.modifiers;
    let (control, alt, shift, windows) =
        (mods & 0x0002 != 0, mods & 0x0001 != 0, mods & 0x0004 != 0, mods & 0x0008 != 0);
    let button = crate::hotkeys::binding::MouseButton::from_str_name(command.mouse_button.as_deref().unwrap_or(""));
    let wheel = crate::hotkeys::binding::WheelDirection::from_str_name(command.wheel.as_deref().unwrap_or(""));
    if button != crate::hotkeys::binding::MouseButton::None {
        HotkeyBinding::mouse(button, control, alt, shift, windows)
    } else if wheel != crate::hotkeys::binding::WheelDirection::None {
        HotkeyBinding::wheel(wheel, control, alt, shift, windows)
    } else {
        HotkeyBinding::keyboard(command.virtual_key, control, alt, shift, windows)
    }
}

fn hotkey_action(command: &RegisterNativeHotkeyCommand) -> HotkeyAction {
    let id = command.id;
    if command.emergency.unwrap_or(false) {
        return Arc::new(|| crate::engine::manager::engine().emergency_stop("Emergency stop shortcut pressed"));
    }
    if let Some(macro_id) = command.macro_id.clone() {
        return Arc::new(move || crate::engine::manager::engine().activate(&macro_id));
    }
    Arc::new(move || {
        crate::engine::manager::engine().report(crate::engine::manager::EngineEventPayload {
            kind: "hotkey".into(),
            hotkey_id: Some(id),
            ..Default::default()
        });
    })
}

fn hotkey_policy(command: &RegisterNativeHotkeyCommand) -> Option<crate::hotkeys::manager::HotkeyPolicy> {
    let pass_through = command.pass_through.unwrap_or(false);
    let scope: Option<crate::hotkeys::manager::ScopePredicate> =
        command.scope_process.as_ref().map(|process| {
            let process = process.clone();
            let title = command.scope_title.clone().unwrap_or_default();
            let predicate: crate::hotkeys::manager::ScopePredicate = Arc::new(move || {
                crate::windows::foreground::matches_foreground(Some(&process), Some(&title))
            });
            predicate
        });
    (pass_through || scope.is_some())
        .then(|| crate::hotkeys::manager::HotkeyPolicy::new(pass_through, scope))
}

/// Reports whether each gesture is free, by briefly trying to register it.
/// Gestures this application already holds count as free.
#[napi]
pub fn probe_hotkey_availability(commands: Vec<RegisterNativeHotkeyCommand>) -> napi::Result<Vec<bool>> {
    catch_unwind_napi(|| {
        let bindings = commands.iter().map(binding_from_command).collect();
        let rt = get_runtime();
        let guard = rt.input_capture.lock().unwrap();
        if let Some(ref ic) = *guard {
            ic.probe_availability(bindings).map_err(napi::Error::from)
        } else {
            Err(NativeError::failed_precondition("Input capture service is not active").into())
        }
    })
}

/// Unregisters a previously registered global native hotkey.
#[napi]
pub fn unregister_native_hotkey(command: UnregisterNativeHotkeyCommand) -> napi::Result<()> {
    catch_unwind_napi(|| {
        validate_hotkey_id(command.id)?;

        let rt = get_runtime();
        let guard = rt.input_capture.lock().unwrap();
        if let Some(ref ic) = *guard {
            ic.unregister_hotkey(command.id)?;
            Ok(())
        } else {
            Err(NativeError::failed_precondition("Input capture service is not active").into())
        }
    })
}

/// Layout-aware scan code of a virtual key, for the key-code inspector.
#[napi(object)]
pub struct KeyScanCodeInfo {
    pub scan_code: u32,
    pub extended: bool,
}

#[napi]
pub fn get_key_scan_info(virtual_key: u32) -> napi::Result<KeyScanCodeInfo> {
    catch_unwind_napi(|| {
        validate_virtual_key(virtual_key)?;
        let info = crate::input_capture::KeyboardMapping::from_virtual_key(virtual_key);
        Ok(KeyScanCodeInfo { scan_code: info.scan_code, extended: info.extended })
    })
}

/// Returns whether a physical virtual-key is currently held down.
#[napi]
pub fn is_key_down(virtual_key: i32) -> napi::Result<bool> {
    catch_unwind_napi(|| {
        let checked_key = u32::try_from(virtual_key)
            .map_err(|_| NativeError::invalid_argument("Virtual key must not be negative"))?;
        validate_virtual_key(checked_key)?;
        Ok(crate::hotkeys::binding::is_key_pressed(virtual_key))
    })
}

/// Samples the RGB pixel color at screen coordinates (X, Y).
#[napi]
pub fn sample_pixel_color(command: SamplePixelColorCommand) -> napi::Result<ScreenPixelSample> {
    catch_unwind_napi(|| {
        pixels::capture::capture_pixel_at(command.x, command.y).map_err(napi::Error::from)
    })
}

/// Captures the RGB pixel color at explicit coordinates (X, Y).
#[napi]
pub fn capture_pixel_at(x: i32, y: i32) -> napi::Result<ScreenPixelSample> {
    catch_unwind_napi(|| pixels::capture::capture_pixel_at(x, y).map_err(napi::Error::from))
}

/// Captures the RGB pixel color at the current mouse cursor location.
#[napi]
pub fn capture_pixel_at_cursor() -> napi::Result<ScreenPixelSample> {
    catch_unwind_napi(|| pixels::capture::capture_pixel_at_cursor().map_err(napi::Error::from))
}

/// Updates the synthetic state of an emulated virtual gamepad (Xbox 360 or DualShock 4).
#[napi]
pub fn update_virtual_gamepad(command: UpdateVirtualGamepadCommand) -> napi::Result<()> {
    catch_unwind_napi(|| {
        validate_gamepad_snapshot(&command.snapshot)?;

        let target_type = if command.output_type.eq_ignore_ascii_case("DualShock4") {
            GamepadOutputType::DualShock4
        } else {
            GamepadOutputType::Xbox360
        };

        SharedVirtualGamepad::set_output_type(target_type)?;
        if command.snapshot.connected {
            SharedVirtualGamepad::connect()?;

            for &button in &GamepadBits::ALL {
                let flag = GamepadBits::flag(button);
                let pressed = (command.snapshot.buttons & flag as u32) != 0;
                SharedVirtualGamepad::set_button(button, pressed);
            }

            SharedVirtualGamepad::set_axis(GamepadAxis::LeftStickX, command.snapshot.left_x);
            SharedVirtualGamepad::set_axis(GamepadAxis::LeftStickY, command.snapshot.left_y);
            SharedVirtualGamepad::set_axis(GamepadAxis::RightStickX, command.snapshot.right_x);
            SharedVirtualGamepad::set_axis(GamepadAxis::RightStickY, command.snapshot.right_y);
            SharedVirtualGamepad::set_axis(
                GamepadAxis::LeftTrigger,
                command.snapshot.left_trigger as i32,
            );
            SharedVirtualGamepad::set_axis(
                GamepadAxis::RightTrigger,
                command.snapshot.right_trigger as i32,
            );
            SharedVirtualGamepad::apply()?;
        } else {
            let _ = SharedVirtualGamepad::reset();
            SharedVirtualGamepad::disconnect();
        }

        Ok(())
    })
}

/// Sets the HidHide device concealment state for physical game controllers.
#[napi]
pub fn set_hidhide_state(command: SetHidHideStateCommand) -> napi::Result<bool> {
    catch_unwind_napi(|| {
        if !HidHideService::is_available() {
            return Ok(false);
        }

        SharedVirtualGamepad::set_hide_real_pads(command.hide);
        if command.hide {
            HidHideService::whitelist_self();
            HidHideService::activate();
        } else {
            HidHideService::deactivate();
        }

        Ok(true)
    })
}

/// Returns instantaneous snapshots of all connected physical gamepads for tester UI.
#[napi]
pub fn get_gamepad_readings() -> napi::Result<Vec<GamepadPadReading>> {
    catch_unwind_napi(|| Ok(GamepadReader::read_all()))
}

/// Returns whether the ViGEmBus virtual controller driver is installed and usable.
#[napi]
pub fn is_vigem_driver_available() -> bool {
    gamepad::vigem::is_vigem_driver_available()
}

/// Returns whether the HidHide controller hiding driver is installed and usable.
#[napi]
pub fn is_hidhide_driver_available() -> bool {
    HidHideService::is_available()
}

// ============================================================================
// Windows Services N-API Surface
// ============================================================================

/// Enumerates visible top-level application windows.
#[napi]
pub fn get_open_windows(excluded_pid: Option<u32>) -> napi::Result<Vec<OpenWindowInfo>> {
    catch_unwind_napi(|| {
        windows::enumeration::get_open_windows(excluded_pid).map_err(napi::Error::from)
    })
}

/// Captures a complete window inspection snapshot for the target under cursor or active window.
#[napi]
pub fn inspect_window(
    follow_mouse: bool,
    self_handle: Option<i64>,
    owner_handle: Option<i64>,
) -> napi::Result<WindowInspectionSnapshot> {
    catch_unwind_napi(|| {
        windows::inspector::capture_window_inspection(follow_mouse, self_handle, owner_handle)
            .map_err(napi::Error::from)
    })
}

/// Returns metadata for the current foreground window, or null if none.
#[napi]
pub fn get_foreground_window() -> napi::Result<Option<ForegroundWindowSnapshot>> {
    catch_unwind_napi(|| {
        let snap = windows::foreground::get_foreground_window_info()?;
        if snap.handle == 0 {
            Ok(None)
        } else {
            Ok(Some(snap))
        }
    })
}

/// Attempts to activate and bring to front a target window by HWND.
#[napi]
pub fn activate_window(hwnd: i64) -> napi::Result<bool> {
    catch_unwind_napi(|| {
        let validated = validate_window_handle(hwnd)?;
        let success = unsafe { SetForegroundWindow(validated).as_bool() };
        Ok(success)
    })
}

/// Attempts to activate and bring to front a window matching process name and title.
#[napi]
pub fn activate_window_by_name(process_name: String, window_title: String) -> napi::Result<bool> {
    catch_unwind_napi(|| {
        windows::enumeration::try_activate(&process_name, &window_title).map_err(napi::Error::from)
    })
}

/// Finds the HWND of a target window matching process and title, or null.
#[napi]
pub fn find_window_handle(process_name: String, window_title: String) -> napi::Result<Option<i64>> {
    catch_unwind_napi(|| {
        windows::enumeration::find_handle(&process_name, &window_title).map_err(napi::Error::from)
    })
}

/// Checks if a window ignores background posted messages (Chromium or UWP).
#[napi]
pub fn window_ignores_posted_input(
    process_name: String,
    window_title: String,
) -> napi::Result<bool> {
    catch_unwind_napi(|| {
        windows::enumeration::ignores_posted_input(&process_name, &window_title)
            .map_err(napi::Error::from)
    })
}

/// Checks UIPI integrity level compatibility for a target window.
#[napi]
pub fn check_window_integrity(hwnd: i64) -> napi::Result<IntegrityCheckResult> {
    catch_unwind_napi(|| Ok(windows::integrity::check_window_injection_integrity(hwnd)))
}

/// Applies immersive dark/light mode window theme attributes to a native window handle.
#[napi]
pub fn apply_window_theme(options: WindowThemeOptions) -> napi::Result<bool> {
    catch_unwind_napi(|| {
        let hwnd = windows::foreground::get_foreground_window();
        if hwnd != 0 {
            windows::theming::apply_window_theme(
                hwnd,
                options.dark_mode,
                options.caption_rgb,
                options.text_rgb,
            )
            .map(|_| true)
            .map_err(napi::Error::from)
        } else {
            Ok(false)
        }
    })
}

// ============================================================================
// Display, Monitor, and DPI N-API Surface
// ============================================================================

/// Enumerates all active display monitors in the system with work areas and DPI.
#[napi]
pub fn get_all_monitors() -> napi::Result<Vec<MonitorInfo>> {
    catch_unwind_napi(|| pixels::monitor::get_all_monitors().map_err(napi::Error::from))
}

/// Returns the effective system DPI (96 = 100% scaling).
#[napi]
pub fn get_effective_system_dpi() -> napi::Result<u32> {
    catch_unwind_napi(|| Ok(pixels::dpi::get_effective_system_dpi()))
}

/// Returns the DPI for the monitor containing the specified window handle.
#[napi]
pub fn get_dpi_for_window(hwnd: i64) -> napi::Result<u32> {
    catch_unwind_napi(|| {
        validate_window_handle(hwnd)?;
        Ok(pixels::dpi::get_dpi_for_window(hwnd))
    })
}

/// Returns the DPI for the monitor containing screen coordinates (X, Y).
#[napi]
pub fn get_dpi_for_point(x: i32, y: i32) -> napi::Result<u32> {
    catch_unwind_napi(|| Ok(pixels::dpi::get_dpi_for_point(x, y)))
}

// ============================================================================
// Performance and Hardware Telemetry N-API Surface
// ============================================================================

/// Samples instantaneous system-wide CPU utilization percentage (0.0..=100.0).
#[napi]
pub fn sample_cpu_utilization() -> napi::Result<f64> {
    catch_unwind_napi(|| Ok(performance::cpu::sample_cpu_utilization().unwrap_or(0.0)))
}

/// Samples instantaneous GPU utilization percentage (0.0..=100.0).
#[napi]
pub fn sample_gpu_utilization() -> napi::Result<f64> {
    catch_unwind_napi(|| Ok(performance::gpu::sample_gpu_utilization().unwrap_or(0.0)))
}

/// Samples system-wide and process memory metrics (working set, private bytes).
#[napi]
pub fn sample_memory_status() -> napi::Result<RamMetrics> {
    catch_unwind_napi(|| performance::memory::sample_memory_status().map_err(napi::Error::from))
}

/// Samples a complete system load snapshot (CPU, GPU, RAM).
#[napi]
pub fn get_system_load_snapshot() -> napi::Result<SystemLoadSnapshot> {
    catch_unwind_napi(|| {
        let mut probe = performance::probe::SystemLoadProbe::new();
        Ok(probe.sample())
    })
}

/// Finds the most capable discrete GPU adapter, or null if only integrated graphics exist.
#[napi]
pub fn find_strongest_gpu_adapter() -> napi::Result<Option<GpuAdapterInfo>> {
    catch_unwind_napi(|| Ok(performance::discrete_gpu::find_strongest_adapter()))
}

/// Enumerates all display and compute adapters.
#[napi]
pub fn enumerate_gpu_adapters() -> napi::Result<Vec<GpuAdapterInfo>> {
    catch_unwind_napi(|| Ok(performance::discrete_gpu::enumerate_adapters()))
}

// ============================================================================
// Monotonic Timing and Clock N-API Surface
// ============================================================================

/// Returns the raw high-resolution performance counter ticks.
#[napi]
pub fn get_monotonic_timestamp() -> i64 {
    get_timestamp()
}

/// Returns the current monotonic time in microseconds.
#[napi]
pub fn get_monotonic_microseconds() -> i64 {
    get_microseconds()
}

/// Blocks with sub-millisecond precision until target microseconds have elapsed.
#[napi]
pub fn wait_precision_microseconds(target_microseconds: i64) -> napi::Result<bool> {
    catch_unwind_napi(|| {
        if target_microseconds < 0 {
            return Err(
                NativeError::invalid_argument("Target microseconds cannot be negative").into(),
            );
        }
        let token = CancellationToken::none();
        PrecisionWaiter::until(get_timestamp(), target_microseconds, 0, &token)?;
        Ok(true)
    })
}

// ============================================================================
// Integration Unit Tests
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_central_runtime_lifecycle() {
        assert!(!is_native_runtime_running());
        let stats = get_runtime_queue_stats().expect("stats");
        assert!(stats.is_closed);
    }

    #[test]
    fn test_virtual_key_range_validation() {
        assert!(validate_virtual_key(0).is_ok());
        assert!(validate_virtual_key(65).is_ok());
        assert!(validate_virtual_key(255).is_ok());
        assert!(validate_virtual_key(256).is_err());
        assert!(validate_virtual_key(9999).is_err());
    }

    #[test]
    fn test_extra_mouse_buttons_preserve_their_identity() {
        assert_eq!(resolve_x_button(None).unwrap(), MouseButton::X1);
        assert_eq!(resolve_x_button(Some("X1")).unwrap(), MouseButton::X1);
        assert_eq!(resolve_x_button(Some("X2")).unwrap(), MouseButton::X2);
        assert!(resolve_x_button(Some("invalid")).is_err());
    }

    #[test]
    fn test_key_state_rejects_invalid_virtual_keys_before_querying_windows() {
        assert!(is_key_down(-1).is_err());
        assert!(is_key_down(256).is_err());
    }

    #[test]
    fn test_scan_code_range_validation() {
        assert!(validate_scan_code(0).is_ok());
        assert!(validate_scan_code(0x1C).is_ok());
        assert!(validate_scan_code(65535).is_ok());
        assert!(validate_scan_code(65536).is_err());
    }

    #[test]
    fn test_hotkey_id_range_validation() {
        assert!(validate_hotkey_id(0).is_err());
        assert!(validate_hotkey_id(1).is_ok());
        assert!(validate_hotkey_id(100).is_ok());
    }

    #[test]
    fn test_window_handle_zero_validation() {
        assert!(validate_window_handle(0).is_err());
    }

    #[test]
    fn test_gamepad_snapshot_validation() {
        let valid = GamepadSnapshotPayload {
            connected: true,
            buttons: 0x1000,
            left_x: 0,
            left_y: 0,
            right_x: 0,
            right_y: 0,
            left_trigger: 128,
            right_trigger: 255,
        };
        assert!(validate_gamepad_snapshot(&valid).is_ok());

        let mut invalid = valid.clone();
        invalid.buttons = 70000;
        assert!(validate_gamepad_snapshot(&invalid).is_err());

        let mut invalid_stick = valid.clone();
        invalid_stick.left_x = 40000;
        assert!(validate_gamepad_snapshot(&invalid_stick).is_err());

        let mut invalid_trigger = valid;
        invalid_trigger.left_trigger = 300;
        assert!(validate_gamepad_snapshot(&invalid_trigger).is_err());
    }

    #[test]
    fn test_monotonic_clock_functions() {
        let t1 = get_monotonic_timestamp();
        let u1 = get_monotonic_microseconds();
        assert!(t1 > 0);
        assert!(u1 > 0);
    }
}

// ============================================================================
// Engine Support
// ============================================================================

/// Releases input held by the shared injector. Used by the emergency stop.
pub(crate) fn release_all_runtime_inputs() {
    get_runtime().injector.release_all(None);
}

/// Runs the gamepad polling thread only while something needs it.
pub(crate) fn set_gamepad_capture(enabled: bool) {
    let rt = get_runtime();
    let mut guard = rt.gamepad_capture.lock().unwrap();
    if !enabled {
        if let Some(mut service) = guard.take() {
            service.stop();
        }
        return;
    }
    if guard.is_some() {
        return;
    }
    *guard = Some(GamepadCaptureService::new(Arc::new(|event| {
        let (name, pad_index, button, axis, value) = match event {
            GamepadEvent::ButtonDown { pad_index, button, .. } => {
                ("GamepadButtonDown", pad_index, Some(button.as_str().to_string()), None, None)
            }
            GamepadEvent::ButtonUp { pad_index, button, .. } => {
                ("GamepadButtonUp", pad_index, Some(button.as_str().to_string()), None, None)
            }
            GamepadEvent::Axis { pad_index, axis, value, .. } => {
                ("GamepadAxis", pad_index, None, Some(axis.as_str().to_string()), Some(value))
            }
            GamepadEvent::State(_) => return,
        };
        crate::engine::manager::engine().report(crate::engine::manager::EngineEventPayload {
            kind: "gamepad".into(),
            gamepad_event: Some(name.into()),
            gamepad_button: button,
            gamepad_axis: axis,
            axis_value: value,
            pad_index: Some(pad_index),
            // The polling thread keeps its own clock; recordings need the shared one.
            timestamp_microseconds: Some(get_microseconds()),
            ..Default::default()
        });
    })));
}
