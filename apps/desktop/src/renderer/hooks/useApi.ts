import {
  IpcErrorCode,
  type IpcChannelName,
  type IpcRequestFor,
  type IpcResponseFor,
  type IpcResult,
} from '../../../../../packages/contracts/src/index.js';

export interface MacroRecorderApi {
  invoke<C extends IpcChannelName>(
    channel: C,
    request: IpcRequestFor<C>,
  ): Promise<IpcResult<IpcResponseFor<C>>>;
  on<E = unknown>(channel: string, callback: (event: E) => void): () => void;
  cancelIpc(cancellationToken: string): Promise<void>;
}

declare global {
  interface Window {
    macroRecorderApi?: MacroRecorderApi | undefined;
  }
}

/**
 * Creates an in-memory mock API implementation for testing and isolated browser development.
 */
export function createMockApi(
  handlers?: Partial<{
    [C in IpcChannelName]: (
      request: IpcRequestFor<C>,
    ) => Promise<IpcResponseFor<C>> | IpcResponseFor<C>;
  }>,
): MacroRecorderApi {
  const listeners = new Map<string, Set<(event: unknown) => void>>();

  return {
    async invoke<C extends IpcChannelName>(
      channel: C,
      request: IpcRequestFor<C>,
    ): Promise<IpcResult<IpcResponseFor<C>>> {
      const handler = handlers?.[channel];
      if (handler) {
        try {
          const data = await handler(request);
          return {
            success: true,
            data: data as IpcResponseFor<C>,
            requestId: request.requestId,
          };
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);
          return {
            success: false,
            error: {
              code: IpcErrorCode.INTERNAL,
              message,
            },
            requestId: request.requestId,
          };
        }
      }

      return {
        success: false,
        error: {
          code: IpcErrorCode.NOT_FOUND,
          message: `No mock handler registered for channel ${channel}`,
        },
        requestId: request.requestId,
      };
    },

    on<E = unknown>(channel: string, callback: (event: E) => void): () => void {
      if (!listeners.has(channel)) {
        listeners.set(channel, new Set());
      }
      const set = listeners.get(channel)!;
      const fn = callback as (event: unknown) => void;
      set.add(fn);

      return () => {
        set.delete(fn);
        if (set.size === 0) {
          listeners.delete(channel);
        }
      };
    },

    async cancelIpc(_cancellationToken: string): Promise<void> {
      // Mock cancellation no-op
    },
  };
}

/**
 * Hook to safely obtain the typed IPC API bridge without importing Electron or Node directly.
 * Adheres strictly to unprivileged renderer security rules.
 */
export function useApi(): MacroRecorderApi {
  if (typeof window !== 'undefined' && window.macroRecorderApi) {
    return window.macroRecorderApi;
  }

  // Fallback to default mock API in test or headless environments
  return createMockApi();
}
