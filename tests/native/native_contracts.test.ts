/**
 * and Rust native addon types, error codes, and message payloads.
 */

import { describe, expect, it } from 'vitest';

import {
  IpcErrorCode,
  MacroRecorderError,
  MouseButton,
  mouseButtonSchema,
  GamepadOutputType,
  gamepadOutputTypeSchema,
} from '../../packages/contracts/src/index.js';
import {
  injectKeyboardCommandSchema,
  injectMouseCommandSchema,
  injectTargetedWindowMessageCommandSchema,
  releaseAllInputsCommandSchema,
  type InjectKeyboardCommand,
  type InjectMouseCommand,
  type InjectTargetedWindowMessageCommand,
  type ReleaseAllInputsCommand,
} from '../../packages/contracts/src/native/commands.js';
import {
  nativeKeyboardHookEventSchema,
  nativeMouseHookEventSchema,
  nativeRawInputEventSchema,
  nativeGamepadStateEventSchema,
  type NativeKeyboardHookEvent,
  type NativeMouseHookEvent,
  type NativeRawInputEvent,
  type NativeGamepadStateEvent,
} from '../../packages/contracts/src/native/events.js';
import {
  gamepadSnapshotSchema,
  type GamepadSnapshot,
} from '../../packages/contracts/src/descriptors/controller.js';

describe('Native IPC Error Code', () => {
  it('defines all 19 canonical IPC error codes matching Rust error::IpcErrorCode', () => {
    const expectedCodes = [
      'INVALID_ARGUMENT',
      'NOT_FOUND',
      'ALREADY_EXISTS',
      'PERMISSION_DENIED',
      'RESOURCE_EXHAUSTED',
      'FAILED_PRECONDITION',
      'ABORTED',
      'CANCELLED',
      'UNAVAILABLE',
      'INTERNAL',
      'UNSUPPORTED_VERSION',
      'CHECKSUM_MISMATCH',
      'CORRUPT_DATA',
      'HOTKEY_CONFLICT',
      'RECURSION_LIMIT_EXCEEDED',
      'CYCLE_DETECTED',
      'DRIVER_NOT_FOUND',
      'NATIVE_HOOK_ERROR',
      'WINDOW_NOT_FOUND',
    ];

    expect(Object.keys(IpcErrorCode)).toHaveLength(19);
    for (const code of expectedCodes) {
      expect(IpcErrorCode).toHaveProperty(code, code);
    }
  });

  it('serializes MacroRecorderError into typed AppError payload', () => {
    const err = new MacroRecorderError(
      IpcErrorCode.NATIVE_HOOK_ERROR,
      'SetWindowsHookExW failed with Win32 error 1428',
      { win32Code: 1428, context: 'WH_KEYBOARD_LL' },
    );

    const json = err.toJSON();
    expect(json.code).toBe('NATIVE_HOOK_ERROR');
    expect(json.message).toBe('SetWindowsHookExW failed with Win32 error 1428');
    expect(json.details).toEqual({ win32Code: 1428, context: 'WH_KEYBOARD_LL' });
  });
});

describe('Native Gamepad Contract', () => {
  it('validates GamepadOutputType schema values', () => {
    expect(gamepadOutputTypeSchema.is(GamepadOutputType.Xbox360)).toBe(true);
    expect(gamepadOutputTypeSchema.is(GamepadOutputType.DualShock4)).toBe(true);
    expect(gamepadOutputTypeSchema.is('NintendoSwitch')).toBe(false);
  });

  it('validates GamepadSnapshot schema against Rust GamepadSnapshot representation', () => {
    const validSnapshot: GamepadSnapshot = {
      connected: true,
      buttons: 0x1000, // Button A
      leftX: 12000,
      leftY: -8000,
      rightX: 0,
      rightY: 0,
      leftTrigger: 128,
      rightTrigger: 255,
    };

    expect(gamepadSnapshotSchema.is(validSnapshot)).toBe(true);

    const outOfBounds: unknown = {
      ...validSnapshot,
      leftTrigger: 300, // > 255
    };
    expect(gamepadSnapshotSchema.is(outOfBounds)).toBe(false);
  });

  it('validates NativeGamepadStateEvent contract schema', () => {
    const validEvent: NativeGamepadStateEvent = {
      slot: 0,
      connected: true,
      buttons: 0x4000,
      leftX: 1500,
      leftY: -1500,
      rightX: 0,
      rightY: 0,
      leftTrigger: 0,
      rightTrigger: 50,
      timestampMicroseconds: 12345678,
    };

    expect(nativeGamepadStateEventSchema.is(validEvent)).toBe(true);
  });
});

describe('Native Injection Command Contracts', () => {
  it('validates InjectKeyboardCommand schema', () => {
    const validKeyCmd: InjectKeyboardCommand = {
      virtualKey: 0x41, // 'A'
      scanCode: 0x1e,
      extended: false,
      isUp: false,
    };
    expect(injectKeyboardCommandSchema.is(validKeyCmd)).toBe(true);

    const invalidVk: unknown = {
      ...validKeyCmd,
      virtualKey: 300, // > 255
    };
    expect(injectKeyboardCommandSchema.is(invalidVk)).toBe(false);
  });

  it('validates InjectMouseCommand schema', () => {
    const validMouseCmd: InjectMouseCommand = {
      deltaX: 50,
      deltaY: -30,
      flags: 0x0001, // MOUSEEVENTF_MOVE
      wheelDelta: 0,
      isAbsolute: false,
    };
    expect(injectMouseCommandSchema.is(validMouseCmd)).toBe(true);
  });

  it('validates InjectTargetedWindowMessageCommand schema', () => {
    const validTargetedCmd: InjectTargetedWindowMessageCommand = {
      hwnd: 0x00050124,
      msg: 0x0100, // WM_KEYDOWN
      wParam: 0x41,
      lParam: 0x001e0001,
    };
    expect(injectTargetedWindowMessageCommandSchema.is(validTargetedCmd)).toBe(true);
  });

  it('validates ReleaseAllInputsCommand schema', () => {
    expect(releaseAllInputsCommandSchema.is({})).toBe(true);
    expect(releaseAllInputsCommandSchema.is({ hwnd: 0x00050124 })).toBe(true);
    expect(releaseAllInputsCommandSchema.is({ hwnd: 'invalid' })).toBe(false);
  });
});

describe('Native Hook Event Contracts', () => {
  it('validates NativeKeyboardHookEvent schema', () => {
    const keyEvent: NativeKeyboardHookEvent = {
      eventType: 'KeyDown',
      virtualKey: 0x20, // Space
      scanCode: 0x39,
      extended: false,
      timestampMicroseconds: 5000000,
      isInjected: false,
    };
    expect(nativeKeyboardHookEventSchema.is(keyEvent)).toBe(true);

    const invalidType: unknown = {
      ...keyEvent,
      eventType: 'KeyHold', // Not KeyDown or KeyUp
    };
    expect(nativeKeyboardHookEventSchema.is(invalidType)).toBe(false);
  });

  it('validates NativeMouseHookEvent schema with all button variants', () => {
    const mouseEvent: NativeMouseHookEvent = {
      eventType: 'MouseButtonDown',
      button: MouseButton.Left,
      x: 1920,
      y: 1080,
      wheelDelta: 0,
      timestampMicroseconds: 6000000,
      isInjected: false,
    };
    expect(nativeMouseHookEventSchema.is(mouseEvent)).toBe(true);

    // Verify all mouse buttons validate
    for (const btn of [
      MouseButton.None,
      MouseButton.Left,
      MouseButton.Right,
      MouseButton.Middle,
      MouseButton.X1,
      MouseButton.X2,
    ]) {
      expect(mouseButtonSchema.is(btn)).toBe(true);
    }
  });

  it('validates NativeRawInputEvent schema', () => {
    const rawInput: NativeRawInputEvent = {
      deltaX: -12,
      deltaY: 5,
      buttonFlags: 0,
      timestampMicroseconds: 7000000,
    };
    expect(nativeRawInputEventSchema.is(rawInput)).toBe(true);
  });
});
