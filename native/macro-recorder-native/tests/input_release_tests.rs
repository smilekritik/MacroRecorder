//! Tests for universal held-input state tracking, rollback on failure,
//! per-window tracking, and emergency release guarantees across global and targeted injection.

#![allow(dead_code, clippy::manual_range_contains)]

#[rustfmt::skip]
#[path = "../src/error.rs"]
mod error;

pub mod timing {
    #[rustfmt::skip]
    #[path = "../../src/timing/clock.rs"]
    pub mod clock;
    #[rustfmt::skip]
    #[path = "../../src/timing/waiter.rs"]
    pub mod waiter;
}

pub mod runtime {
    #[rustfmt::skip]
    #[path = "../../src/runtime/cancellation.rs"]
    pub mod cancellation;
}

pub mod input_injection {
    #[rustfmt::skip]
    #[path = "../../src/input_injection/confirmation.rs"]
    pub mod confirmation;
    #[rustfmt::skip]
    #[path = "../../src/input_injection/facade.rs"]
    pub mod facade;
    #[rustfmt::skip]
    #[path = "../../src/input_injection/focused_child.rs"]
    pub mod focused_child;
    #[rustfmt::skip]
    #[path = "../../src/input_injection/global_injector.rs"]
    pub mod global_injector;
    #[rustfmt::skip]
    #[path = "../../src/input_injection/limitations.rs"]
    pub mod limitations;
    #[rustfmt::skip]
    #[path = "../../src/input_injection/receipt.rs"]
    pub mod receipt;
    #[rustfmt::skip]
    #[path = "../../src/input_injection/scan_code.rs"]
    pub mod scan_code;
    #[rustfmt::skip]
    #[path = "../../src/input_injection/state_tracker.rs"]
    pub mod state_tracker;
    #[rustfmt::skip]
    #[path = "../../src/input_injection/targeted_injector.rs"]
    pub mod targeted_injector;
    #[rustfmt::skip]
    #[path = "../../src/input_injection/text_expansion.rs"]
    pub mod text_expansion;
    #[rustfmt::skip]
    #[path = "../../src/input_injection/virtual_cursor.rs"]
    pub mod virtual_cursor;
}

use input_injection::facade::WindowsInputInjector;
use input_injection::state_tracker::{InputStateTracker, MouseButton, OwnershipChange};
use std::sync::Arc;
use std::thread;
use windows::Win32::Foundation::HWND;

#[test]
fn test_key_ownership_lifecycle_and_drain() {
    let tracker = InputStateTracker::new();
    let vk = 0x51; // 'Q'

    // First press
    let (change1, send1) = tracker.prepare_key_ownership(vk, true);
    assert_eq!(change1, OwnershipChange::AddedKey(vk));
    assert!(send1, "Initial key press must be dispatched to OS");

    // Repeat press on same tracker instance (should not send duplicate down)
    let (change2, send2) = tracker.prepare_key_ownership(vk, true);
    assert_eq!(change2, OwnershipChange::None);
    assert!(
        !send2,
        "Repeat key press by same instance should not re-send"
    );

    // Drain should yield vk and clear tracker
    let (drained_keys, drained_buttons) = tracker.drain_global_held();
    assert_eq!(drained_keys, vec![vk]);
    assert!(drained_buttons.is_empty());

    // Subsequent drain is empty
    let (drained_keys2, _) = tracker.drain_global_held();
    assert!(drained_keys2.is_empty());
}

#[test]
fn test_key_ownership_release_flow() {
    let tracker = InputStateTracker::new();
    let vk = 0x57; // 'W'

    let (change, send) = tracker.prepare_key_ownership(vk, true);
    assert_eq!(change, OwnershipChange::AddedKey(vk));
    assert!(send);

    // Normal release
    let (change_up, send_up) = tracker.prepare_key_ownership(vk, false);
    assert_eq!(change_up, OwnershipChange::RemovedKey(vk));
    assert!(send_up, "Key release must be dispatched");

    // Subsequent release when already released
    let (change_up2, _) = tracker.prepare_key_ownership(vk, false);
    assert_eq!(change_up2, OwnershipChange::None);
}

#[test]
fn test_rollback_key_ownership_on_injection_failure() {
    let tracker = InputStateTracker::new();
    let vk = 0x45; // 'E'

    // Simulate key down preparation followed by injection failure -> rollback
    let (change, _) = tracker.prepare_key_ownership(vk, true);
    assert_eq!(change, OwnershipChange::AddedKey(vk));

    tracker.rollback_key_ownership(change);

    // Verify key is no longer held in tracker
    let (drained, _) = tracker.drain_global_held();
    assert!(
        drained.is_empty(),
        "Rollback should have removed key from tracker"
    );

    // Key can now be cleanly pressed again as a first press
    let (change_after, send_after) = tracker.prepare_key_ownership(vk, true);
    assert_eq!(change_after, OwnershipChange::AddedKey(vk));
    assert!(send_after);

    // Clean up
    let _ = tracker.drain_global_held();
}

#[test]
fn test_rollback_key_release_ownership_on_failure() {
    let tracker = InputStateTracker::new();
    let vk = 0x52; // 'R'

    let _ = tracker.prepare_key_ownership(vk, true);

    // Prepare key up, then simulate failure and rollback
    let (change_up, _) = tracker.prepare_key_ownership(vk, false);
    assert_eq!(change_up, OwnershipChange::RemovedKey(vk));

    tracker.rollback_key_ownership(change_up);

    // Key must still be in held state after rollback
    let (drained, _) = tracker.drain_global_held();
    assert_eq!(
        drained,
        vec![vk],
        "Key should still be held after rollback of release"
    );
}

#[test]
fn test_button_ownership_and_rollback() {
    let tracker = InputStateTracker::new();
    let btn = MouseButton::Left;

    let (change, send) = tracker.prepare_button_ownership(btn, true);
    assert_eq!(change, OwnershipChange::AddedButton(btn));
    assert!(send);

    tracker.rollback_button_ownership(change);

    let (_, drained_btns) = tracker.drain_global_held();
    assert!(
        drained_btns.is_empty(),
        "Rollback should restore unpressed button"
    );

    // Test across all mouse buttons
    for button in [
        MouseButton::Left,
        MouseButton::Right,
        MouseButton::Middle,
        MouseButton::X1,
        MouseButton::X2,
    ] {
        let (ch, s) = tracker.prepare_button_ownership(button, true);
        assert_eq!(ch, OwnershipChange::AddedButton(button));
        assert!(s);

        let (ch_up, s_up) = tracker.prepare_button_ownership(button, false);
        assert_eq!(ch_up, OwnershipChange::RemovedButton(button));
        assert!(s_up);
    }
}

#[test]
fn test_targeted_window_state_tracking() {
    let tracker = InputStateTracker::new();
    let fake_hwnd = HWND(0x11223344 as *mut _);

    tracker.track_window_key(fake_hwnd, 0x41, true);
    tracker.track_window_key(fake_hwnd, 0x42, true);
    tracker.track_window_button(fake_hwnd, MouseButton::Right, true);

    let (keys, buttons) = tracker.drain_window_held(fake_hwnd);
    assert_eq!(keys.len(), 2);
    assert!(keys.contains(&0x41));
    assert!(keys.contains(&0x42));
    assert_eq!(buttons, vec![MouseButton::Right]);

    // Subsequent drain is empty
    let (keys2, buttons2) = tracker.drain_window_held(fake_hwnd);
    assert!(keys2.is_empty());
    assert!(buttons2.is_empty());
}

#[test]
fn test_drain_all_windows_held_multi_window() {
    let tracker = InputStateTracker::new();
    let hwnd1 = HWND(0x1000 as *mut _);
    let hwnd2 = HWND(0x2000 as *mut _);

    tracker.track_window_key(hwnd1, 0x31, true); // '1'
    tracker.track_window_button(hwnd1, MouseButton::Left, true);

    tracker.track_window_key(hwnd2, 0x32, true); // '2'
    tracker.track_window_button(hwnd2, MouseButton::Middle, true);

    let all_held = tracker.drain_all_windows_held();
    assert_eq!(all_held.len(), 2);

    for (hwnd, keys, buttons) in all_held {
        if hwnd == hwnd1 {
            assert_eq!(keys, vec![0x31]);
            assert_eq!(buttons, vec![MouseButton::Left]);
        } else if hwnd == hwnd2 {
            assert_eq!(keys, vec![0x32]);
            assert_eq!(buttons, vec![MouseButton::Middle]);
        } else {
            panic!("Unexpected window in drain_all_windows_held");
        }
    }

    // After drain, all windows are clear
    assert!(tracker.drain_all_windows_held().is_empty());
}

#[test]
fn test_universal_release_all_none() {
    let injector = WindowsInputInjector::new();
    let fake_hwnd = HWND(0x9999 as *mut _);

    // Track some global inputs and some window inputs
    let _ = injector.state_tracker().prepare_key_ownership(0x4B, true);
    let _ = injector
        .state_tracker()
        .prepare_button_ownership(MouseButton::Left, true);
    injector
        .state_tracker()
        .track_window_key(fake_hwnd, 0x4C, true);

    // Calling release_all(None) must drain everything
    injector.release_all(None);

    let (global_keys, global_btns) = injector.state_tracker().drain_global_held();
    assert!(global_keys.is_empty());
    assert!(global_btns.is_empty());
    assert!(injector.state_tracker().drain_all_windows_held().is_empty());
}

#[test]
fn test_injector_raii_drop_releases_all() {
    let state_tracker_ref;
    {
        let injector = WindowsInputInjector::new();
        state_tracker_ref = Arc::clone(injector.state_tracker());

        let _ = injector.state_tracker().prepare_key_ownership(0x5A, true);
        let _ = injector
            .state_tracker()
            .prepare_button_ownership(MouseButton::Right, true);
        let fake_hwnd = HWND(0x7777 as *mut _);
        injector
            .state_tracker()
            .track_window_key(fake_hwnd, 0x58, true);

        // Injector goes out of scope here; Drop must invoke release_all(None)
    }

    let (keys, btns) = state_tracker_ref.drain_global_held();
    assert!(keys.is_empty(), "Drop should have drained global keys");
    assert!(btns.is_empty(), "Drop should have drained global buttons");
    assert!(state_tracker_ref.drain_all_windows_held().is_empty());
}

#[test]
fn test_emergency_release_cross_thread() {
    let injector = Arc::new(WindowsInputInjector::new());
    let inj_clone = Arc::clone(&injector);

    // Simulate JS thread pressing keys
    let _ = injector.state_tracker().prepare_key_ownership(0x46, true); // 'F'
    let _ = injector.state_tracker().prepare_key_ownership(0x47, true); // 'G'

    // Background thread triggers emergency release (e.g. F10 hotkey or JS timeout watchdog)
    let handle = thread::spawn(move || {
        inj_clone.release_all(None);
    });

    handle.join().unwrap();

    let (keys, _) = injector.state_tracker().drain_global_held();
    assert!(
        keys.is_empty(),
        "Emergency release must succeed across threads"
    );
}
