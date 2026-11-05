/**
 * Timeline editing domain types, interfaces, and operation results.
 */

import type {
  GamepadAxis,
  GamepadButton,
  Guid,
  ISODateTimeString,
  MacroEvent,
  Microseconds,
  Milliseconds,
  MouseButton,
} from '../model/types.js';

/**
 * Result of a timeline editing operation.
 * Contains whether the timeline was mutated and the event IDs that should be selected.
 */
export class TimelineEditResult {
  public static readonly unchanged = new TimelineEditResult(false, []);
  public static readonly Unchanged = TimelineEditResult.unchanged;

  public constructor(
    public readonly changed: boolean,
    public readonly selectedEventIds: readonly Guid[],
  ) {}

  public get Changed(): boolean {
    return this.changed;
  }

  public get SelectedEventIds(): readonly Guid[] {
    return this.selectedEventIds;
  }
}

/**
 * Immutable snapshot of macro timeline state for per-macro undo/redo stacks.
 */
export interface TimelineSnapshot {
  readonly events: readonly MacroEvent[];
  readonly modifiedAt: ISODateTimeString;
  readonly selectedEventIds: readonly Guid[];
}

/**
 * Observable interface for a single row in the timeline view/editor.
 * Links absolute time and previous interval as two views of the same value.
 */
export interface TimelineRow {
  /** The underlying macro event. */
  event: MacroEvent;
  readonly Event: MacroEvent;

  /** Human-readable display string for this action. */
  readonly display: string;
  readonly Display: string;

  /** Whether this row is a non-dispatching separator comment row. */
  readonly isComment: boolean;
  readonly IsComment: boolean;

  /** Action comment note (for normal action) or row text (for comment row). */
  comment: string;
  Comment: string;

  /** Absolute start time in fractional milliseconds. */
  timeMilliseconds: number;
  TimeMilliseconds: number;

  /** Time interval in fractional milliseconds from the previous event (or 0 for the first). */
  intervalMilliseconds: number;
  IntervalMilliseconds: number;

  /** Subscribes to changes on this row. Returns an unsubscribe function. */
  subscribe(listener: (row: TimelineRow) => void): () => void;

  /** Triggers notification that time has changed. */
  notifyTimeChanged(): void;

  /** Triggers notification that comment has changed. */
  notifyCommentChanged(): void;

  /** Triggers notification that interval has changed. */
  notifyIntervalChanged(): void;
}

/**
 * Options for configuring TimelineEditor instances.
 */
export interface TimelineEditorOptions {
  /**
   * Maximum undo history stack depth per macro.
   * Defaults to 100. Set to 0 or Infinity for unbounded history.
   */
  readonly maxUndoDepth?: number | undefined;
}

/**
 * Callback listener invoked when timeline state changes (edits, undo, reload).
 */
export type TimelineChangeListener = () => void;

/**
 * Supported manual action types for the Add Action dialog and press-release synthesis.
 */
export enum ManualActionType {
  KeyPress = 'KeyPress',
  KeyDown = 'KeyDown',
  KeyUp = 'KeyUp',
  TypeText = 'TypeText',
  MouseClick = 'MouseClick',
  MouseDown = 'MouseDown',
  MouseUp = 'MouseUp',
  MouseMove = 'MouseMove',
  Wheel = 'Wheel',
  HorizontalWheel = 'HorizontalWheel',
  GamepadPress = 'GamepadPress',
  GamepadButtonDown = 'GamepadButtonDown',
  GamepadButtonUp = 'GamepadButtonUp',
  GamepadAxis = 'GamepadAxis',
  PixelColorTrigger = 'PixelColorTrigger',
  WaitForPixelGone = 'WaitForPixelGone',
  WaitForWindow = 'WaitForWindow',
  WaitForKey = 'WaitForKey',
  RunMacro = 'RunMacro',
  Delay = 'Delay',
  OverlayText = 'OverlayText',
  Comment = 'Comment',
}

/**
 * Parameters for creating a press-release pair with hold duration.
 */
export interface KeyPressPairOptions {
  readonly virtualKey?: number | undefined;
  readonly scanCode?: number | undefined;
  readonly extended?: boolean | undefined;
  readonly mouseButton?: MouseButton | undefined;
  readonly startTimeMicroseconds?: Microseconds | undefined;
  readonly holdDurationMicroseconds?: Microseconds | undefined;
  readonly comment?: string | undefined;
  readonly idDown?: Guid | undefined;
  readonly idUp?: Guid | undefined;
}

/**
 * Parameters for creating a mouse click press-release pair with hold duration.
 */
export interface MouseClickPairOptions {
  readonly button: MouseButton;
  readonly startTimeMicroseconds?: Microseconds | undefined;
  readonly holdDurationMicroseconds?: Microseconds | undefined;
  readonly comment?: string | undefined;
  readonly idDown?: Guid | undefined;
  readonly idUp?: Guid | undefined;
}

/**
 * Parameters for creating a gamepad button press-release pair with hold duration.
 */
export interface GamepadPressPairOptions {
  readonly button: GamepadButton;
  readonly padIndex?: number | undefined;
  readonly gamepadIndex?: number | undefined;
  readonly startTimeMicroseconds?: Microseconds | undefined;
  readonly holdDurationMicroseconds?: Microseconds | undefined;
  readonly comment?: string | undefined;
  readonly idDown?: Guid | undefined;
  readonly idUp?: Guid | undefined;
}

/**
 * Parameters for generating manual actions through the unified factory.
 */
export interface ManualActionParams {
  readonly type: ManualActionType;
  readonly startTimeMicroseconds?: Microseconds | undefined;
  readonly comment?: string | undefined;
  readonly virtualKey?: number | undefined;
  readonly scanCode?: number | undefined;
  readonly extended?: boolean | undefined;
  readonly mouseButton?: MouseButton | undefined;
  readonly deltaX?: number | undefined;
  readonly deltaY?: number | undefined;
  readonly wheelDelta?: number | undefined;
  readonly gamepadButton?: GamepadButton | undefined;
  readonly gamepadAxis?: GamepadAxis | undefined;
  readonly axisValue?: number | undefined;
  readonly text?: string | undefined;
  readonly durationMicroseconds?: Microseconds | undefined;
  readonly showOverlayTiming?: boolean | undefined;
  readonly pixelX?: number | undefined;
  readonly pixelY?: number | undefined;
  readonly pixelColor?: number | undefined;
  readonly triggerCooldownMilliseconds?: Milliseconds | undefined;
  readonly waitTimeoutMilliseconds?: Milliseconds | undefined;
  readonly waitProcessName?: string | undefined;
  readonly waitWindowTitle?: string | undefined;
  readonly waitKeyVirtualKey?: number | undefined;
  readonly subMacroName?: string | undefined;
}

/**
 * Result of synthesizing a manual action block, including the created events and shift bounds.
 */
export interface ManualActionResult {
  readonly events: readonly MacroEvent[];
  readonly shiftAfterMicroseconds: Microseconds;
  readonly shiftDurationMicroseconds: Microseconds;
  readonly occupiedMicroseconds?: Microseconds | undefined;
}
