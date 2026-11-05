import { useState, useRef, useCallback, useEffect } from 'react';
import {
  IpcErrorCode,
  type IpcChannelName,
  type IpcRequestFor,
  type IpcResponseFor,
  type AppError,
} from '../../../../../packages/contracts/src/index.js';
import { useApi, type MacroRecorderApi } from './useApi.js';

export interface UseIpcMutationOptions<C extends IpcChannelName> {
  readonly apiOverride?: MacroRecorderApi | undefined;
  readonly onSuccess?: ((data: IpcResponseFor<C>) => void) | undefined;
  readonly onError?: ((error: AppError) => void) | undefined;
}

export interface UseIpcMutationResult<C extends IpcChannelName> {
  readonly mutate: (
    request: Omit<IpcRequestFor<C>, 'requestId' | 'cancellationToken'>,
  ) => void;
  readonly mutateAsync: (
    request: Omit<IpcRequestFor<C>, 'requestId' | 'cancellationToken'>,
  ) => Promise<IpcResponseFor<C>>;
  readonly data: IpcResponseFor<C> | undefined;
  readonly error: AppError | undefined;
  readonly isLoading: boolean;
  readonly reset: () => void;
}

/**
 * Strongly-typed IPC mutation hook.
 * Safely invokes main process commands and maintains loading/error/data boundaries.
 */
export function useIpcMutation<C extends IpcChannelName>(
  channel: C,
  options: UseIpcMutationOptions<C> = {},
): UseIpcMutationResult<C> {
  const defaultApi = useApi();
  const api = options.apiOverride ?? defaultApi;
  const { onSuccess, onError } = options;

  const [data, setData] = useState<IpcResponseFor<C> | undefined>(undefined);
  const [error, setError] = useState<AppError | undefined>(undefined);
  const [isLoading, setIsLoading] = useState<boolean>(false);

  const isMountedRef = useRef<boolean>(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const mutateAsync = useCallback(
    async (
      rawRequest: Omit<IpcRequestFor<C>, 'requestId' | 'cancellationToken'>,
    ): Promise<IpcResponseFor<C>> => {
      const requestId = `mut-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
      const fullRequest = {
        ...(rawRequest as object),
        requestId,
      } as IpcRequestFor<C>;

      setIsLoading(true);
      setError(undefined);

      try {
        const result = await api.invoke(channel, fullRequest);

        if (result.success) {
          if (isMountedRef.current) {
            setData(result.data);
            setIsLoading(false);
          }
          onSuccess?.(result.data);
          return result.data;
        } else {
          if (isMountedRef.current) {
            setError(result.error);
            setIsLoading(false);
          }
          onError?.(result.error);
          throw new Error(result.error.message);
        }
      } catch (err: unknown) {
        const appError: AppError = {
          code: IpcErrorCode.INTERNAL,
          message: err instanceof Error ? err.message : String(err),
        };

        if (isMountedRef.current) {
          setError(appError);
          setIsLoading(false);
        }
        onError?.(appError);
        throw err;
      }
    },
    [api, channel, onSuccess, onError],
  );

  const mutate = useCallback(
    (rawRequest: Omit<IpcRequestFor<C>, 'requestId' | 'cancellationToken'>) => {
      void mutateAsync(rawRequest).catch(() => {
        // Handled in mutateAsync state & onError
      });
    },
    [mutateAsync],
  );

  const reset = useCallback(() => {
    setData(undefined);
    setError(undefined);
    setIsLoading(false);
  }, []);

  return {
    mutate,
    mutateAsync,
    data,
    error,
    isLoading,
    reset,
  };
}
