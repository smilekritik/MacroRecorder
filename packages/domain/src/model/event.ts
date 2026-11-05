/**
 * Macro event domain models, factory constructors, immutable helpers.
 */

import {
  fromWireMacroEvent,
  macroEventSchema,
  sendsInput as contractSendsInput,
  takesTime as contractTakesTime,
} from '../../../contracts/src/index.js';
import { formatMacroEventDisplay, getEventEndTimeMicroseconds } from './display.js';
import {
  type CommentEvent,
  type DelayEvent,
  type GamepadAxis,
  type GamepadAxisEvent,
  type GamepadButton,
  type GamepadButtonDownEvent,
  type GamepadButtonUpEvent,
  type Guid,
  type HorizontalWheelEvent,
  InputDevice,
  type KeyDownEvent,
  type KeyUpEvent,
  type MacroEvent,
  MacroEventType,
  type MacroEventWire,
  type Microseconds,
  type MouseButton,
  type MouseButtonDownEvent,
  type MouseButtonUpEvent,
  type MouseMoveEvent,
  type OverlayTextEvent,
  type PixelColorTriggerEvent,
  type RunMacroEvent,
  type TypeTextEvent,
  type ValidationResult,
  type WaitForPixelGoneEvent,
  type WaitForKeyEvent,
  type WaitForWindowEvent,
  type WheelEvent,
} from './types.js';

export { formatMacroEventDisplay, getEventEndTimeMicroseconds } from './display.js';
export { sendsInput, takesTime } from '../../../contracts/src/index.js';

/**
 * Checks if an event is a comment row (sends no input, takes no time, serves as separator).
 */
export function isCommentEvent(event: MacroEvent): boolean {
  return event.type === MacroEventType.Comment;
}

/**
 * Checks if an event is a blocking wait condition.
 * Blocking waits come first when actions share identical timestamps.
 */
export function isWaitEvent(event: MacroEvent): boolean {
  return (
    event.type === MacroEventType.PixelColorTrigger ||
    event.type === MacroEventType.WaitForPixelGone ||
    event.type === MacroEventType.WaitForWindow ||
    event.type === MacroEventType.WaitForKey
  );
}

/**
 * Gets user-facing time in fractional milliseconds.
 */
export function getEventTimeMilliseconds(event: MacroEvent): number {
  return event.timeMicroseconds / 1000.0;
}

/**
 * Gets user-facing end time in fractional milliseconds.
 */
export function getEventEndTimeMilliseconds(event: MacroEvent): number {
  return getEventEndTimeMicroseconds(event) / 1000.0;
}

/**
 * Returns a cloned event with updated time from milliseconds.
 */
export function withEventTimeMilliseconds<E extends MacroEvent>(
  event: E,
  timeMilliseconds: number,
): E {
  const timeMicroseconds = Math.max(0, Math.round(timeMilliseconds * 1000));
  return {
    ...event,
    timeMicroseconds,
  };
}

/**
 * Validates a MacroEvent against wire schema.
 */
export function validateMacroEvent(input: unknown, path = ''): ValidationResult<MacroEvent> {
  if (typeof input === 'object' && input !== null) {
    return fromWireMacroEvent(input, path);
  }
  return macroEventSchema.parse(input, path);
}

/**
 * Performs deep immutable cloning of a MacroEvent.
 */
export function cloneMacroEvent(event: MacroEvent): MacroEvent {
  switch (event.type) {
    case MacroEventType.KeyDown:
    case MacroEventType.KeyUp:
      return { ...event };
    case MacroEventType.MouseMove:
      return { ...event };
    case MacroEventType.MouseButtonDown:
    case MacroEventType.MouseButtonUp:
      return { ...event };
    case MacroEventType.Wheel:
    case MacroEventType.HorizontalWheel:
      return { ...event };
    case MacroEventType.Delay:
      return { ...event };
    case MacroEventType.OverlayText:
      return { ...event };
    case MacroEventType.PixelColorTrigger:
      return { ...event };
    case MacroEventType.Comment:
      return { ...event };
    case MacroEventType.GamepadButtonDown:
    case MacroEventType.GamepadButtonUp:
    case MacroEventType.GamepadAxis:
      return { ...event };
    case MacroEventType.TypeText:
      return { ...event };
    case MacroEventType.WaitForPixelGone:
    case MacroEventType.WaitForWindow:
    case MacroEventType.WaitForKey:
    case MacroEventType.RunMacro:
      return { ...event };
    default: {
      const exhaustiveCheck: never = event;
      return exhaustiveCheck;
    }
  }
}

// ---------------------------------------------------------------------------
// Specific Factory Functions for All 19 Types
// ---------------------------------------------------------------------------

export function createKeyDownEvent(params: {
  readonly virtualKey: number;
  readonly scanCode?: number;
  readonly extended?: boolean;
  readonly timeMicroseconds?: Microseconds;
  readonly comment?: string;
  readonly id?: Guid;
}): KeyDownEvent {
  return {
    id: params.id ?? crypto.randomUUID(),
    timeMicroseconds: Math.max(0, Math.round(params.timeMicroseconds ?? 0)),
    comment: params.comment ?? '',
    type: MacroEventType.KeyDown,
    device: InputDevice.Keyboard,
    virtualKey: params.virtualKey,
    scanCode: params.scanCode ?? 0,
    extended: params.extended ?? false,
  };
}

export function createKeyUpEvent(params: {
  readonly virtualKey: number;
  readonly scanCode?: number;
  readonly extended?: boolean;
  readonly timeMicroseconds?: Microseconds;
  readonly comment?: string;
  readonly id?: Guid;
}): KeyUpEvent {
  return {
    id: params.id ?? crypto.randomUUID(),
    timeMicroseconds: Math.max(0, Math.round(params.timeMicroseconds ?? 0)),
    comment: params.comment ?? '',
    type: MacroEventType.KeyUp,
    device: InputDevice.Keyboard,
    virtualKey: params.virtualKey,
    scanCode: params.scanCode ?? 0,
    extended: params.extended ?? false,
  };
}

export function createMouseMoveEvent(params: {
  readonly deltaX: number;
  readonly deltaY: number;
  readonly absoluteMove?: boolean;
  readonly timeMicroseconds?: Microseconds;
  readonly comment?: string;
  readonly id?: Guid;
}): MouseMoveEvent {
  return {
    id: params.id ?? crypto.randomUUID(),
    timeMicroseconds: Math.max(0, Math.round(params.timeMicroseconds ?? 0)),
    comment: params.comment ?? '',
    type: MacroEventType.MouseMove,
    device: InputDevice.Mouse,
    deltaX: params.deltaX,
    deltaY: params.deltaY,
    absoluteMove: params.absoluteMove ?? false,
  };
}

export function createMouseButtonDownEvent(params: {
  readonly button: MouseButton;
  readonly timeMicroseconds?: Microseconds;
  readonly comment?: string;
  readonly id?: Guid;
}): MouseButtonDownEvent {
  return {
    id: params.id ?? crypto.randomUUID(),
    timeMicroseconds: Math.max(0, Math.round(params.timeMicroseconds ?? 0)),
    comment: params.comment ?? '',
    type: MacroEventType.MouseButtonDown,
    device: InputDevice.Mouse,
    button: params.button,
  };
}

export function createMouseButtonUpEvent(params: {
  readonly button: MouseButton;
  readonly timeMicroseconds?: Microseconds;
  readonly comment?: string;
  readonly id?: Guid;
}): MouseButtonUpEvent {
  return {
    id: params.id ?? crypto.randomUUID(),
    timeMicroseconds: Math.max(0, Math.round(params.timeMicroseconds ?? 0)),
    comment: params.comment ?? '',
    type: MacroEventType.MouseButtonUp,
    device: InputDevice.Mouse,
    button: params.button,
  };
}

export function createWheelEvent(params: {
  readonly wheelDelta: number;
  readonly timeMicroseconds?: Microseconds;
  readonly comment?: string;
  readonly id?: Guid;
}): WheelEvent {
  return {
    id: params.id ?? crypto.randomUUID(),
    timeMicroseconds: Math.max(0, Math.round(params.timeMicroseconds ?? 0)),
    comment: params.comment ?? '',
    type: MacroEventType.Wheel,
    device: InputDevice.Mouse,
    wheelDelta: params.wheelDelta,
  };
}

export function createHorizontalWheelEvent(params: {
  readonly wheelDelta: number;
  readonly timeMicroseconds?: Microseconds;
  readonly comment?: string;
  readonly id?: Guid;
}): HorizontalWheelEvent {
  return {
    id: params.id ?? crypto.randomUUID(),
    timeMicroseconds: Math.max(0, Math.round(params.timeMicroseconds ?? 0)),
    comment: params.comment ?? '',
    type: MacroEventType.HorizontalWheel,
    device: InputDevice.Mouse,
    wheelDelta: params.wheelDelta,
  };
}

export function createDelayEvent(params: {
  readonly durationMicroseconds: Microseconds;
  readonly timeMicroseconds?: Microseconds;
  readonly comment?: string;
  readonly id?: Guid;
}): DelayEvent {
  return {
    id: params.id ?? crypto.randomUUID(),
    timeMicroseconds: Math.max(0, Math.round(params.timeMicroseconds ?? 0)),
    comment: params.comment ?? '',
    type: MacroEventType.Delay,
    durationMicroseconds: Math.max(0, Math.round(params.durationMicroseconds)),
  };
}

export function createOverlayTextEvent(params: {
  readonly text: string;
  readonly durationMicroseconds?: Microseconds;
  readonly showOverlayTiming?: boolean;
  readonly timeMicroseconds?: Microseconds;
  readonly comment?: string;
  readonly id?: Guid;
}): OverlayTextEvent {
  return {
    id: params.id ?? crypto.randomUUID(),
    timeMicroseconds: Math.max(0, Math.round(params.timeMicroseconds ?? 0)),
    comment: params.comment ?? '',
    type: MacroEventType.OverlayText,
    text: params.text,
    durationMicroseconds: Math.max(0, Math.round(params.durationMicroseconds ?? 0)),
    showOverlayTiming: params.showOverlayTiming ?? true,
  };
}

export function createPixelColorTriggerEvent(params: {
  readonly pixelX: number;
  readonly pixelY: number;
  readonly pixelColor: number;
  readonly triggerCooldownMilliseconds?: number;
  readonly timeMicroseconds?: Microseconds;
  readonly comment?: string;
  readonly id?: Guid;
}): PixelColorTriggerEvent {
  return {
    id: params.id ?? crypto.randomUUID(),
    timeMicroseconds: Math.max(0, Math.round(params.timeMicroseconds ?? 0)),
    comment: params.comment ?? '',
    type: MacroEventType.PixelColorTrigger,
    pixelX: params.pixelX,
    pixelY: params.pixelY,
    pixelColor: params.pixelColor,
    triggerCooldownMilliseconds: Math.max(0, params.triggerCooldownMilliseconds ?? 3000),
  };
}

export function createCommentEvent(params: {
  readonly text: string;
  readonly timeMicroseconds?: Microseconds;
  readonly comment?: string;
  readonly id?: Guid;
}): CommentEvent {
  return {
    id: params.id ?? crypto.randomUUID(),
    timeMicroseconds: Math.max(0, Math.round(params.timeMicroseconds ?? 0)),
    comment: params.comment ?? '',
    type: MacroEventType.Comment,
    text: params.text,
  };
}

export function createGamepadButtonDownEvent(params: {
  readonly gamepadButton: GamepadButton;
  readonly padIndex?: number;
  readonly timeMicroseconds?: Microseconds;
  readonly comment?: string;
  readonly id?: Guid;
}): GamepadButtonDownEvent {
  return {
    id: params.id ?? crypto.randomUUID(),
    timeMicroseconds: Math.max(0, Math.round(params.timeMicroseconds ?? 0)),
    comment: params.comment ?? '',
    type: MacroEventType.GamepadButtonDown,
    device: InputDevice.Gamepad,
    gamepadButton: params.gamepadButton,
    padIndex: Math.max(0, Math.min(3, params.padIndex ?? 0)),
  };
}

export function createGamepadButtonUpEvent(params: {
  readonly gamepadButton: GamepadButton;
  readonly padIndex?: number;
  readonly timeMicroseconds?: Microseconds;
  readonly comment?: string;
  readonly id?: Guid;
}): GamepadButtonUpEvent {
  return {
    id: params.id ?? crypto.randomUUID(),
    timeMicroseconds: Math.max(0, Math.round(params.timeMicroseconds ?? 0)),
    comment: params.comment ?? '',
    type: MacroEventType.GamepadButtonUp,
    device: InputDevice.Gamepad,
    gamepadButton: params.gamepadButton,
    padIndex: Math.max(0, Math.min(3, params.padIndex ?? 0)),
  };
}

export function createGamepadAxisEvent(params: {
  readonly gamepadAxis: GamepadAxis;
  readonly axisValue: number;
  readonly padIndex?: number;
  readonly timeMicroseconds?: Microseconds;
  readonly comment?: string;
  readonly id?: Guid;
}): GamepadAxisEvent {
  return {
    id: params.id ?? crypto.randomUUID(),
    timeMicroseconds: Math.max(0, Math.round(params.timeMicroseconds ?? 0)),
    comment: params.comment ?? '',
    type: MacroEventType.GamepadAxis,
    device: InputDevice.Gamepad,
    gamepadAxis: params.gamepadAxis,
    axisValue: params.axisValue,
    padIndex: Math.max(0, Math.min(3, params.padIndex ?? 0)),
  };
}

export function createTypeTextEvent(params: {
  readonly text: string;
  readonly timeMicroseconds?: Microseconds;
  readonly comment?: string;
  readonly id?: Guid;
}): TypeTextEvent {
  return {
    id: params.id ?? crypto.randomUUID(),
    timeMicroseconds: Math.max(0, Math.round(params.timeMicroseconds ?? 0)),
    comment: params.comment ?? '',
    type: MacroEventType.TypeText,
    device: InputDevice.Keyboard,
    text: params.text,
  };
}

export function createWaitForPixelGoneEvent(params: {
  readonly pixelX: number;
  readonly pixelY: number;
  readonly pixelColor: number;
  readonly waitTimeoutMilliseconds?: number;
  readonly timeMicroseconds?: Microseconds;
  readonly comment?: string;
  readonly id?: Guid;
}): WaitForPixelGoneEvent {
  return {
    id: params.id ?? crypto.randomUUID(),
    timeMicroseconds: Math.max(0, Math.round(params.timeMicroseconds ?? 0)),
    comment: params.comment ?? '',
    type: MacroEventType.WaitForPixelGone,
    pixelX: params.pixelX,
    pixelY: params.pixelY,
    pixelColor: params.pixelColor,
    waitTimeoutMilliseconds: Math.max(0, params.waitTimeoutMilliseconds ?? 0),
  };
}

export function createWaitForWindowEvent(params: {
  readonly waitProcessName?: string;
  readonly waitWindowTitle?: string;
  readonly waitTimeoutMilliseconds?: number;
  readonly timeMicroseconds?: Microseconds;
  readonly comment?: string;
  readonly id?: Guid;
}): WaitForWindowEvent {
  return {
    id: params.id ?? crypto.randomUUID(),
    timeMicroseconds: Math.max(0, Math.round(params.timeMicroseconds ?? 0)),
    comment: params.comment ?? '',
    type: MacroEventType.WaitForWindow,
    waitProcessName: params.waitProcessName ?? '',
    waitWindowTitle: params.waitWindowTitle ?? '',
    waitTimeoutMilliseconds: Math.max(0, params.waitTimeoutMilliseconds ?? 0),
  };
}

export function createWaitForKeyEvent(params: {
  readonly waitKeyVirtualKey: number;
  readonly waitTimeoutMilliseconds?: number;
  readonly timeMicroseconds?: Microseconds;
  readonly comment?: string;
  readonly id?: Guid;
}): WaitForKeyEvent {
  return {
    id: params.id ?? crypto.randomUUID(),
    timeMicroseconds: Math.max(0, Math.round(params.timeMicroseconds ?? 0)),
    comment: params.comment ?? '',
    type: MacroEventType.WaitForKey,
    waitKeyVirtualKey: params.waitKeyVirtualKey,
    waitTimeoutMilliseconds: Math.max(0, params.waitTimeoutMilliseconds ?? 0),
  };
}

export function createRunMacroEvent(params: {
  readonly subMacroName: string;
  readonly timeMicroseconds?: Microseconds;
  readonly comment?: string;
  readonly id?: Guid;
}): RunMacroEvent {
  return {
    id: params.id ?? crypto.randomUUID(),
    timeMicroseconds: Math.max(0, Math.round(params.timeMicroseconds ?? 0)),
    comment: params.comment ?? '',
    type: MacroEventType.RunMacro,
    subMacroName: params.subMacroName,
  };
}

/**
 * Creates any MacroEvent from raw wire format or partial initialization record.
 */
export function createMacroEvent(raw: unknown): MacroEvent {
  const parsed = fromWireMacroEvent(raw);
  if (parsed.success) {
    return parsed.data;
  }
  // Fallback to delay
  return createDelayEvent({ durationMicroseconds: 0 });
}

/**
 * Object-oriented model wrapper around MacroEvent.
 * with MacroEvent class properties and display semantics.
 */
export class MacroEventModel {
  private _event: MacroEvent;

  public constructor(init?: Partial<MacroEvent> | MacroEventWire) {
    const raw = init ?? {};
    const parsed = fromWireMacroEvent({
      id: crypto.randomUUID(),
      timeMicroseconds: 0,
      type: MacroEventType.Delay,
      durationMicroseconds: 0,
      comment: '',
      ...raw,
    });
    this._event = parsed.success ? parsed.data : createDelayEvent({ durationMicroseconds: 0 });
  }

  public get id(): Guid {
    return this._event.id;
  }
  public get Id(): Guid {
    return this._event.id;
  }

  public get timeMicroseconds(): Microseconds {
    return this._event.timeMicroseconds;
  }
  public set timeMicroseconds(val: Microseconds) {
    this._event = { ...this._event, timeMicroseconds: Math.max(0, Math.round(val)) };
  }
  public get TimeMicroseconds(): Microseconds {
    return this.timeMicroseconds;
  }
  public set TimeMicroseconds(val: Microseconds) {
    this.timeMicroseconds = val;
  }

  public get timeMilliseconds(): number {
    return getEventTimeMilliseconds(this._event);
  }
  public set timeMilliseconds(val: number) {
    this.timeMicroseconds = Math.max(0, Math.round(val * 1000));
  }
  public get TimeMilliseconds(): number {
    return this.timeMilliseconds;
  }
  public set TimeMilliseconds(val: number) {
    this.timeMilliseconds = val;
  }

  public get type(): MacroEventType {
    return this._event.type;
  }
  public get Type(): MacroEventType {
    return this._event.type;
  }

  public get device(): InputDevice | undefined {
    return 'device' in this._event ? this._event.device : undefined;
  }
  public get Device(): InputDevice | undefined {
    return this.device;
  }

  public get virtualKey(): number | undefined {
    return 'virtualKey' in this._event ? this._event.virtualKey : undefined;
  }
  public get VirtualKey(): number | undefined {
    return this.virtualKey;
  }

  public get scanCode(): number | undefined {
    return 'scanCode' in this._event ? this._event.scanCode : undefined;
  }
  public get ScanCode(): number | undefined {
    return this.scanCode;
  }

  public get extended(): boolean | undefined {
    return 'extended' in this._event ? this._event.extended : undefined;
  }
  public get Extended(): boolean | undefined {
    return this.extended;
  }

  public get button(): MouseButton | undefined {
    return 'button' in this._event ? this._event.button : undefined;
  }
  public get Button(): MouseButton | undefined {
    return this.button;
  }

  public get deltaX(): number | undefined {
    return 'deltaX' in this._event ? this._event.deltaX : undefined;
  }
  public get DeltaX(): number | undefined {
    return this.deltaX;
  }

  public get deltaY(): number | undefined {
    return 'deltaY' in this._event ? this._event.deltaY : undefined;
  }
  public get DeltaY(): number | undefined {
    return this.deltaY;
  }

  public get wheelDelta(): number | undefined {
    return 'wheelDelta' in this._event ? this._event.wheelDelta : undefined;
  }
  public get WheelDelta(): number | undefined {
    return this.wheelDelta;
  }

  public get absoluteMove(): boolean | undefined {
    return 'absoluteMove' in this._event ? this._event.absoluteMove : undefined;
  }
  public get AbsoluteMove(): boolean | undefined {
    return this.absoluteMove;
  }

  public get gamepadButton(): GamepadButton | undefined {
    return 'gamepadButton' in this._event ? this._event.gamepadButton : undefined;
  }
  public get GamepadButton(): GamepadButton | undefined {
    return this.gamepadButton;
  }

  public get gamepadAxis(): GamepadAxis | undefined {
    return 'gamepadAxis' in this._event ? this._event.gamepadAxis : undefined;
  }
  public get GamepadAxis(): GamepadAxis | undefined {
    return this.gamepadAxis;
  }

  public get axisValue(): number | undefined {
    return 'axisValue' in this._event ? this._event.axisValue : undefined;
  }
  public get AxisValue(): number | undefined {
    return this.axisValue;
  }

  public get padIndex(): number | undefined {
    return 'padIndex' in this._event ? this._event.padIndex : undefined;
  }
  public get PadIndex(): number | undefined {
    return this.padIndex;
  }

  public get text(): string | undefined {
    return 'text' in this._event ? this._event.text : undefined;
  }
  public get Text(): string | undefined {
    return this.text;
  }

  public get comment(): string {
    return this._event.comment;
  }
  public set comment(val: string) {
    this._event = { ...this._event, comment: val };
  }
  public get Comment(): string {
    return this.comment;
  }
  public set Comment(val: string) {
    this.comment = val;
  }

  public get durationMicroseconds(): Microseconds | undefined {
    return 'durationMicroseconds' in this._event ? this._event.durationMicroseconds : undefined;
  }
  public set durationMicroseconds(val: Microseconds | undefined) {
    if ('durationMicroseconds' in this._event && val !== undefined) {
      this._event = { ...this._event, durationMicroseconds: Math.max(0, Math.round(val)) };
    }
  }
  public get DurationMicroseconds(): Microseconds | undefined {
    return this.durationMicroseconds;
  }
  public set DurationMicroseconds(val: Microseconds | undefined) {
    this.durationMicroseconds = val;
  }

  public get showOverlayTiming(): boolean | undefined {
    return 'showOverlayTiming' in this._event ? this._event.showOverlayTiming : undefined;
  }
  public get ShowOverlayTiming(): boolean | undefined {
    return this.showOverlayTiming;
  }

  public get pixelX(): number | undefined {
    return 'pixelX' in this._event ? this._event.pixelX : undefined;
  }
  public get PixelX(): number | undefined {
    return this.pixelX;
  }

  public get pixelY(): number | undefined {
    return 'pixelY' in this._event ? this._event.pixelY : undefined;
  }
  public get PixelY(): number | undefined {
    return this.pixelY;
  }

  public get pixelColor(): number | undefined {
    return 'pixelColor' in this._event ? this._event.pixelColor : undefined;
  }
  public get PixelColor(): number | undefined {
    return this.pixelColor;
  }

  public get triggerCooldownMilliseconds(): number | undefined {
    return 'triggerCooldownMilliseconds' in this._event
      ? this._event.triggerCooldownMilliseconds
      : undefined;
  }
  public get TriggerCooldownMilliseconds(): number | undefined {
    return this.triggerCooldownMilliseconds;
  }

  public get waitProcessName(): string | undefined {
    return 'waitProcessName' in this._event ? this._event.waitProcessName : undefined;
  }
  public get WaitProcessName(): string | undefined {
    return this.waitProcessName;
  }

  public get waitWindowTitle(): string | undefined {
    return 'waitWindowTitle' in this._event ? this._event.waitWindowTitle : undefined;
  }
  public get WaitWindowTitle(): string | undefined {
    return this.waitWindowTitle;
  }

  public get waitKeyVirtualKey(): number | undefined {
    return 'waitKeyVirtualKey' in this._event ? this._event.waitKeyVirtualKey : undefined;
  }
  public get WaitKeyVirtualKey(): number | undefined {
    return this.waitKeyVirtualKey;
  }

  public get waitTimeoutMilliseconds(): number | undefined {
    return 'waitTimeoutMilliseconds' in this._event
      ? this._event.waitTimeoutMilliseconds
      : undefined;
  }
  public get WaitTimeoutMilliseconds(): number | undefined {
    return this.waitTimeoutMilliseconds;
  }

  public get subMacroName(): string | undefined {
    return 'subMacroName' in this._event ? this._event.subMacroName : undefined;
  }
  public get SubMacroName(): string | undefined {
    return this.subMacroName;
  }

  public get sendsInput(): boolean {
    return contractSendsInput(this._event);
  }
  public get SendsInput(): boolean {
    return this.sendsInput;
  }

  public get takesTime(): boolean {
    return contractTakesTime(this._event);
  }
  public get TakesTime(): boolean {
    return this.takesTime;
  }

  public get isComment(): boolean {
    return isCommentEvent(this._event);
  }
  public get IsComment(): boolean {
    return this.isComment;
  }

  public get endTimeMicroseconds(): Microseconds {
    return getEventEndTimeMicroseconds(this._event);
  }
  public get EndTimeMicroseconds(): Microseconds {
    return this.endTimeMicroseconds;
  }

  public get display(): string {
    return formatMacroEventDisplay(this._event);
  }
  public get Display(): string {
    return this.display;
  }

  public toEvent(): MacroEvent {
    return cloneMacroEvent(this._event);
  }

  public clone(): MacroEventModel {
    return new MacroEventModel(this.toEvent());
  }
}
