//! Owns plans and live sessions, applies activation policy, and reports to JavaScript.
//!
//! Hotkey activation and the emergency stop run on the input-capture thread, so every path
//! reachable from there avoids JavaScript and any work that could stall the hook.

use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, AtomicI64, AtomicUsize, Ordering};
use std::sync::mpsc::{self, RecvTimeoutError, Sender};
use std::sync::{Arc, Mutex, OnceLock, RwLock};
use std::thread::JoinHandle;
use std::time::{Duration, Instant};

use napi::threadsafe_function::{ErrorStrategy, ThreadsafeFunction, ThreadsafeFunctionCallMode};
use windows::Win32::Foundation::HWND;

use crate::engine::control::{ticks_to_us, Cancelled, SessionControl};
use crate::engine::plan::{compile, Action, Activation, CompiledEvent, CompiledPlan, EnginePlan};
use crate::engine::runner::{EngineBackend, Runner};
use crate::engine::thread_priority::TimingCriticalScope;
use crate::error::{NativeError, NativeResult};
use crate::gamepad::shared_gamepad::SharedVirtualGamepad;
use crate::input_injection::confirmation::ConfirmationTracker;
use crate::input_injection::facade::WindowsInputInjector;
use crate::input_injection::receipt::DispatchReceipt;
use crate::runtime::cancellation::CancellationToken;
use crate::timing::clock::get_timestamp;

const RECEIPT_FLUSH_INTERVAL: Duration = Duration::from_millis(50);
const REPRESS_GUARD: Duration = Duration::from_millis(50);

#[napi_derive::napi(object)]
#[derive(Debug, Clone, PartialEq)]
pub struct EngineReceiptPayload {
    pub id: String,
    pub scheduled_microseconds: i64,
    pub planned_microseconds: Option<i64>,
    pub started_microseconds: i64,
    pub completed_microseconds: i64,
    pub confirmed_microseconds: Option<i64>,
    pub success: bool,
    pub error: Option<String>,
}

#[napi_derive::napi(object)]
#[derive(Debug, Clone, PartialEq, Default)]
pub struct EngineEventPayload {
    /// `state`, `receipts`, `overlay`, `finished`, `emergency`, `hotkey`, or `gamepad`.
    pub kind: String,
    pub session_id: Option<i64>,
    pub macro_id: Option<String>,
    pub macro_name: Option<String>,
    pub state: Option<String>,
    pub activation: Option<String>,
    pub total_actions: Option<u32>,
    pub elapsed_microseconds: Option<i64>,
    pub receipts: Option<Vec<EngineReceiptPayload>>,
    pub text: Option<String>,
    pub duration_microseconds: Option<i64>,
    pub show_timing: Option<bool>,
    pub error: Option<String>,
    pub reason: Option<String>,
    pub hotkey_id: Option<u32>,
    pub gamepad_event: Option<String>,
    pub gamepad_button: Option<String>,
    pub gamepad_axis: Option<String>,
    pub axis_value: Option<i32>,
    pub pad_index: Option<u32>,
    pub timestamp_microseconds: Option<i64>,
}

#[napi_derive::napi(object)]
#[derive(Debug, Clone, PartialEq)]
pub struct EngineSessionStatus {
    pub session_id: i64,
    pub macro_id: String,
    pub macro_name: String,
    pub state: String,
    pub automatic: bool,
    pub elapsed_microseconds: i64,
}

enum Report {
    Event(EngineEventPayload),
    Receipt(i64, DispatchReceipt, Option<i64>),
}

type EngineCallback = ThreadsafeFunction<EngineEventPayload, ErrorStrategy::Fatal>;

struct LiveBackend {
    session_id: i64,
    injector: WindowsInputInjector,
    token: CancellationToken,
    uses_lease: AtomicBool,
    /// How each held key was pressed, so its release reaches games that read scan codes.
    held_keys: Mutex<HashMap<(i64, u32), (u32, bool, bool)>>,
    macro_id: Arc<str>,
    macro_name: Arc<str>,
}

impl LiveBackend {
    fn release_everything(&self) {
        let none = CancellationToken::none();
        let held: Vec<_> = self.held_keys.lock().unwrap().drain().collect();
        for ((target, vk), (scan, extended, prefer)) in held {
            let _ = self.injector.send_keyboard(
                "release",
                vk,
                scan,
                extended,
                true,
                prefer,
                hwnd_of(target),
                0,
                get_timestamp(),
                &none,
            );
        }
        self.injector.release_all(None);
        if self.uses_lease.swap(false, Ordering::SeqCst) {
            SharedVirtualGamepad::release_session();
        }
    }

    fn ensure_gamepad(&self) -> Result<(), String> {
        if self.uses_lease.swap(true, Ordering::SeqCst) {
            return Ok(());
        }
        SharedVirtualGamepad::acquire_session().map_err(|error| {
            self.uses_lease.store(false, Ordering::SeqCst);
            error.message
        })
    }
}

fn hwnd_of(handle: i64) -> Option<HWND> {
    (handle != 0).then(|| HWND(handle as usize as *mut _))
}

impl EngineBackend for LiveBackend {
    fn dispatch(
        &self,
        event: &CompiledEvent,
        authored_us: i64,
        clock_start: i64,
        prefer_scan_codes: bool,
        target_window: i64,
    ) -> DispatchReceipt {
        let id = &*event.id;
        let target = hwnd_of(target_window);
        let token = &self.token;
        match &event.action {
            Action::Key {
                vk,
                scan,
                extended,
                is_up,
            } => {
                let receipt = self.injector.send_keyboard(
                    id,
                    *vk,
                    *scan,
                    *extended,
                    *is_up,
                    prefer_scan_codes,
                    target,
                    authored_us,
                    clock_start,
                    token,
                );
                if receipt.success {
                    let mut held = self.held_keys.lock().unwrap();
                    if *is_up {
                        held.remove(&(target_window, *vk));
                    } else {
                        held.insert((target_window, *vk), (*scan, *extended, prefer_scan_codes));
                    }
                }
                receipt
            }
            Action::MouseButton { button, is_down } => self.injector.send_mouse(
                id,
                0,
                0,
                Some(*button),
                Some(*is_down),
                0,
                false,
                false,
                target,
                authored_us,
                clock_start,
                token,
            ),
            Action::MouseMove { dx, dy, absolute } => self.injector.send_mouse(
                id,
                *dx,
                *dy,
                None,
                None,
                0,
                false,
                *absolute,
                target,
                authored_us,
                clock_start,
                token,
            ),
            Action::Wheel { delta, horizontal } => self.injector.send_mouse(
                id,
                0,
                0,
                None,
                None,
                *delta,
                *horizontal,
                false,
                target,
                authored_us,
                clock_start,
                token,
            ),
            Action::Text(text) => {
                self.injector
                    .send_text(id, text, target, authored_us, clock_start, token)
            }
            Action::GamepadButton { .. } | Action::GamepadAxis { .. } => {
                let started = ticks_to_us(get_timestamp() - clock_start);
                let outcome = self.ensure_gamepad().and_then(|()| {
                    match &event.action {
                        Action::GamepadButton { button, is_down } => {
                            SharedVirtualGamepad::set_button(*button, *is_down)
                        }
                        Action::GamepadAxis { axis, value } => {
                            SharedVirtualGamepad::set_axis(*axis, *value)
                        }
                        _ => {}
                    }
                    SharedVirtualGamepad::apply().map_err(|error| error.message)
                });
                let completed = ticks_to_us(get_timestamp() - clock_start);
                match outcome {
                    Ok(()) => DispatchReceipt::success(id, authored_us, started, completed, None),
                    Err(error) => {
                        DispatchReceipt::failure(id, authored_us, started, completed, error)
                    }
                }
            }
            _ => DispatchReceipt::success(id, authored_us, 0, 0, None),
        }
    }

    fn pixel_rgb(&self, x: i32, y: i32) -> Result<i32, String> {
        crate::pixels::capture::get_pixel_color_rgb(x, y).map_err(|error| error.message)
    }

    fn foreground_matches(&self, process: &str, title: &str) -> bool {
        crate::windows::foreground::matches_foreground(Some(process), Some(title))
    }

    fn key_down(&self, vk: u32) -> bool {
        crate::hotkeys::binding::is_key_pressed(vk as i32)
    }

    fn resolve_macro(&self, name: &str) -> Option<Arc<CompiledPlan>> {
        engine().plans.read().unwrap().by_name.get(name).cloned()
    }

    fn publish_receipt(&self, receipt: DispatchReceipt, planned_us: Option<i64>) {
        let _ = engine()
            .reports
            .send(Report::Receipt(self.session_id, receipt, planned_us));
    }

    fn publish_overlay(
        &self,
        plan: &CompiledPlan,
        text: &str,
        duration_us: i64,
        show_timing: bool,
    ) {
        engine().report(EngineEventPayload {
            kind: "overlay".into(),
            session_id: Some(self.session_id),
            macro_id: Some(plan.macro_id.to_string()),
            macro_name: Some(plan.name.to_string()),
            text: Some(text.to_string()),
            duration_microseconds: Some(duration_us),
            show_timing: Some(show_timing),
            ..Default::default()
        });
    }

    fn publish_paused(&self, paused: bool) {
        engine().report(EngineEventPayload {
            kind: "state".into(),
            session_id: Some(self.session_id),
            macro_id: Some(self.macro_id.to_string()),
            macro_name: Some(self.macro_name.to_string()),
            state: Some(if paused { "Paused" } else { "Playing" }.into()),
            ..Default::default()
        });
    }
}

struct SessionEntry {
    id: i64,
    plan: Arc<CompiledPlan>,
    automatic: bool,
    started: Instant,
    control: Arc<SessionControl>,
    backend: Arc<LiveBackend>,
    worker: Mutex<Option<JoinHandle<()>>>,
}

#[derive(Default)]
struct PlanSet {
    by_id: HashMap<String, Arc<CompiledPlan>>,
    by_name: HashMap<String, Arc<CompiledPlan>>,
}

/// How a session should pick its destination window.
enum TargetChoice {
    /// Resolved on the session thread, because enumerating windows must not stall a hook.
    FromPlan,
    Resolved(i64),
}

pub struct Engine {
    plans: RwLock<PlanSet>,
    sessions: Mutex<Vec<Arc<SessionEntry>>>,
    next_session: AtomicI64,
    reports: Sender<Report>,
    callback: Arc<Mutex<Option<EngineCallback>>>,
    automatic_suspended: AtomicBool,
    while_held_sessions: AtomicUsize,
    recording: AtomicBool,
    confirmation: Arc<ConfirmationTracker>,
}

static ENGINE: OnceLock<Engine> = OnceLock::new();

pub fn engine() -> &'static Engine {
    ENGINE.get_or_init(Engine::new)
}

impl Engine {
    fn new() -> Self {
        let (reports, inbox) = mpsc::channel::<Report>();
        let callback: Arc<Mutex<Option<EngineCallback>>> = Arc::new(Mutex::new(None));
        let reporter_callback = Arc::clone(&callback);
        // The reporter blocks on the channel, so it costs nothing while no macro runs.
        let _ = std::thread::Builder::new()
            .name("MacroRecorder.EngineReports".into())
            .spawn(move || {
                let mut pending: Vec<(i64, EngineReceiptPayload)> = Vec::new();
                loop {
                    let next = if pending.is_empty() {
                        inbox.recv().map_err(|_| RecvTimeoutError::Disconnected)
                    } else {
                        inbox.recv_timeout(RECEIPT_FLUSH_INTERVAL)
                    };
                    match next {
                        Ok(Report::Receipt(session, receipt, planned)) => {
                            pending.push((session, to_payload(receipt, planned)));
                        }
                        Ok(Report::Event(event)) => {
                            flush_receipts(&reporter_callback, &mut pending);
                            deliver(&reporter_callback, event);
                        }
                        Err(RecvTimeoutError::Timeout) => {
                            flush_receipts(&reporter_callback, &mut pending)
                        }
                        Err(RecvTimeoutError::Disconnected) => return,
                    }
                }
            });
        Self {
            plans: RwLock::new(PlanSet::default()),
            sessions: Mutex::new(Vec::new()),
            next_session: AtomicI64::new(1),
            reports,
            callback,
            automatic_suspended: AtomicBool::new(false),
            while_held_sessions: AtomicUsize::new(0),
            recording: AtomicBool::new(false),
            confirmation: Arc::new(ConfirmationTracker::new()),
        }
    }

    pub fn set_callback(&self, callback: Option<EngineCallback>) {
        *self.callback.lock().unwrap() = callback;
    }

    pub fn report(&self, event: EngineEventPayload) {
        let _ = self.reports.send(Report::Event(event));
    }

    pub fn on_injected_observed(&self, marker: usize, timestamp: i64) {
        // The hook stamps events in microseconds.
        self.confirmation.notify_observed_at_microseconds(marker, timestamp);
    }

    #[inline]
    pub fn is_recording(&self) -> bool {
        self.recording.load(Ordering::Relaxed)
    }

    pub fn set_recording(&self, recording: bool) {
        self.recording.store(recording, Ordering::SeqCst);
    }

    /// Replaces the plan set and reconciles automatic monitors. Returns per-macro load errors.
    pub fn load_plans(&'static self, plans: Vec<EnginePlan>) -> Vec<String> {
        let mut errors = Vec::new();
        let mut next = PlanSet::default();
        {
            let current = self.plans.read().unwrap();
            for source in plans {
                // Reusing unchanged plans keeps their running automatic monitors undisturbed.
                let compiled = match current.by_id.get(&source.macro_id) {
                    Some(existing) if existing.source == source => Arc::clone(existing),
                    _ => match compile(source.clone()) {
                        Ok(plan) => Arc::new(plan),
                        Err(error) => {
                            errors.push(format!("{}: {}", source.name, error.message));
                            continue;
                        }
                    },
                };
                next.by_name
                    .insert(source.name.clone(), Arc::clone(&compiled));
                next.by_id.insert(source.macro_id, compiled);
            }
        }
        *self.plans.write().unwrap() = next;
        self.reconcile_automatic();
        errors
    }

    fn reconcile_automatic(&'static self) {
        let suspended = self.automatic_suspended.load(Ordering::SeqCst);
        let plans = self.plans.read().unwrap();
        let live = self.sessions.lock().unwrap().clone();
        for entry in live.iter().filter(|entry| entry.automatic) {
            let current = plans.by_id.get(&*entry.plan.macro_id);
            let keep = !suspended
                && current.is_some_and(|plan| {
                    Arc::ptr_eq(plan, &entry.plan)
                        && plan.source.enabled
                        && plan.source.is_automatic
                });
            if !keep {
                entry.control.cancel();
            }
        }
        if suspended {
            return;
        }
        for plan in plans.by_id.values() {
            if !plan.source.enabled || !plan.source.is_automatic {
                continue;
            }
            let running = live.iter().any(|entry| {
                entry.automatic && Arc::ptr_eq(&entry.plan, plan) && !entry.control.is_cancelled()
            });
            if !running {
                self.spawn_session(
                    Arc::clone(plan),
                    "Automatic",
                    TargetChoice::FromPlan,
                    true,
                    None,
                );
            }
        }
    }

    /// Stops automatic monitors while recording, and restarts them afterwards.
    pub fn suspend_automatic(&'static self, suspended: bool) {
        self.automatic_suspended.store(suspended, Ordering::SeqCst);
        self.reconcile_automatic();
    }

    /// Starts a macro for an explicit request, reporting target problems to the caller.
    pub fn start(
        &'static self,
        macro_id: &str,
        activation: &str,
        explicit_target: Option<i64>,
    ) -> NativeResult<i64> {
        let plan = self
            .plans
            .read()
            .unwrap()
            .by_id
            .get(macro_id)
            .cloned()
            .ok_or_else(|| {
                NativeError::invalid_argument(format!(
                    "Macro {macro_id} is not loaded in the engine"
                ))
            })?;
        let target =
            resolve_target(&plan, explicit_target).map_err(NativeError::invalid_argument)?;
        Ok(self.spawn_session(
            plan,
            activation,
            TargetChoice::Resolved(target),
            false,
            None,
        ))
    }

    /// Handles a bind press. Runs on the capture thread.
    pub fn activate(&'static self, macro_id: &str) {
        let Some(plan) = self.plans.read().unwrap().by_id.get(macro_id).cloned() else {
            return;
        };
        if !plan.source.enabled {
            return;
        }
        let running = self
            .sessions
            .lock()
            .unwrap()
            .iter()
            .find(|entry| {
                !entry.automatic
                    && *entry.plan.macro_id == *macro_id
                    && !entry.control.is_cancelled()
            })
            .cloned();
        let predecessor = match (running, plan.activation) {
            (None, _) => None,
            (Some(active), Activation::ToggleStop) => {
                if active.started.elapsed() >= REPRESS_GUARD {
                    active.control.cancel();
                }
                return;
            }
            (Some(active), Activation::Restart) => {
                active.control.cancel();
                active.worker.lock().unwrap().take()
            }
            (Some(_), _) => return,
        };
        self.spawn_session(plan, "Hotkey", TargetChoice::FromPlan, false, predecessor);
    }

    /// Ends while-held sessions whose gesture was released. Runs on the capture thread.
    #[inline]
    pub fn notify_input_released(&self, virtual_key: u32, button: Option<&str>) {
        if self.while_held_sessions.load(Ordering::Relaxed) == 0 {
            return;
        }
        for entry in self.sessions.lock().unwrap().iter() {
            if entry.plan.activation == Activation::WhileHeld
                && gesture_released(&entry.plan.source, virtual_key, button)
            {
                entry.control.cancel();
            }
        }
    }

    pub fn pause(&self, session_id: Option<i64>) -> bool {
        self.for_sessions(session_id, |entry| {
            let changed = entry.control.pause();
            if changed {
                self.report_state(entry, "Paused");
            }
            changed
        })
    }

    pub fn resume(&self, session_id: Option<i64>) -> bool {
        self.for_sessions(session_id, |entry| {
            let changed = entry.control.resume();
            if changed {
                self.report_state(entry, "Playing");
            }
            changed
        })
    }

    pub fn stop(&self, session_id: Option<i64>) -> bool {
        self.for_sessions(session_id, |entry| {
            entry.control.cancel();
            true
        })
    }

    fn for_sessions(
        &self,
        session_id: Option<i64>,
        mut apply: impl FnMut(&SessionEntry) -> bool,
    ) -> bool {
        let mut any = false;
        for entry in self.sessions.lock().unwrap().iter() {
            // Control commands without a session address manual runs, not background monitors.
            let addressed = session_id.map_or(!entry.automatic, |id| id == entry.id);
            if addressed {
                any |= apply(entry);
            }
        }
        any
    }

    /// Stops everything and releases all input right here. Safe on the capture thread.
    pub fn emergency_stop(&'static self, reason: &str) {
        self.automatic_suspended.store(true, Ordering::SeqCst);
        let live = self.sessions.lock().unwrap().clone();
        for entry in &live {
            entry.control.cancel();
        }
        for entry in &live {
            entry.backend.release_everything();
        }
        crate::release_all_runtime_inputs();
        SharedVirtualGamepad::emergency_neutral();
        self.report(EngineEventPayload {
            kind: "emergency".into(),
            reason: Some(reason.to_string()),
            ..Default::default()
        });
    }

    pub fn statuses(&self) -> Vec<EngineSessionStatus> {
        self.sessions
            .lock()
            .unwrap()
            .iter()
            .map(|entry| EngineSessionStatus {
                session_id: entry.id,
                macro_id: entry.plan.macro_id.to_string(),
                macro_name: entry.plan.name.to_string(),
                state: if entry.control.is_cancelled() {
                    "Stopping"
                } else if entry.control.is_paused() {
                    "Paused"
                } else {
                    "Playing"
                }
                .into(),
                automatic: entry.automatic,
                elapsed_microseconds: entry.started.elapsed().as_micros() as i64,
            })
            .collect()
    }

    /// Stops all sessions and waits for their threads. Called on application exit.
    pub fn shutdown(&self) {
        self.automatic_suspended.store(true, Ordering::SeqCst);
        let live = self.sessions.lock().unwrap().clone();
        for entry in &live {
            entry.control.cancel();
        }
        for entry in &live {
            if let Some(worker) = entry.worker.lock().unwrap().take() {
                let _ = worker.join();
            }
        }
        self.set_callback(None);
    }

    fn report_state(&self, entry: &SessionEntry, state: &str) {
        self.report(EngineEventPayload {
            kind: "state".into(),
            session_id: Some(entry.id),
            macro_id: Some(entry.plan.macro_id.to_string()),
            macro_name: Some(entry.plan.name.to_string()),
            state: Some(state.into()),
            elapsed_microseconds: Some(entry.started.elapsed().as_micros() as i64),
            ..Default::default()
        });
    }

    fn spawn_session(
        &'static self,
        plan: Arc<CompiledPlan>,
        activation: &str,
        target: TargetChoice,
        automatic: bool,
        predecessor: Option<JoinHandle<()>>,
    ) -> i64 {
        let id = self.next_session.fetch_add(1, Ordering::SeqCst);
        let control = Arc::new(SessionControl::new());
        let backend = Arc::new(LiveBackend {
            session_id: id,
            injector: WindowsInputInjector::with_confirmation(Arc::clone(&self.confirmation)),
            token: control.token(),
            uses_lease: AtomicBool::new(false),
            held_keys: Mutex::new(HashMap::new()),
            macro_id: Arc::clone(&plan.macro_id),
            macro_name: Arc::clone(&plan.name),
        });
        let entry = Arc::new(SessionEntry {
            id,
            plan,
            automatic,
            started: Instant::now(),
            control,
            backend,
            worker: Mutex::new(None),
        });
        self.sessions.lock().unwrap().push(Arc::clone(&entry));
        if entry.plan.activation == Activation::WhileHeld && !automatic {
            self.while_held_sessions.fetch_add(1, Ordering::SeqCst);
        }
        let thread_entry = Arc::clone(&entry);
        let activation = activation.to_string();
        let spawned = std::thread::Builder::new()
            .name("MacroRecorder.Session".into())
            .spawn(move || {
                if let Some(previous) = predecessor {
                    let _ = previous.join();
                }
                self.run_session(&thread_entry, target, activation);
            });
        match spawned {
            Ok(worker) => *entry.worker.lock().unwrap() = Some(worker),
            Err(error) => {
                self.finish_session(
                    &entry,
                    "Manual".into(),
                    Some(format!("Could not start playback: {error}")),
                );
            }
        }
        id
    }

    fn run_session(
        &'static self,
        entry: &Arc<SessionEntry>,
        target: TargetChoice,
        activation: String,
    ) {
        let _boost = TimingCriticalScope::enter();
        let resolved = match target {
            TargetChoice::Resolved(handle) => Ok(handle),
            TargetChoice::FromPlan => resolve_target(&entry.plan, None),
        };
        let target_window = match resolved {
            Ok(handle) => handle,
            Err(error) => {
                self.finish_session(entry, activation, Some(error));
                return;
            }
        };
        if entry.plan.uses_gamepad {
            // Connecting the device takes milliseconds; do it before the clock starts.
            if let Err(error) = entry.backend.ensure_gamepad() {
                self.finish_session(entry, activation, Some(error));
                return;
            }
        }
        self.report(EngineEventPayload {
            kind: "state".into(),
            session_id: Some(entry.id),
            macro_id: Some(entry.plan.macro_id.to_string()),
            macro_name: Some(entry.plan.name.to_string()),
            state: Some("Playing".into()),
            activation: Some(activation.clone()),
            total_actions: Some(
                entry
                    .plan
                    .groups
                    .iter()
                    .map(|(_, group)| group.len() as u32)
                    .sum(),
            ),
            ..Default::default()
        });
        let runner = Runner {
            backend: &*entry.backend,
            control: &entry.control,
            target_window,
        };
        let outcome: Result<(), Cancelled> = runner.run(&entry.plan, entry.automatic);
        let _ = outcome;
        entry.backend.release_everything();
        self.finish_session(entry, activation, None);
    }

    fn finish_session(&self, entry: &Arc<SessionEntry>, activation: String, error: Option<String>) {
        self.sessions
            .lock()
            .unwrap()
            .retain(|other| other.id != entry.id);
        if entry.plan.activation == Activation::WhileHeld && !entry.automatic {
            self.while_held_sessions.fetch_sub(1, Ordering::SeqCst);
        }
        self.report(EngineEventPayload {
            kind: "finished".into(),
            session_id: Some(entry.id),
            macro_id: Some(entry.plan.macro_id.to_string()),
            macro_name: Some(entry.plan.name.to_string()),
            state: Some("Idle".into()),
            activation: Some(activation),
            elapsed_microseconds: Some(entry.started.elapsed().as_micros() as i64),
            error,
            ..Default::default()
        });
    }
}

fn gesture_released(plan: &EnginePlan, virtual_key: u32, button: Option<&str>) -> bool {
    if let (Some(released), Some(bound)) = (button, plan.hotkey_button.as_deref()) {
        return released == bound;
    }
    if button.is_some() {
        return false;
    }
    if plan.hotkey_virtual_key != 0 && virtual_key == plan.hotkey_virtual_key {
        return true;
    }
    use crate::hotkeys::binding::{MOD_ALT, MOD_CONTROL, MOD_SHIFT, MOD_WIN};
    let modifier = match virtual_key {
        0x10 | 0xA0 | 0xA1 => MOD_SHIFT,
        0x11 | 0xA2 | 0xA3 => MOD_CONTROL,
        0x12 | 0xA4 | 0xA5 => MOD_ALT,
        0x5B | 0x5C => MOD_WIN,
        _ => 0,
    };
    modifier != 0 && plan.hotkey_modifiers & modifier != 0
}

fn resolve_target(plan: &CompiledPlan, explicit: Option<i64>) -> Result<i64, String> {
    let explicit = explicit.filter(|handle| *handle != 0);
    let directed = plan.specific_window || explicit.is_some();
    let mut target = explicit.unwrap_or(0);
    if directed && target == 0 {
        let process = plan.source.target_process.trim();
        let title = plan.source.target_title.trim();
        if process.is_empty() || title.is_empty() {
            return Err("Select a target window on the Playback tab first.".into());
        }
        target = crate::windows::enumeration::find_handle(process, title)
            .map_err(|error| error.message)?
            .ok_or(
                "The selected window was not found. Refresh the list and select the target again.",
            )?;
    }
    if !crate::windows::integrity::check_window_injection_integrity(target).can_inject {
        return Err("The target window has higher privileges (UIPI restriction).".into());
    }
    Ok(if directed { target } else { 0 })
}

fn to_payload(receipt: DispatchReceipt, planned: Option<i64>) -> EngineReceiptPayload {
    EngineReceiptPayload {
        id: receipt.id,
        scheduled_microseconds: receipt.scheduled_microseconds,
        planned_microseconds: planned,
        started_microseconds: receipt.started_microseconds,
        completed_microseconds: receipt.completed_microseconds,
        confirmed_microseconds: receipt.confirmed_microseconds,
        success: receipt.success,
        error: receipt.error,
    }
}

fn deliver(callback: &Mutex<Option<EngineCallback>>, event: EngineEventPayload) {
    if let Some(function) = callback.lock().unwrap().as_ref() {
        function.call(event, ThreadsafeFunctionCallMode::NonBlocking);
    }
}

fn flush_receipts(
    callback: &Mutex<Option<EngineCallback>>,
    pending: &mut Vec<(i64, EngineReceiptPayload)>,
) {
    while let Some(&(session, _)) = pending.first() {
        let boundary = pending
            .iter()
            .position(|(id, _)| *id != session)
            .unwrap_or(pending.len());
        let receipts = pending
            .drain(..boundary)
            .map(|(_, receipt)| receipt)
            .collect();
        deliver(
            callback,
            EngineEventPayload {
                kind: "receipts".into(),
                session_id: Some(session),
                receipts: Some(receipts),
                ..Default::default()
            },
        );
    }
}
