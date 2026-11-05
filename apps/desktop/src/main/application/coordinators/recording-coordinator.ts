/**
 * Recording Coordinator.
 * State machine managing recording lifecycle: Idle -> Countdown -> Recording -> Paused -> Stopping -> Idle.
 * Handles recording source filtering, first-event origin, countdown, window minimize/restore,
 * ChoiceWindow modes (Overwrite, Continue, Append), and management hotkey scrubbing.
 */

import type {
  IWindowOrchestratorAdapter,
  Microseconds,
  RecordingSessionStatus,
} from '../types.js';
import type { TriggerCoordinator } from '../state/trigger-coordinator.js';
import type { OverlayCoordinator } from '../state/overlay-coordinator.js';
import type {
  EngineState,
  MacroDefinition,
  MacroEvent,
  RecordingChoice,
  RecordingOptions,
} from '../../ipc/types.js';

export interface RecordingCoordinatorOptions {
  readonly windowOrchestrator: IWindowOrchestratorAdapter;
  readonly triggerCoordinator?: TriggerCoordinator | undefined;
  readonly overlayCoordinator?: OverlayCoordinator | undefined;
  readonly onEventRecorded?: ((event: MacroEvent) => void) | undefined;
  readonly onStateChanged?: ((state: EngineState) => void) | undefined;
}

/** Native capture controls. Physical input reaches JavaScript only between these calls. */
export interface RecordingCapture {
  setRecording(recording: boolean, gamepad: boolean): void;
  suspendAutomatic(suspended: boolean): void;
}

export interface RecordingWiring {
  readonly capture?: RecordingCapture | undefined;
  /** Gestures that control the application and must stay out of the recording. */
  readonly controlGestures?: (() => {
    readonly virtualKeys: readonly number[];
    readonly mouseButtons: readonly string[];
  }) | undefined;
  /** Stores a finished recording in the macro it was started for. */
  readonly persist?: ((macro: MacroDefinition) => void) | undefined;
}

const CONTROL_KEYS = new Set([0x10, 0x11, 0x12, 0x5b, 0x5c, 0xa0, 0xa1, 0xa2, 0xa3, 0xa4, 0xa5]);
const MERGE_GAP_MICROSECONDS = 10_000;

function eventEndMicroseconds(event: MacroEvent): number {
  const time = Number(event.timeMicroseconds ?? 0);
  const type = String(event['type'] ?? event['eventType'] ?? '');
  return type === 'OverlayText' ? time + Number(event['durationMicroseconds'] ?? 0) : time;
}

function macroEndMicroseconds(events: readonly MacroEvent[]): number {
  return events.reduce((latest, event) => Math.max(latest, eventEndMicroseconds(event)), 0);
}

export class RecordingCoordinator {
  private wiring: RecordingWiring = {};
  private insertAtMicroseconds: number | undefined;
  private wasActive = false;
  private readonly pressedKeys = new Set<number>();
  private readonly pressedButtons = new Set<string>();
  private ignoredKeys: ReadonlySet<number> = new Set();
  private ignoredButtons: ReadonlySet<string> = new Set();

  private readonly windowOrchestrator: IWindowOrchestratorAdapter;
  private readonly triggerCoordinator?: TriggerCoordinator | undefined;
  private readonly overlayCoordinator?: OverlayCoordinator | undefined;

  private state: EngineState = 'Idle';
  private recordedEvents: MacroEvent[] = [];
  private options: RecordingOptions = {
    keyboard: true,
    mouseButtons: true,
    mouseMovement: true,
    mouseWheel: true,
    gamepad: true,
    mouseMoveBucketMilliseconds: 10,
    countdownSeconds: 0,
  };

  private countdownRemaining = 0;
  private countdownTimer: NodeJS.Timeout | null = null;
  private firstEventTimestampUs: Microseconds | null = null;
  private sessionStartTimestampUs: Microseconds = 0;
  private pauseStartTimestampUs: Microseconds | null = null;
  private totalPausedMicroseconds: Microseconds = 0;
  private lastRecordedTimeUs: Microseconds = 0;
  private lastEvent: MacroEvent | null = null;
  private activeChoice: RecordingChoice = 'Overwrite';
  private existingBaseMacro: MacroDefinition | null = null;

  public onEventRecorded?: ((event: MacroEvent) => void) | undefined;
  public onStateChanged?: ((state: EngineState) => void) | undefined;
  private readonly eventListeners = new Set<(event: MacroEvent) => void>();
  private readonly sessionStatusListeners = new Set<(status: RecordingSessionStatus) => void>();

  constructor(options: RecordingCoordinatorOptions) {
    this.windowOrchestrator = options.windowOrchestrator;
    this.triggerCoordinator = options.triggerCoordinator;
    this.overlayCoordinator = options.overlayCoordinator;
    this.onEventRecorded = options.onEventRecorded;
    this.onStateChanged = options.onStateChanged;
  }

  public configure(wiring: RecordingWiring): void {
    this.wiring = wiring;
  }

  public onEvent(callback: (event: MacroEvent) => void): () => void {
    this.eventListeners.add(callback);
    return () => {
      this.eventListeners.delete(callback);
    };
  }

  public onStateChange(callback: (status: RecordingSessionStatus) => void): () => void {
    this.sessionStatusListeners.add(callback);
    return () => {
      this.sessionStatusListeners.delete(callback);
    };
  }

  public get currentState(): EngineState {
    return this.state;
  }

  public get isRecording(): boolean {
    return this.state === 'Recording';
  }

  public get isPaused(): boolean {
    return this.state === 'Paused';
  }

  public get isCountdown(): boolean {
    return this.countdownRemaining > 0 && this.state === 'Idle';
  }

  public get hasActiveSession(): boolean {
    return this.isCountdown || this.state === 'Recording' || this.state === 'Paused';
  }

  public get countdownSeconds(): number {
    return this.countdownRemaining;
  }

  public get recordedCount(): number {
    return this.recordedEvents.length;
  }

  /**
   * Starts a recording session.
   * If countdownSeconds > 0, enters countdown mode first before active recording.
   * Minimizes the main window when recording begins.
   */
  public start(
    options?: Partial<RecordingOptions>,
    countdownSeconds = 0,
    choice: RecordingChoice = 'Overwrite',
    baseMacro?: MacroDefinition | null,
    insertAtMicroseconds?: number,
  ): boolean {
    this.insertAtMicroseconds = insertAtMicroseconds;
    this.options = {
      ...this.options,
      ...options,
    };
    this.activeChoice = choice;
    this.existingBaseMacro = baseMacro ?? null;

    // Suspend automatic pixel triggers while recording (Lifecycle rule)
    this.triggerCoordinator?.suspend('recording');

    if (countdownSeconds > 0) {
      this.countdownRemaining = countdownSeconds;
      this.overlayCoordinator?.showCountdown(countdownSeconds);
      this.countdownTimer = setInterval(() => {
        this.countdownRemaining--;
        if (this.countdownRemaining <= 0) {
          this.cancelCountdownTimer();
          this.beginActiveRecording();
        }
      }, 1000);
      return true;
    }

    this.beginActiveRecording();
    return true;
  }

  private beginActiveRecording(): void {
    this.recordedEvents = [];
    this.firstEventTimestampUs = null;
    this.sessionStartTimestampUs = Math.round(performance.now() * 1000);
    this.pauseStartTimestampUs = null;
    this.totalPausedMicroseconds = 0;
    this.lastRecordedTimeUs = 0;
    this.lastEvent = null;
    this.wasActive = true;
    this.pressedKeys.clear();
    this.pressedButtons.clear();
    const gestures = this.wiring.controlGestures?.();
    this.ignoredKeys = new Set(gestures?.virtualKeys ?? []);
    this.ignoredButtons = new Set(gestures?.mouseButtons ?? []);
    this.wiring.capture?.suspendAutomatic(true);
    this.wiring.capture?.setRecording(true, this.options.gamepad !== false);

    this.setState('Recording');

    // Minimize main window on recording start
    this.windowOrchestrator.minimizeMainWindow();
  }

  public cancelCountdownTimer(): void {
    if (this.countdownTimer !== null) {
      clearInterval(this.countdownTimer);
      this.countdownTimer = null;
    }
    this.countdownRemaining = 0;
    this.overlayCoordinator?.clearCountdown();
  }

  public get overlay(): OverlayCoordinator | undefined {
    return this.overlayCoordinator;
  }

  public pause(): void {
    if (this.state !== 'Recording') return;
    this.pauseStartTimestampUs = Math.round(performance.now() * 1000);
    this.setState('Paused');
  }

  public resume(): void {
    if (this.state !== 'Paused' || this.pauseStartTimestampUs === null) return;
    const nowUs = Math.round(performance.now() * 1000);
    this.totalPausedMicroseconds += Math.max(0, nowUs - this.pauseStartTimestampUs);
    this.pauseStartTimestampUs = null;
    this.setState('Recording');
  }

  /**
   * Appends an input event during an active recording session.
   * Filters out disabled sources.
   * First allowed event sets origin at 0 us.
   */
  public addEvent(rawEvent: MacroEvent, timestampUs?: number): boolean {
    if (this.state !== 'Recording') {
      return false;
    }

    const eventType = String(rawEvent['type'] ?? rawEvent['eventType'] ?? '');

    // Source filtering
    if ((eventType === 'KeyDown' || eventType === 'KeyUp') && this.options.keyboard === false) {
      return false;
    }
    if (
      (eventType === 'MouseButtonDown' || eventType === 'MouseButtonUp') &&
      this.options.mouseButtons === false
    ) {
      return false;
    }
    if (eventType === 'MouseMove' && this.options.mouseMovement === false) {
      return false;
    }
    if (
      (eventType === 'Wheel' || eventType === 'HorizontalWheel') &&
      this.options.mouseWheel === false
    ) {
      return false;
    }
    if (eventType.startsWith('Gamepad') && this.options.gamepad === false) {
      return false;
    }

    if (!this.tracksPhysicalPress(rawEvent, eventType)) {
      return false;
    }

    const now = timestampUs ?? Math.round(performance.now() * 1000);
    const effectiveNow = Math.max(0, now - this.totalPausedMicroseconds);

    // First allowed event starts clock at 0 us
    if (this.firstEventTimestampUs === null) {
      this.firstEventTimestampUs = effectiveNow;
    }

    let calculatedTimeUs = Math.max(0, effectiveNow - this.firstEventTimestampUs);
    if (calculatedTimeUs < this.lastRecordedTimeUs) {
      calculatedTimeUs = this.lastRecordedTimeUs;
    }
    this.lastRecordedTimeUs = calculatedTimeUs;

    const eventToStore: MacroEvent = {
      ...rawEvent,
      id: rawEvent.id || `rec-${this.recordedEvents.length + 1}`,
      timeMicroseconds: calculatedTimeUs,
    };

    this.recordedEvents.push(eventToStore);
    this.lastEvent = eventToStore;
    this.onEventRecorded?.(eventToStore);
    for (const listener of this.eventListeners) {
      try {
        listener(eventToStore);
      } catch (err) {
        console.warn('[RecordingCoordinator] Event listener error:', err);
      }
    }
    return true;
  }

  /**
   * Keeps one press and one release per physical action: auto-repeat presses and releases of keys
   * held before the start stay out, as do gestures that control the application.
   */
  private tracksPhysicalPress(event: MacroEvent, eventType: string): boolean {
    const virtualKey = Number(event['virtualKey'] ?? 0);
    const button = String(event['button'] ?? '');
    switch (eventType) {
      case 'KeyDown':
        if (this.ignoredKeys.has(virtualKey) || this.pressedKeys.has(virtualKey)) return false;
        this.pressedKeys.add(virtualKey);
        return true;
      case 'KeyUp':
        return !this.ignoredKeys.has(virtualKey) && this.pressedKeys.delete(virtualKey);
      case 'MouseButtonDown':
        if (this.ignoredButtons.has(button) || this.pressedButtons.has(button)) return false;
        this.pressedButtons.add(button);
        return true;
      case 'MouseButtonUp':
        return !this.ignoredButtons.has(button) && this.pressedButtons.delete(button);
      default:
        return true;
    }
  }

  /**
   * Stops the active recording session, performs ChoiceWindow transformations,
   * compresses mouse moves, restores main window, and resumes automatic triggers.
   */
  public stop(managementHotkeys?: ReadonlyArray<{ virtualKey: number; modifiers?: number }>): MacroDefinition {
    this.cancelCountdownTimer();
    this.wiring.capture?.setRecording(false, false);
    this.wiring.capture?.suspendAutomatic(false);
    const recordedSomething = this.wasActive;
    this.wasActive = false;
    this.setState('Idle');

    // Restore main window on recording stop
    this.windowOrchestrator.restoreMainWindow();

    // Resume automatic triggers after recording
    this.triggerCoordinator?.resume('recording');

    // Compress mouse moves into buckets
    let processedEvents = this.compressMouseMoves(
      this.recordedEvents,
      this.options.mouseMoveBucketMilliseconds ?? 10,
    );

    // Filter out management hotkeys and dangling modifiers
    if (managementHotkeys && managementHotkeys.length > 0) {
      processedEvents = this.filterManagementHotkeys(processedEvents, managementHotkeys);
    }
    processedEvents = this.removeUnbalancedControlKeys(processedEvents);

    const base = this.existingBaseMacro;
    const finalEvents = this.mergeWithBase(processedEvents, base);
    const macro: MacroDefinition = base
      ? { ...base, events: finalEvents, modifiedAt: new Date().toISOString() }
      : {
          schemaVersion: 12,
          id: `macro-${Date.now()}`,
          name: 'Recorded Macro',
          events: finalEvents,
          isEnabled: true,
          modifiedAt: new Date().toISOString(),
        };

    if (base && recordedSomething) {
      this.wiring.persist?.(macro);
    }
    this.existingBaseMacro = null;
    return macro;
  }

  /** Applies the choice made before recording. */
  private mergeWithBase(recorded: MacroEvent[], base: MacroDefinition | null): MacroEvent[] {
    const baseEvents = (base?.events ?? []) as MacroEvent[];
    if (this.activeChoice === 'Overwrite' || baseEvents.length === 0) return recorded;
    if (recorded.length === 0) return baseEvents;

    const insertAt = this.activeChoice === 'Continue' ? this.insertAtMicroseconds : undefined;
    if (insertAt !== undefined) {
      const shift = macroEndMicroseconds(recorded) + MERGE_GAP_MICROSECONDS;
      const kept = baseEvents.map((event) => (Number(event.timeMicroseconds ?? 0) >= insertAt
        ? { ...event, timeMicroseconds: Number(event.timeMicroseconds ?? 0) + shift }
        : event));
      const placed = recorded.map((event) => ({
        ...event,
        timeMicroseconds: Number(event.timeMicroseconds ?? 0) + insertAt,
      }));
      return [...kept, ...placed]
        .map((event, index) => ({ event, index }))
        .sort((left, right) => Number(left.event.timeMicroseconds ?? 0) - Number(right.event.timeMicroseconds ?? 0)
          || left.index - right.index)
        .map(({ event }) => event);
    }

    const gap = this.activeChoice === 'Append' ? MERGE_GAP_MICROSECONDS : 0;
    const start = macroEndMicroseconds(baseEvents) + gap;
    const shifted = recorded.map((event) => ({
      ...event,
      timeMicroseconds: Number(event.timeMicroseconds ?? 0) + start,
    }));
    return [...baseEvents, ...shifted];
  }

  /**
   * A modifier pressed for a control shortcut has no matching release, or the reverse.
   * Dropping those keeps a replay from leaving Ctrl or Alt held down.
   */
  private removeUnbalancedControlKeys(events: MacroEvent[]): MacroEvent[] {
    const pressed = new Set<number>();
    const balanced: MacroEvent[] = [];
    for (const event of events) {
      const type = String(event['type'] ?? event['eventType'] ?? '');
      const virtualKey = Number(event['virtualKey'] ?? 0);
      if (type === 'KeyDown') pressed.add(virtualKey);
      if (type === 'KeyUp' && !pressed.delete(virtualKey) && CONTROL_KEYS.has(virtualKey)) continue;
      balanced.push(event);
    }
    const kept = balanced.filter((event) => {
      const virtualKey = Number(event['virtualKey'] ?? 0);
      return !(CONTROL_KEYS.has(virtualKey) && pressed.has(virtualKey));
    });
    const first = Number(kept[0]?.timeMicroseconds ?? 0);
    return first > 0
      ? kept.map((event) => ({ ...event, timeMicroseconds: Number(event.timeMicroseconds ?? 0) - first }))
      : kept;
  }

  public getStatus(): RecordingSessionStatus {
    const nowUs = Math.round(performance.now() * 1000);
    const elapsed = this.state === 'Recording' || this.state === 'Paused'
      ? Math.max(0, nowUs - this.sessionStartTimestampUs - this.totalPausedMicroseconds)
      : 0;

    return {
      isRecording: this.state === 'Recording',
      isPaused: this.state === 'Paused',
      isCountdown: this.isCountdown,
      countdownSeconds: this.countdownRemaining,
      elapsedMicroseconds: elapsed,
      recordedCount: this.recordedEvents.length,
      options: this.options,
      lastEvent: this.lastEvent,
    };
  }

  /**
   * Compresses consecutive mouse moves within bucket duration.
   */
  private compressMouseMoves(events: MacroEvent[], bucketMs: number): MacroEvent[] {
    if (bucketMs <= 0 || events.length === 0) return events;
    const bucketUs = bucketMs * 1000;
    const result: MacroEvent[] = [];
    let pending: MacroEvent | null = null;
    const flush = () => {
      if (pending) result.push(pending);
      pending = null;
    };

    for (const event of events) {
      if (String(event['type'] ?? event['eventType'] ?? '') !== 'MouseMove') {
        flush();
        result.push(event);
        continue;
      }
      const time = Number(event.timeMicroseconds ?? 0);
      const current: MacroEvent | null = pending;
      if (!current || Math.floor(Number(current.timeMicroseconds ?? 0) / bucketUs) !== Math.floor(time / bucketUs)) {
        flush();
        pending = { ...event };
      } else {
        // Moves are relative, so merging must add them or the cursor ends up elsewhere.
        pending = {
          ...event,
          deltaX: Number(current['deltaX'] ?? 0) + Number(event['deltaX'] ?? 0),
          deltaY: Number(current['deltaY'] ?? 0) + Number(event['deltaY'] ?? 0),
        };
      }
    }
    flush();
    return result;
  }

  /**
   * Removes configured management hotkey strokes and rebases timeline to zero.
   */
  private filterManagementHotkeys(
    events: MacroEvent[],
    managementHotkeys: ReadonlyArray<{ virtualKey: number; modifiers?: number }>,
  ): MacroEvent[] {
    const vks = new Set(managementHotkeys.map((h) => h.virtualKey));
    const filtered = events.filter((e) => {
      const vk = Number(e['virtualKey'] ?? 0);
      return !vks.has(vk);
    });

    if (filtered.length > 0) {
      const firstTimeUs = Number(filtered[0]?.timeMicroseconds ?? 0);
      if (firstTimeUs > 0) {
        return filtered.map((e) => ({
          ...e,
          timeMicroseconds: Math.max(0, Number(e.timeMicroseconds ?? 0) - firstTimeUs),
        }));
      }
    }
    return filtered;
  }

  private setState(newState: EngineState): void {
    if (this.state !== newState) {
      this.state = newState;
      this.onStateChanged?.(newState);
      const status = this.getStatus();
      for (const listener of this.sessionStatusListeners) {
        try {
          listener(status);
        } catch (err) {
          console.warn('[RecordingCoordinator] Status listener error:', err);
        }
      }
    }
  }

  public dispose(): void {
    this.cancelCountdownTimer();
    this.wiring.capture?.setRecording(false, false);
    this.triggerCoordinator?.resume('recording');
    this.setState('Idle');
  }
}
