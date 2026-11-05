/**
 * Platform-neutral recording policy types, states, merge modes, and clock contracts.
 */

import {
  type Microseconds,
  type MacroEvent,
  type RecordingOptions,
  type HotkeyBinding,
  type MacroDefinition,
  InputDevice,
  MacroEventType,
  MouseButton,
  GamepadButton,
  GamepadAxis,
  EngineState,
} from '../model/types.js';

/**
 * Recording merge mode for combining a new recording session into an existing macro timeline.
 */
export const RecordingMergeMode = {
  Replace: 'Replace',
  InsertAtSelection: 'InsertAtSelection',
  AppendToEnd: 'AppendToEnd',
} as const;

export type RecordingMergeMode =
  | (typeof RecordingMergeMode)[keyof typeof RecordingMergeMode]
  | 'replace'
  | 'insertAtSelection'
  | 'appendToEnd'
  | 'overwrite'
  | 'continue'
  | 'append';

/**
 * Lifecycle state of a recording session.
 */
export const RecordingState = {
  Idle: 'Idle',
  Countdown: 'Countdown',
  Recording: 'Recording',
  Paused: 'Paused',
  Stopped: 'Stopped',
} as const;

export type RecordingState = (typeof RecordingState)[keyof typeof RecordingState];

/**
 * Snapshot of current recording session status, used by UI overlays, status bars, and inspectors.
 */
export interface RecordingSessionStatus {
  readonly state: RecordingState;
  readonly isRecording: boolean;
  readonly isPaused: boolean;
  readonly isCountdown: boolean;
  readonly elapsedMicroseconds: Microseconds;
  readonly recordedCount: number;
  readonly lastEvent: MacroEvent | null;
  readonly options: RecordingOptions;
  readonly countdownRemainingSeconds: number;
}

/**
 * Pluggable monotonic clock interface in integer microseconds.
 * Allows 100% deterministic, hardware-free testing of recording timing policies.
 */
export interface MonotonicClock {
  nowMicroseconds(): Microseconds;
}

export type {
  Microseconds,
  MacroEvent,
  RecordingOptions,
  HotkeyBinding,
  MacroDefinition,
  InputDevice,
  MacroEventType,
  MouseButton,
  GamepadButton,
  GamepadAxis,
  EngineState,
};
