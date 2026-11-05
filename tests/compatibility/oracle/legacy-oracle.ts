/**
 * Legacy Oracle Reference Implementation.
 *
 * Re-implements and codifies the exact .NET behavior from:
 * - MacroRecorder.Core.Processing.MacroProcessing
 * - MacroRecorder.Core.Storage.MacroLibraryStore
 * - MacroRecorder.Core.TimelineEditor
 * - MacroRecorder.Core.ActivationPolicy
 * - MacroRecorder.Core.RunHistoryStore
 * - MacroRecorder.Core.KeyNames / InputKeyCatalog
 *
 * Pins how files written by earlier versions must keep behaving.
 */

import * as crypto from 'node:crypto';
import {
  ActivationMode,
  OverlayCardOverride,
} from '../../../packages/contracts/src/index.js';

// --- Types for Legacy Oracle ---

export interface LegacyMacroEvent {
  Id?: string;
  TimeMicroseconds: number;
  Device: string;
  Type: string;
  VirtualKey: number;
  ScanCode: number;
  Extended: boolean;
  Button: string;
  DeltaX: number;
  DeltaY: number;
  WheelDelta: number;
  AbsoluteMove: boolean;
  GamepadButton: string;
  GamepadAxis: string;
  AxisValue: number;
  PadIndex: number;
  Text: string;
  Comment: string;
  DurationMicroseconds: number;
  ShowOverlayTiming: boolean;
  PixelX: number;
  PixelY: number;
  PixelColor: number;
  TriggerCooldownMilliseconds: number;
  WaitProcessName: string;
  WaitWindowTitle: string;
  WaitKeyVirtualKey: number;
  WaitTimeoutMilliseconds: number;
  SubMacroName: string;
}

export interface LegacyRecordingOptions {
  Keyboard: boolean;
  MouseButtons: boolean;
  MouseMovement: boolean;
  MouseWheel: boolean;
  Gamepad: boolean;
  MouseMoveBucketMilliseconds: number;
  CountdownSeconds: number;
}

export interface LegacyPlaybackOptions {
  ActivationMode: string;
  TargetMode: string;
  FocusLossBehavior: string;
  PassThroughHotkey: boolean;
  HotkeyScopedToTarget: boolean;
  TargetProcessName: string;
  TargetWindowTitle: string;
  Speed: number;
  RandomizeTiming: boolean;
  TimingJitterMilliseconds: number;
  RepeatCount: number;
  RepeatDelayMilliseconds: number;
  PreferScanCodes: boolean;
  InfoCardOverride: string;
  CustomTextOverride: string;
}

export interface LegacyHotkeyBinding {
  VirtualKey: number;
  MouseButton: string;
  Wheel: string;
  Control: boolean;
  Alt: boolean;
  Shift: boolean;
  Windows: boolean;
}

export interface LegacyMacroDefinition {
  SchemaVersion: number;
  Id: string;
  Name: string;
  Folder: string;
  Description: string;
  IsEnabled: boolean;
  Tags: string[];
  ModifiedAt: string;
  Recording: LegacyRecordingOptions;
  Playback: LegacyPlaybackOptions;
  Hotkey: LegacyHotkeyBinding;
  Events: LegacyMacroEvent[];
}

// --- 1. MacroProcessing Oracle ---

export class LegacyMacroProcessingOracle {
  /**
   * Rounds time to whole milliseconds; negative values are clamped to zero.
   * C#: microseconds <= 0 ? 0 : (long)Math.Round(microseconds / 1000d, MidpointRounding.AwayFromZero) * 1000;
   */
  public static roundToMilliseconds(microseconds: number): number {
    if (microseconds <= 0) return 0;
    // AwayFromZero rounding
    const ms = microseconds / 1000;
    const rounded = ms >= 0 ? Math.floor(ms + 0.5) : Math.ceil(ms - 0.5);
    return rounded * 1000;
  }

  /**
   * IsWait: e.Type is PixelColorTrigger or WaitForPixelGone or WaitForWindow or WaitForKey
   */
  public static isWait(eventType: string): boolean {
    return (
      eventType === 'PixelColorTrigger' ||
      eventType === 'WaitForPixelGone' ||
      eventType === 'WaitForWindow' ||
      eventType === 'WaitForKey'
    );
  }

  /**
   * EventOrder: IsWait(e) ? 0 : 1
   */
  public static eventOrder(eventType: string): number {
    return this.isWait(eventType) ? 0 : 1;
  }

  /**
   * Normalize algorithm:
   * 1. Round all TimeMicroseconds and DurationMicroseconds to whole milliseconds.
   * 2. If no comments: sort by TimeMicroseconds, then by EventOrder (stable).
   * 3. If comments exist:
   *    - Leading comments before any action go to time 0.
   *    - Actions are sorted by TimeMicroseconds, then EventOrder.
   *    - Comments attached to an action inherit the sorted action's TimeMicroseconds and follow immediately.
   */
  public static normalize(events: readonly LegacyMacroEvent[]): LegacyMacroEvent[] {
    const source: LegacyMacroEvent[] = events.map((e) => ({
      ...e,
      TimeMicroseconds: this.roundToMilliseconds(e.TimeMicroseconds),
      DurationMicroseconds: this.roundToMilliseconds(e.DurationMicroseconds),
    }));

    const hasComments = source.some((e) => e.Type === 'Comment');
    if (!hasComments) {
      return source.slice().sort((a, b) => {
        const diff = a.TimeMicroseconds - b.TimeMicroseconds;
        if (diff !== 0) return diff;
        return this.eventOrder(a.Type) - this.eventOrder(b.Type);
      });
    }

    const leading: LegacyMacroEvent[] = [];
    const trailingByAction = new Map<LegacyMacroEvent, LegacyMacroEvent[]>();
    const actions: LegacyMacroEvent[] = [];
    let anchor: LegacyMacroEvent | null = null;

    for (const item of source) {
      if (item.Type === 'Comment') {
        if (anchor === null) {
          leading.push(item);
        } else {
          let attached = trailingByAction.get(anchor);
          if (!attached) {
            attached = [];
            trailingByAction.set(anchor, attached);
          }
          attached.push(item);
        }
        continue;
      }
      actions.push(item);
      anchor = item;
    }

    const sortedActions = actions.slice().sort((a, b) => {
      const diff = a.TimeMicroseconds - b.TimeMicroseconds;
      if (diff !== 0) return diff;
      return this.eventOrder(a.Type) - this.eventOrder(b.Type);
    });

    const result: LegacyMacroEvent[] = [];
    for (const comment of leading) {
      comment.TimeMicroseconds = 0;
      result.push(comment);
    }
    for (const action of sortedActions) {
      this.AddAction(action, trailingByAction, result);
    }
    return result;
  }

  private static AddAction(
    action: LegacyMacroEvent,
    trailingByAction: Map<LegacyMacroEvent, LegacyMacroEvent[]>,
    result: LegacyMacroEvent[],
  ) {
    result.push(action);
    const attached = trailingByAction.get(action);
    if (attached) {
      for (const comment of attached) {
        comment.TimeMicroseconds = action.TimeMicroseconds;
        result.push(comment);
      }
    }
  }

  /**
   * RebaseToZero:
   * First normalizes. If empty, returns.
   * Finds first non-comment action. Origin = first.TimeMicroseconds.
   * Shifts all events by origin: Math.Max(0, e.TimeMicroseconds - origin).
   */
  public static rebaseToZero(events: readonly LegacyMacroEvent[]): LegacyMacroEvent[] {
    const normalized = this.normalize(events);
    if (normalized.length === 0) return normalized;
    const first = normalized.find((e) => e.Type !== 'Comment');
    const origin = first?.TimeMicroseconds ?? 0;
    if (origin === 0) return normalized;
    return normalized.map((item) => ({
      ...item,
      TimeMicroseconds: Math.max(0, item.TimeMicroseconds - origin),
    }));
  }

  /**
   * CompressMouseMoves:
   * Normalizes first. Combines MouseMove deltas falling in the same bucket:
   * bucketUs = bucketMilliseconds * 1000L.
   * Same bucket condition: pending.TimeMicroseconds / bucketUs == item.TimeMicroseconds / bucketUs.
   * Non-mouse move flushes pending mouse move.
   */
  public static compressMouseMoves(
    events: readonly LegacyMacroEvent[],
    bucketMilliseconds: number,
  ): LegacyMacroEvent[] {
    const source = this.normalize(events);
    if (bucketMilliseconds <= 0) return source;
    const output: LegacyMacroEvent[] = [];
    let pending: LegacyMacroEvent | null = null;
    const bucketUs = bucketMilliseconds * 1000;

    const flush = () => {
      if (pending !== null) {
        output.push(pending);
        pending = null;
      }
    };

    for (const item of source) {
      if (item.Type !== 'MouseMove') {
        flush();
        output.push(item);
        continue;
      }

      if (
        pending === null ||
        Math.floor(pending.TimeMicroseconds / bucketUs) !== Math.floor(item.TimeMicroseconds / bucketUs)
      ) {
        flush();
        pending = { ...item };
      } else {
        pending.DeltaX += item.DeltaX;
        pending.DeltaY += item.DeltaY;
        pending.TimeMicroseconds = item.TimeMicroseconds;
      }
    }
    flush();
    return output;
  }

  /**
   * ScaleTime:
   * Clamped between 0.1 and 10.0.
   * Multiplies TimeMicroseconds by factor (rounded to whole integer).
   * For OverlayText, also multiplies DurationMicroseconds by factor.
   */
  public static scaleTime(events: readonly LegacyMacroEvent[], factor: number): LegacyMacroEvent[] {
    if (factor < 0.1 || factor > 10.0) {
      throw new Error(`Scale factor ${factor} out of range [0.1, 10.0]`);
    }
    return events.map((e) => {
      const copy = { ...e };
      copy.TimeMicroseconds = Math.round(e.TimeMicroseconds * factor);
      if (e.Type === 'OverlayText') {
        copy.DurationMicroseconds = Math.round(e.DurationMicroseconds * factor);
      }
      return copy;
    });
  }

  /**
   * IsAutomaticTriggerMacro:
   * Filters out comments, sorts by TimeMicroseconds, then EventOrder.
   * Checks if the first event is PixelColorTrigger.
   */
  public static isAutomaticTrigger(events: readonly LegacyMacroEvent[]): boolean {
    const sorted = events
      .filter((e) => e.Type !== 'Comment')
      .slice()
      .sort((a, b) => {
        const diff = a.TimeMicroseconds - b.TimeMicroseconds;
        if (diff !== 0) return diff;
        return this.eventOrder(a.Type) - this.eventOrder(b.Type);
      });
    return sorted.length > 0 && sorted[0]?.Type === 'PixelColorTrigger';
  }
}

// --- 2. MacroLibraryStore Oracle ---

export class LegacyMacroLibraryStoreOracle {
  /**
   * Matches MacroLibraryStore.ComputeBundleHash:
   * Sorted ordinally by Name.
   * For each: utf8(name + "\n") header followed by raw bytes.
   * SHA-256 lowercase hex string.
   */
  public static computeBundleHash(entries: readonly { name: string; bytes: Buffer }[]): string {
    const sorted = entries.slice().sort((a, b) => {
      if (a.name < b.name) return -1;
      if (a.name > b.name) return 1;
      return 0;
    });

    const sha = crypto.createHash('sha256');
    for (const entry of sorted) {
      sha.update(Buffer.from(`${entry.name}\n`, 'utf-8'));
      sha.update(entry.bytes);
    }
    return sha.digest('hex').toLowerCase();
  }

  /**
   * Matches RescaleForDpi logic:
   * multiplier = targetDpi / sourceDpi
   * Rescales PixelX, PixelY, DeltaX, DeltaY (when AbsoluteMove is true).
   */
  public static rescaleForDpi(
    events: readonly LegacyMacroEvent[],
    sourceDpi: number,
    targetDpi: number,
  ): { events: LegacyMacroEvent[]; rescaled: boolean } {
    if (sourceDpi <= 0 || targetDpi <= 0 || sourceDpi === targetDpi) {
      return { events: events.map((e) => ({ ...e })), rescaled: false };
    }
    const factor = targetDpi / sourceDpi;
    const rescaledEvents = events.map((e) => {
      const copy = { ...e };
      if (e.Type === 'PixelColorTrigger' || e.Type === 'WaitForPixelGone') {
        copy.PixelX = Math.round(e.PixelX * factor);
        copy.PixelY = Math.round(e.PixelY * factor);
      } else if (e.Type === 'MouseMove' && e.AbsoluteMove) {
        copy.DeltaX = Math.round(e.DeltaX * factor);
        copy.DeltaY = Math.round(e.DeltaY * factor);
      }
      return copy;
    });
    return { events: rescaledEvents, rescaled: true };
  }

  /**
   * Legacy disambiguation with numeric suffixes:
   * "combo" -> "combo 2" -> "combo 3"
   */
  public static nextFreeName(name: string, takenNames: Set<string>): string {
    const base = name.trim();
    if (!takenNames.has(base.toLowerCase())) {
      return base;
    }
    let suffix = 2;
    while (takenNames.has(`${base} ${suffix}`.toLowerCase())) {
      suffix++;
    }
    return `${base} ${suffix}`;
  }
}

// --- 3. ActivationPolicy Oracle ---

export class LegacyActivationPolicyOracle {
  /**
   * Resolves activation behavior matching ActivationPolicy:
   * Modes: Once, WhileHeld, ToggleStop (with 50ms debounce guard), Restart.
   * If RepeatCount == 0 (RepeatForever), forces ToggleStop.
   */
  public static resolveMode(
    mode: ActivationMode | string,
    repeatCount: number,
    nowMs: number,
    lastToggleMs: number,
  ): { action: 'start' | 'stop' | 'ignore' | 'restart'; newLastToggleMs: number } {
    const effectiveMode = repeatCount === 0 ? ActivationMode.ToggleStop : mode;

    switch (effectiveMode) {
      case ActivationMode.Once:
      case 'Once':
        return { action: 'start', newLastToggleMs: lastToggleMs };

      case ActivationMode.WhileHeld:
      case 'WhileHeld':
        return { action: 'start', newLastToggleMs: lastToggleMs };

      case ActivationMode.ToggleStop:
      case 'ToggleStop': {
        // 50ms debounce guard
        if (nowMs - lastToggleMs < 50) {
          return { action: 'ignore', newLastToggleMs: lastToggleMs };
        }
        return { action: 'start', newLastToggleMs: nowMs };
      }

      case ActivationMode.Restart:
      case 'Restart':
        return { action: 'restart', newLastToggleMs: nowMs };

      default:
        return { action: 'start', newLastToggleMs: lastToggleMs };
    }
  }

  /**
   * RepeatForever toggle:
   * Enabling sets RepeatCount = 0 and forces ActivationMode to ToggleStop.
   * Disabling restores finite count (default 1).
   */
  public static applyRepeatForever(
    playback: { RepeatCount: number; ActivationMode: string },
    enabled: boolean,
    previousFiniteCount = 1,
  ): void {
    if (enabled) {
      playback.RepeatCount = 0;
      playback.ActivationMode = 'ToggleStop';
    } else {
      playback.RepeatCount = previousFiniteCount > 0 ? previousFiniteCount : 1;
    }
  }
}

// --- 4. OverlayCardOverride Oracle ---

export class LegacyOverlayCardOverrideOracle {
  /**
   * OverlayCardOverride.Resolve matches truth table:
   * ForceShow -> true
   * ForceHide -> false
   * Inherit -> appSetting
   */
  public static resolve(override: OverlayCardOverride | string, appSetting: boolean): boolean {
    if (override === OverlayCardOverride.ForceShow || override === 'ForceShow') return true;
    if (override === OverlayCardOverride.ForceHide || override === 'ForceHide') return false;
    return appSetting;
  }
}

// --- 5. TimelineEditor Oracle ---

export class LegacyTimelineEditorOracle {
  /**
   * Synchronizes intervals and absolute timestamps:
   * Changing interval of item i recalculates its absolute time and shifts subsequent items.
   */
  public static updateInterval(
    events: LegacyMacroEvent[],
    index: number,
    newIntervalUs: number,
  ): LegacyMacroEvent[] {
    const result = events.map((e) => ({ ...e }));
    if (index < 0 || index >= result.length) return result;

    const prevTime = index === 0 ? 0 : (result[index - 1]?.TimeMicroseconds ?? 0);
    const oldTime = result[index]?.TimeMicroseconds ?? 0;
    const newTime = prevTime + Math.max(0, newIntervalUs);
    const delta = newTime - oldTime;

    const target = result[index];
    if (target) {
      target.TimeMicroseconds = newTime;
    }
    for (let i = index + 1; i < result.length; i++) {
      const e = result[i];
      if (e) {
        e.TimeMicroseconds = Math.max(0, e.TimeMicroseconds + delta);
      }
    }
    return result;
  }

  /**
   * Deleting events compacts subsequent timestamps by the deleted duration.
   */
  public static deleteEvents(
    events: LegacyMacroEvent[],
    indexesToDelete: Set<number>,
  ): LegacyMacroEvent[] {
    if (indexesToDelete.size === 0) return events.slice();

    const surviving: LegacyMacroEvent[] = [];
    let shiftAccumulator = 0;

    for (let i = 0; i < events.length; i++) {
      const e = events[i]!;
      if (indexesToDelete.has(i)) {
        const nextTime = i + 1 < events.length ? (events[i + 1]?.TimeMicroseconds ?? e.TimeMicroseconds) : e.TimeMicroseconds;
        shiftAccumulator += Math.max(0, nextTime - e.TimeMicroseconds);
      } else {
        surviving.push({
          ...e,
          TimeMicroseconds: Math.max(0, e.TimeMicroseconds - shiftAccumulator),
        });
      }
    }
    return surviving;
  }
}

// --- 6. RunHistoryStore Oracle ---

export class LegacyRunHistoryStoreOracle {
  public static updateAggregate(
    current: { RunCount: number; MeanDurationMilliseconds: number; MaxJitterMilliseconds: number; FailureCount: number },
    runDurationMs: number,
    jitterMs: number,
    failed: boolean,
  ): { RunCount: number; MeanDurationMilliseconds: number; MaxJitterMilliseconds: number; FailureCount: number } {
    const newCount = current.RunCount + 1;
    const newMean = current.RunCount === 0
      ? runDurationMs
      : ((current.MeanDurationMilliseconds * current.RunCount) + runDurationMs) / newCount;
    const newMaxJitter = Math.max(current.MaxJitterMilliseconds, jitterMs);
    const newFailures = current.FailureCount + (failed ? 1 : 0);

    return {
      RunCount: newCount,
      MeanDurationMilliseconds: Math.round(newMean * 100) / 100,
      MaxJitterMilliseconds: Math.round(newMaxJitter * 100) / 100,
      FailureCount: newFailures,
    };
  }
}
