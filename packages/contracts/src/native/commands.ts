/**
 * Native command contracts passed from Node.js main process to the Rust N-API addon.
 */

import { boolean, integer, object, optional, string, type Schema } from '../common/validation.js';
import { GamepadOutputType, gamepadOutputTypeSchema } from '../domain/enums.js';
import { type GamepadSnapshot, gamepadSnapshotSchema } from '../descriptors/controller.js';

export interface InjectKeyboardCommand {
  readonly virtualKey: number;
  readonly scanCode: number;
  readonly extended: boolean;
  readonly isUp: boolean;
  readonly isUnicode?: boolean | undefined;
  readonly unicodeChar?: string | undefined;
  readonly targetWindow?: number | undefined;
}

export const injectKeyboardCommandSchema: Schema<InjectKeyboardCommand> = object({
  virtualKey: integer({ min: 0, max: 255 }),
  scanCode: integer({ min: 0, max: 65535 }),
  extended: boolean(),
  isUp: boolean(),
  isUnicode: optional(boolean()),
  unicodeChar: optional(string({ max: 1_000_000 })),
  targetWindow: optional(integer({ min: 0 })),
});

export interface InjectMouseCommand {
  readonly deltaX: number;
  readonly deltaY: number;
  readonly flags: number;
  readonly wheelDelta: number;
  readonly isAbsolute: boolean;
  readonly button?: string | undefined;
  readonly targetWindow?: number | undefined;
}

export const injectMouseCommandSchema: Schema<InjectMouseCommand> = object({
  deltaX: integer(),
  deltaY: integer(),
  flags: integer({ min: 0 }),
  wheelDelta: integer(),
  isAbsolute: boolean(),
  button: optional(string({ max: 8 })),
  targetWindow: optional(integer({ min: 0 })),
});

export interface InjectTargetedWindowMessageCommand {
  readonly hwnd: number;
  readonly msg: number;
  readonly wParam: number;
  readonly lParam: number;
}

export const injectTargetedWindowMessageCommandSchema: Schema<InjectTargetedWindowMessageCommand> =
  object({
    hwnd: integer(),
    msg: integer({ min: 0 }),
    wParam: integer(),
    lParam: integer(),
  });

export interface ReleaseAllInputsCommand {
  readonly hwnd?: number | undefined;
}

export const releaseAllInputsCommandSchema: Schema<ReleaseAllInputsCommand> = object({
  hwnd: optional(integer()),
});

export interface RegisterNativeHotkeyCommand {
  readonly id: number;
  readonly virtualKey: number;
  readonly modifiers: number;
}

export const registerNativeHotkeyCommandSchema: Schema<RegisterNativeHotkeyCommand> = object({
  id: integer({ min: 1 }),
  virtualKey: integer({ min: 0, max: 255 }),
  modifiers: integer({ min: 0 }),
});

export interface UnregisterNativeHotkeyCommand {
  readonly id: number;
}

export const unregisterNativeHotkeyCommandSchema: Schema<UnregisterNativeHotkeyCommand> = object({
  id: integer({ min: 1 }),
});

export interface SamplePixelColorCommand {
  readonly x: number;
  readonly y: number;
}

export const samplePixelColorCommandSchema: Schema<SamplePixelColorCommand> = object({
  x: integer(),
  y: integer(),
});

export interface UpdateVirtualGamepadCommand {
  readonly outputType: GamepadOutputType;
  readonly snapshot: GamepadSnapshot;
}

export const updateVirtualGamepadCommandSchema: Schema<UpdateVirtualGamepadCommand> = object({
  outputType: gamepadOutputTypeSchema,
  snapshot: gamepadSnapshotSchema,
});

export interface SetHidHideStateCommand {
  readonly hide: boolean;
}

export const setHidHideStateCommandSchema: Schema<SetHidHideStateCommand> = object({
  hide: boolean(),
});
