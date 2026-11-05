//! The playback loop: deadlines, repeats, conditions, and nested macros.

use std::collections::HashSet;
use std::sync::Arc;

use crate::engine::control::{ticks_to_us, us_to_ticks, Cancelled, SessionControl};
use crate::engine::plan::{Action, CompiledEvent, CompiledPlan, FocusLoss};
use crate::input_injection::receipt::DispatchReceipt;
use crate::timing::clock::get_timestamp;

pub const MAX_SUB_MACRO_DEPTH: usize = 16;
const PIXEL_POLL_US: i64 = 10_000;
const KEY_POLL_US: i64 = 10_000;
const WINDOW_POLL_US: i64 = 50_000;
const FOCUS_POLL_US: i64 = 100_000;

/// Everything a run needs from the outside world.
pub trait EngineBackend: Send + Sync {
    /// Sends one input event. Must not block beyond the OS call.
    fn dispatch(
        &self,
        event: &CompiledEvent,
        authored_us: i64,
        clock_start: i64,
        prefer_scan_codes: bool,
        target_window: i64,
    ) -> DispatchReceipt;
    fn pixel_rgb(&self, x: i32, y: i32) -> Result<i32, String>;
    fn foreground_matches(&self, process: &str, title: &str) -> bool;
    fn key_down(&self, vk: u32) -> bool;
    fn resolve_macro(&self, name: &str) -> Option<Arc<CompiledPlan>>;
    fn publish_receipt(&self, receipt: DispatchReceipt, planned_us: Option<i64>);
    fn publish_overlay(&self, plan: &CompiledPlan, text: &str, duration_us: i64, show_timing: bool);
    fn publish_paused(&self, paused: bool);
}

struct XorShift(u64);

impl XorShift {
    fn seeded() -> Self {
        Self((get_timestamp() as u64) | 1)
    }

    /// Uniform value in `-span..=span`.
    fn between(&mut self, span: i64) -> i64 {
        self.0 ^= self.0 << 13;
        self.0 ^= self.0 >> 7;
        self.0 ^= self.0 << 17;
        (self.0 % (2 * span as u64 + 1)) as i64 - span
    }
}

pub struct Runner<'a, B: EngineBackend> {
    pub backend: &'a B,
    pub control: &'a SessionControl,
    pub target_window: i64,
}

impl<B: EngineBackend> Runner<'_, B> {
    pub fn run(&self, plan: &Arc<CompiledPlan>, automatic: bool) -> Result<(), Cancelled> {
        let mut stack = HashSet::new();
        stack.insert(Arc::clone(&plan.macro_id));
        self.play(plan, automatic, 0, &mut stack)
    }

    fn play(
        &self,
        plan: &Arc<CompiledPlan>,
        automatic: bool,
        depth: usize,
        stack: &mut HashSet<Arc<str>>,
    ) -> Result<(), Cancelled> {
        // A nested endless repeat would hang its parent, so it becomes a single pass.
        let repeat_forever = depth == 0 && (automatic || plan.repeat_count == 0);
        let repeats = plan.repeat_count.max(1);
        let mut random = XorShift::seeded();
        let mut repeat = 0i64;
        while repeat_forever || repeat < repeats {
            self.control.check()?;
            self.play_pass(plan, depth, stack, &mut random)?;
            repeat += 1;
            let delay_ms = if automatic {
                plan.automatic_cooldown_ms
            } else {
                plan.repeat_delay_ms
            };
            if repeat_forever || repeat < repeats {
                // Even an instant endless macro must not flood the system from a boosted thread.
                let delay_us = (delay_ms * 1000).max(if repeat_forever { 1000 } else { 0 });
                if delay_us > 0 {
                    self.wait_deadline(get_timestamp(), delay_us, 0, self.control.paused_ticks())?;
                }
            }
        }
        Ok(())
    }

    fn play_pass(
        &self,
        plan: &Arc<CompiledPlan>,
        depth: usize,
        stack: &mut HashSet<Arc<str>>,
        random: &mut XorShift,
    ) -> Result<(), Cancelled> {
        let start = get_timestamp();
        let pause_at_start = self.control.paused_ticks();
        // Time spent inside waits and sub-macros does not consume authored intervals.
        let mut blocked = 0i64;
        let mut previous_planned = 0i64;
        for (time, group) in &plan.groups {
            if depth == 0 && self.target_window == 0 {
                blocked += self.guard_focus(plan)?;
            }
            let authored_us = (*time as f64 / plan.speed) as i64;
            let mut planned_us = authored_us;
            if plan.jitter_us > 0 {
                planned_us = (authored_us + random.between(plan.jitter_us))
                    .max(0)
                    .max(previous_planned);
            }
            previous_planned = planned_us;
            let planned_tag = (planned_us != authored_us).then_some(planned_us);
            self.wait_deadline(start, planned_us, blocked, pause_at_start)?;

            for event in group {
                self.control.wait_while_paused()?;
                match &event.action {
                    action if action.is_blocking_wait() => {
                        let begun = get_timestamp();
                        let pause_before = self.control.paused_ticks();
                        let outcome = self.wait_condition(action)?;
                        let finished = get_timestamp();
                        let pause_after = self.control.paused_ticks();
                        let actual =
                            ticks_to_us(finished - start - blocked - pause_after + pause_at_start);
                        blocked += finished - begun - (pause_after - pause_before);
                        self.publish_blocking(event, authored_us, actual, outcome, planned_tag);
                    }
                    Action::RunMacro(name) => {
                        let begun = get_timestamp();
                        let pause_before = self.control.paused_ticks();
                        let outcome = self.run_sub_macro(name, depth, stack)?;
                        let finished = get_timestamp();
                        let pause_after = self.control.paused_ticks();
                        let actual =
                            ticks_to_us(finished - start - blocked - pause_after + pause_at_start);
                        blocked += finished - begun - (pause_after - pause_before);
                        self.publish_blocking(event, authored_us, actual, outcome, planned_tag);
                    }
                    Action::Overlay {
                        text,
                        duration_us,
                        show_timing,
                    } => {
                        // Display is fire-and-forget; following actions keep their own time.
                        let scaled = (*duration_us as f64 / plan.speed) as i64;
                        self.backend
                            .publish_overlay(plan, text, scaled, *show_timing);
                        self.publish_marker(event, authored_us, planned_us, planned_tag);
                    }
                    Action::Marker => {
                        self.publish_marker(event, authored_us, planned_us, planned_tag)
                    }
                    _ => {
                        let paused_since = self.control.paused_ticks() - pause_at_start;
                        let receipt = self.backend.dispatch(
                            event,
                            authored_us,
                            start + blocked + paused_since,
                            plan.prefer_scan_codes,
                            self.target_window,
                        );
                        self.backend.publish_receipt(receipt, planned_tag);
                    }
                }
            }
        }
        let finish_us = (plan.duration_us as f64 / plan.speed) as i64;
        if finish_us > 0 {
            self.wait_deadline(start, finish_us, blocked, pause_at_start)?;
        }
        Ok(())
    }

    fn publish_marker(
        &self,
        event: &CompiledEvent,
        authored_us: i64,
        planned_us: i64,
        tag: Option<i64>,
    ) {
        let receipt = DispatchReceipt::success(
            event.id.to_string(),
            authored_us,
            planned_us,
            planned_us,
            None,
        );
        self.backend.publish_receipt(receipt, tag);
    }

    fn publish_blocking(
        &self,
        event: &CompiledEvent,
        authored_us: i64,
        actual_us: i64,
        outcome: Result<(), String>,
        tag: Option<i64>,
    ) {
        let id = event.id.to_string();
        let receipt = match outcome {
            Ok(()) => {
                DispatchReceipt::success(id, authored_us, actual_us, actual_us, Some(actual_us))
            }
            Err(error) => DispatchReceipt::failure(id, authored_us, actual_us, actual_us, error),
        };
        self.backend.publish_receipt(receipt, tag);
    }

    /// Holds one deadline across any number of pauses.
    fn wait_deadline(
        &self,
        start: i64,
        target_us: i64,
        blocked: i64,
        pause_at_start: i64,
    ) -> Result<(), Cancelled> {
        loop {
            self.control.wait_while_paused()?;
            let paused = self.control.paused_ticks() - pause_at_start;
            self.control
                .wait_until(start + blocked + paused + us_to_ticks(target_us))?;
            self.control.wait_while_paused()?;
            // A pause can begin and end while the thread sleeps towards the old deadline.
            if self.control.paused_ticks() - pause_at_start == paused {
                return Ok(());
            }
        }
    }

    /// Applies focus-loss policy; returns the time the macro was held back.
    fn guard_focus(&self, plan: &CompiledPlan) -> Result<i64, Cancelled> {
        if !plan.specific_window || plan.focus_loss == FocusLoss::Continue {
            return Ok(0);
        }
        let is_active = || {
            self.backend
                .foreground_matches(&plan.source.target_process, &plan.source.target_title)
        };
        if is_active() {
            return Ok(0);
        }
        if plan.focus_loss == FocusLoss::Stop {
            self.control.cancel();
            return Err(Cancelled);
        }
        let held_since = get_timestamp();
        self.backend.publish_paused(true);
        while !is_active() {
            self.control.sleep_interruptible(FOCUS_POLL_US)?;
            self.control.wait_while_paused()?;
        }
        self.backend.publish_paused(false);
        Ok(get_timestamp() - held_since)
    }

    fn wait_condition(&self, action: &Action) -> Result<Result<(), String>, Cancelled> {
        match action {
            Action::WaitPixel {
                x,
                y,
                color,
                must_match,
                timeout_ms,
            } => self.poll(*timeout_ms, PIXEL_POLL_US, || {
                let current = self.backend.pixel_rgb(*x, *y)? & 0x00FF_FFFF;
                Ok((current == *color) == *must_match)
            }),
            Action::WaitWindow {
                process,
                title,
                timeout_ms,
            } => self.poll(*timeout_ms, WINDOW_POLL_US, || {
                Ok(self.backend.foreground_matches(process, title))
            }),
            Action::WaitKey { vk, timeout_ms } => {
                if *vk == 0 || *vk > 255 {
                    return Ok(Err(
                        "Key state detection is unavailable or the key is invalid.".into(),
                    ));
                }
                self.poll(*timeout_ms, KEY_POLL_US, || Ok(self.backend.key_down(*vk)))
            }
            _ => Ok(Ok(())),
        }
    }

    fn poll(
        &self,
        timeout_ms: i64,
        poll_us: i64,
        mut condition: impl FnMut() -> Result<bool, String>,
    ) -> Result<Result<(), String>, Cancelled> {
        let mut deadline =
            (timeout_ms > 0).then(|| get_timestamp() + us_to_ticks(timeout_ms * 1000));
        loop {
            let pause_before = self.control.paused_ticks();
            self.control.wait_while_paused()?;
            let held = self.control.paused_ticks() - pause_before;
            deadline = deadline.map(|value| value + held);
            match condition() {
                Ok(true) => return Ok(Ok(())),
                Ok(false) => {}
                Err(error) => return Ok(Err(error)),
            }
            if deadline.is_some_and(|value| get_timestamp() >= value) {
                return Ok(Err("Wait timed out".into()));
            }
            self.control.sleep_interruptible(poll_us)?;
        }
    }

    fn run_sub_macro(
        &self,
        name: &str,
        depth: usize,
        stack: &mut HashSet<Arc<str>>,
    ) -> Result<Result<(), String>, Cancelled> {
        let Some(sub) = self.backend.resolve_macro(name) else {
            return Ok(Err(format!("Sub-macro “{name}” not found")));
        };
        if depth + 1 > MAX_SUB_MACRO_DEPTH {
            return Ok(Err("Macro call nesting is too deep.".into()));
        }
        if !stack.insert(Arc::clone(&sub.macro_id)) {
            return Ok(Err(format!("Cyclic call of macro “{}”", sub.name)));
        }
        let result = self.play(&sub, false, depth + 1, stack);
        stack.remove(&sub.macro_id);
        result.map(|()| Ok(()))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::engine::plan::{compile, Activation, EnginePlan, EnginePlanEvent};
    use std::collections::HashMap;
    use std::sync::atomic::{AtomicBool, Ordering};
    use std::sync::Mutex;
    use std::time::{Duration, Instant};

    #[derive(Default)]
    struct FakeBackend {
        sent: Mutex<Vec<(String, Instant)>>,
        receipts: Mutex<Vec<(DispatchReceipt, Option<i64>)>>,
        overlays: Mutex<Vec<String>>,
        macros: Mutex<HashMap<String, Arc<CompiledPlan>>>,
        key_pressed: AtomicBool,
        pixel: Mutex<i32>,
        foreground: AtomicBool,
        focus_events: Mutex<Vec<bool>>,
    }

    impl EngineBackend for FakeBackend {
        fn dispatch(
            &self,
            event: &CompiledEvent,
            authored_us: i64,
            clock_start: i64,
            _: bool,
            _: i64,
        ) -> DispatchReceipt {
            self.sent
                .lock()
                .unwrap()
                .push((event.id.to_string(), Instant::now()));
            let at = ticks_to_us(get_timestamp() - clock_start);
            DispatchReceipt::success(event.id.to_string(), authored_us, at, at, None)
        }
        fn pixel_rgb(&self, _: i32, _: i32) -> Result<i32, String> {
            Ok(*self.pixel.lock().unwrap())
        }
        fn foreground_matches(&self, _: &str, _: &str) -> bool {
            self.foreground.load(Ordering::SeqCst)
        }
        fn key_down(&self, _: u32) -> bool {
            self.key_pressed.load(Ordering::SeqCst)
        }
        fn resolve_macro(&self, name: &str) -> Option<Arc<CompiledPlan>> {
            self.macros.lock().unwrap().get(name).cloned()
        }
        fn publish_receipt(&self, receipt: DispatchReceipt, planned_us: Option<i64>) {
            self.receipts.lock().unwrap().push((receipt, planned_us));
        }
        fn publish_overlay(&self, _: &CompiledPlan, text: &str, _: i64, _: bool) {
            self.overlays.lock().unwrap().push(text.to_string());
        }
        fn publish_paused(&self, paused: bool) {
            self.focus_events.lock().unwrap().push(paused);
        }
    }

    fn key(id: &str, time_ms: i64) -> EnginePlanEvent {
        EnginePlanEvent {
            id: id.into(),
            kind: "KeyDown".into(),
            time_microseconds: time_ms * 1000,
            virtual_key: Some(0x87),
            ..Default::default()
        }
    }

    fn plan(id: &str, events: Vec<EnginePlanEvent>) -> EnginePlan {
        EnginePlan {
            macro_id: id.into(),
            name: id.into(),
            speed: 1.0,
            repeat_count: 1,
            activation_mode: "Once".into(),
            target_mode: "ForegroundAtStart".into(),
            focus_loss: "Continue".into(),
            enabled: true,
            events,
            ..Default::default()
        }
    }

    fn run_plan(
        backend: &FakeBackend,
        source: EnginePlan,
        control: &SessionControl,
    ) -> Result<(), Cancelled> {
        let compiled = Arc::new(compile(source).unwrap());
        Runner {
            backend,
            control,
            target_window: 0,
        }
        .run(&compiled, false)
    }

    fn sent_ids(backend: &FakeBackend) -> Vec<String> {
        backend
            .sent
            .lock()
            .unwrap()
            .iter()
            .map(|(id, _)| id.clone())
            .collect()
    }

    #[test]
    fn dispatches_in_order_at_authored_offsets() {
        let backend = FakeBackend::default();
        let control = SessionControl::new();
        let begun = Instant::now();
        run_plan(
            &backend,
            plan("a", vec![key("1", 0), key("2", 30), key("3", 60)]),
            &control,
        )
        .unwrap();
        let sent = backend.sent.lock().unwrap();
        assert_eq!(
            sent.iter().map(|(id, _)| id.as_str()).collect::<Vec<_>>(),
            ["1", "2", "3"]
        );
        let last = sent[2].1 - begun;
        assert!(last >= Duration::from_millis(60), "too early: {last:?}");
        assert!(last < Duration::from_millis(120), "too late: {last:?}");
    }

    #[test]
    fn speed_scales_time_and_repeats_restart_the_clock() {
        let backend = FakeBackend::default();
        let control = SessionControl::new();
        let mut source = plan("a", vec![key("1", 40)]);
        source.speed = 2.0;
        source.repeat_count = 2;
        source.repeat_delay_milliseconds = 20;
        let begun = Instant::now();
        run_plan(&backend, source, &control).unwrap();
        assert_eq!(sent_ids(&backend), ["1", "1"]);
        // 20 ms + repeat delay 20 ms + 20 ms.
        let total = backend.sent.lock().unwrap()[1].1 - begun;
        assert!(total >= Duration::from_millis(60), "too early: {total:?}");
    }

    #[test]
    fn jitter_stays_monotonic_and_is_tagged() {
        let backend = FakeBackend::default();
        let control = SessionControl::new();
        let mut source = plan("a", (0..20).map(|i| key(&i.to_string(), i)).collect());
        source.randomize_timing = true;
        source.jitter_milliseconds = 5;
        run_plan(&backend, source, &control).unwrap();
        let receipts = backend.receipts.lock().unwrap();
        let tags: Vec<i64> = receipts
            .iter()
            .map(|(r, tag)| tag.unwrap_or(r.scheduled_microseconds))
            .collect();
        assert!(
            tags.windows(2).all(|pair| pair[0] <= pair[1]),
            "reordered: {tags:?}"
        );
        assert!(receipts.iter().any(|(_, tag)| tag.is_some()));
    }

    #[test]
    fn pause_shifts_following_deadlines_and_blocks_dispatch() {
        let backend = Arc::new(FakeBackend::default());
        let control = Arc::new(SessionControl::new());
        let (run_backend, run_control) = (Arc::clone(&backend), Arc::clone(&control));
        let worker = std::thread::spawn(move || {
            run_plan(
                &run_backend,
                plan("a", vec![key("1", 0), key("2", 60)]),
                &run_control,
            )
        });
        std::thread::sleep(Duration::from_millis(20));
        assert!(control.pause());
        std::thread::sleep(Duration::from_millis(100));
        assert_eq!(sent_ids(&backend), ["1"], "dispatched while paused");
        assert!(control.resume());
        worker.join().unwrap().unwrap();
        let sent = backend.sent.lock().unwrap();
        let gap = sent[1].1 - sent[0].1;
        assert!(
            gap >= Duration::from_millis(155),
            "pause not added: {gap:?}"
        );
    }

    #[test]
    fn stop_interrupts_a_long_wait_immediately() {
        let backend = Arc::new(FakeBackend::default());
        let control = Arc::new(SessionControl::new());
        let (run_backend, run_control) = (Arc::clone(&backend), Arc::clone(&control));
        let worker = std::thread::spawn(move || {
            run_plan(
                &run_backend,
                plan("a", vec![key("1", 60_000)]),
                &run_control,
            )
        });
        std::thread::sleep(Duration::from_millis(20));
        let begun = Instant::now();
        control.cancel();
        assert_eq!(worker.join().unwrap(), Err(Cancelled));
        assert!(
            begun.elapsed() < Duration::from_millis(20),
            "slow stop: {:?}",
            begun.elapsed()
        );
        assert!(sent_ids(&backend).is_empty());
    }

    #[test]
    fn stop_interrupts_while_paused() {
        let backend = Arc::new(FakeBackend::default());
        let control = Arc::new(SessionControl::new());
        let (run_backend, run_control) = (Arc::clone(&backend), Arc::clone(&control));
        let worker = std::thread::spawn(move || {
            run_plan(
                &run_backend,
                plan("a", vec![key("1", 10), key("2", 20)]),
                &run_control,
            )
        });
        control.pause();
        std::thread::sleep(Duration::from_millis(40));
        control.cancel();
        assert_eq!(worker.join().unwrap(), Err(Cancelled));
        assert!(sent_ids(&backend).len() <= 1);
    }

    #[test]
    fn wait_time_does_not_consume_following_intervals() {
        let backend = Arc::new(FakeBackend::default());
        let control = Arc::new(SessionControl::new());
        let wait = EnginePlanEvent {
            id: "w".into(),
            kind: "WaitForKey".into(),
            time_microseconds: 10_000,
            wait_key: Some(0x41),
            ..Default::default()
        };
        let (run_backend, run_control) = (Arc::clone(&backend), Arc::clone(&control));
        let worker = std::thread::spawn(move || {
            run_plan(
                &run_backend,
                plan("a", vec![wait, key("after", 60)]),
                &run_control,
            )
        });
        std::thread::sleep(Duration::from_millis(100));
        assert!(sent_ids(&backend).is_empty());
        let released = Instant::now();
        backend.key_pressed.store(true, Ordering::SeqCst);
        worker.join().unwrap().unwrap();
        let after = backend.sent.lock().unwrap()[0].1 - released;
        // 50 ms remain after the wait authored at 10 ms.
        assert!(
            after >= Duration::from_millis(40),
            "interval consumed: {after:?}"
        );
    }

    #[test]
    fn wait_timeout_continues_and_reports_failure() {
        let backend = FakeBackend::default();
        let control = SessionControl::new();
        let wait = EnginePlanEvent {
            id: "w".into(),
            kind: "WaitForPixelGone".into(),
            timeout_milliseconds: Some(30),
            ..Default::default()
        };
        run_plan(&backend, plan("a", vec![wait, key("after", 1)]), &control).unwrap();
        let receipts = backend.receipts.lock().unwrap();
        assert!(!receipts[0].0.success);
        assert_eq!(receipts[0].0.error.as_deref(), Some("Wait timed out"));
        assert_eq!(sent_ids(&backend), ["after"]);
    }

    #[test]
    fn sub_macro_runs_once_and_cycles_are_refused() {
        let backend = FakeBackend::default();
        let control = SessionControl::new();
        let call = |id: &str, target: &str| EnginePlanEvent {
            id: id.into(),
            kind: "RunMacro".into(),
            sub_macro: Some(target.into()),
            ..Default::default()
        };
        let mut sub = plan("sub", vec![key("inner", 10), call("back", "top")]);
        sub.repeat_count = 0;
        let top = plan("top", vec![call("c", "sub"), key("outer", 1)]);
        let compiled_top = Arc::new(compile(top).unwrap());
        {
            let mut macros = backend.macros.lock().unwrap();
            macros.insert("sub".into(), Arc::new(compile(sub).unwrap()));
            macros.insert("top".into(), Arc::clone(&compiled_top));
        }
        Runner {
            backend: &backend,
            control: &control,
            target_window: 0,
        }
        .run(&compiled_top, false)
        .unwrap();
        assert_eq!(sent_ids(&backend), ["inner", "outer"]);
        let receipts = backend.receipts.lock().unwrap();
        let cycle = receipts.iter().find(|(r, _)| r.id == "back").unwrap();
        assert!(cycle.0.error.as_deref().unwrap().contains("Cyclic"));
    }

    #[test]
    fn missing_sub_macro_is_a_failed_receipt_not_a_crash() {
        let backend = FakeBackend::default();
        let control = SessionControl::new();
        let call = EnginePlanEvent {
            id: "c".into(),
            kind: "RunMacro".into(),
            sub_macro: Some("nope".into()),
            ..Default::default()
        };
        run_plan(&backend, plan("a", vec![call, key("after", 1)]), &control).unwrap();
        assert!(!backend.receipts.lock().unwrap()[0].0.success);
        assert_eq!(sent_ids(&backend), ["after"]);
    }

    #[test]
    fn overlay_does_not_delay_the_next_action_but_keeps_macro_duration() {
        let backend = FakeBackend::default();
        let control = SessionControl::new();
        let overlay = EnginePlanEvent {
            id: "o".into(),
            kind: "OverlayText".into(),
            text: Some("hello".into()),
            duration_microseconds: Some(50_000),
            ..Default::default()
        };
        let mut source = plan("a", vec![overlay, key("k", 1)]);
        source.duration_microseconds = 50_000;
        let begun = Instant::now();
        run_plan(&backend, source, &control).unwrap();
        assert_eq!(backend.overlays.lock().unwrap().as_slice(), ["hello"]);
        assert!(backend.sent.lock().unwrap()[0].1 - begun < Duration::from_millis(30));
        assert!(begun.elapsed() >= Duration::from_millis(50));
    }

    #[test]
    fn focus_loss_stop_cancels_and_pause_waits() {
        let backend = FakeBackend::default();
        let control = SessionControl::new();
        let mut source = plan("a", vec![key("1", 0)]);
        source.target_mode = "SpecificWindow".into();
        source.focus_loss = "Stop".into();
        assert_eq!(run_plan(&backend, source, &control), Err(Cancelled));
        assert!(sent_ids(&backend).is_empty());

        let backend = Arc::new(FakeBackend::default());
        let control = Arc::new(SessionControl::new());
        let mut source = plan("a", vec![key("1", 0)]);
        source.target_mode = "SpecificWindow".into();
        source.focus_loss = "Pause".into();
        let (run_backend, run_control) = (Arc::clone(&backend), Arc::clone(&control));
        let worker = std::thread::spawn(move || run_plan(&run_backend, source, &run_control));
        std::thread::sleep(Duration::from_millis(30));
        assert!(sent_ids(&backend).is_empty());
        backend.foreground.store(true, Ordering::SeqCst);
        worker.join().unwrap().unwrap();
        assert_eq!(sent_ids(&backend), ["1"]);
        assert_eq!(
            backend.focus_events.lock().unwrap().as_slice(),
            [true, false]
        );
    }

    #[test]
    fn automatic_macro_loops_on_trigger_until_stopped() {
        let backend = Arc::new(FakeBackend::default());
        let control = Arc::new(SessionControl::new());
        *backend.pixel.lock().unwrap() = 0x112233;
        let trigger = EnginePlanEvent {
            id: "t".into(),
            kind: "PixelColorTrigger".into(),
            pixel_color: Some(0x112233),
            cooldown_milliseconds: Some(5),
            ..Default::default()
        };
        let compiled = Arc::new(compile(plan("a", vec![trigger, key("k", 1)])).unwrap());
        let (run_backend, run_control) = (Arc::clone(&backend), Arc::clone(&control));
        let worker = std::thread::spawn(move || {
            Runner {
                backend: &*run_backend,
                control: &*run_control,
                target_window: 0,
            }
            .run(&compiled, true)
        });
        std::thread::sleep(Duration::from_millis(50));
        control.cancel();
        assert_eq!(worker.join().unwrap(), Err(Cancelled));
        assert!(sent_ids(&backend).len() >= 2);
    }

    #[test]
    fn comments_are_dropped_and_unknown_kinds_are_refused() {
        let comment = EnginePlanEvent {
            id: "c".into(),
            kind: "Comment".into(),
            ..Default::default()
        };
        assert!(compile(plan("a", vec![comment])).unwrap().groups.is_empty());
        let bad = EnginePlanEvent {
            id: "x".into(),
            kind: "Nope".into(),
            ..Default::default()
        };
        assert!(compile(plan("a", vec![bad])).is_err());
    }

    #[test]
    fn endless_macro_is_forced_to_toggle_stop() {
        let mut source = plan("a", vec![key("1", 0)]);
        source.repeat_count = 0;
        assert_eq!(compile(source).unwrap().activation, Activation::ToggleStop);
    }
}
