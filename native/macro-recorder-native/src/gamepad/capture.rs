//! Gamepad capture service running on a dedicated high-frequency polling thread.
//!
//! Polls XInput slots 0..3 and native WGI non-XInput controllers (e.g. DualShock 4),
//! diffs button edges (Down/Up) and applies deadzone, trigger threshold, step quantization,
//! and neutral zero-release guarantees.

use std::collections::{HashMap, HashSet};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::thread::{self, JoinHandle};
use std::time::{Duration, Instant};

use crate::gamepad::ds4_mapping::{
    apply_stick_deadzone, apply_trigger_threshold, convert_wgi_axis, ds4_hat_buttons,
    map_ds4_button_label, should_emit_axis, DS4_AXIS_MAP, STICK_STEP, TRIGGER_STEP,
};
use crate::gamepad::types::{GamepadAxis, GamepadBits, GamepadButton, GamepadEvent};
use crate::gamepad::wgi::enumerate_wgi_controllers;
use crate::gamepad::xinput::get_xinput_state;

const POLL_INTERVAL: Duration = Duration::from_millis(8); // ~125 Hz
const XINPUT_SLOTS: usize = 4;

const CANONICAL_AXES: [GamepadAxis; 6] = [
    GamepadAxis::LeftStickX,
    GamepadAxis::LeftStickY,
    GamepadAxis::RightStickX,
    GamepadAxis::RightStickY,
    GamepadAxis::LeftTrigger,
    GamepadAxis::RightTrigger,
];

fn axis_index(axis: GamepadAxis) -> usize {
    match axis {
        GamepadAxis::LeftStickX => 0,
        GamepadAxis::LeftStickY => 1,
        GamepadAxis::RightStickX => 2,
        GamepadAxis::RightStickY => 3,
        GamepadAxis::LeftTrigger => 4,
        GamepadAxis::RightTrigger => 5,
        GamepadAxis::None => 0,
    }
}

pub type GamepadEventCallback = Arc<dyn Fn(GamepadEvent) + Send + Sync>;

struct RawPadState {
    pad_index: u32,
    pressed: HashSet<GamepadButton>,
    hat: i32,
    last_axes: HashMap<GamepadAxis, i32>,
}

/// Service that captures gamepad inputs via XInput and WGI on a dedicated thread.
pub struct GamepadCaptureService {
    running: Arc<AtomicBool>,
    thread_handle: Option<JoinHandle<()>>,
}

impl GamepadCaptureService {
    /// Starts the dedicated gamepad polling thread.
    pub fn new(callback: GamepadEventCallback) -> Self {
        let running = Arc::new(AtomicBool::new(true));
        let running_clone = running.clone();

        let thread_handle = thread::Builder::new()
            .name("MacroRecorder.GamepadCapture".into())
            .spawn(move || {
                let start_time = Instant::now();
                let mut prev_buttons = [0u16; XINPUT_SLOTS];
                let mut connected = [false; XINPUT_SLOTS];
                let mut last_axes = [[0i32; 6]; XINPUT_SLOTS];

                let mut raw_pads: HashMap<String, RawPadState> = HashMap::new();
                let mut next_raw_index = XINPUT_SLOTS as u32;

                while running_clone.load(Ordering::Relaxed) {
                    let now_us = start_time.elapsed().as_micros() as i64;

                    // 1. Poll XInput slots 0..3
                    for slot in 0..XINPUT_SLOTS {
                        let user_index = slot as u32;
                        match get_xinput_state(user_index) {
                            Some(state) => {
                                connected[slot] = true;
                                let pad = state.gamepad;

                                // Diff buttons
                                let prev = prev_buttons[slot];
                                if prev != pad.buttons {
                                    for &button in &GamepadBits::ALL {
                                        let flag = GamepadBits::flag(button);
                                        let was = (prev & flag) != 0;
                                        let now = (pad.buttons & flag) != 0;
                                        if was != now {
                                            if now {
                                                callback(GamepadEvent::ButtonDown {
                                                    pad_index: user_index,
                                                    button,
                                                    timestamp_microseconds: now_us,
                                                });
                                            } else {
                                                callback(GamepadEvent::ButtonUp {
                                                    pad_index: user_index,
                                                    button,
                                                    timestamp_microseconds: now_us,
                                                });
                                            }
                                        }
                                    }
                                    prev_buttons[slot] = pad.buttons;
                                }

                                // Emit axes with deadzone and step quantization
                                let check_axis = |axis: GamepadAxis,
                                                  value: i32,
                                                  last_axes: &mut [[i32; 6]; XINPUT_SLOTS]| {
                                    let idx = axis_index(axis);
                                    let last = last_axes[slot][idx];
                                    let step = match axis {
                                        GamepadAxis::LeftTrigger | GamepadAxis::RightTrigger => {
                                            TRIGGER_STEP
                                        }
                                        _ => STICK_STEP,
                                    };
                                    if should_emit_axis(value, last, step) {
                                        last_axes[slot][idx] = value;
                                        callback(GamepadEvent::Axis {
                                            pad_index: user_index,
                                            axis,
                                            value,
                                            timestamp_microseconds: now_us,
                                        });
                                    }
                                };

                                check_axis(
                                    GamepadAxis::LeftStickX,
                                    apply_stick_deadzone(pad.thumb_lx as i32),
                                    &mut last_axes,
                                );
                                check_axis(
                                    GamepadAxis::LeftStickY,
                                    apply_stick_deadzone(pad.thumb_ly as i32),
                                    &mut last_axes,
                                );
                                check_axis(
                                    GamepadAxis::RightStickX,
                                    apply_stick_deadzone(pad.thumb_rx as i32),
                                    &mut last_axes,
                                );
                                check_axis(
                                    GamepadAxis::RightStickY,
                                    apply_stick_deadzone(pad.thumb_ry as i32),
                                    &mut last_axes,
                                );
                                check_axis(
                                    GamepadAxis::LeftTrigger,
                                    apply_trigger_threshold(pad.left_trigger as i32),
                                    &mut last_axes,
                                );
                                check_axis(
                                    GamepadAxis::RightTrigger,
                                    apply_trigger_threshold(pad.right_trigger as i32),
                                    &mut last_axes,
                                );
                            }
                            None => {
                                if connected[slot] {
                                    // Pad disconnected: release all currently held buttons
                                    let prev = prev_buttons[slot];
                                    for &button in &GamepadBits::ALL {
                                        let flag = GamepadBits::flag(button);
                                        if (prev & flag) != 0 {
                                            callback(GamepadEvent::ButtonUp {
                                                pad_index: user_index,
                                                button,
                                                timestamp_microseconds: now_us,
                                            });
                                        }
                                    }
                                    // Reset last axes to rest (0)
                                    for idx in 0..6 {
                                        if last_axes[slot][idx] != 0 {
                                            callback(GamepadEvent::Axis {
                                                pad_index: user_index,
                                                axis: CANONICAL_AXES[idx],
                                                value: 0,
                                                timestamp_microseconds: now_us,
                                            });
                                            last_axes[slot][idx] = 0;
                                        }
                                    }
                                    prev_buttons[slot] = 0;
                                    connected[slot] = false;
                                }
                            }
                        }
                    }

                    // 2. Poll native WGI controllers (DualShock 4 etc.)
                    let controllers = enumerate_wgi_controllers();

                    // Remove dropped pads and release their buttons
                    let active_names: Vec<String> = controllers
                        .iter()
                        .enumerate()
                        .map(|(i, c)| format!("{}:{}", i, c.display_name()))
                        .collect();

                    raw_pads.retain(|key, state| {
                        if !active_names.contains(key) {
                            for &button in &state.pressed {
                                callback(GamepadEvent::ButtonUp {
                                    pad_index: state.pad_index,
                                    button,
                                    timestamp_microseconds: now_us,
                                });
                            }
                            for (&axis, &last_val) in &state.last_axes {
                                if last_val != 0 {
                                    callback(GamepadEvent::Axis {
                                        pad_index: state.pad_index,
                                        axis,
                                        value: 0,
                                        timestamp_microseconds: now_us,
                                    });
                                }
                            }
                            false
                        } else {
                            true
                        }
                    });

                    for (i, controller) in controllers.iter().enumerate() {
                        let key = format!("{}:{}", i, controller.display_name());
                        let state = raw_pads.entry(key).or_insert_with(|| {
                            let pad_idx = next_raw_index;
                            next_raw_index += 1;
                            RawPadState {
                                pad_index: pad_idx,
                                pressed: HashSet::new(),
                                hat: 0,
                                last_axes: HashMap::new(),
                            }
                        });

                        let btn_len = controller.button_count().max(0) as usize;
                        let sw_len = controller.switch_count().max(0) as usize;
                        let axis_len = controller.axis_count().max(0) as usize;

                        let mut buttons = vec![false; btn_len];
                        let mut switches = vec![0i32; sw_len];
                        let mut axes = vec![0.0f64; axis_len];

                        if !controller.get_current_reading(&mut buttons, &mut switches, &mut axes) {
                            continue;
                        }

                        // Poll raw buttons
                        let mut current_pressed = HashSet::new();
                        for (btn_idx, &pressed) in buttons.iter().enumerate() {
                            if !pressed {
                                continue;
                            }
                            let label = controller.get_button_label(btn_idx as i32);
                            let mapped = map_ds4_button_label(label);
                            if mapped != GamepadButton::None {
                                current_pressed.insert(mapped);
                            }
                        }

                        // Poll switch hat
                        let hat_pos = if !switches.is_empty() { switches[0] } else { 0 };
                        if hat_pos != state.hat {
                            let before = ds4_hat_buttons(state.hat);
                            let after = ds4_hat_buttons(hat_pos);
                            for &b in before {
                                if !after.contains(&b) {
                                    callback(GamepadEvent::ButtonUp {
                                        pad_index: state.pad_index,
                                        button: b,
                                        timestamp_microseconds: now_us,
                                    });
                                }
                            }
                            for &b in after {
                                if !before.contains(&b) {
                                    callback(GamepadEvent::ButtonDown {
                                        pad_index: state.pad_index,
                                        button: b,
                                        timestamp_microseconds: now_us,
                                    });
                                }
                            }
                            state.hat = hat_pos;
                        }

                        // Check new button presses
                        for &b in &current_pressed {
                            if state.pressed.insert(b) {
                                callback(GamepadEvent::ButtonDown {
                                    pad_index: state.pad_index,
                                    button: b,
                                    timestamp_microseconds: now_us,
                                });
                            }
                        }
                        // Check button releases
                        state.pressed.retain(|&b| {
                            if !current_pressed.contains(&b) {
                                callback(GamepadEvent::ButtonUp {
                                    pad_index: state.pad_index,
                                    button: b,
                                    timestamp_microseconds: now_us,
                                });
                                false
                            } else {
                                true
                            }
                        });

                        // Poll raw axes
                        for &(axis, axis_idx) in &DS4_AXIS_MAP {
                            if axis_idx >= axes.len() {
                                continue;
                            }
                            let converted = convert_wgi_axis(axis, axes[axis_idx]);
                            let value = match axis {
                                GamepadAxis::LeftTrigger | GamepadAxis::RightTrigger => {
                                    apply_trigger_threshold(converted)
                                }
                                _ => apply_stick_deadzone(converted),
                            };

                            let last = *state.last_axes.get(&axis).unwrap_or(&0);
                            let step = match axis {
                                GamepadAxis::LeftTrigger | GamepadAxis::RightTrigger => {
                                    TRIGGER_STEP
                                }
                                _ => STICK_STEP,
                            };
                            if should_emit_axis(value, last, step) {
                                state.last_axes.insert(axis, value);
                                callback(GamepadEvent::Axis {
                                    pad_index: state.pad_index,
                                    axis,
                                    value,
                                    timestamp_microseconds: now_us,
                                });
                            }
                        }
                    }

                    thread::sleep(POLL_INTERVAL);
                }
            })
            .ok();

        Self {
            running,
            thread_handle,
        }
    }

    /// Stops the polling thread cleanly within a bounded timeout.
    pub fn stop(&mut self) {
        self.running.store(false, Ordering::Relaxed);
        if let Some(handle) = self.thread_handle.take() {
            let _ = handle.join();
        }
    }
}

impl Drop for GamepadCaptureService {
    fn drop(&mut self) {
        self.stop();
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::AtomicUsize;

    #[test]
    fn test_capture_service_lifecycle() {
        let count = Arc::new(AtomicUsize::new(0));
        let count_clone = count.clone();

        let mut service = GamepadCaptureService::new(Arc::new(move |_| {
            count_clone.fetch_add(1, Ordering::Relaxed);
        }));

        // Let it poll for a short moment
        thread::sleep(Duration::from_millis(50));
        service.stop();
        // Verifies clean stop and join without deadlocks
        assert!(!service.running.load(Ordering::Relaxed));
    }
}
