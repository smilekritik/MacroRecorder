/**
 * Bounded serializable native hook and hardware events.
 * Dispatched from dedicated native OS threads to the Node.js main process.
 */

import { type Microseconds } from '../common/types.js';
import { boolean, enumValues, integer, object, string, type Schema } from '../common/validation.js';
import { MouseButton, mouseButtonSchema } from '../domain/enums.js';

export interface NativeKeyboardHookEvent {
  readonly eventType: 'KeyDown' | 'KeyUp';
  readonly virtualKey: number;
  readonly scanCode: number;
  readonly extended: boolean;
  readonly timestampMicroseconds: Microseconds;
  readonly isInjected: boolean;
}

export const nativeKeyboardHookEventSchema: Schema<NativeKeyboardHookEvent> = object({
  eventType: enumValues(['KeyDown', 'KeyUp'] as const),
  virtualKey: integer({ min: 0, max: 255 }),
  scanCode: integer({ min: 0, max: 65535 }),
  extended: boolean(),
  timestampMicroseconds: integer({ min: 0 }),
  isInjected: boolean(),
});

export interface NativeMouseHookEvent {
  readonly eventType:
    | 'MouseMove'
    | 'MouseButtonDown'
    | 'MouseButtonUp'
    | 'Wheel'
    | 'HorizontalWheel';
  readonly button: MouseButton;
  readonly x: number;
  readonly y: number;
  readonly wheelDelta: number;
  readonly timestampMicroseconds: Microseconds;
  readonly isInjected: boolean;
}

export const nativeMouseHookEventSchema: Schema<NativeMouseHookEvent> = object({
  eventType: enumValues([
    'MouseMove',
    'MouseButtonDown',
    'MouseButtonUp',
    'Wheel',
    'HorizontalWheel',
  ] as const),
  button: mouseButtonSchema,
  x: integer(),
  y: integer(),
  wheelDelta: integer(),
  timestampMicroseconds: integer({ min: 0 }),
  isInjected: boolean(),
});

export interface NativeRawInputEvent {
  readonly deltaX: number;
  readonly deltaY: number;
  readonly buttonFlags: number;
  readonly timestampMicroseconds: Microseconds;
}

export const nativeRawInputEventSchema: Schema<NativeRawInputEvent> = object({
  deltaX: integer(),
  deltaY: integer(),
  buttonFlags: integer({ min: 0 }),
  timestampMicroseconds: integer({ min: 0 }),
});

export interface NativeGamepadStateEvent {
  readonly slot: number;
  readonly connected: boolean;
  readonly buttons: number;
  readonly leftX: number;
  readonly leftY: number;
  readonly rightX: number;
  readonly rightY: number;
  readonly leftTrigger: number;
  readonly rightTrigger: number;
  readonly timestampMicroseconds: Microseconds;
}

export const nativeGamepadStateEventSchema: Schema<NativeGamepadStateEvent> = object({
  slot: integer({ min: 0, max: 3 }),
  connected: boolean(),
  buttons: integer({ min: 0, max: 65535 }),
  leftX: integer({ min: -32768, max: 32767 }),
  leftY: integer({ min: -32768, max: 32767 }),
  rightX: integer({ min: -32768, max: 32767 }),
  rightY: integer({ min: -32768, max: 32767 }),
  leftTrigger: integer({ min: 0, max: 255 }),
  rightTrigger: integer({ min: 0, max: 255 }),
  timestampMicroseconds: integer({ min: 0 }),
});

export interface NativeEmergencyStopEvent {
  readonly timestampMicroseconds: Microseconds;
  readonly reason: string;
}

export const nativeEmergencyStopEventSchema: Schema<NativeEmergencyStopEvent> = object({
  timestampMicroseconds: integer({ min: 0 }),
  reason: string({ min: 1 }),
});

export interface NativeLifecycleEvent {
  readonly type: 'sessionEnding' | 'suspend' | 'resume' | 'lock' | 'unlock';
  readonly timestampMicroseconds: Microseconds;
}

export const nativeLifecycleEventSchema: Schema<NativeLifecycleEvent> = object({
  type: enumValues(['sessionEnding', 'suspend', 'resume', 'lock', 'unlock'] as const),
  timestampMicroseconds: integer({ min: 0 }),
});
