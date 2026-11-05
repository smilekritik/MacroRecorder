import { useCallback } from 'react';
import {
  IpcChannels,
  type MacroDefinition,
} from '../../../../../packages/contracts/src/index.js';
import { useIpcQuery } from './useIpcQuery.js';
import { useIpcMutation } from './useIpcMutation.js';
import type { MacroRecorderApi } from './useApi.js';

export interface UsePlaybackOptions {
  readonly apiOverride?: MacroRecorderApi | undefined;
  readonly pollInterval?: number | undefined;
}

export function usePlayback(options: UsePlaybackOptions = {}) {
  const statusQuery = useIpcQuery(
    IpcChannels.PLAYBACK_GET_STATUS,
    {},
    {
      apiOverride: options.apiOverride,
      refetchInterval: options.pollInterval ?? 200,
    },
  );

  const startMutation = useIpcMutation(IpcChannels.PLAYBACK_START, {
    apiOverride: options.apiOverride,
    onSuccess: () => {
      void statusQuery.refetch();
    },
  });

  const pauseMutation = useIpcMutation(IpcChannels.PLAYBACK_PAUSE, {
    apiOverride: options.apiOverride,
    onSuccess: () => {
      void statusQuery.refetch();
    },
  });

  const resumeMutation = useIpcMutation(IpcChannels.PLAYBACK_RESUME, {
    apiOverride: options.apiOverride,
    onSuccess: () => {
      void statusQuery.refetch();
    },
  });

  const stopMutation = useIpcMutation(IpcChannels.PLAYBACK_STOP, {
    apiOverride: options.apiOverride,
    onSuccess: () => {
      void statusQuery.refetch();
    },
  });

  const emergencyStopMutation = useIpcMutation(IpcChannels.EMERGENCY_STOP, {
    apiOverride: options.apiOverride,
    onSuccess: () => {
      void statusQuery.refetch();
    },
  });

  const start = useCallback(
    async (params: {
      macroId?: string | undefined;
      macro?: MacroDefinition | undefined;
      speed?: number | undefined;
      targetWindowHandle?: number | undefined;
    }) => {
      return await startMutation.mutateAsync(params);
    },
    [startMutation],
  );

  const pause = useCallback(async () => {
    return await pauseMutation.mutateAsync({});
  }, [pauseMutation]);

  const resume = useCallback(async () => {
    return await resumeMutation.mutateAsync({});
  }, [resumeMutation]);

  const stop = useCallback(
    async (reason?: string) => {
      return await stopMutation.mutateAsync({ reason });
    },
    [stopMutation],
  );

  const emergencyStop = useCallback(
    async (reason?: string) => {
      return await emergencyStopMutation.mutateAsync({ reason });
    },
    [emergencyStopMutation],
  );

  return {
    state: statusQuery.data?.state ?? 'Idle',
    activeMacroId: statusQuery.data?.currentMacroId,
    elapsedMicroseconds: statusQuery.data?.elapsedMicroseconds ?? 0,
    isLoading: statusQuery.isLoading,
    error:
      statusQuery.error ||
      startMutation.error ||
      pauseMutation.error ||
      resumeMutation.error ||
      stopMutation.error ||
      emergencyStopMutation.error,
    start,
    pause,
    resume,
    stop,
    emergencyStop,
    refetchStatus: statusQuery.refetch,
  };
}
