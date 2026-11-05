//! Gamepad reader for UI diagnostics and "Gamepad test" window.
//!
//! Allows reading both XInput pads (Xbox) and native WGI pads (DualShock 4)
//! without requiring any driver to be installed.

use crate::gamepad::ds4_mapping::{
    convert_wgi_axis, ds4_hat_buttons, map_ds4_button_label, DS4_AXIS_MAP,
};
use crate::gamepad::types::{
    GamepadAxis, GamepadBits, GamepadButton, GamepadPadReading, GamepadSnapshot,
};
use crate::gamepad::wgi::{any_wgi_connected, enumerate_wgi_controllers};
use crate::gamepad::xinput::{
    any_xinput_connected, first_connected_xinput, get_xinput_state, read_xinput_snapshot,
};

/// Public gamepad reader matching `GamepadReader`.
pub struct GamepadReader;

impl GamepadReader {
    /// Returns the first connected XInput slot (0..3), or None if none are connected.
    pub fn first_connected() -> Option<u32> {
        first_connected_xinput()
    }

    /// Returns true if any gamepad is connected (XInput or non-XInput WGI like DS4).
    pub fn any_connected() -> bool {
        any_xinput_connected() || any_wgi_connected()
    }

    /// Takes an instant snapshot of an XInput pad slot (0..3).
    pub fn read(slot: u32) -> Option<GamepadSnapshot> {
        read_xinput_snapshot(slot)
    }

    /// Snapshots all connected pads: first XInput slots (0..3), then native WGI pads (no duplicates).
    pub fn read_all() -> Vec<GamepadPadReading> {
        let mut readings = Vec::new();

        // 1. XInput slots (0..3)
        for slot in 0..4 {
            if let Some(state) = get_xinput_state(slot) {
                let pad = state.gamepad;
                let mut pressed = Vec::new();
                for &button in &GamepadBits::ALL {
                    let flag = GamepadBits::flag(button);
                    if (pad.buttons & flag) != 0 {
                        pressed.push(button.as_str().to_string());
                    }
                }

                readings.push(GamepadPadReading {
                    source: format!("XInput · slot {slot}"),
                    pressed,
                    left_x: pad.thumb_lx as i32,
                    left_y: pad.thumb_ly as i32,
                    right_x: pad.thumb_rx as i32,
                    right_y: pad.thumb_ry as i32,
                    left_trigger: pad.left_trigger as i32,
                    right_trigger: pad.right_trigger as i32,
                    raw_axes: None,
                });
            }
        }

        // 2. Native WGI pads (DualShock 4 etc., skipping any duplicates already reported by XInput)
        let wgi_controllers = enumerate_wgi_controllers();
        for controller in wgi_controllers {
            let btn_len = controller.button_count().max(0) as usize;
            let sw_len = controller.switch_count().max(0) as usize;
            let axis_len = controller.axis_count().max(0) as usize;

            let mut buttons = vec![false; btn_len];
            let mut switches = vec![0i32; sw_len];
            let mut axes = vec![0.0f64; axis_len];

            if !controller.get_current_reading(&mut buttons, &mut switches, &mut axes) {
                continue;
            }

            let mut pressed_buttons = Vec::new();
            for (i, &pressed) in buttons.iter().enumerate() {
                if !pressed {
                    continue;
                }
                let label = controller.get_button_label(i as i32);
                let mapped = map_ds4_button_label(label);
                if mapped != GamepadButton::None {
                    let name = mapped.as_str().to_string();
                    if !pressed_buttons.contains(&name) {
                        pressed_buttons.push(name);
                    }
                }
            }

            if !switches.is_empty() {
                for &hat_btn in ds4_hat_buttons(switches[0]) {
                    let name = hat_btn.as_str().to_string();
                    if !pressed_buttons.contains(&name) {
                        pressed_buttons.push(name);
                    }
                }
            }

            let get_axis = |axis: GamepadAxis| -> i32 {
                for &(map_axis, index) in &DS4_AXIS_MAP {
                    if map_axis == axis && index < axes.len() {
                        return convert_wgi_axis(axis, axes[index]);
                    }
                }
                0
            };

            let raw_axes_str = if axes.is_empty() {
                None
            } else {
                Some(
                    axes.iter()
                        .enumerate()
                        .map(|(i, val)| format!("[{i}] {val:.2}"))
                        .collect::<Vec<_>>()
                        .join("  "),
                )
            };

            let name = controller.display_name();
            let source = if name.is_empty() || name == "gamepad" {
                "WGI · gamepad".to_string()
            } else {
                format!("WGI · {name}")
            };

            readings.push(GamepadPadReading {
                source,
                pressed: pressed_buttons,
                left_x: get_axis(GamepadAxis::LeftStickX),
                left_y: get_axis(GamepadAxis::LeftStickY),
                right_x: get_axis(GamepadAxis::RightStickX),
                right_y: get_axis(GamepadAxis::RightStickY),
                left_trigger: get_axis(GamepadAxis::LeftTrigger),
                right_trigger: get_axis(GamepadAxis::RightTrigger),
                raw_axes: raw_axes_str,
            });
        }

        readings
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_read_all_returns_bounded_list() {
        let readings = GamepadReader::read_all();
        // Even with no controllers, should return an empty or populated vector without crashing
        assert!(readings.len() <= 16);
    }

    #[test]
    fn test_any_connected_matches_first_connected_on_empty() {
        if GamepadReader::first_connected().is_none() && !any_wgi_connected() {
            assert!(!GamepadReader::any_connected());
        }
    }
}
