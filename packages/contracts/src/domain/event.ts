/**
 * Macro event contracts, discriminated unions, wire representations,
 * and exhaustive MacroEventType handling.
 */

import { type Guid, type Microseconds } from '../common/types.js';
import { type Schema, type ValidationResult } from '../common/validation.js';
import { GamepadAxis, GamepadButton, InputDevice, MacroEventType, MouseButton } from './enums.js';

// Base fields shared across all variants
export interface MacroEventBase {
  readonly id: Guid;
  readonly timeMicroseconds: Microseconds;
  readonly comment: string;
}

export interface KeyDownEvent extends MacroEventBase {
  readonly type: typeof MacroEventType.KeyDown;
  readonly device: typeof InputDevice.Keyboard;
  readonly virtualKey: number;
  readonly scanCode: number;
  readonly extended: boolean;
}

export interface KeyUpEvent extends MacroEventBase {
  readonly type: typeof MacroEventType.KeyUp;
  readonly device: typeof InputDevice.Keyboard;
  readonly virtualKey: number;
  readonly scanCode: number;
  readonly extended: boolean;
}

export interface MouseMoveEvent extends MacroEventBase {
  readonly type: typeof MacroEventType.MouseMove;
  readonly device: typeof InputDevice.Mouse;
  readonly deltaX: number;
  readonly deltaY: number;
  readonly absoluteMove: boolean;
}

export interface MouseButtonDownEvent extends MacroEventBase {
  readonly type: typeof MacroEventType.MouseButtonDown;
  readonly device: typeof InputDevice.Mouse;
  readonly button: MouseButton;
}

export interface MouseButtonUpEvent extends MacroEventBase {
  readonly type: typeof MacroEventType.MouseButtonUp;
  readonly device: typeof InputDevice.Mouse;
  readonly button: MouseButton;
}

export interface WheelEvent extends MacroEventBase {
  readonly type: typeof MacroEventType.Wheel;
  readonly device: typeof InputDevice.Mouse;
  readonly wheelDelta: number;
}

export interface HorizontalWheelEvent extends MacroEventBase {
  readonly type: typeof MacroEventType.HorizontalWheel;
  readonly device: typeof InputDevice.Mouse;
  readonly wheelDelta: number;
}

export interface DelayEvent extends MacroEventBase {
  readonly type: typeof MacroEventType.Delay;
  readonly durationMicroseconds: Microseconds;
}

export interface OverlayTextEvent extends MacroEventBase {
  readonly type: typeof MacroEventType.OverlayText;
  readonly text: string;
  readonly durationMicroseconds: Microseconds;
  readonly showOverlayTiming: boolean;
}

export interface PixelColorTriggerEvent extends MacroEventBase {
  readonly type: typeof MacroEventType.PixelColorTrigger;
  readonly pixelX: number;
  readonly pixelY: number;
  readonly pixelColor: number;
  readonly triggerCooldownMilliseconds: number;
}

export interface CommentEvent extends MacroEventBase {
  readonly type: typeof MacroEventType.Comment;
  readonly text: string;
}

export interface GamepadButtonDownEvent extends MacroEventBase {
  readonly type: typeof MacroEventType.GamepadButtonDown;
  readonly device: typeof InputDevice.Gamepad;
  readonly gamepadButton: GamepadButton;
  readonly padIndex: number;
}

export interface GamepadButtonUpEvent extends MacroEventBase {
  readonly type: typeof MacroEventType.GamepadButtonUp;
  readonly device: typeof InputDevice.Gamepad;
  readonly gamepadButton: GamepadButton;
  readonly padIndex: number;
}

export interface GamepadAxisEvent extends MacroEventBase {
  readonly type: typeof MacroEventType.GamepadAxis;
  readonly device: typeof InputDevice.Gamepad;
  readonly gamepadAxis: GamepadAxis;
  readonly axisValue: number;
  readonly padIndex: number;
}

export interface TypeTextEvent extends MacroEventBase {
  readonly type: typeof MacroEventType.TypeText;
  readonly device: typeof InputDevice.Keyboard;
  readonly text: string;
}

export interface WaitForPixelGoneEvent extends MacroEventBase {
  readonly type: typeof MacroEventType.WaitForPixelGone;
  readonly pixelX: number;
  readonly pixelY: number;
  readonly pixelColor: number;
  readonly waitTimeoutMilliseconds: number;
}

export interface WaitForWindowEvent extends MacroEventBase {
  readonly type: typeof MacroEventType.WaitForWindow;
  readonly waitProcessName: string;
  readonly waitWindowTitle: string;
  readonly waitTimeoutMilliseconds: number;
}

export interface WaitForKeyEvent extends MacroEventBase {
  readonly type: typeof MacroEventType.WaitForKey;
  readonly waitKeyVirtualKey: number;
  readonly waitTimeoutMilliseconds: number;
}

export interface RunMacroEvent extends MacroEventBase {
  readonly type: typeof MacroEventType.RunMacro;
  readonly subMacroName: string;
}

/**
 * Strict discriminated union across all 19 macro action types.
 */
export type MacroEvent =
  | KeyDownEvent
  | KeyUpEvent
  | MouseMoveEvent
  | MouseButtonDownEvent
  | MouseButtonUpEvent
  | WheelEvent
  | HorizontalWheelEvent
  | DelayEvent
  | OverlayTextEvent
  | PixelColorTriggerEvent
  | CommentEvent
  | GamepadButtonDownEvent
  | GamepadButtonUpEvent
  | GamepadAxisEvent
  | TypeTextEvent
  | WaitForPixelGoneEvent
  | WaitForWindowEvent
  | WaitForKeyEvent
  | RunMacroEvent;

/**
 * Flat serialized MacroEvent record shape (supports case-insensitive Pascal/camel case).
 */
export interface MacroEventWire {
  readonly Id?: string | undefined;
  readonly id?: string | undefined;
  readonly TimeMicroseconds?: number | undefined;
  readonly timeMicroseconds?: number | undefined;
  readonly Device?: InputDevice | undefined;
  readonly device?: InputDevice | undefined;
  readonly Type?: MacroEventType | undefined;
  readonly type?: MacroEventType | undefined;
  readonly VirtualKey?: number | undefined;
  readonly virtualKey?: number | undefined;
  readonly ScanCode?: number | undefined;
  readonly scanCode?: number | undefined;
  readonly Extended?: boolean | undefined;
  readonly extended?: boolean | undefined;
  readonly Button?: MouseButton | undefined;
  readonly button?: MouseButton | undefined;
  readonly DeltaX?: number | undefined;
  readonly deltaX?: number | undefined;
  readonly DeltaY?: number | undefined;
  readonly deltaY?: number | undefined;
  readonly WheelDelta?: number | undefined;
  readonly wheelDelta?: number | undefined;
  readonly AbsoluteMove?: boolean | undefined;
  readonly absoluteMove?: boolean | undefined;
  readonly GamepadButton?: GamepadButton | undefined;
  readonly gamepadButton?: GamepadButton | undefined;
  readonly GamepadAxis?: GamepadAxis | undefined;
  readonly gamepadAxis?: GamepadAxis | undefined;
  readonly AxisValue?: number | undefined;
  readonly axisValue?: number | undefined;
  readonly PadIndex?: number | undefined;
  readonly padIndex?: number | undefined;
  readonly Text?: string | undefined;
  readonly text?: string | undefined;
  readonly Comment?: string | undefined;
  readonly comment?: string | undefined;
  readonly DurationMicroseconds?: number | undefined;
  readonly durationMicroseconds?: number | undefined;
  readonly ShowOverlayTiming?: boolean | undefined;
  readonly showOverlayTiming?: boolean | undefined;
  readonly PixelX?: number | undefined;
  readonly pixelX?: number | undefined;
  readonly PixelY?: number | undefined;
  readonly pixelY?: number | undefined;
  readonly PixelColor?: number | undefined;
  readonly pixelColor?: number | undefined;
  readonly TriggerCooldownMilliseconds?: number | undefined;
  readonly triggerCooldownMilliseconds?: number | undefined;
  readonly WaitProcessName?: string | undefined;
  readonly waitProcessName?: string | undefined;
  readonly WaitWindowTitle?: string | undefined;
  readonly waitWindowTitle?: string | undefined;
  readonly WaitKeyVirtualKey?: number | undefined;
  readonly waitKeyVirtualKey?: number | undefined;
  readonly WaitTimeoutMilliseconds?: number | undefined;
  readonly waitTimeoutMilliseconds?: number | undefined;
  readonly SubMacroName?: string | undefined;
  readonly subMacroName?: string | undefined;
}

export function sendsInput(event: MacroEvent): boolean {
  switch (event.type) {
    case MacroEventType.KeyDown:
    case MacroEventType.KeyUp:
    case MacroEventType.MouseMove:
    case MacroEventType.MouseButtonDown:
    case MacroEventType.MouseButtonUp:
    case MacroEventType.Wheel:
    case MacroEventType.HorizontalWheel:
    case MacroEventType.GamepadButtonDown:
    case MacroEventType.GamepadButtonUp:
    case MacroEventType.GamepadAxis:
    case MacroEventType.TypeText:
      return true;
    case MacroEventType.Delay:
    case MacroEventType.OverlayText:
    case MacroEventType.PixelColorTrigger:
    case MacroEventType.Comment:
    case MacroEventType.WaitForPixelGone:
    case MacroEventType.WaitForWindow:
    case MacroEventType.WaitForKey:
    case MacroEventType.RunMacro:
      return false;
    default:
      return assertExhaustiveMacroEvent(event);
  }
}

export function takesTime(event: MacroEvent): boolean {
  switch (event.type) {
    case MacroEventType.KeyDown:
    case MacroEventType.KeyUp:
    case MacroEventType.MouseMove:
    case MacroEventType.MouseButtonDown:
    case MacroEventType.MouseButtonUp:
    case MacroEventType.Wheel:
    case MacroEventType.HorizontalWheel:
    case MacroEventType.Delay:
    case MacroEventType.GamepadButtonDown:
    case MacroEventType.GamepadButtonUp:
    case MacroEventType.GamepadAxis:
    case MacroEventType.TypeText:
      return true;
    case MacroEventType.OverlayText:
    case MacroEventType.PixelColorTrigger:
    case MacroEventType.Comment:
    case MacroEventType.WaitForPixelGone:
    case MacroEventType.WaitForWindow:
    case MacroEventType.WaitForKey:
    case MacroEventType.RunMacro:
      return false;
    default:
      return assertExhaustiveMacroEvent(event);
  }
}

export function getEndTimeMicroseconds(event: MacroEvent): Microseconds {
  if (event.type === MacroEventType.OverlayText && event.durationMicroseconds > 0) {
    return event.timeMicroseconds + event.durationMicroseconds;
  }
  return event.timeMicroseconds;
}

/**
 * Compile-time exhaustiveness checker for MacroEventType.
 */
export function assertExhaustiveMacroEvent(event: never): never {
  throw new Error(`Unhandled MacroEventType: ${JSON.stringify(event)}`);
}

/**
 * Pattern-matches exhaustively across all 19 macro event types.
 */
export function matchMacroEvent<R>(
  event: MacroEvent,
  handlers: {
    readonly [K in MacroEventType]: (variant: Extract<MacroEvent, { readonly type: K }>) => R;
  },
): R {
  switch (event.type) {
    case MacroEventType.KeyDown:
      return handlers.KeyDown(event);
    case MacroEventType.KeyUp:
      return handlers.KeyUp(event);
    case MacroEventType.MouseMove:
      return handlers.MouseMove(event);
    case MacroEventType.MouseButtonDown:
      return handlers.MouseButtonDown(event);
    case MacroEventType.MouseButtonUp:
      return handlers.MouseButtonUp(event);
    case MacroEventType.Wheel:
      return handlers.Wheel(event);
    case MacroEventType.HorizontalWheel:
      return handlers.HorizontalWheel(event);
    case MacroEventType.Delay:
      return handlers.Delay(event);
    case MacroEventType.OverlayText:
      return handlers.OverlayText(event);
    case MacroEventType.PixelColorTrigger:
      return handlers.PixelColorTrigger(event);
    case MacroEventType.Comment:
      return handlers.Comment(event);
    case MacroEventType.GamepadButtonDown:
      return handlers.GamepadButtonDown(event);
    case MacroEventType.GamepadButtonUp:
      return handlers.GamepadButtonUp(event);
    case MacroEventType.GamepadAxis:
      return handlers.GamepadAxis(event);
    case MacroEventType.TypeText:
      return handlers.TypeText(event);
    case MacroEventType.WaitForPixelGone:
      return handlers.WaitForPixelGone(event);
    case MacroEventType.WaitForWindow:
      return handlers.WaitForWindow(event);
    case MacroEventType.WaitForKey:
      return handlers.WaitForKey(event);
    case MacroEventType.RunMacro:
      return handlers.RunMacro(event);
    default:
      return assertExhaustiveMacroEvent(event);
  }
}

/**
 * Converts a discriminated union MacroEvent into the wire-compatible representation.
 */
export function toWireMacroEvent(event: MacroEvent, pascalCase = false): Record<string, unknown> {
  const common = {
    id: event.id,
    timeMicroseconds: event.timeMicroseconds,
    comment: event.comment,
    type: event.type,
  };

  const fields: Record<string, unknown> = { ...common };

  switch (event.type) {
    case MacroEventType.KeyDown:
    case MacroEventType.KeyUp:
      fields.device = InputDevice.Keyboard;
      fields.virtualKey = event.virtualKey;
      fields.scanCode = event.scanCode;
      fields.extended = event.extended;
      break;
    case MacroEventType.MouseMove:
      fields.device = InputDevice.Mouse;
      fields.deltaX = event.deltaX;
      fields.deltaY = event.deltaY;
      fields.absoluteMove = event.absoluteMove;
      break;
    case MacroEventType.MouseButtonDown:
    case MacroEventType.MouseButtonUp:
      fields.device = InputDevice.Mouse;
      fields.button = event.button;
      break;
    case MacroEventType.Wheel:
    case MacroEventType.HorizontalWheel:
      fields.device = InputDevice.Mouse;
      fields.wheelDelta = event.wheelDelta;
      break;
    case MacroEventType.Delay:
      fields.durationMicroseconds = event.durationMicroseconds;
      break;
    case MacroEventType.OverlayText:
      fields.text = event.text;
      fields.durationMicroseconds = event.durationMicroseconds;
      fields.showOverlayTiming = event.showOverlayTiming;
      break;
    case MacroEventType.PixelColorTrigger:
      fields.pixelX = event.pixelX;
      fields.pixelY = event.pixelY;
      fields.pixelColor = event.pixelColor;
      fields.triggerCooldownMilliseconds = event.triggerCooldownMilliseconds;
      break;
    case MacroEventType.Comment:
      fields.text = event.text;
      break;
    case MacroEventType.GamepadButtonDown:
    case MacroEventType.GamepadButtonUp:
      fields.device = InputDevice.Gamepad;
      fields.gamepadButton = event.gamepadButton;
      fields.padIndex = event.padIndex;
      break;
    case MacroEventType.GamepadAxis:
      fields.device = InputDevice.Gamepad;
      fields.gamepadAxis = event.gamepadAxis;
      fields.axisValue = event.axisValue;
      fields.padIndex = event.padIndex;
      break;
    case MacroEventType.TypeText:
      fields.device = InputDevice.Keyboard;
      fields.text = event.text;
      break;
    case MacroEventType.WaitForPixelGone:
      fields.pixelX = event.pixelX;
      fields.pixelY = event.pixelY;
      fields.pixelColor = event.pixelColor;
      fields.waitTimeoutMilliseconds = event.waitTimeoutMilliseconds;
      break;
    case MacroEventType.WaitForWindow:
      fields.waitProcessName = event.waitProcessName;
      fields.waitWindowTitle = event.waitWindowTitle;
      fields.waitTimeoutMilliseconds = event.waitTimeoutMilliseconds;
      break;
    case MacroEventType.WaitForKey:
      fields.waitKeyVirtualKey = event.waitKeyVirtualKey;
      fields.waitTimeoutMilliseconds = event.waitTimeoutMilliseconds;
      break;
    case MacroEventType.RunMacro:
      fields.subMacroName = event.subMacroName;
      break;
    default:
      assertExhaustiveMacroEvent(event);
  }

  if (!pascalCase) {
    return fields;
  }

  const pascalResult: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(fields)) {
    const pascalKey = k.charAt(0).toUpperCase() + k.slice(1);
    pascalResult[pascalKey] = v;
  }
  return pascalResult;
}

/**
 * Converts a wire object into the discriminated union MacroEvent.
 */
export function fromWireMacroEvent(raw: unknown, path = ''): ValidationResult<MacroEvent> {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return {
      success: false,
      errors: [{ path, message: 'Expected object for MacroEvent', received: raw }],
    };
  }

  const wire = raw as MacroEventWire;
  const rawType = wire.type ?? wire.Type;
  if (!rawType || typeof rawType !== 'string' || !(rawType in MacroEventType)) {
    return {
      success: false,
      errors: [
        {
          path: path ? `${path}.type` : 'type',
          message: `Invalid or missing MacroEventType: ${String(rawType)}`,
          received: rawType,
        },
      ],
    };
  }

  const type = rawType as MacroEventType;
  const id = (wire.id ?? wire.Id ?? '') as Guid;
  const timeMicroseconds = Math.max(
    0,
    Math.round(wire.timeMicroseconds ?? wire.TimeMicroseconds ?? 0),
  );
  const comment = (wire.comment ?? wire.Comment ?? '') as string;

  const base: MacroEventBase = { id, timeMicroseconds, comment };

  switch (type) {
    case MacroEventType.KeyDown:
      return {
        success: true,
        data: {
          ...base,
          type: MacroEventType.KeyDown,
          device: InputDevice.Keyboard,
          virtualKey: wire.virtualKey ?? wire.VirtualKey ?? 0,
          scanCode: wire.scanCode ?? wire.ScanCode ?? 0,
          extended: wire.extended ?? wire.Extended ?? false,
        },
      };
    case MacroEventType.KeyUp:
      return {
        success: true,
        data: {
          ...base,
          type: MacroEventType.KeyUp,
          device: InputDevice.Keyboard,
          virtualKey: wire.virtualKey ?? wire.VirtualKey ?? 0,
          scanCode: wire.scanCode ?? wire.ScanCode ?? 0,
          extended: wire.extended ?? wire.Extended ?? false,
        },
      };
    case MacroEventType.MouseMove:
      return {
        success: true,
        data: {
          ...base,
          type: MacroEventType.MouseMove,
          device: InputDevice.Mouse,
          deltaX: wire.deltaX ?? wire.DeltaX ?? 0,
          deltaY: wire.deltaY ?? wire.DeltaY ?? 0,
          absoluteMove: wire.absoluteMove ?? wire.AbsoluteMove ?? false,
        },
      };
    case MacroEventType.MouseButtonDown:
      return {
        success: true,
        data: {
          ...base,
          type: MacroEventType.MouseButtonDown,
          device: InputDevice.Mouse,
          button: wire.button ?? wire.Button ?? MouseButton.None,
        },
      };
    case MacroEventType.MouseButtonUp:
      return {
        success: true,
        data: {
          ...base,
          type: MacroEventType.MouseButtonUp,
          device: InputDevice.Mouse,
          button: wire.button ?? wire.Button ?? MouseButton.None,
        },
      };
    case MacroEventType.Wheel:
      return {
        success: true,
        data: {
          ...base,
          type: MacroEventType.Wheel,
          device: InputDevice.Mouse,
          wheelDelta: wire.wheelDelta ?? wire.WheelDelta ?? 0,
        },
      };
    case MacroEventType.HorizontalWheel:
      return {
        success: true,
        data: {
          ...base,
          type: MacroEventType.HorizontalWheel,
          device: InputDevice.Mouse,
          wheelDelta: wire.wheelDelta ?? wire.WheelDelta ?? 0,
        },
      };
    case MacroEventType.Delay:
      return {
        success: true,
        data: {
          ...base,
          type: MacroEventType.Delay,
          durationMicroseconds: Math.max(
            0,
            Math.round(wire.durationMicroseconds ?? wire.DurationMicroseconds ?? 0),
          ),
        },
      };
    case MacroEventType.OverlayText:
      return {
        success: true,
        data: {
          ...base,
          type: MacroEventType.OverlayText,
          text: wire.text ?? wire.Text ?? '',
          durationMicroseconds: Math.max(
            0,
            Math.round(wire.durationMicroseconds ?? wire.DurationMicroseconds ?? 0),
          ),
          showOverlayTiming: wire.showOverlayTiming ?? wire.ShowOverlayTiming ?? true,
        },
      };
    case MacroEventType.PixelColorTrigger:
      return {
        success: true,
        data: {
          ...base,
          type: MacroEventType.PixelColorTrigger,
          pixelX: wire.pixelX ?? wire.PixelX ?? 0,
          pixelY: wire.pixelY ?? wire.PixelY ?? 0,
          pixelColor: wire.pixelColor ?? wire.PixelColor ?? 0,
          triggerCooldownMilliseconds: Math.max(
            0,
            wire.triggerCooldownMilliseconds ?? wire.TriggerCooldownMilliseconds ?? 3000,
          ),
        },
      };
    case MacroEventType.Comment:
      return {
        success: true,
        data: {
          ...base,
          type: MacroEventType.Comment,
          text: wire.text ?? wire.Text ?? '',
        },
      };
    case MacroEventType.GamepadButtonDown:
      return {
        success: true,
        data: {
          ...base,
          type: MacroEventType.GamepadButtonDown,
          device: InputDevice.Gamepad,
          gamepadButton: wire.gamepadButton ?? wire.GamepadButton ?? GamepadButton.None,
          padIndex: Math.max(0, Math.min(3, wire.padIndex ?? wire.PadIndex ?? 0)),
        },
      };
    case MacroEventType.GamepadButtonUp:
      return {
        success: true,
        data: {
          ...base,
          type: MacroEventType.GamepadButtonUp,
          device: InputDevice.Gamepad,
          gamepadButton: wire.gamepadButton ?? wire.GamepadButton ?? GamepadButton.None,
          padIndex: Math.max(0, Math.min(3, wire.padIndex ?? wire.PadIndex ?? 0)),
        },
      };
    case MacroEventType.GamepadAxis:
      return {
        success: true,
        data: {
          ...base,
          type: MacroEventType.GamepadAxis,
          device: InputDevice.Gamepad,
          gamepadAxis: wire.gamepadAxis ?? wire.GamepadAxis ?? GamepadAxis.None,
          axisValue: wire.axisValue ?? wire.AxisValue ?? 0,
          padIndex: Math.max(0, Math.min(3, wire.padIndex ?? wire.PadIndex ?? 0)),
        },
      };
    case MacroEventType.TypeText:
      return {
        success: true,
        data: {
          ...base,
          type: MacroEventType.TypeText,
          device: InputDevice.Keyboard,
          text: wire.text ?? wire.Text ?? '',
        },
      };
    case MacroEventType.WaitForPixelGone:
      return {
        success: true,
        data: {
          ...base,
          type: MacroEventType.WaitForPixelGone,
          pixelX: wire.pixelX ?? wire.PixelX ?? 0,
          pixelY: wire.pixelY ?? wire.PixelY ?? 0,
          pixelColor: wire.pixelColor ?? wire.PixelColor ?? 0,
          waitTimeoutMilliseconds: Math.max(
            0,
            wire.waitTimeoutMilliseconds ?? wire.WaitTimeoutMilliseconds ?? 0,
          ),
        },
      };
    case MacroEventType.WaitForWindow:
      return {
        success: true,
        data: {
          ...base,
          type: MacroEventType.WaitForWindow,
          waitProcessName: wire.waitProcessName ?? wire.WaitProcessName ?? '',
          waitWindowTitle: wire.waitWindowTitle ?? wire.WaitWindowTitle ?? '',
          waitTimeoutMilliseconds: Math.max(
            0,
            wire.waitTimeoutMilliseconds ?? wire.WaitTimeoutMilliseconds ?? 0,
          ),
        },
      };
    case MacroEventType.WaitForKey:
      return {
        success: true,
        data: {
          ...base,
          type: MacroEventType.WaitForKey,
          waitKeyVirtualKey: wire.waitKeyVirtualKey ?? wire.WaitKeyVirtualKey ?? 0,
          waitTimeoutMilliseconds: Math.max(
            0,
            wire.waitTimeoutMilliseconds ?? wire.WaitTimeoutMilliseconds ?? 0,
          ),
        },
      };
    case MacroEventType.RunMacro:
      return {
        success: true,
        data: {
          ...base,
          type: MacroEventType.RunMacro,
          subMacroName: wire.subMacroName ?? wire.SubMacroName ?? '',
        },
      };
    default:
      return assertExhaustiveMacroEvent(type as never);
  }
}

export const macroEventSchema: Schema<MacroEvent> = {
  _output: undefined as unknown as MacroEvent,
  parse(input: unknown, path = ''): ValidationResult<MacroEvent> {
    return fromWireMacroEvent(input, path);
  },
  is(input: unknown): input is MacroEvent {
    return fromWireMacroEvent(input, '').success;
  },
};
