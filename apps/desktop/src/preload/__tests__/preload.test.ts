import { describe, expect, it, vi } from 'vitest';
import {
  createApiBridge,
  type IpcRendererTransport,
} from '../api-bridge.js';
import { IpcChannels, IpcEventChannels } from '../channels.js';
import { validatePreloadFilePath, validatePreloadRelativePath } from '../path-guard.js';
import { IpcErrorCode } from '../types.js';

function createMockTransport(
  invokeHandler?: (channel: string, ...args: unknown[]) => Promise<unknown>,
): IpcRendererTransport & {
  listeners: Map<string, Set<(event: unknown, ...args: unknown[]) => void>>;
} {
  const listeners = new Map<string, Set<(event: unknown, ...args: unknown[]) => void>>();

  return {
    listeners,
    invoke: vi.fn(async (channel: string, ...args: unknown[]) => {
      if (invokeHandler) {
        return invokeHandler(channel, ...args);
      }
      return { success: true, data: { status: 'mock-ok' }, requestId: 'req-mock' };
    }),
    on: vi.fn((channel: string, listener: (event: unknown, ...args: unknown[]) => void) => {
      if (!listeners.has(channel)) {
        listeners.set(channel, new Set());
      }
      listeners.get(channel)!.add(listener);
    }),
    removeListener: vi.fn((channel: string, listener: (event: unknown, ...args: unknown[]) => void) => {
      const set = listeners.get(channel);
      if (set) {
        set.delete(listener);
        if (set.size === 0) {
          listeners.delete(channel);
        }
      }
    }),
  };
}

describe('Preload IPC Bridge and Capability Security', () => {
  describe('Channel Whitelisting and Rejection of Arbitrary Bridges', () => {
    it('rejects unwhitelisted / generic channel invoke with PERMISSION_DENIED without invoking transport', async () => {
      const transport = createMockTransport();
      const bridge = createApiBridge(transport);

      // Attempt to invoke a generic/forbidden channel
      // @ts-expect-error Testing unwhitelisted channel
      const result = await bridge.api.invoke('generic:execute', { requestId: 'test-hack' });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe(IpcErrorCode.PERMISSION_DENIED);
        expect(result.error.message).toContain('Forbidden IPC channel');
      }
      expect(transport.invoke).not.toHaveBeenCalled();
    });

    it('rejects unsupported renderer playback channels without registering on transport', () => {
      const transport = createMockTransport();
      const bridge = createApiBridge(transport);
      const listener = vi.fn();

      // @ts-expect-error Legacy renderer channel is intentionally unsupported
      const unsubscribe = bridge.api.on('playback:receipt', listener);
      expect(transport.on).not.toHaveBeenCalled();
      expect(typeof unsubscribe).toBe('function');
      unsubscribe();
    });

    it('allows whitelisted channels and forwards valid requests', async () => {
      const transport = createMockTransport(async (_channel, req) => ({
        success: true,
        data: { state: 'Idle', elapsedMicroseconds: 0 },
        requestId: (req as { requestId: string }).requestId,
      }));
      const bridge = createApiBridge(transport);

      const result = await bridge.api.invoke(IpcChannels.PLAYBACK_GET_STATUS, {
        requestId: 'status-123',
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.state).toBe('Idle');
      }
      expect(transport.invoke).toHaveBeenCalledWith(
        IpcChannels.PLAYBACK_GET_STATUS,
        expect.objectContaining({ requestId: 'status-123' }),
      );
    });
  });

  describe('Path Traversal and Security Guard', () => {
    it('rejects path traversal sequences in relative folder paths', () => {
      expect(validatePreloadRelativePath('../escape').ok).toBe(false);
      expect(validatePreloadRelativePath('sub/../../escape').ok).toBe(false);
      expect(validatePreloadRelativePath('folder/..').ok).toBe(false);
    });

    it('rejects absolute paths in relative folder paths', () => {
      expect(validatePreloadRelativePath('C:\\Windows').ok).toBe(false);
      expect(validatePreloadRelativePath('/etc/passwd').ok).toBe(false);
      expect(validatePreloadRelativePath('\\system32').ok).toBe(false);
    });

    it('rejects null bytes and control characters in folder paths', () => {
      expect(validatePreloadRelativePath('folder\0secret').ok).toBe(false);
      expect(validatePreloadRelativePath('folder\x1fbad').ok).toBe(false);
    });

    it('rejects reserved DOS device names in folder paths', () => {
      expect(validatePreloadRelativePath('CON').ok).toBe(false);
      expect(validatePreloadRelativePath('sub/NUL').ok).toBe(false);
      expect(validatePreloadRelativePath('COM1').ok).toBe(false);
    });

    it('accepts safe relative folder paths and normalizes separators', () => {
      const res = validatePreloadRelativePath('MyFolder\\SubFolder');
      expect(res.ok).toBe(true);
      expect(res.sanitizedPath).toBe('MyFolder/SubFolder');
    });

    it('rejects path traversal and device names in file paths', () => {
      expect(validatePreloadFilePath('C:\\safe\\..\\escaped.mrmacro').ok).toBe(false);
      expect(validatePreloadFilePath('CON.mrmacro').ok).toBe(false);
      expect(validatePreloadFilePath('COM1.json').ok).toBe(false);
      expect(validatePreloadFilePath('path\0withnull.mrmacro').ok).toBe(false);
    });

    it('enforces permitted file extensions for exports and imports', () => {
      const allowed = ['.mrmacro', '.json'];
      expect(validatePreloadFilePath('C:\\data\\macro.exe', allowed).ok).toBe(false);
      expect(validatePreloadFilePath('C:\\data\\macro.mrmacro', allowed).ok).toBe(true);
      expect(validatePreloadFilePath('C:\\data\\macro.JSON', allowed).ok).toBe(true);
    });
  });

  describe('Narrow Capability APIs', () => {
    it('exposes all 13 narrow capability groups on bridge.api', () => {
      const transport = createMockTransport();
      const bridge = createApiBridge(transport);

      expect(bridge.api.library).toBeDefined();
      expect(bridge.api.recording).toBeDefined();
      expect(bridge.api.playback).toBeDefined();
      expect(bridge.api.hotkeys).toBeDefined();
      expect(bridge.api.windows).toBeDefined();
      expect(bridge.api.pixels).toBeDefined();
      expect(bridge.api.gamepads).toBeDefined();
      expect(bridge.api.overlays).toBeDefined();
      expect(bridge.api.settings).toBeDefined();
      expect(bridge.api.imports).toBeDefined();
      expect(bridge.api.exports).toBeDefined();
      expect(bridge.api.diagnostics).toBeDefined();
      expect(bridge.api.cancellation).toBeDefined();
    });

    it('library.createFolder pre-validates and rejects path traversal before invoking IPC', async () => {
      const transport = createMockTransport();
      const bridge = createApiBridge(transport);

      const result = await bridge.api.library.createFolder('../escape');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe(IpcErrorCode.INVALID_ARGUMENT);
        expect(result.error.message).toContain('Path traversal');
      }
      expect(transport.invoke).not.toHaveBeenCalled();
    });

    it('imports.importMacro rejects invalid file extensions before IPC', async () => {
      const transport = createMockTransport();
      const bridge = createApiBridge(transport);

      const result = await bridge.api.imports.importMacro('C:\\test\\virus.exe');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe(IpcErrorCode.INVALID_ARGUMENT);
        expect(result.error.message).toContain('extension');
      }
      expect(transport.invoke).not.toHaveBeenCalled();
    });

    it('playback.start sends valid request to main', async () => {
      const transport = createMockTransport(async () => ({
        success: true,
        data: { started: true, activeMacroId: 'macro-1' },
        requestId: 'req-1',
      }));
      const bridge = createApiBridge(transport);

      const result = await bridge.api.playback.start({ macroId: 'macro-1', speed: 1.5 });

      expect(result.success).toBe(true);
      expect(transport.invoke).toHaveBeenCalledWith(
        IpcChannels.PLAYBACK_START,
        expect.objectContaining({ macroId: 'macro-1', speed: 1.5 }),
      );
    });
  });

  describe('Push Event Subscriptions and Disposal', () => {
    it('strips Electron event parameter and delivers only payload to callback', () => {
      const transport = createMockTransport();
      const bridge = createApiBridge(transport);
      const received: unknown[] = [];

      bridge.api.recording.onStateChanged((state) => {
        received.push(state);
      });

      expect(transport.on).toHaveBeenCalledWith(
        IpcEventChannels.RECORDING_STATE_CHANGED,
        expect.any(Function),
      );

      // Simulate event arriving from Electron main with an internal event object
      const registeredWrapper = transport.listeners.get(IpcEventChannels.RECORDING_STATE_CHANGED)!.values().next().value!;
      const fakeElectronEvent = { sender: { id: 1 }, ports: [] };
      registeredWrapper(fakeElectronEvent, 'Recording');

      expect(received).toEqual(['Recording']);
    });

    it('subscribes on the first listener and unsubscribes after the last listener', async () => {
      const transport = createMockTransport();
      const bridge = createApiBridge(transport);

      const unsubscribeFirst = bridge.api.playback.onStatusChanged(vi.fn());
      const unsubscribeSecond = bridge.api.playback.onStatusChanged(vi.fn());

      await vi.waitFor(() => {
        expect(transport.invoke).toHaveBeenCalledWith(
          IpcChannels.IPC_SUBSCRIBE,
          expect.objectContaining({ channel: IpcEventChannels.PLAYBACK_STATUS_CHANGED }),
        );
      });
      expect(
        vi.mocked(transport.invoke).mock.calls.filter(
          ([channel]) => channel === IpcChannels.IPC_SUBSCRIBE,
        ),
      ).toHaveLength(1);

      unsubscribeFirst();
      expect(
        vi.mocked(transport.invoke).mock.calls.some(
          ([channel]) => channel === IpcChannels.IPC_UNSUBSCRIBE,
        ),
      ).toBe(false);

      unsubscribeSecond();
      await vi.waitFor(() => {
        expect(transport.invoke).toHaveBeenCalledWith(
          IpcChannels.IPC_UNSUBSCRIBE,
          expect.objectContaining({ channel: IpcEventChannels.PLAYBACK_STATUS_CHANGED }),
        );
      });
    });

    it('unsubscribes and disposes listener when returned unsubscribe is called', () => {
      const transport = createMockTransport();
      const bridge = createApiBridge(transport);

      const unsubscribe = bridge.api.hotkeys.onTriggered(vi.fn());
      expect(bridge.getActiveSubscriptionCount()).toBe(1);

      unsubscribe();
      expect(bridge.getActiveSubscriptionCount()).toBe(0);
      expect(transport.removeListener).toHaveBeenCalled();
    });

    it('disposeAll cleans up all active subscriptions', () => {
      const transport = createMockTransport();
      const bridge = createApiBridge(transport);

      bridge.api.recording.onEvent(vi.fn());
      bridge.api.playback.onStatusChanged(vi.fn());
      bridge.api.gamepads.onStateChanged(vi.fn());

      expect(bridge.getActiveSubscriptionCount()).toBe(3);

      bridge.disposeAll();
      expect(bridge.getActiveSubscriptionCount()).toBe(0);
      expect(transport.removeListener).toHaveBeenCalledTimes(3);
    });
  });

  describe('Error Boundary and Redaction in Preload', () => {
    it('catches unexpected transport rejections and redacts file paths', async () => {
      const transport = createMockTransport(async () => {
        throw new Error('EACCES: permission denied, open "C:\\Users\\Kritik\\Private\\key.pem"');
      });
      const bridge = createApiBridge(transport);

      const result = await bridge.api.invoke(IpcChannels.STORAGE_LOAD_LIBRARY, {
        requestId: 'err-test',
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe(IpcErrorCode.INTERNAL);
        // Sensitive path must be redacted
        expect(result.error.message).not.toContain('C:\\Users\\Kritik\\Private');
        expect(result.error.message).toContain('<redacted-path>');
      }
    });
  });
});
