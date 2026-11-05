/**
 * Live recording session manager.
 */

import {
  cloneRecordingOptions,
  compressMouseMoves,
  createDefaultRecordingOptions,
  MacroEventType,
  MouseButton,
} from '../model/index.js';
import type { MacroEventModel } from '../model/event.js';
import type {
  HotkeyBinding,
  KeyDownEvent,
  KeyUpEvent,
  MacroEvent,
  MouseButtonDownEvent,
  MouseButtonUpEvent,
  RecordingOptions,
} from '../model/types.js';
import { type IPlaybackClock, Stopwatch } from './ports.js';

export class RecordingSession {
  private readonly _events: MacroEvent[] = [];
  private readonly _ignoredVirtualKeys = new Set<number>();
  private readonly _ignoredMouseButtons = new Set<MouseButton>();
  private readonly _pressedKeys = new Set<number>();
  private readonly _pressedButtons = new Set<MouseButton>();
  private _firstEventTimestamp?: number | undefined;
  private _startTimestamp = 0;
  private _recordedCount = 0;
  private _isRecording = false;
  private _options: RecordingOptions = createDefaultRecordingOptions();
  private _lastEvent: MacroEvent | null = null;

  public constructor(private readonly clock: IPlaybackClock = Stopwatch) {}

  public get isRecording(): boolean {
    return this._isRecording;
  }
  public get IsRecording(): boolean {
    return this._isRecording;
  }

  public get options(): RecordingOptions {
    return this._options;
  }
  public get Options(): RecordingOptions {
    return this._options;
  }

  public get lastEvent(): MacroEvent | null {
    return this._lastEvent;
  }
  public get LastEvent(): MacroEvent | null {
    return this._lastEvent;
  }

  public get recordedCount(): number {
    return this._recordedCount;
  }
  public get RecordedCount(): number {
    return this._recordedCount;
  }

  public get elapsedMicroseconds(): number {
    if (!this._isRecording) return 0;
    return Math.round(
      ((this.clock.getTimestamp() - this._startTimestamp) * 1_000_000) / this.clock.frequency,
    );
  }
  public get ElapsedMicroseconds(): number {
    return this.elapsedMicroseconds;
  }

  public start(
    options: RecordingOptions,
    ignoredHotkeys?: Iterable<HotkeyBinding> | null,
  ): void {
    this._events.length = 0;
    this._ignoredVirtualKeys.clear();
    this._ignoredMouseButtons.clear();
    this._pressedKeys.clear();
    this._pressedButtons.clear();

    if (ignoredHotkeys) {
      for (const hotkey of ignoredHotkeys) {
        if (hotkey.virtualKey !== 0) {
          this._ignoredVirtualKeys.add(hotkey.virtualKey);
        }
        if (hotkey.mouseButton !== MouseButton.None) {
          this._ignoredMouseButtons.add(hotkey.mouseButton);
        }
      }
    }

    this._options = cloneRecordingOptions(options);
    this._firstEventTimestamp = undefined;
    this._startTimestamp = this.clock.getTimestamp();
    this._recordedCount = 0;
    this._lastEvent = null;
    this._isRecording = true;
  }

  public Start(
    options: RecordingOptions,
    ignoredHotkeys?: Iterable<HotkeyBinding> | null,
  ): void {
    this.start(options, ignoredHotkeys);
  }

  public add(item: MacroEvent | MacroEventModel): void {
    const rawItem: MacroEvent =
      'toEvent' in item && typeof item.toEvent === 'function'
        ? item.toEvent()
        : (item as MacroEvent);

    if (!this._isRecording || !this.shouldRecord(rawItem) || !this.trackPressState(rawItem)) {
      return;
    }
    const timestamp = this.clock.getTimestamp();
    if (this._firstEventTimestamp === undefined) {
      this._firstEventTimestamp = timestamp;
    }
    const relativeTimeUs = Math.round(
      ((timestamp - this._firstEventTimestamp) * 1_000_000) / this.clock.frequency,
    );
    const recordedItem = { ...rawItem, timeMicroseconds: relativeTimeUs } as MacroEvent;
    (item as { timeMicroseconds?: number; TimeMicroseconds?: number }).timeMicroseconds =
      relativeTimeUs;
    (item as { timeMicroseconds?: number; TimeMicroseconds?: number }).TimeMicroseconds =
      relativeTimeUs;
    this._events.push(recordedItem);
    this._lastEvent = recordedItem;
    this._recordedCount = this._events.length;
  }

  public Add(item: MacroEvent | MacroEventModel): void {
    this.add(item);
  }

  public stop(): readonly MacroEvent[] {
    this._isRecording = false;
    return compressMouseMoves(this._events, this._options.mouseMoveBucketMilliseconds);
  }

  public Stop(): readonly MacroEvent[] {
    return this.stop();
  }

  private trackPressState(item: MacroEvent): boolean {
    switch (item.type) {
      case MacroEventType.KeyDown: {
        const vk = (item as KeyDownEvent).virtualKey;
        if (this._pressedKeys.has(vk)) return false;
        this._pressedKeys.add(vk);
        return true;
      }
      case MacroEventType.KeyUp: {
        const vk = (item as KeyUpEvent).virtualKey;
        if (!this._pressedKeys.has(vk)) return false;
        this._pressedKeys.delete(vk);
        return true;
      }
      case MacroEventType.MouseButtonDown: {
        const btn = (item as MouseButtonDownEvent).button;
        if (this._pressedButtons.has(btn)) return false;
        this._pressedButtons.add(btn);
        return true;
      }
      case MacroEventType.MouseButtonUp: {
        const btn = (item as MouseButtonUpEvent).button;
        if (!this._pressedButtons.has(btn)) return false;
        this._pressedButtons.delete(btn);
        return true;
      }
      default:
        return true;
    }
  }

  private shouldRecord(item: MacroEvent): boolean {
    if (
      (item.type === MacroEventType.KeyDown || item.type === MacroEventType.KeyUp) &&
      this._ignoredVirtualKeys.has((item as KeyDownEvent | KeyUpEvent).virtualKey)
    ) {
      return false;
    }
    if (
      (item.type === MacroEventType.MouseButtonDown || item.type === MacroEventType.MouseButtonUp) &&
      this._ignoredMouseButtons.has(
        (item as MouseButtonDownEvent | MouseButtonUpEvent).button,
      )
    ) {
      return false;
    }

    switch (item.type) {
      case MacroEventType.KeyDown:
      case MacroEventType.KeyUp:
        return this._options.keyboard;
      case MacroEventType.MouseMove:
        return this._options.mouseMovement;
      case MacroEventType.MouseButtonDown:
      case MacroEventType.MouseButtonUp:
        return this._options.mouseButtons;
      case MacroEventType.Wheel:
      case MacroEventType.HorizontalWheel:
        return this._options.mouseWheel;
      case MacroEventType.GamepadButtonDown:
      case MacroEventType.GamepadButtonUp:
      case MacroEventType.GamepadAxis:
        return this._options.gamepad;
      default:
        return true;
    }
  }
}
