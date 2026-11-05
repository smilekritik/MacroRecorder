/**
 * Playback and recording options domain models, immutable helpers.
 */

import {
  clampPlaybackSpeed as contractClampSpeed,
  DEFAULT_PLAYBACK_OPTIONS,
  DEFAULT_RECORDING_OPTIONS,
  parsePlaybackOptionsWire,
  parseRecordingOptionsWire,
  playbackOptionsSchema,
  recordingOptionsSchema,
} from '../../../contracts/src/index.js';
import {
  ActivationMode,
  FocusLossBehavior,
  OverlayCardOverride,
  type PlaybackOptions,
  type PlaybackOptionsWire,
  type RecordingOptions,
  type RecordingOptionsWire,
  TargetMode,
  type ValidationResult,
} from './types.js';

export const clampPlaybackSpeed = contractClampSpeed;

/**
 * Creates default or partially populated PlaybackOptions.
 */
export function createDefaultPlaybackOptions(partial?: Partial<PlaybackOptions>): PlaybackOptions {
  return {
    activationMode: partial?.activationMode ?? DEFAULT_PLAYBACK_OPTIONS.activationMode,
    targetMode: partial?.targetMode ?? DEFAULT_PLAYBACK_OPTIONS.targetMode,
    focusLossBehavior: partial?.focusLossBehavior ?? DEFAULT_PLAYBACK_OPTIONS.focusLossBehavior,
    passThroughHotkey: partial?.passThroughHotkey ?? DEFAULT_PLAYBACK_OPTIONS.passThroughHotkey,
    hotkeyScopedToTarget:
      partial?.hotkeyScopedToTarget ?? DEFAULT_PLAYBACK_OPTIONS.hotkeyScopedToTarget,
    targetProcessName: partial?.targetProcessName ?? DEFAULT_PLAYBACK_OPTIONS.targetProcessName,
    targetWindowTitle: partial?.targetWindowTitle ?? DEFAULT_PLAYBACK_OPTIONS.targetWindowTitle,
    speed: clampPlaybackSpeed(partial?.speed ?? DEFAULT_PLAYBACK_OPTIONS.speed),
    randomizeTiming: partial?.randomizeTiming ?? DEFAULT_PLAYBACK_OPTIONS.randomizeTiming,
    timingJitterMilliseconds: Math.max(
      0,
      partial?.timingJitterMilliseconds ?? DEFAULT_PLAYBACK_OPTIONS.timingJitterMilliseconds,
    ),
    repeatCount: Math.max(0, partial?.repeatCount ?? DEFAULT_PLAYBACK_OPTIONS.repeatCount),
    repeatDelayMilliseconds: Math.max(
      0,
      partial?.repeatDelayMilliseconds ?? DEFAULT_PLAYBACK_OPTIONS.repeatDelayMilliseconds,
    ),
    preferScanCodes: partial?.preferScanCodes ?? DEFAULT_PLAYBACK_OPTIONS.preferScanCodes,
    infoCardOverride: partial?.infoCardOverride ?? DEFAULT_PLAYBACK_OPTIONS.infoCardOverride,
    customTextOverride: partial?.customTextOverride ?? DEFAULT_PLAYBACK_OPTIONS.customTextOverride,
  };
}

/**
 * Creates default or partially populated RecordingOptions.
 */
export function createDefaultRecordingOptions(
  partial?: Partial<RecordingOptions>,
): RecordingOptions {
  return {
    keyboard: partial?.keyboard ?? DEFAULT_RECORDING_OPTIONS.keyboard,
    mouseButtons: partial?.mouseButtons ?? DEFAULT_RECORDING_OPTIONS.mouseButtons,
    mouseMovement: partial?.mouseMovement ?? DEFAULT_RECORDING_OPTIONS.mouseMovement,
    mouseWheel: partial?.mouseWheel ?? DEFAULT_RECORDING_OPTIONS.mouseWheel,
    gamepad: partial?.gamepad ?? DEFAULT_RECORDING_OPTIONS.gamepad,
    mouseMoveBucketMilliseconds: Math.max(
      0,
      partial?.mouseMoveBucketMilliseconds ?? DEFAULT_RECORDING_OPTIONS.mouseMoveBucketMilliseconds,
    ),
    countdownSeconds: Math.max(
      0,
      partial?.countdownSeconds ?? DEFAULT_RECORDING_OPTIONS.countdownSeconds,
    ),
  };
}

/**
 * Performs deep immutable cloning of PlaybackOptions.
 */
export function clonePlaybackOptions(options: PlaybackOptions): PlaybackOptions {
  return { ...options };
}

/**
 * Performs deep immutable cloning of RecordingOptions.
 */
export function cloneRecordingOptions(options: RecordingOptions): RecordingOptions {
  return { ...options };
}

/**
 * Validates PlaybackOptions against schema.
 */
export function validatePlaybackOptions(
  input: unknown,
  path = '',
): ValidationResult<PlaybackOptions> {
  if (typeof input === 'object' && input !== null) {
    return parsePlaybackOptionsWire(input, path);
  }
  return playbackOptionsSchema.parse(input, path);
}

/**
 * Validates RecordingOptions against schema.
 */
export function validateRecordingOptions(
  input: unknown,
  path = '',
): ValidationResult<RecordingOptions> {
  if (typeof input === 'object' && input !== null) {
    return parseRecordingOptionsWire(input, path);
  }
  return recordingOptionsSchema.parse(input, path);
}

/**
 * Evaluates whether repeatForever policy is active (repeatCount === 0).
 */
export function isRepeatForever(options: PlaybackOptions): boolean {
  return options.repeatCount === 0;
}

export interface RepeatStateResult {
  readonly options: PlaybackOptions;
  readonly lastFiniteRepeatCount: number;
}

/**
 * Immutable state transformation applying RepeatForever policy.
 * Setting repeatForever = true sets repeatCount = 0 and forces activationMode = ToggleStop;
 * setting false restores previous finite count (minimum 1).
 */
export function applyRepeatForever(
  options: PlaybackOptions,
  repeatForever: boolean,
  lastFiniteRepeatCount = 1,
): RepeatStateResult {
  const finiteCount = Math.max(
    1,
    lastFiniteRepeatCount > 0
      ? lastFiniteRepeatCount
      : options.repeatCount > 0
        ? options.repeatCount
        : 1,
  );

  if (repeatForever) {
    return {
      options: {
        ...options,
        repeatCount: 0,
        activationMode: ActivationMode.ToggleStop,
      },
      lastFiniteRepeatCount: finiteCount,
    };
  }

  return {
    options: {
      ...options,
      repeatCount: finiteCount,
    },
    lastFiniteRepeatCount: finiteCount,
  };
}

/**
 * Immutable state transformation updating repeat count and updating last finite count.
 */
export function applyRepeatCount(
  options: PlaybackOptions,
  count: number,
  currentLastFinite = 1,
): RepeatStateResult {
  const normalized = count < 0 ? 1 : count;
  const newFinite = normalized > 0 ? normalized : currentLastFinite > 0 ? currentLastFinite : 1;

  return {
    options: {
      ...options,
      repeatCount: normalized,
    },
    lastFiniteRepeatCount: newFinite,
  };
}

/**
 * Object-oriented model wrapper around PlaybackOptions.
 * with PlaybackOptions class properties, notifications, and repeat-forever restoration.
 */
export class PlaybackOptionsModel implements PlaybackOptions {
  private _options: PlaybackOptions;
  private _lastFiniteRepeatCount: number;

  public constructor(init?: Partial<PlaybackOptions> | PlaybackOptionsWire) {
    const raw = init ?? {};
    const parsed = parsePlaybackOptionsWire(raw);
    const initial = parsed.success ? parsed.data : createDefaultPlaybackOptions();
    this._options = initial;
    this._lastFiniteRepeatCount = initial.repeatCount > 0 ? initial.repeatCount : 1;
  }

  public get activationMode(): ActivationMode {
    return this._options.activationMode;
  }
  public set activationMode(val: ActivationMode) {
    this._options = { ...this._options, activationMode: val };
  }
  public get ActivationMode(): ActivationMode {
    return this.activationMode;
  }
  public set ActivationMode(val: ActivationMode) {
    this.activationMode = val;
  }

  public get targetMode(): TargetMode {
    return this._options.targetMode;
  }
  public set targetMode(val: TargetMode) {
    this._options = { ...this._options, targetMode: val };
  }
  public get TargetMode(): TargetMode {
    return this.targetMode;
  }
  public set TargetMode(val: TargetMode) {
    this.targetMode = val;
  }

  public get focusLossBehavior(): FocusLossBehavior {
    return this._options.focusLossBehavior;
  }
  public set focusLossBehavior(val: FocusLossBehavior) {
    this._options = { ...this._options, focusLossBehavior: val };
  }
  public get FocusLossBehavior(): FocusLossBehavior {
    return this.focusLossBehavior;
  }
  public set FocusLossBehavior(val: FocusLossBehavior) {
    this.focusLossBehavior = val;
  }

  public get passThroughHotkey(): boolean {
    return this._options.passThroughHotkey;
  }
  public set passThroughHotkey(val: boolean) {
    this._options = { ...this._options, passThroughHotkey: val };
  }
  public get PassThroughHotkey(): boolean {
    return this.passThroughHotkey;
  }
  public set PassThroughHotkey(val: boolean) {
    this.passThroughHotkey = val;
  }

  public get hotkeyScopedToTarget(): boolean {
    return this._options.hotkeyScopedToTarget;
  }
  public set hotkeyScopedToTarget(val: boolean) {
    this._options = { ...this._options, hotkeyScopedToTarget: val };
  }
  public get HotkeyScopedToTarget(): boolean {
    return this.hotkeyScopedToTarget;
  }
  public set HotkeyScopedToTarget(val: boolean) {
    this.hotkeyScopedToTarget = val;
  }

  public get targetProcessName(): string {
    return this._options.targetProcessName;
  }
  public set targetProcessName(val: string) {
    this._options = { ...this._options, targetProcessName: val };
  }
  public get TargetProcessName(): string {
    return this.targetProcessName;
  }
  public set TargetProcessName(val: string) {
    this.targetProcessName = val;
  }

  public get targetWindowTitle(): string {
    return this._options.targetWindowTitle;
  }
  public set targetWindowTitle(val: string) {
    this._options = { ...this._options, targetWindowTitle: val };
  }
  public get TargetWindowTitle(): string {
    return this.targetWindowTitle;
  }
  public set TargetWindowTitle(val: string) {
    this.targetWindowTitle = val;
  }

  public get speed(): number {
    return this._options.speed;
  }
  public set speed(val: number) {
    const clamped = clampPlaybackSpeed(val);
    this._options = { ...this._options, speed: clamped };
  }
  public get Speed(): number {
    return this.speed;
  }
  public set Speed(val: number) {
    this.speed = val;
  }

  public get randomizeTiming(): boolean {
    return this._options.randomizeTiming;
  }
  public set randomizeTiming(val: boolean) {
    this._options = { ...this._options, randomizeTiming: val };
  }
  public get RandomizeTiming(): boolean {
    return this.randomizeTiming;
  }
  public set RandomizeTiming(val: boolean) {
    this.randomizeTiming = val;
  }

  public get timingJitterMilliseconds(): number {
    return this._options.timingJitterMilliseconds;
  }
  public set timingJitterMilliseconds(val: number) {
    const normalized = Math.max(0, val);
    this._options = { ...this._options, timingJitterMilliseconds: normalized };
  }
  public get TimingJitterMilliseconds(): number {
    return this.timingJitterMilliseconds;
  }
  public set TimingJitterMilliseconds(val: number) {
    this.timingJitterMilliseconds = val;
  }

  public get repeatCount(): number {
    return this._options.repeatCount;
  }
  public set repeatCount(val: number) {
    const res = applyRepeatCount(this._options, val, this._lastFiniteRepeatCount);
    this._options = res.options;
    this._lastFiniteRepeatCount = res.lastFiniteRepeatCount;
  }
  public get RepeatCount(): number {
    return this.repeatCount;
  }
  public set RepeatCount(val: number) {
    this.repeatCount = val;
  }

  public get repeatForever(): boolean {
    return isRepeatForever(this._options);
  }
  public set repeatForever(val: boolean) {
    const res = applyRepeatForever(this._options, val, this._lastFiniteRepeatCount);
    this._options = res.options;
    this._lastFiniteRepeatCount = res.lastFiniteRepeatCount;
  }
  public get RepeatForever(): boolean {
    return this.repeatForever;
  }
  public set RepeatForever(val: boolean) {
    this.repeatForever = val;
  }

  public get repeatDelayMilliseconds(): number {
    return this._options.repeatDelayMilliseconds;
  }
  public set repeatDelayMilliseconds(val: number) {
    this._options = { ...this._options, repeatDelayMilliseconds: Math.max(0, val) };
  }
  public get RepeatDelayMilliseconds(): number {
    return this.repeatDelayMilliseconds;
  }
  public set RepeatDelayMilliseconds(val: number) {
    this.repeatDelayMilliseconds = val;
  }

  public get preferScanCodes(): boolean {
    return this._options.preferScanCodes;
  }
  public set preferScanCodes(val: boolean) {
    this._options = { ...this._options, preferScanCodes: val };
  }
  public get PreferScanCodes(): boolean {
    return this.preferScanCodes;
  }
  public set PreferScanCodes(val: boolean) {
    this.preferScanCodes = val;
  }

  public get infoCardOverride(): OverlayCardOverride {
    return this._options.infoCardOverride;
  }
  public set infoCardOverride(val: OverlayCardOverride) {
    this._options = { ...this._options, infoCardOverride: val };
  }
  public get InfoCardOverride(): OverlayCardOverride {
    return this.infoCardOverride;
  }
  public set InfoCardOverride(val: OverlayCardOverride) {
    this.infoCardOverride = val;
  }

  public get customTextOverride(): OverlayCardOverride {
    return this._options.customTextOverride;
  }
  public set customTextOverride(val: OverlayCardOverride) {
    this._options = { ...this._options, customTextOverride: val };
  }
  public get CustomTextOverride(): OverlayCardOverride {
    return this.customTextOverride;
  }
  public set CustomTextOverride(val: OverlayCardOverride) {
    this.customTextOverride = val;
  }

  public toOptions(): PlaybackOptions {
    return clonePlaybackOptions(this._options);
  }

  public clone(): PlaybackOptionsModel {
    const model = new PlaybackOptionsModel(this._options);
    model._lastFiniteRepeatCount = this._lastFiniteRepeatCount;
    return model;
  }
}

/**
 * Object-oriented model wrapper around RecordingOptions.
 */
export class RecordingOptionsModel implements RecordingOptions {
  public keyboard: boolean;
  public mouseButtons: boolean;
  public mouseMovement: boolean;
  public mouseWheel: boolean;
  public gamepad: boolean;
  public mouseMoveBucketMilliseconds: number;
  public countdownSeconds: number;

  public constructor(init?: Partial<RecordingOptions> | RecordingOptionsWire) {
    const raw = init ?? {};
    const parsed = parseRecordingOptionsWire(raw);
    const initial = parsed.success ? parsed.data : createDefaultRecordingOptions();
    this.keyboard = initial.keyboard;
    this.mouseButtons = initial.mouseButtons;
    this.mouseMovement = initial.mouseMovement;
    this.mouseWheel = initial.mouseWheel;
    this.gamepad = initial.gamepad;
    this.mouseMoveBucketMilliseconds = initial.mouseMoveBucketMilliseconds;
    this.countdownSeconds = initial.countdownSeconds;
  }

  public get Keyboard(): boolean {
    return this.keyboard;
  }
  public set Keyboard(val: boolean) {
    this.keyboard = val;
  }

  public get MouseButtons(): boolean {
    return this.mouseButtons;
  }
  public set MouseButtons(val: boolean) {
    this.mouseButtons = val;
  }

  public get MouseMovement(): boolean {
    return this.mouseMovement;
  }
  public set MouseMovement(val: boolean) {
    this.mouseMovement = val;
  }

  public get MouseWheel(): boolean {
    return this.mouseWheel;
  }
  public set MouseWheel(val: boolean) {
    this.mouseWheel = val;
  }

  public get Gamepad(): boolean {
    return this.gamepad;
  }
  public set Gamepad(val: boolean) {
    this.gamepad = val;
  }

  public get MouseMoveBucketMilliseconds(): number {
    return this.mouseMoveBucketMilliseconds;
  }
  public set MouseMoveBucketMilliseconds(val: number) {
    this.mouseMoveBucketMilliseconds = Math.max(0, val);
  }

  public get CountdownSeconds(): number {
    return this.countdownSeconds;
  }
  public set CountdownSeconds(val: number) {
    this.countdownSeconds = Math.max(0, val);
  }

  public toOptions(): RecordingOptions {
    return {
      keyboard: this.keyboard,
      mouseButtons: this.mouseButtons,
      mouseMovement: this.mouseMovement,
      mouseWheel: this.mouseWheel,
      gamepad: this.gamepad,
      mouseMoveBucketMilliseconds: this.mouseMoveBucketMilliseconds,
      countdownSeconds: this.countdownSeconds,
    };
  }

  public clone(): RecordingOptionsModel {
    return new RecordingOptionsModel(this.toOptions());
  }
}
