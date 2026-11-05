//! Pure decision matrix for hook-driven keyboard hotkeys.
//!
//! Enforces pass-through policy, target window scoping, and autorepeat suppression.

/// Outcome of a keyboard press event for a hook-driven binding.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct KeyboardBindDecision {
    /// Whether the key press must be swallowed (eaten) so it does not reach the foreground window.
    pub eat: bool,
    /// Whether to trigger the macro/shortcut callback action.
    pub run_action: bool,
}

/// A pure decision on a bind-key press (no side state): whether to start the action and
/// whether to eat the key.
///
/// Rules:
/// 1. Out-of-scope (`!fire`): The key passes through to the foreground application without firing (`eat: false, run_action: false`).
/// 2. Pass-through ON: The initial user press passes through to the active application (`eat: false`) and runs the action (`run_action: true`).
///    Subsequent OS auto-repeats while held are eaten (`eat: true`) and do NOT re-run the action (`run_action: false`).
/// 3. Pass-through OFF: The initial user press is eaten (`eat: true`) and runs the action (`run_action: true`).
///    Subsequent OS auto-repeats are eaten (`eat: true`) and do NOT re-run the action (`run_action: false`).
pub fn decide_keyboard_down(first_press: bool, fire: bool, pass_through: bool) -> KeyboardBindDecision {
    if !first_press {
        KeyboardBindDecision {
            eat: fire,
            run_action: false,
        }
    } else {
        KeyboardBindDecision {
            eat: fire && !pass_through,
            run_action: fire,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// LEGACY-TEST-027 / NATIVE-INPUT-027: KeyboardBindPassThrough_ForwardsOnlyUserPress_NotAutoRepeats
    #[test]
    fn test_keyboard_bind_pass_through_forwards_only_user_press_not_autorepeats() {
        // Pass-through is on, bind is active: original press goes to the app (not eaten),
        // and action runs once.
        let press = decide_keyboard_down(true, true, true);
        assert!(!press.eat);
        assert!(press.run_action);

        // OS auto-repeats while held: eaten (do not reach the app) and do not restart action.
        let repeat = decide_keyboard_down(false, true, true);
        assert!(repeat.eat);
        assert!(!repeat.run_action);
    }

    /// LEGACY-TEST-028 / NATIVE-INPUT-028: KeyboardBind_NoPassThrough_EatsPressAndRepeats
    #[test]
    fn test_keyboard_bind_no_pass_through_eats_press_and_repeats() {
        let press = decide_keyboard_down(true, true, false);
        assert!(press.eat);
        assert!(press.run_action);

        let repeat = decide_keyboard_down(false, true, false);
        assert!(repeat.eat);
        assert!(!repeat.run_action);
    }

    /// LEGACY-TEST-029 / NATIVE-INPUT-029: KeyboardBind_OutOfScope_PassesEverythingThroughAndDoesNotFire
    #[test]
    fn test_keyboard_bind_out_of_scope_passes_everything_through_and_does_not_fire() {
        let press = decide_keyboard_down(true, false, false);
        assert!(!press.eat);
        assert!(!press.run_action);

        let repeat = decide_keyboard_down(false, false, true);
        assert!(!repeat.eat);
        assert!(!repeat.run_action);
    }
}
