import { describe, expect, it, vi } from 'vitest';
import type { IpcMain, IpcMainInvokeEvent, Session, WebContents, WebFrameMain } from 'electron';
import { CancellationManager } from '../cancellation.js';
import { IpcChannels, IpcEventChannels, isKnownIpcChannel } from '../channels.js';
import { redactError, redactMessage } from '../error-redaction.js';
import { validateMainFilePath, validateMainRelativePath } from '../path-security.js';
import { IpcHandlerRegistry } from '../registry.js';
import { configureWebContentsSecurity, isAllowedExternalUrl, isAllowedNavigationUrl } from '../security.js';
import { validateSender } from '../sender.js';
import { SubscriptionManager } from '../subscriptions.js';
import { IpcErrorCode } from '../types.js';
import { validateIpcPayload } from '../validation.js';
import { IpcBroadcaster } from '../../application/ipc/ipc-broadcaster.js';

function createMockIpcMain(): IpcMain & {
  handlers: Map<string, (event: IpcMainInvokeEvent, ...args: unknown[]) => Promise<unknown>>;
} {
  const handlers = new Map<string, (event: IpcMainInvokeEvent, ...args: unknown[]) => Promise<unknown>>();

  return {
    handlers,
    handle: vi.fn((channel: string, listener: (event: IpcMainInvokeEvent, ...args: unknown[]) => Promise<unknown>) => {
      handlers.set(channel, listener);
    }),
    removeHandler: vi.fn((channel: string) => {
      handlers.delete(channel);
    }),
    handleOnce: vi.fn(),
    on: vi.fn(),
    once: vi.fn(),
    removeListener: vi.fn(),
    removeAllListeners: vi.fn(),
  } as unknown as IpcMain & {
    handlers: Map<string, (event: IpcMainInvokeEvent, ...args: unknown[]) => Promise<unknown>>;
  };
}

function createMockInvokeEvent(overrides: Partial<IpcMainInvokeEvent> = {}): IpcMainInvokeEvent {
  const mockSender = {
    id: 42,
    isDestroyed: vi.fn(() => false),
    getOSProcessId: vi.fn(() => 1234),
    getProcessId: vi.fn(() => 1234),
    send: vi.fn(),
    once: vi.fn(),
  } as unknown as WebContents;

  const mockFrame = {
    url: 'file:///C:/app/index.html',
    processId: 1234,
  } as unknown as WebFrameMain;

  return {
    sender: mockSender,
    senderFrame: mockFrame,
    processId: 1234,
    frameId: 1,
    ...overrides,
  } as unknown as IpcMainInvokeEvent;
}

describe('Electron Main IPC Infrastructure and Security', () => {
  describe('Sender Frame and Origin Authentication', () => {
    it('compares Chromium frame IDs independently of Windows process IDs', () => {
      const event = createMockInvokeEvent();
      vi.mocked(event.sender.getProcessId).mockReturnValue(7);
      if (!event.senderFrame) throw new Error('Test requires an attached frame');
      Object.assign(event.senderFrame, { processId: 7 });
      expect(validateSender(event).valid).toBe(true);
    });

    it('approves legitimate application file:// sender frame', () => {
      const event = createMockInvokeEvent();
      const result = validateSender(event);
      expect(result.valid).toBe(true);
      if (result.valid) {
        expect(result.url).toBe('file:///C:/app/index.html');
      }
    });

    it('approves legitimate app:// sender frame', () => {
      const event = createMockInvokeEvent({
        senderFrame: { url: 'app://macro-recorder/index.html', processId: 1234 } as unknown as WebFrameMain,
      });
      const result = validateSender(event);
      expect(result.valid).toBe(true);
    });

    it('rejects forged or missing senderFrame with PERMISSION_DENIED', () => {
      const event = createMockInvokeEvent({
        senderFrame: null as unknown as WebFrameMain,
      });
      const result = validateSender(event);
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.code).toBe(IpcErrorCode.PERMISSION_DENIED);
        expect(result.reason).toContain('detached or invalid senderFrame');
      }
    });

    it('rejects destroyed WebContents sender with PERMISSION_DENIED', () => {
      const destroyedSender = {
        id: 99,
        isDestroyed: vi.fn(() => true),
      } as unknown as WebContents;
      const event = createMockInvokeEvent({ sender: destroyedSender });

      const result = validateSender(event);
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.code).toBe(IpcErrorCode.PERMISSION_DENIED);
        expect(result.reason).toContain('destroyed or missing WebContents');
      }
    });

    it('rejects forbidden schemes like javascript: and data: with PERMISSION_DENIED', () => {
      const jsEvent = createMockInvokeEvent({
        senderFrame: { url: 'javascript:alert(1)', processId: 1234 } as unknown as WebFrameMain,
      });
      const jsResult = validateSender(jsEvent);
      expect(jsResult.valid).toBe(false);

      const dataEvent = createMockInvokeEvent({
        senderFrame: { url: 'data:text/html,<h1>hack</h1>', processId: 1234 } as unknown as WebFrameMain,
      });
      const dataResult = validateSender(dataEvent);
      expect(dataResult.valid).toBe(false);
    });

    it('rejects unauthorized external web origins with PERMISSION_DENIED', () => {
      const externalEvent = createMockInvokeEvent({
        senderFrame: { url: 'https://attacker.evil.com/payload', processId: 1234 } as unknown as WebFrameMain,
      });
      const result = validateSender(externalEvent, { allowDevServer: false });
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.code).toBe(IpcErrorCode.PERMISSION_DENIED);
        expect(result.reason).toContain('Untrusted sender URL origin');
      }
    });

    it('rejects mismatched process IDs with PERMISSION_DENIED', () => {
      const event = createMockInvokeEvent({
        senderFrame: { url: 'file:///C:/app/index.html', processId: 9999 } as unknown as WebFrameMain,
      });
      const result = validateSender(event);
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.code).toBe(IpcErrorCode.PERMISSION_DENIED);
        expect(result.reason).toContain('Mismatched frame processId');
      }
    });
  });

  describe('Path Security and Traversal Guard', () => {
    it('rejects path traversal attempts in folder relative paths', () => {
      expect(validateMainRelativePath('../escape').valid).toBe(false);
      expect(validateMainRelativePath('folder/../../escape').valid).toBe(false);
      expect(validateMainRelativePath('..\\escape').valid).toBe(false);
    });

    it('rejects absolute paths in folder relative paths', () => {
      expect(validateMainRelativePath('C:\\Windows').valid).toBe(false);
      expect(validateMainRelativePath('/etc/passwd').valid).toBe(false);
      expect(validateMainRelativePath('\\system32').valid).toBe(false);
    });

    it('rejects null bytes and control characters in folder paths', () => {
      expect(validateMainRelativePath('sub\0secret').valid).toBe(false);
      expect(validateMainRelativePath('sub\x1einvalid').valid).toBe(false);
    });

    it('rejects reserved DOS devices in folder paths', () => {
      expect(validateMainRelativePath('CON').valid).toBe(false);
      expect(validateMainRelativePath('sub/NUL').valid).toBe(false);
      expect(validateMainRelativePath('COM3').valid).toBe(false);
    });

    it('sanitizes and accepts legitimate relative folder paths', () => {
      const res = validateMainRelativePath('Workflows\\Finance\\Daily');
      expect(res.valid).toBe(true);
      expect(res.sanitizedPath).toBe('Workflows/Finance/Daily');
    });

    it('rejects file paths pointing to sensitive OS directories', () => {
      expect(validateMainFilePath('C:\\Windows\\System32\\calc.exe').valid).toBe(false);
      expect(validateMainFilePath('C:\\Program Files\\app.dll').valid).toBe(false);
      expect(validateMainFilePath('/etc/shadow').valid).toBe(false);
    });

    it('enforces permitted file extension whitelist for file paths', () => {
      const options = { allowedExtensions: ['.mrmacro', '.json'] };
      expect(validateMainFilePath('C:\\Users\\test\\Desktop\\macro.mrmacro', options).valid).toBe(true);
      expect(validateMainFilePath('C:\\Users\\test\\Desktop\\macro.JSON', options).valid).toBe(true);
      expect(validateMainFilePath('C:\\Users\\test\\Desktop\\exploit.exe', options).valid).toBe(false);
    });
  });

  describe('Runtime Schema and Payload Validation', () => {
    it('rejects non-object payload with INVALID_ARGUMENT', () => {
      const result = validateIpcPayload(IpcChannels.PLAYBACK_GET_STATUS, null);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain('non-null JSON object');
      }
    });

    it('rejects missing or blank requestId', () => {
      const result = validateIpcPayload(IpcChannels.PLAYBACK_GET_STATUS, { requestId: '' });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain('requestId');
      }
    });

    it('rejects invalid speed parameter in PLAYBACK_START', () => {
      const result = validateIpcPayload(IpcChannels.PLAYBACK_START, {
        requestId: 'req-1',
        speed: -5,
      });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain('speed');
      }
    });

    it('validates required fields in STORAGE_SAVE_MACRO', () => {
      const invalid = validateIpcPayload(IpcChannels.STORAGE_SAVE_MACRO, {
        requestId: 'req-2',
        macro: { name: 'Incomplete' }, // Missing id and events
      });
      expect(invalid.ok).toBe(false);

      const valid = validateIpcPayload(IpcChannels.STORAGE_SAVE_MACRO, {
        requestId: 'req-3',
        macro: {
          schemaVersion: 12,
          id: 'macro-1',
          name: 'Complete',
          events: [],
        },
      });
      expect(valid.ok).toBe(true);
    });

    it('rejects path traversal inside STORAGE_CREATE_FOLDER request', () => {
      const result = validateIpcPayload(IpcChannels.STORAGE_CREATE_FOLDER, {
        requestId: 'req-4',
        folderRelativePath: '../../escape',
      });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain('Path traversal');
      }
    });
  });

  describe('Error Redaction and Data Sanitization', () => {
    it('redacts local user paths from error messages', () => {
      const raw = 'Failed opening file: C:\\Users\\Administrator\\AppData\\Local\\MacroRecorder\\data.db';
      const redacted = redactMessage(raw);
      expect(redacted).not.toContain('C:\\Users\\Administrator');
      expect(redacted).toContain('<redacted-user-path>');
    });

    it('redacts raw memory pointer addresses', () => {
      const raw = 'Access violation reading location 0x00007FFB34021000';
      const redacted = redactMessage(raw);
      expect(redacted).not.toContain('0x00007FFB34021000');
      expect(redacted).toContain('<redacted-ptr>');
    });

    it('strips stack traces in production mode', () => {
      const err = new Error('Database locked');
      err.stack = 'Error: Database locked\n    at internalQuery (C:\\secret\\db.ts:10:5)';

      const result = redactError(err, true);
      expect(result.code).toBe(IpcErrorCode.INTERNAL);
      expect(result.stack).toBeUndefined();
    });
  });

  describe('Cancellation Lifecycle and AbortSignal', () => {
    it('registers in-flight request and aborts signal when cancelled by requestId', () => {
      const cm = new CancellationManager();
      const signal = cm.register('req-long-1');

      expect(signal.aborted).toBe(false);
      expect(cm.isCancelled('req-long-1')).toBe(false);

      const cancelled = cm.cancel('req-long-1', 'User clicked cancel');
      expect(cancelled).toBe(true);
      expect(signal.aborted).toBe(true);
      expect(cm.isCancelled('req-long-1')).toBe(true);
      expect(cm.getReason('req-long-1')).toBe('User clicked cancel');

      cm.complete('req-long-1');
      expect(cm.isCancelled('req-long-1')).toBe(false);
    });

    it('cancels in-flight request by cancellationToken', () => {
      const cm = new CancellationManager();
      const signal = cm.register('req-long-2', 'token-abc');

      expect(signal.aborted).toBe(false);
      const cancelled = cm.cancel('token-abc', 'Token aborted');
      expect(cancelled).toBe(true);
      expect(signal.aborted).toBe(true);
    });
  });

  describe('Subscription Manager and Automatic Disposal', () => {
    it('subscribes WebContents, broadcasts payload, and cleans up on destroyed event', () => {
      const sm = new SubscriptionManager();
      let destroyCallback: (() => void) | undefined;

      const mockWebContents = {
        id: 77,
        isDestroyed: vi.fn(() => false),
        send: vi.fn(),
        once: vi.fn((event: string, cb: () => void) => {
          if (event === 'destroyed') destroyCallback = cb;
        }),
      } as unknown as WebContents;

      const subscribed = sm.subscribe(mockWebContents, 'playback:status-changed');
      expect(subscribed).toBe(true);
      expect(sm.getSubscriberCount('playback:status-changed')).toBe(1);

      // Broadcast event
      sm.broadcast('playback:status-changed', { state: 'Playing', elapsedMicroseconds: 0 });
      expect(mockWebContents.send).toHaveBeenCalledWith('playback:status-changed', {
        state: 'Playing',
        elapsedMicroseconds: 0,
      });

      // Simulate window close / WebContents destroyed
      expect(destroyCallback).toBeDefined();
      destroyCallback!();

      // Subscriber count should drop to 0 automatically
      expect(sm.getSubscriberCount('playback:status-changed')).toBe(0);
    });

    it('rejects subscriptions to unauthorized event channels', () => {
      const sm = new SubscriptionManager();
      const mockWebContents = { id: 88, isDestroyed: () => false } as unknown as WebContents;

      const subscribed = sm.subscribe(mockWebContents, 'arbitrary:unauthorized');
      expect(subscribed).toBe(false);
    });

    it('registers and removes the authenticated invoking sender through lifecycle channels', async () => {
      const mockIpc = createMockIpcMain();
      const subscriptions = new SubscriptionManager();
      const registry = new IpcHandlerRegistry({
        ipcMainInstance: mockIpc,
        subscriptionManager: subscriptions,
      });
      const event = createMockInvokeEvent();

      const subscribe = mockIpc.handlers.get(IpcChannels.IPC_SUBSCRIBE)!;
      const subscribed = await subscribe(event, {
        requestId: 'subscribe-1',
        channel: IpcEventChannels.PLAYBACK_STATUS_CHANGED,
      });

      expect(subscribed).toMatchObject({
        success: true,
        data: { subscribed: true },
      });
      expect(registry.subscriptions).toBe(subscriptions);
      expect(subscriptions.getSubscriberCount(IpcEventChannels.PLAYBACK_STATUS_CHANGED)).toBe(1);

      const payload = {
        state: 'Playing' as const,
        currentMacroId: 'macro-1',
        elapsedMicroseconds: 1250,
      };
      subscriptions.broadcast(IpcEventChannels.PLAYBACK_STATUS_CHANGED, payload);
      expect(event.sender.send).toHaveBeenCalledWith(
        IpcEventChannels.PLAYBACK_STATUS_CHANGED,
        payload,
      );

      const unsubscribe = mockIpc.handlers.get(IpcChannels.IPC_UNSUBSCRIBE)!;
      const unsubscribed = await unsubscribe(event, {
        requestId: 'unsubscribe-1',
        channel: IpcEventChannels.PLAYBACK_STATUS_CHANGED,
      });

      expect(unsubscribed).toMatchObject({
        success: true,
        data: { unsubscribed: true },
      });
      expect(subscriptions.getSubscriberCount(IpcEventChannels.PLAYBACK_STATUS_CHANGED)).toBe(0);
    });
  });

  describe('IPC broadcaster event DTOs', () => {
    it('emits payloads matching the preload declarations', () => {
      const broadcast = vi.fn();
      const playbackOnStatusChange = vi.fn((_listener: unknown) => () => {});
      const recordingOnEvent = vi.fn((_listener: unknown) => () => {});
      const recordingOnStateChange = vi.fn((_listener: unknown) => () => {});
      const hotkeyOnTriggered = vi.fn((_listener: unknown) => () => {});
      const gamepadOnStateChanged = vi.fn((_listener: unknown) => () => {});
      const overlayOnStateChange = vi.fn((_listener: unknown) => () => {});
      const broadcaster = new IpcBroadcaster(
        { broadcast } as unknown as SubscriptionManager,
        {
          playbackCoordinator: { onStatusChange: playbackOnStatusChange },
          recordingCoordinator: {
            onEvent: recordingOnEvent,
            onStateChange: recordingOnStateChange,
          },
          globalControlCoordinator: { onHotkeyTriggered: hotkeyOnTriggered },
          gamepadCoordinator: { onStateChanged: gamepadOnStateChanged },
          overlayCoordinator: { onStateChange: overlayOnStateChange },
        } as unknown as ConstructorParameters<typeof IpcBroadcaster>[1],
      );

      broadcaster.start();

      const recordingListener = recordingOnStateChange.mock.calls[0]![0] as unknown as (
        status: { isRecording: boolean; isPaused: boolean; isCountdown: boolean },
      ) => void;
      recordingListener({ isRecording: true, isPaused: false, isCountdown: false });
      recordingListener({ isRecording: false, isPaused: true, isCountdown: false });

      const readings = [{ slot: 0, connected: true }];
      const gamepadListener = gamepadOnStateChanged.mock.calls[0]![0] as unknown as (
        value: readonly unknown[],
      ) => void;
      gamepadListener(readings);

      const hotkeyListener = hotkeyOnTriggered.mock.calls[0]![0] as unknown as (
        value: { id: number; virtualKey: number; description: string },
      ) => void;
      hotkeyListener({ id: 7, virtualKey: 65, description: 'A' });
      broadcaster.broadcastWindowState('MainWindow', 'minimized');

      expect(broadcast).toHaveBeenCalledWith(
        IpcEventChannels.RECORDING_STATE_CHANGED,
        'Recording',
      );
      expect(broadcast).toHaveBeenCalledWith(IpcEventChannels.RECORDING_STATE_CHANGED, 'Paused');
      expect(broadcast).toHaveBeenCalledWith(IpcEventChannels.GAMEPAD_STATE_CHANGED, readings);
      expect(broadcast).toHaveBeenCalledWith(IpcEventChannels.HOTKEY_TRIGGERED, { id: 7, key: 'A' });
      expect(broadcast).toHaveBeenCalledWith(IpcEventChannels.WINDOW_STATE_CHANGED, {
        windowId: 'MainWindow',
        state: 'minimized',
      });
    });
  });

  describe('WebContents Security Policies (Deny by Default)', () => {
    it('denies window.open requests by default', () => {
      let openHandler: ((details: { url: string }) => { action: string }) | undefined;
      const mockWc = {
        setWindowOpenHandler: vi.fn((handler) => {
          openHandler = handler;
        }),
        on: vi.fn(),
        session: {
          setPermissionRequestHandler: vi.fn(),
          setPermissionCheckHandler: vi.fn(),
        },
      } as unknown as WebContents;

      configureWebContentsSecurity(mockWc);
      expect(openHandler).toBeDefined();

      const result = openHandler!({ url: 'https://evil.com/popup' });
      expect(result.action).toBe('deny');
    });

    it('opens only the author\'s GitHub pages in the browser', () => {
      let openHandler: ((details: { url: string }) => { action: string }) | undefined;
      const openExternal = vi.fn();
      const mockWc = {
        setWindowOpenHandler: vi.fn((handler) => {
          openHandler = handler;
        }),
        on: vi.fn(),
      } as unknown as WebContents;
      configureWebContentsSecurity(mockWc, { openExternal });

      const allowed = 'https://github.com/smilekritik/MacroRecorder/releases/tag/v1.0.0';
      expect(openHandler!({ url: allowed }).action).toBe('deny');
      expect(openHandler!({ url: 'https://evil.com/smilekritik' }).action).toBe('deny');
      expect(openExternal.mock.calls).toEqual([[allowed]]);

      expect(isAllowedExternalUrl('https://github.com/smilekritik')).toBe(true);
      expect(isAllowedExternalUrl('https://github.com/smilekritik-evil')).toBe(false);
      expect(isAllowedExternalUrl('http://github.com/smilekritik')).toBe(false);
      expect(isAllowedExternalUrl('https://github.com.evil.com/smilekritik')).toBe(false);
    });

    it('denies will-navigate to unauthorized URLs by default', () => {
      const listeners = new Map<string, (event: { preventDefault: () => void }, url: string) => void>();
      const mockWc = {
        setWindowOpenHandler: vi.fn(),
        on: vi.fn((event, handler) => {
          listeners.set(event, handler);
        }),
        session: {
          setPermissionRequestHandler: vi.fn(),
          setPermissionCheckHandler: vi.fn(),
        },
      } as unknown as WebContents;

      configureWebContentsSecurity(mockWc, { allowDevServer: false });

      const willNavigate = listeners.get('will-navigate');
      expect(willNavigate).toBeDefined();

      const preventDefault = vi.fn();
      willNavigate!({ preventDefault }, 'https://malicious.org');
      expect(preventDefault).toHaveBeenCalled();
    });

    it('denies all session permission requests by default', () => {
      let registeredHandler: ((wc: unknown, perm: string, cb: (allowed: boolean) => void) => void) | undefined;
      let registeredCheckHandler: ((wc: unknown, perm: string) => boolean) | undefined;

      const mockSession = {
        setPermissionRequestHandler: vi.fn((handler) => {
          registeredHandler = handler;
        }),
        setPermissionCheckHandler: vi.fn((handler) => {
          registeredCheckHandler = handler;
        }),
      } as unknown as Session;

      const mockWc = {
        setWindowOpenHandler: vi.fn(),
        on: vi.fn(),
        session: mockSession,
      } as unknown as WebContents;

      configureWebContentsSecurity(mockWc);

      expect(mockSession.setPermissionRequestHandler).toHaveBeenCalled();
      expect(mockSession.setPermissionCheckHandler).toHaveBeenCalled();
      expect(registeredHandler).toBeDefined();
      expect(registeredCheckHandler).toBeDefined();

      const cb = vi.fn();
      registeredHandler!(mockWc, 'camera', cb);
      expect(cb).toHaveBeenCalledWith(false);

      expect(registeredCheckHandler!(mockWc, 'notifications')).toBe(false);
    });

    it('blocks <webview> attachment by default', () => {
      const listeners = new Map<string, (event: { preventDefault: () => void }) => void>();
      const mockWc = {
        setWindowOpenHandler: vi.fn(),
        on: vi.fn((event, handler) => {
          listeners.set(event, handler);
        }),
        session: {
          setPermissionRequestHandler: vi.fn(),
          setPermissionCheckHandler: vi.fn(),
        },
      } as unknown as WebContents;

      configureWebContentsSecurity(mockWc);

      const willAttach = listeners.get('will-attach-webview');
      expect(willAttach).toBeDefined();

      const preventDefault = vi.fn();
      willAttach!({ preventDefault });
      expect(preventDefault).toHaveBeenCalled();
    });

    it('evaluates isAllowedNavigationUrl correctly', () => {
      expect(isAllowedNavigationUrl('file:///C:/app/index.html')).toBe(true);
      expect(isAllowedNavigationUrl('app://macro-recorder/index.html')).toBe(true);
      expect(isAllowedNavigationUrl('javascript:alert(1)')).toBe(false);
      expect(isAllowedNavigationUrl('data:text/html,hack')).toBe(false);
      expect(isAllowedNavigationUrl('https://google.com')).toBe(false);
    });
  });

  describe('End-to-End Typed Handler Registry Integration', () => {
    it('dispatches valid requests, passes cancellation signal, and returns envelope', async () => {
      const mockIpc = createMockIpcMain();
      const registry = new IpcHandlerRegistry({ ipcMainInstance: mockIpc });

      registry.register(IpcChannels.PLAYBACK_GET_STATUS, (_req, context) => {
        expect(context.signal).toBeDefined();
        expect(context.signal.aborted).toBe(false);
        return {
          state: 'Idle',
          elapsedMicroseconds: 5000,
        };
      });

      const handler = mockIpc.handlers.get(IpcChannels.PLAYBACK_GET_STATUS);
      expect(handler).toBeDefined();

      const event = createMockInvokeEvent();
      const result = (await handler!(event, { requestId: 'test-req-1' })) as {
        success: boolean;
        data?: { state: string; elapsedMicroseconds: number };
        requestId: string;
      };

      expect(result.success).toBe(true);
      expect(result.data?.state).toBe('Idle');
      expect(result.data?.elapsedMicroseconds).toBe(5000);
      expect(result.requestId).toBe('test-req-1');
    });

    it('rejects forged sender before executing domain handler', async () => {
      const mockIpc = createMockIpcMain();
      const registry = new IpcHandlerRegistry({ ipcMainInstance: mockIpc });
      const domainHandler = vi.fn();

      registry.register(IpcChannels.PLAYBACK_STOP, domainHandler);
      const handler = mockIpc.handlers.get(IpcChannels.PLAYBACK_STOP)!;

      // Fake event with forged sender URL
      const forgedEvent = createMockInvokeEvent({
        senderFrame: { url: 'https://attacker.com/steal', processId: 1234 } as unknown as WebFrameMain,
      });

      const result = (await handler(forgedEvent, { requestId: 'forge-1' })) as {
        success: boolean;
        error: { code: string; message: string };
      };

      expect(result.success).toBe(false);
      expect(result.error.code).toBe(IpcErrorCode.PERMISSION_DENIED);
      expect(domainHandler).not.toHaveBeenCalled();
    });

    it('rejects malformed payload with INVALID_ARGUMENT before domain handler', async () => {
      const mockIpc = createMockIpcMain();
      const registry = new IpcHandlerRegistry({ ipcMainInstance: mockIpc });
      const domainHandler = vi.fn();

      registry.register(IpcChannels.PIXEL_CAPTURE, domainHandler);
      const handler = mockIpc.handlers.get(IpcChannels.PIXEL_CAPTURE)!;

      const event = createMockInvokeEvent();
      // Non-integer coordinates
      const result = (await handler(event, { requestId: 'pix-1', x: 'invalid', y: 10 })) as {
        success: boolean;
        error: { code: string };
      };

      expect(result.success).toBe(false);
      expect(result.error.code).toBe(IpcErrorCode.INVALID_ARGUMENT);
      expect(domainHandler).not.toHaveBeenCalled();
    });

    it('handles domain errors by redacting paths and returning error envelope', async () => {
      const mockIpc = createMockIpcMain();
      const registry = new IpcHandlerRegistry({ ipcMainInstance: mockIpc });

      registry.register(IpcChannels.STORAGE_LOAD_LIBRARY, () => {
        throw new Error('Failed to read library at C:\\Users\\SensitiveUser\\Library\\macros.db');
      });

      const handler = mockIpc.handlers.get(IpcChannels.STORAGE_LOAD_LIBRARY)!;
      const event = createMockInvokeEvent();
      const result = (await handler(event, { requestId: 'err-1' })) as {
        success: boolean;
        error: { code: string; message: string };
      };

      expect(result.success).toBe(false);
      expect(result.error.code).toBe(IpcErrorCode.INTERNAL);
      expect(result.error.message).not.toContain('SensitiveUser');
      expect(result.error.message).toContain('<redacted-user-path>');
    });

    it('cancels active operation via built-in IPC_CANCEL channel', async () => {
      const mockIpc = createMockIpcMain();
      const registry = new IpcHandlerRegistry({ ipcMainInstance: mockIpc });

      // Register long-running handler
      let capturedSignal: AbortSignal | undefined;
      registry.register(IpcChannels.PLAYBACK_START, async (_req, context) => {
        capturedSignal = context.signal;
        await new Promise((resolve) => setTimeout(resolve, 50));
        return { started: true, activeMacroId: 'macro-1' };
      });

      const startHandler = mockIpc.handlers.get(IpcChannels.PLAYBACK_START)!;
      const cancelHandler = mockIpc.handlers.get(IpcChannels.IPC_CANCEL)!;
      const event = createMockInvokeEvent();

      // Launch start in background
      const startPromise = startHandler(event, {
        requestId: 'long-req-1',
        cancellationToken: 'tok-1',
      });

      // Send cancellation
      const cancelResult = (await cancelHandler(event, {
        requestId: 'cancel-req-1',
        targetRequestId: 'tok-1',
        reason: 'User cancelled',
      })) as { success: boolean; data: { cancelled: boolean } };

      expect(cancelResult.success).toBe(true);
      expect(cancelResult.data.cancelled).toBe(true);
      expect(capturedSignal?.aborted).toBe(true);

      const startResult = (await startPromise) as {
        success: boolean;
        error?: { code: string };
      };
      expect(startResult.success).toBe(false);
      expect(startResult.error?.code).toBe(IpcErrorCode.CANCELLED);
    });

    it('rejects registering arbitrary / unknown channels', () => {
      const mockIpc = createMockIpcMain();
      const registry = new IpcHandlerRegistry({ ipcMainInstance: mockIpc });

      expect(() => {
        // @ts-expect-error Testing invalid channel
        registry.register('unknown:dangerous', vi.fn());
      }).toThrow('Cannot register unknown IPC channel');
    });

    it('verifies all 44 canonical channels are known', () => {
      expect(isKnownIpcChannel('playback:start')).toBe(true);
      expect(isKnownIpcChannel('storage:load-library')).toBe(true);
      expect(isKnownIpcChannel('gamepad:get-readings')).toBe(true);
      expect(isKnownIpcChannel('emergency:stop')).toBe(true);
      expect(isKnownIpcChannel('ipc:cancel')).toBe(true);
      expect(isKnownIpcChannel('arbitrary:channel')).toBe(false);
    });
  });
});
