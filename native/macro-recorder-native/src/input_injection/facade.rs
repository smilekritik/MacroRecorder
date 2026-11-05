//! Unified Windows input injection facade.
//!
//! Coordinates global SendInput and targeted HWND deliveries, provides atomic
//! state tracking, ensures universal held-input release on all exit paths,
//! and correlates low-level hook confirmations.

use std::sync::Arc;
use std::time::Duration;
use windows::Win32::Foundation::{HWND, LPARAM, WPARAM};
use windows::Win32::UI::WindowsAndMessaging::PostMessageW;

use crate::error::{NativeError, NativeResult};
use crate::input_injection::confirmation::{next_marker, ConfirmationTracker};
use crate::input_injection::global_injector::{
    build_keyboard_input, build_mouse_button_input, build_mouse_move_input,
    build_mouse_wheel_input, build_text_inputs, dispatch_inputs,
};
use crate::input_injection::receipt::DispatchReceipt;
use crate::input_injection::state_tracker::{InputStateTracker, MouseButton, OwnershipChange};
use crate::input_injection::targeted_injector::{
    post_targeted_key, post_targeted_mouse_button, post_targeted_mouse_move,
    post_targeted_text, post_targeted_wheel, release_window_held_inputs,
};
use crate::input_injection::virtual_cursor::VirtualCursorManager;
use crate::runtime::cancellation::CancellationToken;
use crate::timing::clock::elapsed_microseconds;

/// High-level native input injector.
pub struct WindowsInputInjector {
    state_tracker: Arc<InputStateTracker>,
    confirmation_tracker: Arc<ConfirmationTracker>,
    cursor_manager: Arc<VirtualCursorManager>,
}

impl Default for WindowsInputInjector {
    fn default() -> Self {
        Self::new()
    }
}

impl WindowsInputInjector {
    /// Creates a new input injector instance.
    pub fn new() -> Self {
        Self {
            state_tracker: Arc::new(InputStateTracker::new()),
            confirmation_tracker: Arc::new(ConfirmationTracker::new()),
            cursor_manager: Arc::new(VirtualCursorManager::new()),
        }
    }

    /// Creates an injector with its own held-input state that shares hook confirmations.
    /// One per session lets a macro release only what it holds itself.
    pub fn with_confirmation(confirmation_tracker: Arc<ConfirmationTracker>) -> Self {
        Self {
            state_tracker: Arc::new(InputStateTracker::new()),
            confirmation_tracker,
            cursor_manager: Arc::new(VirtualCursorManager::new()),
        }
    }

    /// Injects a keyboard event (press or release) globally or targeted to a specific window.
    #[allow(clippy::too_many_arguments)]
    pub fn send_keyboard(
        &self,
        action_id: impl Into<String>,
        virtual_key: u32,
        scan_code: u32,
        extended: bool,
        is_up: bool,
        prefer_scan_codes: bool,
        target_hwnd: Option<HWND>,
        scheduled_us: i64,
        clock_start: i64,
        token: &CancellationToken,
    ) -> DispatchReceipt {
        let action_id = action_id.into();
        let started_us = elapsed_microseconds(clock_start);

        if token.is_cancelled() {
            return DispatchReceipt::failure(
                action_id,
                scheduled_us,
                started_us,
                started_us,
                "Operation was cancelled",
            );
        }

        // Targeted delivery mode (bypasses focus, no hook confirmation)
        if let Some(hwnd) = target_hwnd {
            if !hwnd.is_invalid() && !hwnd.0.is_null() {
                match post_targeted_key(hwnd, virtual_key, scan_code, extended, is_up) {
                    Ok(()) => {
                        self.state_tracker.track_window_key(hwnd, virtual_key, !is_up);
                        let completed_us = elapsed_microseconds(clock_start);
                        return DispatchReceipt::success(
                            action_id,
                            scheduled_us,
                            started_us,
                            completed_us,
                            None,
                        );
                    }
                    Err(e) => {
                        let completed_us = elapsed_microseconds(clock_start);
                        return DispatchReceipt::failure(
                            action_id,
                            scheduled_us,
                            started_us,
                            completed_us,
                            e.message,
                        );
                    }
                }
            }
        }

        // Global SendInput delivery mode
        let (ownership_change, should_send) =
            self.state_tracker.prepare_key_ownership(virtual_key, !is_up);

        if !should_send {
            let completed_us = elapsed_microseconds(clock_start);
            return DispatchReceipt::success(
                action_id,
                scheduled_us,
                started_us,
                completed_us,
                None,
            );
        }

        let marker = next_marker();
        let rx = self.confirmation_tracker.register(marker);

        let input = build_keyboard_input(
            virtual_key,
            scan_code,
            extended,
            is_up,
            prefer_scan_codes,
            marker,
        );

        match dispatch_inputs(&[input]) {
            Ok(_) => {
                let completed_us = elapsed_microseconds(clock_start);
                let confirmed_us = self.confirmation_tracker.wait_confirmation(
                    marker,
                    rx,
                    clock_start,
                    Duration::ZERO,
                );
                DispatchReceipt::success(
                    action_id,
                    scheduled_us,
                    started_us,
                    completed_us,
                    confirmed_us,
                )
            }
            Err(e) => {
                self.state_tracker.rollback_key_ownership(ownership_change);
                self.confirmation_tracker.unregister(marker);
                let completed_us = elapsed_microseconds(clock_start);
                DispatchReceipt::failure(
                    action_id,
                    scheduled_us,
                    started_us,
                    completed_us,
                    e.message,
                )
            }
        }
    }

    /// Injects mouse movements, button clicks, or wheel scrolls globally or targeted.
    #[allow(clippy::too_many_arguments)]
    pub fn send_mouse(
        &self,
        action_id: impl Into<String>,
        delta_x: i32,
        delta_y: i32,
        button: Option<MouseButton>,
        is_button_down: Option<bool>,
        wheel_delta: i32,
        is_horizontal_wheel: bool,
        is_absolute: bool,
        target_hwnd: Option<HWND>,
        scheduled_us: i64,
        clock_start: i64,
        token: &CancellationToken,
    ) -> DispatchReceipt {
        let action_id = action_id.into();
        let started_us = elapsed_microseconds(clock_start);

        if token.is_cancelled() {
            return DispatchReceipt::failure(
                action_id,
                scheduled_us,
                started_us,
                started_us,
                "Operation was cancelled",
            );
        }

        // Targeted delivery mode
        if let Some(hwnd) = target_hwnd {
            if !hwnd.is_invalid() && !hwnd.0.is_null() {
                let target_res = if let Some(btn) = button {
                    let is_down = is_button_down.unwrap_or(true);
                    let res = post_targeted_mouse_button(hwnd, btn, is_down, &self.cursor_manager);
                    if res.is_ok() {
                        self.state_tracker.track_window_button(hwnd, btn, is_down);
                    }
                    res
                } else if wheel_delta != 0 {
                    post_targeted_wheel(hwnd, wheel_delta, is_horizontal_wheel)
                } else {
                    post_targeted_mouse_move(hwnd, delta_x, delta_y, &self.cursor_manager)
                        .map(|_| ())
                };

                let completed_us = elapsed_microseconds(clock_start);
                return match target_res {
                    Ok(()) => DispatchReceipt::success(
                        action_id,
                        scheduled_us,
                        started_us,
                        completed_us,
                        None,
                    ),
                    Err(e) => DispatchReceipt::failure(
                        action_id,
                        scheduled_us,
                        started_us,
                        completed_us,
                        e.message,
                    ),
                };
            }
        }

        // Global SendInput mode
        let marker = next_marker();
        let rx = self.confirmation_tracker.register(marker);

        let (input, ownership_change) = if let Some(btn) = button {
            let is_down = is_button_down.unwrap_or(true);
            let (change, should_send) = self.state_tracker.prepare_button_ownership(btn, is_down);
            if !should_send {
                self.confirmation_tracker.unregister(marker);
                let completed_us = elapsed_microseconds(clock_start);
                return DispatchReceipt::success(
                    action_id,
                    scheduled_us,
                    started_us,
                    completed_us,
                    None,
                );
            }
            (build_mouse_button_input(btn, is_down, marker), change)
        } else if wheel_delta != 0 {
            (
                build_mouse_wheel_input(wheel_delta, is_horizontal_wheel, marker),
                OwnershipChange::None,
            )
        } else {
            (
                build_mouse_move_input(delta_x, delta_y, is_absolute, marker),
                OwnershipChange::None,
            )
        };

        match dispatch_inputs(&[input]) {
            Ok(_) => {
                let completed_us = elapsed_microseconds(clock_start);
                let confirmed_us = self.confirmation_tracker.wait_confirmation(
                    marker,
                    rx,
                    clock_start,
                    Duration::ZERO,
                );
                DispatchReceipt::success(
                    action_id,
                    scheduled_us,
                    started_us,
                    completed_us,
                    confirmed_us,
                )
            }
            Err(e) => {
                self.state_tracker.rollback_button_ownership(ownership_change);
                self.confirmation_tracker.unregister(marker);
                let completed_us = elapsed_microseconds(clock_start);
                DispatchReceipt::failure(
                    action_id,
                    scheduled_us,
                    started_us,
                    completed_us,
                    e.message,
                )
            }
        }
    }

    /// Injects layout-independent Unicode text via atomic SendInput or targeted WM_CHAR.
    pub fn send_text(
        &self,
        action_id: impl Into<String>,
        text: &str,
        target_hwnd: Option<HWND>,
        scheduled_us: i64,
        clock_start: i64,
        token: &CancellationToken,
    ) -> DispatchReceipt {
        let action_id = action_id.into();
        let started_us = elapsed_microseconds(clock_start);

        if token.is_cancelled() {
            return DispatchReceipt::failure(
                action_id,
                scheduled_us,
                started_us,
                started_us,
                "Operation was cancelled",
            );
        }

        if text.is_empty() {
            return DispatchReceipt::success(
                action_id,
                scheduled_us,
                started_us,
                started_us,
                None,
            );
        }

        // Targeted delivery mode
        if let Some(hwnd) = target_hwnd {
            if !hwnd.is_invalid() && !hwnd.0.is_null() {
                let completed_us;
                return match post_targeted_text(hwnd, Some(text)) {
                    Ok(()) => {
                        completed_us = elapsed_microseconds(clock_start);
                        DispatchReceipt::success(
                            action_id,
                            scheduled_us,
                            started_us,
                            completed_us,
                            None,
                        )
                    }
                    Err(e) => {
                        completed_us = elapsed_microseconds(clock_start);
                        DispatchReceipt::failure(
                            action_id,
                            scheduled_us,
                            started_us,
                            completed_us,
                            e.message,
                        )
                    }
                };
            }
        }

        // Global SendInput mode
        let marker = next_marker();
        let rx = self.confirmation_tracker.register(marker);

        let inputs = build_text_inputs(Some(text), marker);
        if inputs.is_empty() {
            self.confirmation_tracker.unregister(marker);
            return DispatchReceipt::success(
                action_id,
                scheduled_us,
                started_us,
                started_us,
                None,
            );
        }

        match dispatch_inputs(&inputs) {
            Ok(_) => {
                let completed_us = elapsed_microseconds(clock_start);
                let confirmed_us = self.confirmation_tracker.wait_confirmation(
                    marker,
                    rx,
                    clock_start,
                    Duration::ZERO,
                );
                DispatchReceipt::success(
                    action_id,
                    scheduled_us,
                    started_us,
                    completed_us,
                    confirmed_us,
                )
            }
            Err(e) => {
                self.confirmation_tracker.unregister(marker);
                let completed_us = elapsed_microseconds(clock_start);
                DispatchReceipt::failure(
                    action_id,
                    scheduled_us,
                    started_us,
                    completed_us,
                    e.message,
                )
            }
        }
    }

    /// Delivers an arbitrary raw Win32 message to a targeted window without activating it.
    pub fn send_targeted_message(
        &self,
        hwnd: HWND,
        msg: u32,
        w_param: usize,
        l_param: isize,
    ) -> NativeResult<()> {
        crate::input_injection::limitations::validate_targeted_window(hwnd)?;

        let posted = unsafe {
            PostMessageW(
                hwnd,
                msg,
                WPARAM(w_param),
                LPARAM(l_param),
            )
        };

        if posted.is_ok() {
            Ok(())
        } else {
            Err(NativeError::from_last_win32("PostMessageW for raw targeted message"))
        }
    }

    /// Releases all held inputs to their respective destinations.
    ///
    /// - If `target_hwnd` is `Some(hwnd)`, releases held inputs for that window only.
    /// - If `target_hwnd` is `None`, performs universal global release: releases all global
    ///   pressed keys and mouse buttons via SendInput, and dispatches release messages to
    ///   every targeted window that has held state.
    pub fn release_all(&self, target_hwnd: Option<HWND>) {
        if let Some(hwnd) = target_hwnd {
            if !hwnd.is_invalid() && !hwnd.0.is_null() {
                let (keys, buttons) = self.state_tracker.drain_window_held(hwnd);
                release_window_held_inputs(hwnd, &keys, &buttons, &self.cursor_manager);
                return;
            }
        }

        // Global release of all pressed keys
        let (global_keys, global_buttons) = self.state_tracker.drain_global_held();
        for vk in global_keys {
            let input = build_keyboard_input(vk, 0, false, true, false, 0);
            let _ = dispatch_inputs(&[input]);
        }

        for btn in global_buttons {
            let input = build_mouse_button_input(btn, false, 0);
            let _ = dispatch_inputs(&[input]);
        }

        // Release all targeted windows with active held state
        let all_windows = self.state_tracker.drain_all_windows_held();
        for (hwnd, keys, buttons) in all_windows {
            release_window_held_inputs(hwnd, &keys, &buttons, &self.cursor_manager);
        }

        self.cursor_manager.clear();
    }

    /// Called by low-level hooks when an injected event carrying a marker is observed.
    pub fn on_hook_observed(&self, marker: usize, timestamp_ticks: i64) -> bool {
        self.confirmation_tracker.notify_observed(marker, timestamp_ticks)
    }

    /// Access to confirmation tracker for hook message pumps.
    pub fn confirmation_tracker(&self) -> &Arc<ConfirmationTracker> {
        &self.confirmation_tracker
    }

    /// Access to state tracker.
    pub fn state_tracker(&self) -> &Arc<InputStateTracker> {
        &self.state_tracker
    }

    /// Access to virtual cursor manager.
    pub fn cursor_manager(&self) -> &Arc<VirtualCursorManager> {
        &self.cursor_manager
    }
}

impl Drop for WindowsInputInjector {
    fn drop(&mut self) {
        // Universal release guarantee: ensure no keys remain stuck on exit/drop
        self.release_all(None);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::timing::clock::get_timestamp;

    #[test]
    fn test_injector_creation_and_universal_release() {
        let injector = WindowsInputInjector::new();
        // Track state
        let (_, send) = injector.state_tracker.prepare_key_ownership(0x41, true);
        assert!(send);

        // Universal release should clear everything
        injector.release_all(None);
        let (keys, _) = injector.state_tracker.drain_global_held();
        assert!(keys.is_empty());
    }

    #[test]
    fn test_send_text_empty_returns_success() {
        let injector = WindowsInputInjector::new();
        let token = CancellationToken::none();
        let receipt = injector.send_text("act_1", "", None, 0, get_timestamp(), &token);
        assert!(receipt.success);
        assert!(receipt.error.is_none());
    }

    #[test]
    fn test_cancelled_token_returns_failure() {
        let injector = WindowsInputInjector::new();
        let handle = crate::runtime::cancellation::CancellationHandle::new();
        let token = handle.token();
        handle.cancel();

        let receipt = injector.send_keyboard(
            "act_2",
            0x41,
            0,
            false,
            false,
            false,
            None,
            0,
            get_timestamp(),
            &token,
        );
        assert!(!receipt.success);
        assert!(receipt.error.unwrap().contains("cancelled"));
    }
}
