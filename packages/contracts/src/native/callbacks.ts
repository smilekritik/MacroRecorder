/**
 * Bounded serializable native callback shapes passed across N-API to Node.js.
 */

import {
  createSchema,
  integer,
  literal,
  object,
  type Schema,
  type ValidationResult,
} from '../common/validation.js';
import {
  type NativeEmergencyStopEvent,
  nativeEmergencyStopEventSchema,
  type NativeGamepadStateEvent,
  nativeGamepadStateEventSchema,
  type NativeKeyboardHookEvent,
  nativeKeyboardHookEventSchema,
  type NativeLifecycleEvent,
  nativeLifecycleEventSchema,
  type NativeMouseHookEvent,
  nativeMouseHookEventSchema,
  type NativeRawInputEvent,
  nativeRawInputEventSchema,
} from './events.js';

export interface NativeHotkeyTriggerCallback {
  readonly kind: 'hotkeyTrigger';
  readonly id: number;
  readonly virtualKey: number;
  readonly modifiers: number;
  readonly timestampMicroseconds: number;
}

export const nativeHotkeyTriggerCallbackSchema: Schema<NativeHotkeyTriggerCallback> = object({
  kind: literal('hotkeyTrigger'),
  id: integer({ min: 1 }),
  virtualKey: integer({ min: 0, max: 255 }),
  modifiers: integer({ min: 0 }),
  timestampMicroseconds: integer({ min: 0 }),
});

export type NativeCallbackPayload =
  | ({ readonly kind: 'keyboardHook' } & NativeKeyboardHookEvent)
  | ({ readonly kind: 'mouseHook' } & NativeMouseHookEvent)
  | ({ readonly kind: 'rawInput' } & NativeRawInputEvent)
  | ({ readonly kind: 'gamepad' } & NativeGamepadStateEvent)
  | NativeHotkeyTriggerCallback
  | ({ readonly kind: 'emergencyStop' } & NativeEmergencyStopEvent)
  | ({ readonly kind: 'lifecycle' } & NativeLifecycleEvent);

export const nativeCallbackPayloadSchema: Schema<NativeCallbackPayload> = createSchema(
  (input, path): ValidationResult<NativeCallbackPayload> => {
    if (typeof input !== 'object' || input === null || Array.isArray(input)) {
      return {
        success: false,
        errors: [{ path, message: 'Expected object for NativeCallbackPayload', received: input }],
      };
    }
    const obj = input as Record<string, unknown>;
    const kind = obj['kind'];
    switch (kind) {
      case 'keyboardHook': {
        const parsed = nativeKeyboardHookEventSchema.parse(input, path);
        if (!parsed.success) return parsed;
        return { success: true, data: { kind: 'keyboardHook', ...parsed.data } };
      }
      case 'mouseHook': {
        const parsed = nativeMouseHookEventSchema.parse(input, path);
        if (!parsed.success) return parsed;
        return { success: true, data: { kind: 'mouseHook', ...parsed.data } };
      }
      case 'rawInput': {
        const parsed = nativeRawInputEventSchema.parse(input, path);
        if (!parsed.success) return parsed;
        return { success: true, data: { kind: 'rawInput', ...parsed.data } };
      }
      case 'gamepad': {
        const parsed = nativeGamepadStateEventSchema.parse(input, path);
        if (!parsed.success) return parsed;
        return { success: true, data: { kind: 'gamepad', ...parsed.data } };
      }
      case 'hotkeyTrigger':
        return nativeHotkeyTriggerCallbackSchema.parse(input, path);
      case 'emergencyStop': {
        const parsed = nativeEmergencyStopEventSchema.parse(input, path);
        if (!parsed.success) return parsed;
        return { success: true, data: { kind: 'emergencyStop', ...parsed.data } };
      }
      case 'lifecycle': {
        const parsed = nativeLifecycleEventSchema.parse(input, path);
        if (!parsed.success) return parsed;
        return { success: true, data: { kind: 'lifecycle', ...parsed.data } };
      }
      default:
        return {
          success: false,
          errors: [
            {
              path: path ? `${path}.kind` : 'kind',
              message: `Unknown native callback kind: ${String(kind)}`,
              received: kind,
            },
          ],
        };
    }
  },
);
