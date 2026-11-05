/**
 * Platform-neutral recording session coordinator.
 * Implements recording lifecycle, first-allowed-event time origin, monotonic timestamp conversion,
 * source filtering, pause/resume policy, mouse-move compression, and management hotkey exclusion.
 */

import {
  type NativeKeyboardHookEvent,
  type NativeMouseHookEvent,
  type NativeRawInputEvent,
  type NativeGamepadStateEvent,
} from '../../../contracts/src/index.js';
import {
  type MacroEvent,
  type RecordingOptions,
  type HotkeyBinding,
  type Microseconds,
  type MouseButton,
} from '../model/types.js';
import {
  cloneMacroEvent,
  cloneRecordingOptions,
  createDefaultRecordingOptions,
  compressMouseMoves,
} from '../model/index.js';
import { type MonotonicClock, RecordingState, type RecordingSessionStatus } from './types.js';
import { SystemMonotonicClock } from './clock.js';
import {
  PressStateTracker,
  extractIgnoredMouseButtons,
  extractIgnoredVirtualKeys,
  shouldRecordEvent,
} from './source-filter.js';
import { removeUnbalancedControlHotkeys } from './control-hotkeys.js';
import {
  convertKeyboardHookEvent,
  convertMouseHookEvent,
  convertRawInputEvent,
  GamepadStateDiffTracker,
} from './event-conversion.js';

export interface RecordingSessionEvents {
  readonly onEventRecorded?: (event: MacroEvent) => void;
  readonly onStateChanged?: (state: RecordingState) => void;
}

/**
 * Coordinates an active recording session.
 */
export class RecordingSession {
  private readonly clock: MonotonicClock;
  private readonly events: MacroEvent[] = [];
  private readonly ignoredVirtualKeys = new Set<number>();
  private readonly ignoredMouseButtons = new Set<MouseButton>();
  private readonly pressTracker = new PressStateTracker();
  private readonly gamepadTracker = new GamepadStateDiffTracker();

  private currentState: RecordingState = RecordingState.Idle;
  private currentOptions: RecordingOptions = createDefaultRecordingOptions();
  private firstEventTimestamp: Microseconds | null = null;
  private startTimestamp: Microseconds = 0;
  private pauseStartTimestamp: Microseconds | null = null;
  private totalPausedMicroseconds: Microseconds = 0;
  private lastRecordedTimeMicroseconds: Microseconds = 0;
  private lastRecordedEvent: MacroEvent | null = null;
  private countdownRemaining = 0;

  public onEventRecorded?: (event: MacroEvent) => void;
  public onStateChanged?: (state: RecordingState) => void;

  constructor(clock: MonotonicClock = new SystemMonotonicClock()) {
    this.clock = clock;
  }

  /**
   * Current lifecycle state of the recording session.
   */
  get state(): RecordingState {
    return this.currentState;
  }

  /**
   * True if currently recording or paused.
   */
  get isRecording(): boolean {
    return (
      this.currentState === RecordingState.Recording || this.currentState === RecordingState.Paused
    );
  }

  /**
   * True if actively in Paused state.
   */
  get isPaused(): boolean {
    return this.currentState === RecordingState.Paused;
  }

  /**
   * True if actively counting down before recording starts.
   */
  get isCountdown(): boolean {
    return this.currentState === RecordingState.Countdown;
  }

  /**
   * Active recording options for this session.
   */
  get options(): RecordingOptions {
    return this.currentOptions;
  }

  /**
   * The last event actually recorded (used for live status displays).
   */
  get lastEvent(): MacroEvent | null {
    return this.lastRecordedEvent;
  }

  /**
   * How many events have been recorded in the current session.
   */
  get recordedCount(): number {
    return this.events.length;
  }

  /**
   * Immutable snapshot of all raw events recorded in this session so far.
   */
  get recordedEvents(): readonly MacroEvent[] {
    return this.events;
  }

  /**
   * Remaining seconds in recording countdown.
   */
  get countdownSeconds(): number {
    return this.countdownRemaining;
  }

  /**
   * Elapsed time since recording started in microseconds (excluding paused duration).
   * Returns 0 if not currently recording or paused.
   */
  get elapsedMicroseconds(): Microseconds {
    if (!this.isRecording) {
      return 0;
    }

    const now = this.clock.nowMicroseconds();
    const effectiveNow =
      this.currentState === RecordingState.Paused && this.pauseStartTimestamp !== null
        ? this.pauseStartTimestamp
        : now;

    return Math.max(0, effectiveNow - this.startTimestamp - this.totalPausedMicroseconds);
  }

  /**
   * Starts a countdown before recording.
   */
  startCountdown(seconds = 3): void {
    this.countdownRemaining = Math.max(1, Math.min(10, seconds));
    this.setState(RecordingState.Countdown);
  }

  /**
   * Decrements countdown seconds. If 0 is reached, transitions to Recording.
   * Returns remaining seconds.
   */
  tickCountdown(): number {
    if (this.currentState !== RecordingState.Countdown) {
      return 0;
    }
    this.countdownRemaining = Math.max(0, this.countdownRemaining - 1);
    if (this.countdownRemaining === 0) {
      this.beginRecordingInternal();
    }
    return this.countdownRemaining;
  }

  /**
   * Cancels an active countdown and returns session to Idle.
   */
  cancelCountdown(): void {
    if (this.currentState === RecordingState.Countdown) {
      this.countdownRemaining = 0;
      this.setState(RecordingState.Idle);
    }
  }

  /**
   * Begins a recording session immediately.
   *
   * @param options Recording source filters and bucket parameters
   * @param ignoredHotkeys Management hotkey bindings to discard during recording
   */
  start(
    options?: Partial<RecordingOptions>,
    ignoredHotkeys?: readonly (HotkeyBinding | null | undefined)[],
  ): void {
    this.currentOptions = createDefaultRecordingOptions(options);

    this.ignoredVirtualKeys.clear();
    for (const vk of extractIgnoredVirtualKeys(ignoredHotkeys)) {
      this.ignoredVirtualKeys.add(vk);
    }

    this.ignoredMouseButtons.clear();
    for (const btn of extractIgnoredMouseButtons(ignoredHotkeys)) {
      this.ignoredMouseButtons.add(btn);
    }

    this.beginRecordingInternal();
  }

  private beginRecordingInternal(): void {
    this.events.length = 0;
    this.pressTracker.reset();
    this.gamepadTracker.reset();
    this.firstEventTimestamp = null;
    this.startTimestamp = this.clock.nowMicroseconds();
    this.pauseStartTimestamp = null;
    this.totalPausedMicroseconds = 0;
    this.lastRecordedTimeMicroseconds = 0;
    this.lastRecordedEvent = null;
    this.countdownRemaining = 0;

    this.setState(RecordingState.Recording);
  }

  /**
   * Pauses an active recording session.
   * Incoming events will be ignored while paused. Clock does not advance.
   */
  pause(): void {
    if (this.currentState !== RecordingState.Recording) {
      return;
    }

    this.pauseStartTimestamp = this.clock.nowMicroseconds();
    this.setState(RecordingState.Paused);
  }

  /**
   * Resumes a paused recording session.
   * The paused duration is deducted from subsequent event timestamps.
   */
  resume(): void {
    if (this.currentState !== RecordingState.Paused || this.pauseStartTimestamp === null) {
      return;
    }

    const pauseDuration = Math.max(0, this.clock.nowMicroseconds() - this.pauseStartTimestamp);
    this.totalPausedMicroseconds += pauseDuration;
    this.pauseStartTimestamp = null;
    this.setState(RecordingState.Recording);
  }

  /**
   * Appends an input event to the recorded timeline.
   *
   * Core guarantees:
   * - First allowed event starts authored timeline at 0 us.
   * - Disabled sources return false immediately and do not start or advance the clock origin.
   * - Auto-repeats and orphaned releases are rejected.
   * - Timestamp conversion is strictly monotonic and accounts for paused intervals.
   */
  add(item: MacroEvent, timestampMicroseconds?: Microseconds): boolean {
    if (this.currentState !== RecordingState.Recording) {
      return false;
    }

    if (
      !shouldRecordEvent(
        item,
        this.currentOptions,
        this.ignoredVirtualKeys,
        this.ignoredMouseButtons,
      )
    ) {
      return false;
    }

    if (!this.pressTracker.trackPressState(item)) {
      return false;
    }

    // Monotonic timestamp conversion relative to session origin
    const now = timestampMicroseconds ?? this.clock.nowMicroseconds();
    const effectiveNow = Math.max(0, now - this.totalPausedMicroseconds);

    if (this.firstEventTimestamp === null) {
      this.firstEventTimestamp = effectiveNow;
    }

    let calculatedTimeUs = Math.max(0, effectiveNow - this.firstEventTimestamp);
    if (calculatedTimeUs < this.lastRecordedTimeMicroseconds) {
      calculatedTimeUs = this.lastRecordedTimeMicroseconds;
    }
    this.lastRecordedTimeMicroseconds = calculatedTimeUs;

    const cloned = cloneMacroEvent(item);
    const eventToStore: MacroEvent = {
      ...cloned,
      timeMicroseconds: calculatedTimeUs,
    } as MacroEvent;

    this.events.push(eventToStore);
    this.lastRecordedEvent = eventToStore;
    this.onEventRecorded?.(eventToStore);

    return true;
  }

  /**
   * Converts and adds a native low-level keyboard hook event.
   * Preserves scan code and extended flag metadata.
   */
  addKeyboardHookEvent(event: NativeKeyboardHookEvent): boolean {
    const macroEvent = convertKeyboardHookEvent(event);
    if (!macroEvent) return false;
    return this.add(macroEvent, event.timestampMicroseconds);
  }

  /**
   * Converts and adds a native low-level mouse hook event.
   */
  addMouseHookEvent(event: NativeMouseHookEvent): boolean {
    const macroEvent = convertMouseHookEvent(event);
    if (!macroEvent) return false;
    return this.add(macroEvent, event.timestampMicroseconds);
  }

  /**
   * Converts and adds a Win32 Raw Input mouse event.
   * Preserves relative hardware deltas. Returns number of events added.
   */
  addRawInputEvent(event: NativeRawInputEvent, wheelDelta = 0, horizontalWheelDelta = 0): number {
    const macroEvents = convertRawInputEvent(event, wheelDelta, horizontalWheelDelta);
    let addedCount = 0;
    for (const me of macroEvents) {
      if (this.add(me, event.timestampMicroseconds)) {
        addedCount++;
      }
    }
    return addedCount;
  }

  /**
   * Diffs and adds gamepad state readings. Returns number of events added.
   */
  addGamepadStateEvent(event: NativeGamepadStateEvent): number {
    const macroEvents = this.gamepadTracker.diff(event);
    let addedCount = 0;
    for (const me of macroEvents) {
      if (this.add(me, event.timestampMicroseconds)) {
        addedCount++;
      }
    }
    return addedCount;
  }

  /**
   * Stops the active recording session and returns compressed, finalized events.
   *
   * @param managementHotkeys Management hotkeys whose triggers and dangling modifiers
   * should be removed from the recorded output.
   */
  stop(managementHotkeys?: readonly (HotkeyBinding | null | undefined)[]): MacroEvent[] {
    this.setState(RecordingState.Idle);

    // Apply mouse movement time bucketing
    const compressed = compressMouseMoves(
      this.events,
      this.currentOptions.mouseMoveBucketMilliseconds,
    );

    // If management hotkeys provided, scrub them and unbalanced modifiers, then rebase to zero
    if (managementHotkeys && managementHotkeys.length > 0) {
      return removeUnbalancedControlHotkeys(compressed, managementHotkeys);
    }

    return compressed;
  }

  /**
   * Resets the recording session completely to clean idle state.
   */
  reset(): void {
    this.events.length = 0;
    this.ignoredVirtualKeys.clear();
    this.ignoredMouseButtons.clear();
    this.pressTracker.reset();
    this.gamepadTracker.reset();
    this.firstEventTimestamp = null;
    this.startTimestamp = 0;
    this.pauseStartTimestamp = null;
    this.totalPausedMicroseconds = 0;
    this.lastRecordedTimeMicroseconds = 0;
    this.lastRecordedEvent = null;
    this.countdownRemaining = 0;
    this.setState(RecordingState.Idle);
  }

  /**
   * Snapshot of current recording session status.
   */
  getStatus(): RecordingSessionStatus {
    return {
      state: this.currentState,
      isRecording: this.isRecording,
      isPaused: this.isPaused,
      isCountdown: this.isCountdown,
      elapsedMicroseconds: this.elapsedMicroseconds,
      recordedCount: this.recordedCount,
      lastEvent: this.lastRecordedEvent ? cloneMacroEvent(this.lastRecordedEvent) : null,
      options: cloneRecordingOptions(this.currentOptions),
      countdownRemainingSeconds: this.countdownRemaining,
    };
  }

  private setState(newState: RecordingState): void {
    if (this.currentState !== newState) {
      this.currentState = newState;
      this.onStateChanged?.(newState);
    }
  }
}
