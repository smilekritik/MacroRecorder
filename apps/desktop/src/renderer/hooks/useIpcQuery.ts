import { useState, useEffect, useRef, useCallback } from 'react';
import {
  IpcErrorCode,
  type IpcChannelName,
  type IpcRequestFor,
  type IpcResponseFor,
  type AppError,
} from '../../../../../packages/contracts/src/index.js';
import { useApi, type MacroRecorderApi } from './useApi.js';

export interface UseIpcQueryOptions<C extends IpcChannelName> {
  readonly enabled?: boolean | undefined;
  readonly refetchInterval?: number | undefined;
  readonly apiOverride?: MacroRecorderApi | undefined;
  readonly onSuccess?: ((data: IpcResponseFor<C>) => void) | undefined;
  readonly onError?: ((error: AppError) => void) | undefined;
}

export interface UseIpcQueryResult<C extends IpcChannelName> {
  readonly data: IpcResponseFor<C> | undefined;
  readonly error: AppError | undefined;
  readonly isLoading: boolean;
  readonly isFetching: boolean;
  readonly refetch: () => Promise<IpcResponseFor<C> | undefined>;
}

/**
 * Strongly-typed IPC query hook.
 * Features:
 * - Automatic cancellation of in-flight requests on unmount via cancelIpc
 * - Guaranteed disposal of polling timers on unmount
 * - Safe error handling with typed AppError envelopes
 */
export function useIpcQuery<C extends IpcChannelName>(
  channel: C,
  request: Omit<IpcRequestFor<C>, 'requestId' | 'cancellationToken'>,
  options: UseIpcQueryOptions<C> = {},
): UseIpcQueryResult<C> {
  const defaultApi = useApi();
  const api = options.apiOverride ?? defaultApi;
  const { enabled = true, refetchInterval, onSuccess, onError } = options;

  const [data, setData] = useState<IpcResponseFor<C> | undefined>(undefined);
  const [error, setError] = useState<AppError | undefined>(undefined);
  const [isLoading, setIsLoading] = useState<boolean>(enabled);
  const [isFetching, setIsFetching] = useState<boolean>(false);

  const activeTokenRef = useRef<string | null>(null);
  const isMountedRef = useRef<boolean>(true);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const requestJson = JSON.stringify(request);

  const executeFetch = useCallback(async (): Promise<IpcResponseFor<C> | undefined> => {
    if (!isMountedRef.current) return undefined;

    const cancellationToken = `cancel-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const requestId = `req-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    activeTokenRef.current = cancellationToken;

    setIsFetching(true);

    const fullRequest = {
      ...(JSON.parse(requestJson) as object),
      requestId,
      cancellationToken,
    } as IpcRequestFor<C>;

    try {
      const result = await api.invoke(channel, fullRequest);

      if (!isMountedRef.current || activeTokenRef.current !== cancellationToken) {
        return undefined;
      }

      if (result.success) {
        setData(result.data);
        setError(undefined);
        onSuccess?.(result.data);
        return result.data;
      } else {
        setError(result.error);
        onError?.(result.error);
        return undefined;
      }
    } catch (err: unknown) {
      if (!isMountedRef.current || activeTokenRef.current !== cancellationToken) {
        return undefined;
      }

      const appError: AppError = {
        code: IpcErrorCode.INTERNAL,
        message: err instanceof Error ? err.message : String(err),
      };
      setError(appError);
      onError?.(appError);
      return undefined;
    } finally {
      if (isMountedRef.current && activeTokenRef.current === cancellationToken) {
        setIsLoading(false);
        setIsFetching(false);
        activeTokenRef.current = null;
      }
    }
  }, [api, channel, requestJson, onSuccess, onError]);

  // Execute on mount / when enabled or request changes
  useEffect(() => {
    isMountedRef.current = true;

    if (enabled) {
      void executeFetch();
    } else {
      setIsLoading(false);
    }

    return () => {
      // Cancel in-flight IPC request on unmount
      if (activeTokenRef.current) {
        void api.cancelIpc(activeTokenRef.current);
        activeTokenRef.current = null;
      }
    };
  }, [enabled, executeFetch, api]);

  // Setup refetch interval polling
  useEffect(() => {
    if (!enabled || !refetchInterval || refetchInterval <= 0) return;

    pollTimerRef.current = setInterval(() => {
      void executeFetch();
    }, refetchInterval);

    return () => {
      // Strictly dispose timer on unmount or options change
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
    };
  }, [enabled, refetchInterval, executeFetch]);

  // Unmount flag disposal
  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  return {
    data,
    error,
    isLoading,
    isFetching,
    refetch: executeFetch,
  };
}
