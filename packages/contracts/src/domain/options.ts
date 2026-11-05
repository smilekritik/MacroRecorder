/**
 * Playback and recording options contracts matching models.
 */

import {
  boolean,
  integer,
  number,
  object,
  string,
  type Schema,
  type ValidationResult,
} from '../common/validation.js';
import {
  ActivationMode,
  activationModeSchema,
  FocusLossBehavior,
  focusLossBehaviorSchema,
  OverlayCardOverride,
  overlayCardOverrideSchema,
  TargetMode,
  targetModeSchema,
} from './enums.js';

export interface PlaybackOptions {
  readonly activationMode: ActivationMode;
  readonly targetMode: TargetMode;
  readonly focusLossBehavior: FocusLossBehavior;
  readonly passThroughHotkey: boolean;
  readonly hotkeyScopedToTarget: boolean;
  readonly targetProcessName: string;
  readonly targetWindowTitle: string;
  readonly speed: number;
  readonly randomizeTiming: boolean;
  readonly timingJitterMilliseconds: number;
  readonly repeatCount: number;
  readonly repeatDelayMilliseconds: number;
  readonly preferScanCodes: boolean;
  readonly infoCardOverride: OverlayCardOverride;
  readonly customTextOverride: OverlayCardOverride;
}

export interface PlaybackOptionsWire {
  readonly ActivationMode?: ActivationMode | undefined;
  readonly activationMode?: ActivationMode | undefined;
  readonly TargetMode?: TargetMode | undefined;
  readonly targetMode?: TargetMode | undefined;
  readonly FocusLossBehavior?: FocusLossBehavior | undefined;
  readonly focusLossBehavior?: FocusLossBehavior | undefined;
  readonly PassThroughHotkey?: boolean | undefined;
  readonly passThroughHotkey?: boolean | undefined;
  readonly HotkeyScopedToTarget?: boolean | undefined;
  readonly hotkeyScopedToTarget?: boolean | undefined;
  readonly TargetProcessName?: string | undefined;
  readonly targetProcessName?: string | undefined;
  readonly TargetWindowTitle?: string | undefined;
  readonly targetWindowTitle?: string | undefined;
  readonly Speed?: number | undefined;
  readonly speed?: number | undefined;
  readonly RandomizeTiming?: boolean | undefined;
  readonly randomizeTiming?: boolean | undefined;
  readonly TimingJitterMilliseconds?: number | undefined;
  readonly timingJitterMilliseconds?: number | undefined;
  readonly RepeatCount?: number | undefined;
  readonly repeatCount?: number | undefined;
  readonly RepeatDelayMilliseconds?: number | undefined;
  readonly repeatDelayMilliseconds?: number | undefined;
  readonly PreferScanCodes?: boolean | undefined;
  readonly preferScanCodes?: boolean | undefined;
  readonly InfoCardOverride?: OverlayCardOverride | undefined;
  readonly infoCardOverride?: OverlayCardOverride | undefined;
  readonly CustomTextOverride?: OverlayCardOverride | undefined;
  readonly customTextOverride?: OverlayCardOverride | undefined;
}

export const DEFAULT_PLAYBACK_OPTIONS: PlaybackOptions = {
  activationMode: ActivationMode.Once,
  targetMode: TargetMode.ForegroundAtStart,
  focusLossBehavior: FocusLossBehavior.Continue,
  passThroughHotkey: false,
  hotkeyScopedToTarget: false,
  targetProcessName: '',
  targetWindowTitle: '',
  speed: 1.0,
  randomizeTiming: false,
  timingJitterMilliseconds: 10,
  repeatCount: 1,
  repeatDelayMilliseconds: 0,
  preferScanCodes: false,
  infoCardOverride: OverlayCardOverride.Inherit,
  customTextOverride: OverlayCardOverride.Inherit,
};

export function clampPlaybackSpeed(speed: number): number {
  if (speed < 0.1) return 0.1;
  if (speed > 10.0) return 10.0;
  return speed;
}

export const playbackOptionsSchema: Schema<PlaybackOptions> = object({
  activationMode: activationModeSchema,
  targetMode: targetModeSchema,
  focusLossBehavior: focusLossBehaviorSchema,
  passThroughHotkey: boolean(),
  hotkeyScopedToTarget: boolean(),
  targetProcessName: string(),
  targetWindowTitle: string(),
  speed: number({ min: 0.1, max: 10.0 }),
  randomizeTiming: boolean(),
  timingJitterMilliseconds: integer({ min: 0 }),
  repeatCount: integer({ min: 0 }),
  repeatDelayMilliseconds: integer({ min: 0 }),
  preferScanCodes: boolean(),
  infoCardOverride: overlayCardOverrideSchema,
  customTextOverride: overlayCardOverrideSchema,
});

export function parsePlaybackOptionsWire(
  raw: unknown,
  path = '',
): ValidationResult<PlaybackOptions> {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return {
      success: false,
      errors: [{ path, message: 'Expected object for PlaybackOptions', received: raw }],
    };
  }
  const obj = raw as PlaybackOptionsWire;
  const rawActivation = obj.activationMode ?? obj.ActivationMode ?? ActivationMode.Once;
  // Handle legacy ToggleRepeat alias
  const activationMode =
    rawActivation === ('ToggleRepeat' as unknown) ? ActivationMode.ToggleStop : rawActivation;

  const normalized: PlaybackOptions = {
    activationMode,
    targetMode: obj.targetMode ?? obj.TargetMode ?? TargetMode.ForegroundAtStart,
    focusLossBehavior: obj.focusLossBehavior ?? obj.FocusLossBehavior ?? FocusLossBehavior.Continue,
    passThroughHotkey: obj.passThroughHotkey ?? obj.PassThroughHotkey ?? false,
    hotkeyScopedToTarget: obj.hotkeyScopedToTarget ?? obj.HotkeyScopedToTarget ?? false,
    targetProcessName: obj.targetProcessName ?? obj.TargetProcessName ?? '',
    targetWindowTitle: obj.targetWindowTitle ?? obj.TargetWindowTitle ?? '',
    speed: clampPlaybackSpeed(obj.speed ?? obj.Speed ?? 1.0),
    randomizeTiming: obj.randomizeTiming ?? obj.RandomizeTiming ?? false,
    timingJitterMilliseconds: Math.max(
      0,
      obj.timingJitterMilliseconds ?? obj.TimingJitterMilliseconds ?? 10,
    ),
    repeatCount: Math.max(0, obj.repeatCount ?? obj.RepeatCount ?? 1),
    repeatDelayMilliseconds: Math.max(
      0,
      obj.repeatDelayMilliseconds ?? obj.RepeatDelayMilliseconds ?? 0,
    ),
    preferScanCodes: obj.preferScanCodes ?? obj.PreferScanCodes ?? false,
    infoCardOverride: obj.infoCardOverride ?? obj.InfoCardOverride ?? OverlayCardOverride.Inherit,
    customTextOverride:
      obj.customTextOverride ?? obj.CustomTextOverride ?? OverlayCardOverride.Inherit,
  };
  return playbackOptionsSchema.parse(normalized, path);
}

export interface RecordingOptions {
  readonly keyboard: boolean;
  readonly mouseButtons: boolean;
  readonly mouseMovement: boolean;
  readonly mouseWheel: boolean;
  readonly gamepad: boolean;
  readonly mouseMoveBucketMilliseconds: number;
  readonly countdownSeconds: number;
}

export interface RecordingOptionsWire {
  readonly Keyboard?: boolean | undefined;
  readonly keyboard?: boolean | undefined;
  readonly MouseButtons?: boolean | undefined;
  readonly mouseButtons?: boolean | undefined;
  readonly MouseMovement?: boolean | undefined;
  readonly mouseMovement?: boolean | undefined;
  readonly MouseWheel?: boolean | undefined;
  readonly mouseWheel?: boolean | undefined;
  readonly Gamepad?: boolean | undefined;
  readonly gamepad?: boolean | undefined;
  readonly MouseMoveBucketMilliseconds?: number | undefined;
  readonly mouseMoveBucketMilliseconds?: number | undefined;
  readonly CountdownSeconds?: number | undefined;
  readonly countdownSeconds?: number | undefined;
}

export const DEFAULT_RECORDING_OPTIONS: RecordingOptions = {
  keyboard: true,
  mouseButtons: true,
  mouseMovement: true,
  mouseWheel: true,
  gamepad: true,
  mouseMoveBucketMilliseconds: 10,
  countdownSeconds: 0,
};

export const recordingOptionsSchema: Schema<RecordingOptions> = object({
  keyboard: boolean(),
  mouseButtons: boolean(),
  mouseMovement: boolean(),
  mouseWheel: boolean(),
  gamepad: boolean(),
  mouseMoveBucketMilliseconds: integer({ min: 0 }),
  countdownSeconds: integer({ min: 0, max: 60 }),
});

export function parseRecordingOptionsWire(
  raw: unknown,
  path = '',
): ValidationResult<RecordingOptions> {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return {
      success: false,
      errors: [{ path, message: 'Expected object for RecordingOptions', received: raw }],
    };
  }
  const obj = raw as RecordingOptionsWire;
  const normalized: RecordingOptions = {
    keyboard: obj.keyboard ?? obj.Keyboard ?? true,
    mouseButtons: obj.mouseButtons ?? obj.MouseButtons ?? true,
    mouseMovement: obj.mouseMovement ?? obj.MouseMovement ?? true,
    mouseWheel: obj.mouseWheel ?? obj.MouseWheel ?? true,
    gamepad: obj.gamepad ?? obj.Gamepad ?? true,
    mouseMoveBucketMilliseconds: Math.max(
      0,
      obj.mouseMoveBucketMilliseconds ?? obj.MouseMoveBucketMilliseconds ?? 10,
    ),
    countdownSeconds: Math.max(0, obj.countdownSeconds ?? obj.CountdownSeconds ?? 0),
  };
  return recordingOptionsSchema.parse(normalized, path);
}
