import { useEffect, useRef } from 'react';
import { useApi, type MacroRecorderApi } from './useApi.js';

export interface UseIpcSubscriptionOptions {
  readonly enabled?: boolean | undefined;
  readonly apiOverride?: MacroRecorderApi | undefined;
}

/**
 * Subscribes to IPC events from the main/native processes.
 * Strictly disposes the subscription listener on unmount.
 */
export function useIpcSubscription<E = unknown>(
  channel: string,
  handler: (event: E) => void,
  options: UseIpcSubscriptionOptions = {},
): void {
  const defaultApi = useApi();
  const api = options.apiOverride ?? defaultApi;
  const { enabled = true } = options;

  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    if (!enabled) return;

    const unsubscribe = api.on<E>(channel, (event: E) => {
      handlerRef.current(event);
    });

    return () => {
      unsubscribe();
    };
  }, [api, channel, enabled]);
}
