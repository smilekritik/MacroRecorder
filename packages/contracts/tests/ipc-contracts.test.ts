import { describe, expect, it } from 'vitest';
import {
  appErrorSchema,
  IpcChannels,
  IpcErrorCode,
  MacroRecorderError,
  nativeCallbackPayloadSchema,
  validateIpcRequest,
} from '../src/index.js';

describe('IPC Boundary Validation and Native Callbacks', () => {
  it('validates playback start request from renderer', () => {
    const validRequest = {
      requestId: 'req-001',
      cancellationToken: 'cancel-abc',
      macroId: crypto.randomUUID(),
      speed: 1.5,
    };
    const result = validateIpcRequest(IpcChannels.PLAYBACK_START, validRequest);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.requestId).toBe('req-001');
    expect(result.data.speed).toBe(1.5);
  });

  it('rejects malformed or unsafe renderer requests (invalid types, out-of-bounds speed)', () => {
    const invalidSpeed = {
      requestId: 'req-002',
      speed: 99.0, // max is 10.0
    };
    const result = validateIpcRequest(IpcChannels.PLAYBACK_START, invalidSpeed);
    expect(result.success).toBe(false);
    expect(result.errors?.[0]?.message).toContain('greater than maximum');

    const missingRequestId = {
      speed: 1.0,
    };
    const result2 = validateIpcRequest(IpcChannels.PLAYBACK_START, missingRequestId);
    expect(result2.success).toBe(false);
  });

  it('validates emergency stop request with reason', () => {
    const request = {
      requestId: 'req-003',
      reason: 'F10 shortcut pressed',
    };
    const result = validateIpcRequest(IpcChannels.EMERGENCY_STOP, request);
    expect(result.success).toBe(true);
  });

  it('validates cancellation requests with target request ID', () => {
    const cancelReq = {
      requestId: 'req-cancel-01',
      targetRequestId: 'req-001',
      reason: 'User clicked cancel',
    };
    const result = validateIpcRequest(IpcChannels.IPC_CANCEL, cancelReq);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.targetRequestId).toBe('req-001');
  });

  it('validates native callback payloads across N-API boundary', () => {
    const keyPayload = {
      kind: 'keyboardHook' as const,
      eventType: 'KeyDown' as const,
      virtualKey: 65,
      scanCode: 30,
      extended: false,
      timestampMicroseconds: 5000000,
      isInjected: false,
    };
    expect(nativeCallbackPayloadSchema.parse(keyPayload).success).toBe(true);

    const emergencyPayload = {
      kind: 'emergencyStop' as const,
      timestampMicroseconds: 5002000,
      reason: 'Native hook panic guard',
    };
    expect(nativeCallbackPayloadSchema.parse(emergencyPayload).success).toBe(true);

    const hotkeyTriggerPayload = {
      kind: 'hotkeyTrigger' as const,
      id: 1,
      virtualKey: 118, // F7
      modifiers: 0,
      timestampMicroseconds: 5001000,
    };
    expect(nativeCallbackPayloadSchema.parse(hotkeyTriggerPayload).success).toBe(true);
  });

  it('serializes and validates typed AppError envelopes', () => {
    const error = new MacroRecorderError(
      IpcErrorCode.CHECKSUM_MISMATCH,
      'Package hash does not match payload',
      { expected: 'abc', received: 'def' },
    );
    const json = error.toJSON();
    expect(json.code).toBe(IpcErrorCode.CHECKSUM_MISMATCH);
    expect(json.message).toBe('Package hash does not match payload');

    const validated = appErrorSchema.parse(json);
    expect(validated.success).toBe(true);
  });
});
