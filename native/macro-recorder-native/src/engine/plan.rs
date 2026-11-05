//! Plans handed over from TypeScript and their compiled in-engine form.

use std::sync::Arc;

use napi_derive::napi;

use crate::error::{NativeError, NativeResult};
use crate::gamepad::types::{GamepadAxis, GamepadButton};
use crate::input_injection::state_tracker::MouseButton;

/// One macro event as supplied by TypeScript. Only the fields of its `kind` are read.
#[napi(object)]
#[derive(Debug, Clone, PartialEq, Default)]
pub struct EnginePlanEvent {
    pub id: String,
    pub kind: String,
    pub time_microseconds: i64,
    pub virtual_key: Option<u32>,
    pub scan_code: Option<u32>,
    pub extended: Option<bool>,
    pub button: Option<String>,
    pub delta_x: Option<i32>,
    pub delta_y: Option<i32>,
    pub absolute: Option<bool>,
    pub wheel_delta: Option<i32>,
    pub text: Option<String>,
    pub duration_microseconds: Option<i64>,
    pub show_timing: Option<bool>,
    pub pixel_x: Option<i32>,
    pub pixel_y: Option<i32>,
    pub pixel_color: Option<i32>,
    pub cooldown_milliseconds: Option<i64>,
    pub timeout_milliseconds: Option<i64>,
    pub wait_process: Option<String>,
    pub wait_title: Option<String>,
    pub wait_key: Option<u32>,
    pub sub_macro: Option<String>,
    pub gamepad_button: Option<String>,
    pub gamepad_axis: Option<String>,
    pub axis_value: Option<i32>,
}

/// A complete macro as supplied by TypeScript, with events already normalized.
#[napi(object)]
#[derive(Debug, Clone, PartialEq, Default)]
pub struct EnginePlan {
    pub macro_id: String,
    pub name: String,
    pub speed: f64,
    pub repeat_count: i64,
    pub repeat_delay_milliseconds: i64,
    pub randomize_timing: bool,
    pub jitter_milliseconds: i64,
    pub prefer_scan_codes: bool,
    pub activation_mode: String,
    pub target_mode: String,
    pub focus_loss: String,
    pub target_process: String,
    pub target_title: String,
    pub duration_microseconds: i64,
    pub is_automatic: bool,
    pub enabled: bool,
    pub hotkey_virtual_key: u32,
    pub hotkey_button: Option<String>,
    pub hotkey_modifiers: u32,
    pub events: Vec<EnginePlanEvent>,
}

#[derive(Debug, Clone, PartialEq)]
pub enum Action {
    Key {
        vk: u32,
        scan: u32,
        extended: bool,
        is_up: bool,
    },
    MouseButton {
        button: MouseButton,
        is_down: bool,
    },
    MouseMove {
        dx: i32,
        dy: i32,
        absolute: bool,
    },
    Wheel {
        delta: i32,
        horizontal: bool,
    },
    Text(String),
    GamepadButton {
        button: GamepadButton,
        is_down: bool,
    },
    GamepadAxis {
        axis: GamepadAxis,
        value: i32,
    },
    /// No input and no authored wait of its own.
    Marker,
    Overlay {
        text: String,
        duration_us: i64,
        show_timing: bool,
    },
    WaitPixel {
        x: i32,
        y: i32,
        color: i32,
        must_match: bool,
        timeout_ms: i64,
    },
    WaitWindow {
        process: String,
        title: String,
        timeout_ms: i64,
    },
    WaitKey {
        vk: u32,
        timeout_ms: i64,
    },
    RunMacro(String),
}

impl Action {
    pub fn is_blocking_wait(&self) -> bool {
        matches!(
            self,
            Self::WaitPixel { .. } | Self::WaitWindow { .. } | Self::WaitKey { .. }
        )
    }

    pub fn is_gamepad(&self) -> bool {
        matches!(self, Self::GamepadButton { .. } | Self::GamepadAxis { .. })
    }
}

#[derive(Debug, Clone)]
pub struct CompiledEvent {
    pub id: Arc<str>,
    pub time_us: i64,
    pub action: Action,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum FocusLoss {
    Stop,
    Pause,
    Continue,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Activation {
    Once,
    WhileHeld,
    ToggleStop,
    Restart,
}

#[derive(Debug)]
pub struct CompiledPlan {
    pub source: EnginePlan,
    pub macro_id: Arc<str>,
    pub name: Arc<str>,
    pub speed: f64,
    pub repeat_count: i64,
    pub repeat_delay_ms: i64,
    pub jitter_us: i64,
    pub prefer_scan_codes: bool,
    pub activation: Activation,
    pub specific_window: bool,
    pub focus_loss: FocusLoss,
    pub duration_us: i64,
    pub automatic_cooldown_ms: i64,
    /// Consecutive events sharing one timestamp, ordered by time.
    pub groups: Vec<(i64, Vec<CompiledEvent>)>,
    pub uses_gamepad: bool,
}

fn parse_button(event: &EnginePlanEvent) -> NativeResult<MouseButton> {
    let name = event.button.as_deref().unwrap_or("Left");
    MouseButton::parse(name)
        .ok_or_else(|| NativeError::invalid_argument(format!("Unknown mouse button {name}")))
}

fn compile_action(event: &EnginePlanEvent) -> NativeResult<Option<Action>> {
    let key = |is_up| Action::Key {
        vk: event.virtual_key.unwrap_or(0),
        scan: event.scan_code.unwrap_or(0),
        extended: event.extended.unwrap_or(false),
        is_up,
    };
    let timeout = event.timeout_milliseconds.unwrap_or(0).max(0);
    let pixel = |must_match, timeout_ms| Action::WaitPixel {
        x: event.pixel_x.unwrap_or(0),
        y: event.pixel_y.unwrap_or(0),
        color: event.pixel_color.unwrap_or(0) & 0x00FF_FFFF,
        must_match,
        timeout_ms,
    };
    Ok(Some(match event.kind.as_str() {
        "Comment" => return Ok(None),
        "KeyDown" => key(false),
        "KeyUp" => key(true),
        "MouseButtonDown" => Action::MouseButton {
            button: parse_button(event)?,
            is_down: true,
        },
        "MouseButtonUp" => Action::MouseButton {
            button: parse_button(event)?,
            is_down: false,
        },
        "MouseMove" => Action::MouseMove {
            dx: event.delta_x.unwrap_or(0),
            dy: event.delta_y.unwrap_or(0),
            absolute: event.absolute.unwrap_or(false),
        },
        "Wheel" => Action::Wheel {
            delta: event.wheel_delta.unwrap_or(0),
            horizontal: false,
        },
        "HorizontalWheel" => Action::Wheel {
            delta: event.wheel_delta.unwrap_or(0),
            horizontal: true,
        },
        "TypeText" => Action::Text(event.text.clone().unwrap_or_default()),
        "Delay" => Action::Marker,
        "OverlayText" => Action::Overlay {
            text: event.text.clone().unwrap_or_default(),
            duration_us: event.duration_microseconds.unwrap_or(0).max(0),
            show_timing: event.show_timing.unwrap_or(true),
        },
        "PixelColorTrigger" => pixel(true, 0),
        "WaitForPixelGone" => pixel(false, timeout),
        "WaitForWindow" => Action::WaitWindow {
            process: event.wait_process.clone().unwrap_or_default(),
            title: event.wait_title.clone().unwrap_or_default(),
            timeout_ms: timeout,
        },
        "WaitForKey" => Action::WaitKey {
            vk: event.wait_key.unwrap_or(0),
            timeout_ms: timeout,
        },
        "RunMacro" => Action::RunMacro(event.sub_macro.clone().unwrap_or_default()),
        "GamepadButtonDown" | "GamepadButtonUp" => {
            let name = event.gamepad_button.as_deref().unwrap_or("");
            let button = GamepadButton::from_str_name(name).ok_or_else(|| {
                NativeError::invalid_argument(format!("Unknown gamepad button {name}"))
            })?;
            Action::GamepadButton {
                button,
                is_down: event.kind == "GamepadButtonDown",
            }
        }
        "GamepadAxis" => {
            let name = event.gamepad_axis.as_deref().unwrap_or("");
            let axis = GamepadAxis::from_str_name(name).ok_or_else(|| {
                NativeError::invalid_argument(format!("Unknown gamepad axis {name}"))
            })?;
            Action::GamepadAxis {
                axis,
                value: event.axis_value.unwrap_or(0),
            }
        }
        other => {
            return Err(NativeError::invalid_argument(format!(
                "Unknown macro event kind {other}"
            )))
        }
    }))
}

pub fn compile(source: EnginePlan) -> NativeResult<CompiledPlan> {
    let mut groups: Vec<(i64, Vec<CompiledEvent>)> = Vec::new();
    let mut uses_gamepad = false;
    let mut automatic_cooldown_ms = 0;
    for event in &source.events {
        let Some(action) = compile_action(event)? else {
            continue;
        };
        uses_gamepad |= action.is_gamepad();
        if event.kind == "PixelColorTrigger" {
            automatic_cooldown_ms = event.cooldown_milliseconds.unwrap_or(0).max(0);
        }
        let compiled = CompiledEvent {
            id: Arc::from(event.id.as_str()),
            time_us: event.time_microseconds.max(0),
            action,
        };
        match groups.last_mut() {
            Some((time, group)) if *time == compiled.time_us => group.push(compiled),
            _ => groups.push((compiled.time_us, vec![compiled])),
        }
    }
    let activation = match source.activation_mode.as_str() {
        "WhileHeld" => Activation::WhileHeld,
        "Restart" => Activation::Restart,
        "ToggleStop" | "ToggleRepeat" => Activation::ToggleStop,
        _ => Activation::Once,
    };
    Ok(CompiledPlan {
        macro_id: Arc::from(source.macro_id.as_str()),
        name: Arc::from(source.name.as_str()),
        speed: source.speed.clamp(0.1, 10.0),
        repeat_count: source.repeat_count.max(0),
        repeat_delay_ms: source.repeat_delay_milliseconds.max(0),
        jitter_us: if source.randomize_timing {
            source.jitter_milliseconds.max(0) * 1000
        } else {
            0
        },
        prefer_scan_codes: source.target_mode == "SpecificWindow" && source.prefer_scan_codes,
        // An endless macro has to be stoppable from its bind.
        activation: if source.repeat_count == 0 {
            Activation::ToggleStop
        } else {
            activation
        },
        specific_window: source.target_mode == "SpecificWindow",
        focus_loss: match source.focus_loss.as_str() {
            "Stop" => FocusLoss::Stop,
            "Pause" => FocusLoss::Pause,
            _ => FocusLoss::Continue,
        },
        duration_us: source.duration_microseconds.max(0),
        automatic_cooldown_ms,
        groups,
        uses_gamepad,
        source,
    })
}
