/**
 * Typed Electron IPC Bridge for Preload.
 * Bridges renderer requests to Electron ipcRenderer with channel whitelisting,
 * event subscription disposal, and error boundary sanitization.
 */

import {
  IpcChannels,
  isAllowedEventChannel,
  isAllowedInvokeChannel,
  type IpcChannelName,
  type IpcEventChannel,
} from './channels.js';
import { buildAllCapabilities } from './capabilities.js';
import {
  IpcErrorCode,
  type IpcEventPayloadFor,
  type IpcRequestFor,
  type IpcResponseFor,
  type IpcResult,
  type MacroRecorderApi,
  type Unsubscribe,
} from './types.js';

export interface IpcRendererTransport {
  invoke(channel: string, ...args: unknown[]): Promise<unknown>;
  on(channel: string, listener: (event: unknown, ...args: unknown[]) => void): void;
  removeListener(channel: string, listener: (event: unknown, ...args: unknown[]) => void): void;
}

export interface ApiBridgeInstance {
  readonly api: MacroRecorderApi;
  disposeAll(): void;
  getActiveSubscriptionCount(): number;
}

/**
 * Creates the safe MacroRecorderApi bridge instance backed by the given Electron transport.
 */
export function createApiBridge(transport: IpcRendererTransport): ApiBridgeInstance {
  // Active listeners map: channel -> Set of registered wrappers
  const activeListeners = new Map<IpcEventChannel, Set<(event: unknown, ...args: unknown[]) => void>>();
  const subscriptionOperations = new Map<IpcEventChannel, Promise<void>>();
  let subscriptionRequestCounter = 0;

  const invoke = async <C extends IpcChannelName>(
    channel: C,
    request: IpcRequestFor<C>,
  ): Promise<IpcResult<IpcResponseFor<C>>> => {
    // 1. Validate channel against whitelist
    if (!isAllowedInvokeChannel(channel)) {
      return {
        success: false,
        error: {
          code: IpcErrorCode.PERMISSION_DENIED,
          message: `Forbidden IPC channel: "${channel}" is not on the allowed channel whitelist`,
        },
        requestId: (request as { requestId?: string })?.requestId ?? 'unknown',
      };
    }

    // 2. Validate request shape
    if (!request || typeof request !== 'object') {
      return {
        success: false,
        error: {
          code: IpcErrorCode.INVALID_ARGUMENT,
          message: 'IPC request payload must be a non-null object',
        },
        requestId: 'unknown',
      };
    }

    const requestId = (request as { requestId?: string }).requestId ?? 'unknown';

    // 3. Transport invocation with error redaction
    try {
      const rawResult = await transport.invoke(channel, request);

      // Validate that the returned result is an IpcResult envelope
      if (
        rawResult &&
        typeof rawResult === 'object' &&
        'success' in rawResult &&
        typeof (rawResult as { success: unknown }).success === 'boolean'
      ) {
        return rawResult as IpcResult<IpcResponseFor<C>>;
      }

      // If main process returned bare response instead of envelope (defensive wrapping)
      return {
        success: true,
        data: rawResult as IpcResponseFor<C>,
        requestId,
      };
    } catch (err: unknown) {
      const rawMessage = err instanceof Error ? err.message : String(err);
      // Redact sensitive local user directories or internal file paths
      const redactedMessage = rawMessage.replace(/[a-zA-Z]:\\[^\s:;,"]+/g, '<redacted-path>');

      return {
        success: false,
        error: {
          code: IpcErrorCode.INTERNAL,
          message: `IPC communication error on ${channel}: ${redactedMessage}`,
        },
        requestId,
      };
    }
  };

  const enqueueSubscriptionChange = (
    channel: IpcEventChannel,
    shouldSubscribe: boolean,
  ): void => {
    const previous = subscriptionOperations.get(channel) ?? Promise.resolve();
    const operation = previous.then(async () => {
      const result = await invoke(
        shouldSubscribe ? IpcChannels.IPC_SUBSCRIBE : IpcChannels.IPC_UNSUBSCRIBE,
        {
          requestId: `subscription-${Date.now()}-${++subscriptionRequestCounter}`,
          channel,
        },
      );
      if (!result.success) {
        console.warn(
          `[MacroRecorder Preload] Failed to ${shouldSubscribe ? 'subscribe to' : 'unsubscribe from'} ${channel}: ${result.error.message}`,
        );
      }
    });
    subscriptionOperations.set(channel, operation);
    void operation.finally(() => {
      if (subscriptionOperations.get(channel) === operation) {
        subscriptionOperations.delete(channel);
      }
    });
  };

  const on = <C extends IpcEventChannel>(
    channel: C,
    callback: (event: IpcEventPayloadFor<C>) => void,
  ): Unsubscribe => {
    if (!isAllowedEventChannel(channel)) {
      console.warn(`[MacroRecorder Preload] Ignored subscription to unauthorized channel: "${channel}"`);
      return () => {};
    }

    if (typeof callback !== 'function') {
      return () => {};
    }

    const listenerWrapper = (_electronEvent: unknown, payload: unknown) => {
      try {
        callback(payload as IpcEventPayloadFor<C>);
      } catch (callbackErr) {
        console.error(`[MacroRecorder Preload] Error in listener callback for "${channel}":`, callbackErr);
      }
    };

    let listeners = activeListeners.get(channel);
    const isFirstListener = !listeners || listeners.size === 0;
    if (!listeners) {
      listeners = new Set();
      activeListeners.set(channel, listeners);
    }
    listeners.add(listenerWrapper);
    transport.on(channel, listenerWrapper);

    if (isFirstListener) {
      enqueueSubscriptionChange(channel, true);
    }

    let isDisposed = false;
    return () => {
      if (isDisposed) return;
      isDisposed = true;

      const set = activeListeners.get(channel);
      const wasRemoved = set?.delete(listenerWrapper) ?? false;
      if (set?.size === 0) {
        activeListeners.delete(channel);
      }

      try {
        transport.removeListener(channel, listenerWrapper);
      } catch (removeErr) {
        console.warn(`[MacroRecorder Preload] Failed removing listener for ${channel}:`, removeErr);
      }

      if (wasRemoved && !activeListeners.has(channel)) {
        enqueueSubscriptionChange(channel, false);
      }
    };
  };

  const cancelIpc = async (cancellationToken: string): Promise<void> => {
    if (!cancellationToken || typeof cancellationToken !== 'string') {
      return;
    }

    await invoke(IpcChannels.IPC_CANCEL, {
      requestId: `cancel-${Date.now()}`,
      targetRequestId: cancellationToken,
      reason: 'Cancellation requested via cancelIpc',
    });
  };

  const capabilities = buildAllCapabilities(invoke, on);

  const api: MacroRecorderApi = {
    ...capabilities,
    invoke,
    on,
    cancelIpc,
  };

  const disposeAll = () => {
    for (const [channel, listeners] of activeListeners.entries()) {
      for (const listener of listeners) {
        try {
          transport.removeListener(channel, listener);
        } catch {
          // Ignore errors during mass cleanup
        }
      }
      enqueueSubscriptionChange(channel, false);
    }
    activeListeners.clear();
  };

  const getActiveSubscriptionCount = () => {
    let count = 0;
    for (const set of activeListeners.values()) {
      count += set.size;
    }
    return count;
  };

  return {
    api,
    disposeAll,
    getActiveSubscriptionCount,
  };
}
