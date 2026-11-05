import { describe, it, expect, vi } from 'vitest';
import { createMockApi } from '../useApi.js';
import { IpcChannels } from '../../../../../../packages/contracts/src/index.js';

describe('Typed IPC Bridge and Hooks', () => {
  it('creates mock API and invokes registered handlers', async () => {
    const api = createMockApi({
      [IpcChannels.PLAYBACK_GET_STATUS]: () => ({
        state: 'Idle',
        elapsedMicroseconds: 12000,
      }),
    });

    const result = await api.invoke(IpcChannels.PLAYBACK_GET_STATUS, {
      requestId: 'test-1',
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.state).toBe('Idle');
      expect(result.data.elapsedMicroseconds).toBe(12000);
    }
  });

  it('handles mock API errors gracefully with AppError envelope', async () => {
    const api = createMockApi({
      [IpcChannels.PLAYBACK_START]: () => {
        throw new Error('Target window not found');
      },
    });

    const result = await api.invoke(IpcChannels.PLAYBACK_START, {
      requestId: 'test-2',
      macroId: 'invalid-id',
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('INTERNAL');
      expect(result.error.message).toContain('Target window not found');
    }
  });

  it('returns NOT_FOUND error for unregistered channels', async () => {
    const api = createMockApi();
    const result = await api.invoke(IpcChannels.RECORDING_START, {
      requestId: 'test-3',
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('NOT_FOUND');
    }
  });

  it('subscribes to push events and disposes listener when returned cleanup is called', () => {
    const api = createMockApi();
    const eventHandler = vi.fn();

    const unsubscribe = api.on('test-channel', eventHandler);

    expect(typeof unsubscribe).toBe('function');
    unsubscribe();
  });
});
