//! N-API surface of the macro engine.

use napi::threadsafe_function::{ErrorStrategy, ThreadsafeFunction};
use napi::{Env, JsFunction};
use napi_derive::napi;

use crate::engine::manager::{engine, EngineEventPayload, EngineSessionStatus};
use crate::engine::plan::EnginePlan;
use crate::error::catch_unwind_napi;

/// Registers the single callback receiving engine reports.
#[napi]
pub fn engine_set_callback(env: Env, callback: JsFunction) -> napi::Result<()> {
    catch_unwind_napi(|| {
        let mut function: ThreadsafeFunction<EngineEventPayload, ErrorStrategy::Fatal> =
            callback.create_threadsafe_function(0, |ctx| Ok(vec![ctx.value]))?;
        // A pending report must not keep the process alive.
        function.unref(&env)?;
        engine().set_callback(Some(function));
        Ok(())
    })
}

/// Replaces all known macros. Returns one message per macro that could not be compiled.
#[napi]
pub fn engine_load_plans(plans: Vec<EnginePlan>) -> napi::Result<Vec<String>> {
    catch_unwind_napi(|| Ok(engine().load_plans(plans)))
}

/// Starts a loaded macro and returns its session id. Throws when the target cannot be used.
#[napi]
pub fn engine_start(
    macro_id: String,
    activation: String,
    target_window: Option<i64>,
) -> napi::Result<i64> {
    catch_unwind_napi(|| {
        engine()
            .start(&macro_id, &activation, target_window)
            .map_err(napi::Error::from)
    })
}

/// Applies a bind press as if the macro's hotkey had fired.
#[napi]
pub fn engine_activate(macro_id: String) -> napi::Result<()> {
    catch_unwind_napi(|| {
        engine().activate(&macro_id);
        Ok(())
    })
}

#[napi]
pub fn engine_pause(session_id: Option<i64>) -> napi::Result<bool> {
    catch_unwind_napi(|| Ok(engine().pause(session_id)))
}

#[napi]
pub fn engine_resume(session_id: Option<i64>) -> napi::Result<bool> {
    catch_unwind_napi(|| Ok(engine().resume(session_id)))
}

#[napi]
pub fn engine_stop(session_id: Option<i64>) -> napi::Result<bool> {
    catch_unwind_napi(|| Ok(engine().stop(session_id)))
}

/// Stops every session, including automatic monitors, and releases all input synchronously.
#[napi]
pub fn engine_emergency_stop(reason: String) -> napi::Result<()> {
    catch_unwind_napi(|| {
        engine().emergency_stop(&reason);
        Ok(())
    })
}

#[napi]
pub fn engine_get_status() -> napi::Result<Vec<EngineSessionStatus>> {
    catch_unwind_napi(|| Ok(engine().statuses()))
}

/// Suspends or restores automatic pixel-trigger monitors.
#[napi]
pub fn engine_suspend_automatic(suspended: bool) -> napi::Result<()> {
    catch_unwind_napi(|| {
        engine().suspend_automatic(suspended);
        Ok(())
    })
}

/// Switches physical input forwarding on for a recording session, and off afterwards.
/// While off, no keyboard, mouse, or gamepad event crosses into JavaScript.
#[napi]
pub fn engine_set_recording(recording: bool, gamepad: bool) -> napi::Result<()> {
    catch_unwind_napi(|| {
        engine().set_recording(recording);
        crate::set_gamepad_capture(recording && gamepad);
        Ok(())
    })
}

/// Chooses how the virtual pad appears to games, and whether physical pads are hidden meanwhile.
#[napi]
pub fn engine_configure_gamepad(output: String, hide_real: bool) -> napi::Result<()> {
    catch_unwind_napi(|| {
        use crate::gamepad::shared_gamepad::SharedVirtualGamepad;
        use crate::gamepad::types::GamepadOutputType;
        SharedVirtualGamepad::set_hide_real_pads(hide_real);
        SharedVirtualGamepad::set_output_type(GamepadOutputType::from_str_name(&output))
            .map_err(napi::Error::from)
    })
}
