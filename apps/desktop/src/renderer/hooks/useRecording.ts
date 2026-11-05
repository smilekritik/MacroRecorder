import { useCallback, useState } from 'react';
import {
  IpcChannels,
  type RecordingOptions,
  type RecordingChoice,
} from '../../../../../packages/contracts/src/index.js';
import { useIpcMutation } from './useIpcMutation.js';
import type { MacroRecorderApi } from './useApi.js';

export interface UseRecordingOptions {
  readonly apiOverride?: MacroRecorderApi | undefined;
}

export function useRecording(options: UseRecordingOptions = {}) {
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);

  const startMutation = useIpcMutation(IpcChannels.RECORDING_START, {
    apiOverride: options.apiOverride,
    onSuccess: (data) => {
      setIsRecording(data.isRecording);
      setIsPaused(false);
    },
  });

  const pauseMutation = useIpcMutation(IpcChannels.RECORDING_PAUSE, {
    apiOverride: options.apiOverride,
    onSuccess: (data) => {
      setIsPaused(data.isPaused);
    },
  });

  const resumeMutation = useIpcMutation(IpcChannels.RECORDING_RESUME, {
    apiOverride: options.apiOverride,
    onSuccess: (data) => {
      setIsPaused(!data.isRecording);
    },
  });

  const stopMutation = useIpcMutation(IpcChannels.RECORDING_STOP, {
    apiOverride: options.apiOverride,
    onSuccess: () => {
      setIsRecording(false);
      setIsPaused(false);
    },
  });

  const start = useCallback(
    async (params?: {
      options?: Partial<RecordingOptions> | undefined;
      countdownSeconds?: number | undefined;
      choice?: RecordingChoice | undefined;
    }) => {
      return await startMutation.mutateAsync(params ?? {});
    },
    [startMutation],
  );

  const pause = useCallback(async () => {
    return await pauseMutation.mutateAsync({});
  }, [pauseMutation]);

  const resume = useCallback(async () => {
    return await resumeMutation.mutateAsync({});
  }, [resumeMutation]);

  const stop = useCallback(async () => {
    return await stopMutation.mutateAsync({});
  }, [stopMutation]);

  return {
    isRecording,
    isPaused,
    isLoading:
      startMutation.isLoading ||
      pauseMutation.isLoading ||
      resumeMutation.isLoading ||
      stopMutation.isLoading,
    error:
      startMutation.error ||
      pauseMutation.error ||
      resumeMutation.error ||
      stopMutation.error,
    start,
    pause,
    resume,
    stop,
  };
}
