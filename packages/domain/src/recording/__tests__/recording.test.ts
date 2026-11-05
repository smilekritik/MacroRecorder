/**
 * Deterministic unit tests for platform-neutral recording policy.
 * Covers:
 * - /: Independent recording source toggles
 * -: Key event recording fidelity (VK, ScanCode, Extended flag)
 * -: Raw input relative mouse movement preservation
 * - /: Mouse movement time bucketing
 * -: First allowed event origin starts at 0 us
 * - /: Management hotkeys exclusion and control modifier cleanup
 * -: Overwrite, Continue, and Append timeline transformations
 * - Pause and resume policy with seamless time continuation
 * - Monotonic timestamp conversion and auto-repeat suppression
 * - Gamepad event conversion, deadzone filtering, and disconnect handling
 */

import { describe, expect, it } from 'vitest';
import {
  type NativeKeyboardHookEvent,
  type NativeMouseHookEvent,
  type NativeRawInputEvent,
  type NativeGamepadStateEvent,
} from '../../../../contracts/src/index.js';
import {
  type MacroEvent,
  type KeyDownEvent,
  type KeyUpEvent,
  type MouseMoveEvent,
  type MouseButtonDownEvent,
  type GamepadButtonDownEvent,
  type GamepadButtonUpEvent,
  type GamepadAxisEvent,
  MacroEventType,
} from '../../model/types.js';
import {
  createDefaultHotkeyBinding,
  createDefaultMacroDefinition,
  createKeyDownEvent,
  createKeyUpEvent,
  createMouseButtonDownEvent,
  createMouseButtonUpEvent,
  createMouseMoveEvent,
  createWheelEvent,
} from '../../model/index.js';
import {
  DeterministicClock,
  RecordingSession,
  RecordingState,
  RecordingMergeMode,
  convertKeyboardHookEvent,
  convertMouseHookEvent,
  convertRawInputEvent,
  GamepadStateDiffTracker,
  GAMEPAD_BITS,
  RAW_INPUT_MOUSE_FLAGS,
  PressStateTracker,
  removeUnbalancedControlHotkeys,
  mergeRecordedEvents,
  mergeRecordedEventsInPlace,
} from '../index.js';

describe('Recording Policy — Source Filtering & First Allowed Event Origin', () => {
  /**
   * Covers:
   * Recording_FirstEnabledInputStartsAtZeroAndDisabledSourcesDoNotStartClock
   */
  it('First enabled input starts at zero and disabled sources do not start clock', () => {
    const clock = new DeterministicClock(100_000);
    const recording = new RecordingSession(clock);

    recording.start(
      {
        keyboard: true,
        mouseButtons: true,
        mouseMovement: false,
        mouseWheel: false,
      },
      [
        createDefaultHotkeyBinding({
          virtualKey: 0x77, // F8
        }),
        createDefaultHotkeyBinding({
          mouseButton: 'X1',
        }),
      ],
    );

    // Clock advances: 50 ms elapsed
    clock.advanceMilliseconds(50);

    // 1. MouseMove (disabled source) -> must not record and must not start the clock origin
    recording.add(
      createMouseMoveEvent({
        deltaX: 5,
        deltaY: 0,
      }),
    );

    // 2. KeyDown F8 (ignored management hotkey) -> must not record
    recording.add(
      createKeyDownEvent({
        virtualKey: 0x77,
      }),
    );

    // 3. MouseButtonDown X1 (ignored management hotkey) -> must not record
    recording.add(
      createMouseButtonDownEvent({
        button: 'X1',
      }),
    );

    // Clock advances: another 100 ms elapsed
    clock.advanceMilliseconds(100);

    // 4. KeyDown 0x45 ('E') (first allowed event) -> must record at 0 microseconds!
    recording.add(
      createKeyDownEvent({
        virtualKey: 0x45,
      }),
    );

    const events = recording.stop();

    expect(events.length).toBe(1);
    const first = events[0]! as KeyDownEvent;
    expect(first.type).toBe(MacroEventType.KeyDown);
    expect(first.timeMicroseconds).toBe(0);
    expect(first.virtualKey).toBe(0x45);
  });

  it('Filters out input devices independently according to RecordingOptions', () => {
    const clock = new DeterministicClock(0);
    const recording = new RecordingSession(clock);

    // Only mouse movement and gamepad enabled; keyboard, mouse buttons, and wheel disabled
    recording.start({
      keyboard: false,
      mouseButtons: false,
      mouseMovement: true,
      mouseWheel: false,
      gamepad: true,
    });

    // Keyboard event dropped
    expect(recording.add(createKeyDownEvent({ virtualKey: 0x41 }))).toBe(false);

    // Mouse button dropped
    expect(recording.add(createMouseButtonDownEvent({ button: 'Left' }))).toBe(false);

    // Wheel dropped
    expect(recording.add(createWheelEvent({ wheelDelta: 120 }))).toBe(false);

    // Mouse movement allowed
    expect(recording.add(createMouseMoveEvent({ deltaX: 10, deltaY: -5 }))).toBe(true);

    const events = recording.stop();
    expect(events.length).toBe(1);
    const move = events[0]! as MouseMoveEvent;
    expect(move.type).toBe(MacroEventType.MouseMove);
    expect(move.deltaX).toBe(10);
    expect(move.deltaY).toBe(-5);
  });

  it('First allowed event receives 0 us and subsequent events preserve intervals', () => {
    const clock = new DeterministicClock(50_000); // starts at 50ms absolute
    const session = new RecordingSession(clock);

    session.start({ keyboard: true, mouseMovement: false });

    // Move is ignored and clock moves forward
    clock.advanceMilliseconds(20);
    session.add(createMouseMoveEvent({ deltaX: 10, deltaY: 0 }));

    // First allowed event at absolute t = 70ms
    session.add(createKeyDownEvent({ virtualKey: 0x41 })); // 'A' down -> time = 0

    // Advance by 80 ms (80,000 us)
    clock.advanceMilliseconds(80);
    session.add(createKeyUpEvent({ virtualKey: 0x41 })); // 'A' up -> time = 80,000 us

    // Advance by 120 ms (120,000 us)
    clock.advanceMilliseconds(120);
    session.add(createKeyDownEvent({ virtualKey: 0x42 })); // 'B' down -> time = 200,000 us

    const recorded = session.stop();
    expect(recorded.length).toBe(3);
    expect(recorded[0]!.timeMicroseconds).toBe(0);
    expect(recorded[1]!.timeMicroseconds).toBe(80_000);
    expect(recorded[2]!.timeMicroseconds).toBe(200_000);
  });
});

describe('Recording Policy — Management Hotkeys Exclusion & Unbalanced Modifier Cleanup', () => {
  /**
   * Covers:
   * RebaseToZero_RemovesTimeConsumedByFilteredManagementInput
   */
  it('RebaseToZero removes time consumed by filtered management input', () => {
    const firstUserAction = createKeyDownEvent({
      timeMicroseconds: 250_000,
      virtualKey: 0x45,
    });
    const release = createKeyUpEvent({
      timeMicroseconds: 280_000,
      virtualKey: 0x45,
    });

    const result = removeUnbalancedControlHotkeys([firstUserAction, release], []);

    expect(result.length).toBe(2);
    expect(result[0]!.timeMicroseconds).toBe(0);
    expect(result[1]!.timeMicroseconds).toBe(30_000);
  });

  it('Removes trailing modifier keys used to press the stop hotkey and rebases', () => {
    // Scenario: User presses Ctrl+Shift+S to stop recording.
    // User pressed 'A', then released 'A'.
    // Then user pressed Ctrl, then Shift, then S was intercepted by stop hook.
    // Recording stopped while Ctrl and Shift were still held down.
    const events: MacroEvent[] = [
      createKeyDownEvent({ virtualKey: 0x41, timeMicroseconds: 10_000 }), // 'A' down
      createKeyUpEvent({ virtualKey: 0x41, timeMicroseconds: 20_000 }), // 'A' up
      createKeyDownEvent({ virtualKey: 0x11, timeMicroseconds: 50_000 }), // Ctrl down
      createKeyDownEvent({ virtualKey: 0x10, timeMicroseconds: 55_000 }), // Shift down
      createKeyDownEvent({ virtualKey: 0x53, timeMicroseconds: 60_000 }), // 'S' down (stop hotkey)
    ];

    const stopHotkey = createDefaultHotkeyBinding({
      virtualKey: 0x53, // 'S'
      control: true,
      shift: true,
    });

    const cleaned = removeUnbalancedControlHotkeys(events, [stopHotkey]);

    // 'S' is stripped by reservedKeys.
    // Dangling Ctrl and Shift down presses are scrubbed.
    // Only 'A' down and 'A' up remain!
    expect(cleaned.length).toBe(2);
    const k1 = cleaned[0]! as KeyDownEvent;
    const k2 = cleaned[1]! as KeyUpEvent;
    expect(k1.virtualKey).toBe(0x41);
    expect(k1.type).toBe(MacroEventType.KeyDown);
    expect(k1.timeMicroseconds).toBe(0); // re-based to 0!
    expect(k2.virtualKey).toBe(0x41);
    expect(k2.type).toBe(MacroEventType.KeyUp);
    expect(k2.timeMicroseconds).toBe(10_000);
  });

  it('Removes orphaned control modifier releases held before recording started', () => {
    // Scenario: User started recording while Alt was held down, then released Alt.
    const events: MacroEvent[] = [
      createKeyUpEvent({ virtualKey: 0x12, timeMicroseconds: 10_000 }), // Alt up without down
      createKeyDownEvent({ virtualKey: 0x42, timeMicroseconds: 30_000 }), // 'B' down
      createKeyUpEvent({ virtualKey: 0x42, timeMicroseconds: 50_000 }), // 'B' up
    ];

    const cleaned = removeUnbalancedControlHotkeys(events, []);

    expect(cleaned.length).toBe(2);
    const k1 = cleaned[0]! as KeyDownEvent;
    const k2 = cleaned[1]! as KeyUpEvent;
    expect(k1.virtualKey).toBe(0x42);
    expect(k1.timeMicroseconds).toBe(0); // re-based to 0!
    expect(k2.virtualKey).toBe(0x42);
    expect(k2.timeMicroseconds).toBe(20_000);
  });
});

describe('Recording Policy — Press State Tracking & Auto-Repeat Suppression', () => {
  it('Suppresses OS auto-repeat KeyDown events while a physical key is held', () => {
    const tracker = new PressStateTracker();

    // 1. Initial key down: valid physical press
    const down1 = createKeyDownEvent({ virtualKey: 0x41 });
    expect(tracker.trackPressState(down1)).toBe(true);

    // 2. OS auto-repeats: should be suppressed
    const down2 = createKeyDownEvent({ virtualKey: 0x41 });
    expect(tracker.trackPressState(down2)).toBe(false);
    const down3 = createKeyDownEvent({ virtualKey: 0x41 });
    expect(tracker.trackPressState(down3)).toBe(false);

    // 3. Key up: valid physical release
    const up1 = createKeyUpEvent({ virtualKey: 0x41 });
    expect(tracker.trackPressState(up1)).toBe(true);

    // 4. Second Key up without down: dropped
    const up2 = createKeyUpEvent({ virtualKey: 0x41 });
    expect(tracker.trackPressState(up2)).toBe(false);
  });

  it('Suppresses duplicate mouse button downs and orphaned mouse button ups', () => {
    const tracker = new PressStateTracker();

    expect(tracker.trackPressState(createMouseButtonDownEvent({ button: 'Left' }))).toBe(true);
    expect(tracker.trackPressState(createMouseButtonDownEvent({ button: 'Left' }))).toBe(false);
    expect(tracker.trackPressState(createMouseButtonUpEvent({ button: 'Left' }))).toBe(true);
    expect(tracker.trackPressState(createMouseButtonUpEvent({ button: 'Left' }))).toBe(false);
  });
});

describe('Recording Policy — Pause and Resume Timing Policy', () => {
  it('Seamlessly continues recording clock across pause intervals without artificial delay', () => {
    const clock = new DeterministicClock(1_000_000); // 1 sec
    const session = new RecordingSession(clock);

    session.start({ keyboard: true });

    // Event 1: at t = 1000ms
    session.add(createKeyDownEvent({ virtualKey: 0x41 })); // 'A' down (0 us)

    clock.advanceMilliseconds(50); // t = 1050ms
    session.add(createKeyUpEvent({ virtualKey: 0x41 })); // 'A' up (50,000 us)

    // User pauses recording at t = 1060ms
    clock.advanceMilliseconds(10);
    session.pause();
    expect(session.isPaused).toBe(true);
    expect(session.state).toBe(RecordingState.Paused);

    // While paused, events are dropped
    const droppedEvent = createKeyDownEvent({ virtualKey: 0x42 });
    expect(session.add(droppedEvent)).toBe(false);

    // 10 seconds of user idle time pass while paused
    clock.advanceMilliseconds(10_000);

    // User resumes recording at t = 11060ms
    session.resume();
    expect(session.isPaused).toBe(false);
    expect(session.state).toBe(RecordingState.Recording);

    // 20 ms after resuming, user presses 'B' (t = 11080ms)
    clock.advanceMilliseconds(20);
    session.add(createKeyDownEvent({ virtualKey: 0x42 })); // 'B' down

    const recorded = session.stop();
    expect(recorded.length).toBe(3);
    expect(recorded[0]!.timeMicroseconds).toBe(0);
    expect(recorded[1]!.timeMicroseconds).toBe(50_000);
    // Crucial check: Without pause compensation, it would be ~10,080,000 us!
    // With pause compensation, it is exactly 80,000 us (60ms + 20ms)!
    expect(recorded[2]!.timeMicroseconds).toBe(80_000);
  });

  it('Freezes elapsed duration calculation while paused', () => {
    const clock = new DeterministicClock(0);
    const session = new RecordingSession(clock);

    session.start();
    clock.advanceMilliseconds(500);
    expect(session.elapsedMicroseconds).toBe(500_000);

    session.pause();
    clock.advanceMilliseconds(2000);
    // Elapsed time does not increase while paused
    expect(session.elapsedMicroseconds).toBe(500_000);

    session.resume();
    clock.advanceMilliseconds(300);
    expect(session.elapsedMicroseconds).toBe(800_000);

    session.stop();
    expect(session.elapsedMicroseconds).toBe(0);
  });
});

describe('Recording Policy — Mouse Movement Time Bucketing', () => {
  /**
   * Covers:
   * CompressMouseMoves_CombinesOnlySameBucketAndPreservesButtons
   */
  it('CompressMouseMoves combines only same bucket and preserves buttons', () => {
    const move = (t: number, x: number, y: number): MacroEvent =>
      createMouseMoveEvent({
        timeMicroseconds: t,
        deltaX: x,
        deltaY: y,
      });

    const events: MacroEvent[] = [
      move(1_000, 2, 3),
      move(5_000, 4, -1),
      createMouseButtonDownEvent({
        timeMicroseconds: 6_000,
        button: 'Left',
      }),
      move(7_000, 1, 1),
      move(15_000, 5, 5),
    ];

    const clock = new DeterministicClock(0);
    const session = new RecordingSession(clock);
    session.start({ mouseMovement: true, mouseButtons: true, mouseMoveBucketMilliseconds: 10 });

    for (const e of events) {
      session.add(e, e.timeMicroseconds);
    }

    const output = session.stop();

    expect(output.length).toBe(4);
    // Moves at 1000 and 5000 combined into bucket [0..10ms]
    const m1 = output[0]! as MouseMoveEvent;
    expect(m1.type).toBe(MacroEventType.MouseMove);
    expect(m1.deltaX).toBe(6);
    expect(m1.deltaY).toBe(2);

    // Button down strictly preserved in order
    const b1 = output[1]! as MouseButtonDownEvent;
    expect(b1.type).toBe(MacroEventType.MouseButtonDown);
    expect(b1.button).toBe('Left');

    // Move at 7000 after button down preserved
    const m2 = output[2]! as MouseMoveEvent;
    expect(m2.type).toBe(MacroEventType.MouseMove);
    expect(m2.deltaX).toBe(1);
    expect(m2.deltaY).toBe(1);

    // Move at 15000 in bucket [10..20ms]
    const m3 = output[3]! as MouseMoveEvent;
    expect(m3.type).toBe(MacroEventType.MouseMove);
    expect(m3.deltaX).toBe(5);
    expect(m3.deltaY).toBe(5);
  });
});

describe('Recording Policy — Overwrite, Continue, and Append Transformations', () => {
  it('Overwrite / Replace mode completely replaces existing timeline', () => {
    const initialMacro = createDefaultMacroDefinition({
      name: 'Test Macro',
      events: [
        createKeyDownEvent({ virtualKey: 0x41, timeMicroseconds: 10_000 }),
        createKeyUpEvent({ virtualKey: 0x41, timeMicroseconds: 20_000 }),
      ],
    });

    const recorded: MacroEvent[] = [
      createKeyDownEvent({ virtualKey: 0x42, timeMicroseconds: 0 }),
      createKeyUpEvent({ virtualKey: 0x42, timeMicroseconds: 5_000 }),
    ];

    const updated = mergeRecordedEvents(initialMacro, recorded, RecordingMergeMode.Replace);

    expect(updated.events.length).toBe(2);
    expect((updated.events[0]! as KeyDownEvent).virtualKey).toBe(0x42);
    expect((updated.events[1]! as KeyUpEvent).virtualKey).toBe(0x42);
  });

  it('Append / AppendToEnd mode appends with 10 ms gap without touching existing actions', () => {
    // Initial macro duration: ends at 30,000 us (30 ms)
    const initialMacro = createDefaultMacroDefinition({
      name: 'Existing',
      events: [
        createKeyDownEvent({ virtualKey: 0x41, timeMicroseconds: 10_000 }),
        createKeyUpEvent({ virtualKey: 0x41, timeMicroseconds: 30_000 }),
      ],
    });

    const recorded: MacroEvent[] = [
      createKeyDownEvent({ virtualKey: 0x43, timeMicroseconds: 0 }),
      createKeyUpEvent({ virtualKey: 0x43, timeMicroseconds: 15_000 }),
    ];

    const updated = mergeRecordedEvents(initialMacro, recorded, 'appendToEnd');

    expect(updated.events.length).toBe(4);
    // Existing actions unmodified
    expect(updated.events[0]!.timeMicroseconds).toBe(10_000);
    expect(updated.events[1]!.timeMicroseconds).toBe(30_000);

    // Appended actions start after duration (30ms) + gap (10ms) = 40,000 us
    expect((updated.events[2]! as KeyDownEvent).virtualKey).toBe(0x43);
    expect(updated.events[2]!.timeMicroseconds).toBe(40_000);
    expect((updated.events[3]! as KeyUpEvent).virtualKey).toBe(0x43);
    expect(updated.events[3]!.timeMicroseconds).toBe(55_000); // 40ms + 15ms
  });

  it('Continue / InsertAtSelection mode shifts tail by span + 10ms', () => {
    // Initial macro: Event 1 at 10ms, Event 2 at 50ms, Event 3 at 100ms
    const initialMacro = createDefaultMacroDefinition({
      events: [
        createKeyDownEvent({ virtualKey: 0x41, timeMicroseconds: 10_000 }),
        createKeyDownEvent({ virtualKey: 0x42, timeMicroseconds: 50_000 }),
        createKeyDownEvent({ virtualKey: 0x43, timeMicroseconds: 100_000 }),
      ],
    });

    // Recording: 2 actions spanning 25,000 us (0 to 25ms)
    const recorded: MacroEvent[] = [
      createKeyDownEvent({ virtualKey: 0x58, timeMicroseconds: 0 }),
      createKeyUpEvent({ virtualKey: 0x58, timeMicroseconds: 25_000 }),
    ];

    // Insert at selection anchor t = 50ms (Event 2)
    const insertTimeUs = 50_000;
    // shift = span (25ms) + gap (10ms) = 35,000 us
    const updated = mergeRecordedEvents(
      initialMacro,
      recorded,
      RecordingMergeMode.InsertAtSelection,
      insertTimeUs,
    );

    expect(updated.events.length).toBe(5);

    // Event 1 (before anchor) is untouched at 10ms
    expect((updated.events[0]! as KeyDownEvent).virtualKey).toBe(0x41);
    expect(updated.events[0]!.timeMicroseconds).toBe(10_000);

    // Recorded actions inserted at anchor (50ms)
    expect((updated.events[1]! as KeyDownEvent).virtualKey).toBe(0x58);
    expect(updated.events[1]!.timeMicroseconds).toBe(50_000);
    expect((updated.events[2]! as KeyUpEvent).virtualKey).toBe(0x58);
    expect(updated.events[2]!.timeMicroseconds).toBe(75_000); // 50ms + 25ms

    // Event 2 and 3 shifted by +35ms:
    // Event 2: 50ms + 35ms = 85ms
    expect((updated.events[3]! as KeyDownEvent).virtualKey).toBe(0x42);
    expect(updated.events[3]!.timeMicroseconds).toBe(85_000);

    // Event 3: 100ms + 35ms = 135ms
    expect((updated.events[4]! as KeyDownEvent).virtualKey).toBe(0x43);
    expect(updated.events[4]!.timeMicroseconds).toBe(135_000);
  });

  it('In-place mutation version matches MergeRecordedEvents signature', () => {
    const macro = {
      events: [createKeyDownEvent({ virtualKey: 0x41, timeMicroseconds: 10_000 })],
      modifiedAt: '2026-01-01T00:00:00Z',
    };

    const recorded = [createKeyDownEvent({ virtualKey: 0x42, timeMicroseconds: 0 })];
    const addedCount = mergeRecordedEventsInPlace(macro, recorded, 'appendToEnd');

    expect(addedCount).toBe(1);
    expect(macro.events.length).toBe(2);
    expect((macro.events[1]! as KeyDownEvent).virtualKey).toBe(0x42);
    expect(macro.events[1]!.timeMicroseconds).toBe(20_000); // 10ms + 10ms gap
  });
});

describe('Recording Policy — Event Conversion (Keyboard, Mouse, RawInput, Gamepad)', () => {
  it('Preserves virtualKey, scanCode, and extended flag values from keyboard hooks', () => {
    const hookEvent: NativeKeyboardHookEvent = {
      eventType: 'KeyDown',
      virtualKey: 0x24, // Home key
      scanCode: 0x47,
      extended: true,
      timestampMicroseconds: 123_456,
      isInjected: false,
    };

    const macroEvent = convertKeyboardHookEvent(hookEvent);
    expect(macroEvent).not.toBeNull();
    const keyEvent = macroEvent! as KeyDownEvent;
    expect(keyEvent.type).toBe(MacroEventType.KeyDown);
    expect(keyEvent.virtualKey).toBe(0x24);
    expect(keyEvent.scanCode).toBe(0x47);
    expect(keyEvent.extended).toBe(true);
  });

  it('Drops injected keyboard and mouse hook events', () => {
    const injectedKey: NativeKeyboardHookEvent = {
      eventType: 'KeyDown',
      virtualKey: 0x41,
      scanCode: 0x1e,
      extended: false,
      timestampMicroseconds: 1000,
      isInjected: true,
    };
    expect(convertKeyboardHookEvent(injectedKey)).toBeNull();

    const injectedMouse: NativeMouseHookEvent = {
      eventType: 'MouseButtonDown',
      button: 'Left',
      x: 100,
      y: 200,
      wheelDelta: 0,
      timestampMicroseconds: 1000,
      isInjected: true,
    };
    expect(convertMouseHookEvent(injectedMouse)).toBeNull();
  });

  it('Converts Raw Input relative mouse movement and button transitions', () => {
    const rawInput: NativeRawInputEvent = {
      deltaX: 12,
      deltaY: -8,
      buttonFlags: RAW_INPUT_MOUSE_FLAGS.LEFT_BUTTON_DOWN | RAW_INPUT_MOUSE_FLAGS.RIGHT_BUTTON_DOWN,
      timestampMicroseconds: 50_000,
    };

    const events = convertRawInputEvent(rawInput);
    expect(events.length).toBe(3);

    // Relative movement deltas intact
    const move = events[0]! as MouseMoveEvent;
    expect(move.type).toBe(MacroEventType.MouseMove);
    expect(move.deltaX).toBe(12);
    expect(move.deltaY).toBe(-8);

    // Left and right button downs
    const b1 = events[1]! as MouseButtonDownEvent;
    expect(b1.type).toBe(MacroEventType.MouseButtonDown);
    expect(b1.button).toBe('Left');

    const b2 = events[2]! as MouseButtonDownEvent;
    expect(b2.type).toBe(MacroEventType.MouseButtonDown);
    expect(b2.button).toBe('Right');
  });

  it('Diffs gamepad state transitions with deadzone and step filtering', () => {
    const tracker = new GamepadStateDiffTracker();

    // 1. Initial neutral state
    const neutralReading: NativeGamepadStateEvent = {
      slot: 0,
      connected: true,
      buttons: 0,
      leftX: 500, // below 7000 deadzone -> 0
      leftY: 0,
      rightX: 0,
      rightY: 0,
      leftTrigger: 10, // below 30 threshold -> 0
      rightTrigger: 0,
      timestampMicroseconds: 1000,
    };
    const e1 = tracker.diff(neutralReading);
    expect(e1.length).toBe(0);

    // 2. Press A button and push stick above deadzone and step
    const activeReading: NativeGamepadStateEvent = {
      slot: 0,
      connected: true,
      buttons: GAMEPAD_BITS.A,
      leftX: 12_000, // above deadzone 7000 and step 1500
      leftY: 0,
      rightX: 0,
      rightY: 0,
      leftTrigger: 128, // above threshold 30 and step 8
      rightTrigger: 0,
      timestampMicroseconds: 2000,
    };
    const e2 = tracker.diff(activeReading);
    expect(e2.length).toBe(3);

    // GamepadButtonDown for 'A'
    const btnDown = e2[0]! as GamepadButtonDownEvent;
    expect(btnDown.type).toBe(MacroEventType.GamepadButtonDown);
    expect(btnDown.gamepadButton).toBe('A');

    // LeftStickX axis event
    const axis1 = e2[1]! as GamepadAxisEvent;
    expect(axis1.type).toBe(MacroEventType.GamepadAxis);
    expect(axis1.gamepadAxis).toBe('LeftStickX');
    expect(axis1.axisValue).toBe(12_000);

    // LeftTrigger axis event
    const axis2 = e2[2]! as GamepadAxisEvent;
    expect(axis2.type).toBe(MacroEventType.GamepadAxis);
    expect(axis2.gamepadAxis).toBe('LeftTrigger');
    expect(axis2.axisValue).toBe(128);

    // 3. Releasing buttons and stick returning to 0 (rest)
    const releaseReading: NativeGamepadStateEvent = {
      slot: 0,
      connected: true,
      buttons: 0,
      leftX: 0,
      leftY: 0,
      rightX: 0,
      rightY: 0,
      leftTrigger: 0,
      rightTrigger: 0,
      timestampMicroseconds: 3000,
    };
    const e3 = tracker.diff(releaseReading);
    expect(e3.length).toBe(3);
    const btnUp = e3[0]! as GamepadButtonUpEvent;
    expect(btnUp.type).toBe(MacroEventType.GamepadButtonUp);
    expect(btnUp.gamepadButton).toBe('A');
    expect((e3[1]! as GamepadAxisEvent).axisValue).toBe(0); // stick reset
    expect((e3[2]! as GamepadAxisEvent).axisValue).toBe(0); // trigger reset
  });

  it('Releases held gamepad buttons when controller disconnects', () => {
    const tracker = new GamepadStateDiffTracker();

    // Connect and press B button
    tracker.diff({
      slot: 1,
      connected: true,
      buttons: GAMEPAD_BITS.B,
      leftX: 0,
      leftY: 0,
      rightX: 0,
      rightY: 0,
      leftTrigger: 0,
      rightTrigger: 0,
      timestampMicroseconds: 1000,
    });

    // Controller disconnects
    const disconnectEvents = tracker.diff({
      slot: 1,
      connected: false,
      buttons: 0,
      leftX: 0,
      leftY: 0,
      rightX: 0,
      rightY: 0,
      leftTrigger: 0,
      rightTrigger: 0,
      timestampMicroseconds: 2000,
    });

    expect(disconnectEvents.length).toBe(1);
    const discBtn = disconnectEvents[0]! as GamepadButtonUpEvent;
    expect(discBtn.type).toBe(MacroEventType.GamepadButtonUp);
    expect(discBtn.gamepadButton).toBe('B');
    expect(discBtn.padIndex).toBe(1);
  });
});

describe('Recording Policy — Countdown & Status Lifecycle', () => {
  it('Handles countdown sequencing and cancels cleanly', () => {
    const session = new RecordingSession();

    session.startCountdown(3);
    expect(session.isCountdown).toBe(true);
    expect(session.state).toBe(RecordingState.Countdown);
    expect(session.countdownSeconds).toBe(3);

    expect(session.tickCountdown()).toBe(2);
    expect(session.tickCountdown()).toBe(1);
    expect(session.tickCountdown()).toBe(0);

    // Reaching 0 automatically transitions to Recording
    expect(session.state).toBe(RecordingState.Recording);
    expect(session.isRecording).toBe(true);

    session.stop();
    expect(session.state).toBe(RecordingState.Idle);
  });

  it('Cancels countdown and returns to Idle', () => {
    const session = new RecordingSession();
    session.startCountdown(5);
    expect(session.isCountdown).toBe(true);

    session.cancelCountdown();
    expect(session.isCountdown).toBe(false);
    expect(session.state).toBe(RecordingState.Idle);
  });

  it('Provides live status snapshots for UI overlays and inspectors', () => {
    const clock = new DeterministicClock(100_000);
    const session = new RecordingSession(clock);

    session.start({ keyboard: true });
    clock.advanceMilliseconds(250);

    session.add(createKeyDownEvent({ virtualKey: 0x41 }));

    const status = session.getStatus();
    expect(status.state).toBe(RecordingState.Recording);
    expect(status.isRecording).toBe(true);
    expect(status.recordedCount).toBe(1);
    expect(status.elapsedMicroseconds).toBe(250_000);
    expect(status.lastEvent).not.toBeNull();
    expect((status.lastEvent! as KeyDownEvent).virtualKey).toBe(0x41);

    session.stop();
  });
});
