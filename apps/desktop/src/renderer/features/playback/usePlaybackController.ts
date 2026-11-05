import { useCallback, useEffect, useRef, useState } from 'react';
import {
  EngineState,
  IpcChannels,
  TargetMode,
  type DispatchReceipt,
  type MacroDefinition,
  type MacroEvent,
  type OpenWindowInfo,
} from '../../../../../../packages/contracts/src/index.js';
import {
  isAutomaticTriggerMacro,
} from '../../../../../../packages/domain/src/model/index.js';
import { useApiContext } from '../../state/ApiContext.js';
import type { MacroRecorderApi } from '../../hooks/useApi.js';
import {
  enrichOpenWindows,
  formatPlaybackBanner,
  isChromiumOrUwpWindow,
  isElevationMismatch as checkElevationMismatch,
} from './target-window-utils.js';
import type { PlaybackController, TargetWindowItem } from './types.js';

export interface UsePlaybackControllerOptions {
  readonly apiOverride?: MacroRecorderApi | any | undefined;
  readonly initialMacro?: MacroDefinition | null | undefined;
  readonly isAppElevated?: boolean | undefined;
  readonly onPlaybackFinished?: ((macroId: string, durationMs: number) => void) | undefined;
  readonly onStateChanged?: ((state: EngineState) => void) | undefined;
}

/**
 * Controller hook managing playback execution lifecycle:
 * - Pre-run validation (events present, target window present, Chromium/UWP warnings, elevation check)
 * - Play, Pause, Resume, Stop, EmergencyStop orchestration
 * - Live telemetry, elapsed time, current action display, and diagnostic receipts
 * - Playback banner and status indicator maintenance
 * - Open windows discovery and compatibility enrichment
 * - Background monitoring synchronization for automatic triggers
 */
export function usePlaybackController(
  options: UsePlaybackControllerOptions = {},
): PlaybackController {
  const api = options.apiOverride ?? useApiContext();
  const isAppElevated = options.isAppElevated ?? false;

  const [engineState, setEngineState] = useState<EngineState>(EngineState.Idle);
  const [activeMacroId, setActiveMacroId] = useState<string | null>(null);
  const [activeMacroName, setActiveMacroName] = useState<string | null>(null);
  const [elapsedMicroseconds, setElapsedMicroseconds] = useState<number>(0);
  const [playbackBanner, setPlaybackBanner] = useState<string>('');
  const [currentEvent, setCurrentEvent] = useState<MacroEvent | null>(null);
  const [lastReceipt, setLastReceipt] = useState<DispatchReceipt | null>(null);
  const [openWindows, setOpenWindows] = useState<readonly TargetWindowItem[]>([]);
  const [statusText, setStatusText] = useState<string>('Ready');
  const [automaticTriggerStatus, setAutomaticTriggerStatus] = useState<
    'idle' | 'monitoring' | 'cooldown'
  >('idle');

  const startTimestampRef = useRef<number>(0);
  const pausedAccumulatedMsRef = useRef<number>(0);
  const pauseStartTimestampRef = useRef<number>(0);
  const currentMacroRef = useRef<MacroDefinition | null>(options.initialMacro ?? null);

  // Synchronize state changes to callback if provided
  useEffect(() => {
    if (options.onStateChanged) {
      options.onStateChanged(engineState);
    }
  }, [engineState, options]);

  // Window list discovery
  const refreshOpenWindows = useCallback(async () => {
    try {
      if (api.windows?.getOpen) {
        const res = await api.windows.getOpen();
        if (res?.windows) {
          setOpenWindows(enrichOpenWindows(res.windows));
          return;
        }
      }
      if (api.invoke) {
        const res = await api.invoke(IpcChannels.WINDOWS_GET_OPEN, {
          requestId: crypto.randomUUID(),
        });
        if (res.success && res.data?.windows) {
          setOpenWindows(enrichOpenWindows(res.data.windows as readonly OpenWindowInfo[]));
        }
      }
    } catch {
      // Ignore discovery errors in mock/test environments
    }
  }, [api]);

  // Initial load of open windows
  useEffect(() => {
    void refreshOpenWindows();
  }, [refreshOpenWindows]);

  // Targeted mode compatibility checks
  const targetMacro = currentMacroRef.current;
  const isSpecificWindow = targetMacro?.playback?.targetMode === TargetMode.SpecificWindow;

  const matchedWindow = isSpecificWindow
    ? openWindows.find(
        (w) =>
          w.processName.toLowerCase() ===
            (targetMacro.playback.targetProcessName ?? '').toLowerCase() &&
          (w.title === targetMacro.playback.targetWindowTitle ||
            w.title
              .toLowerCase()
              .includes((targetMacro.playback.targetWindowTitle ?? '').toLowerCase())),
      )
    : undefined;

  const isTargetIncompatible =
    isSpecificWindow && Boolean(targetMacro?.playback?.targetProcessName)
      ? isChromiumOrUwpWindow(
          targetMacro.playback.targetProcessName,
          targetMacro.playback.targetWindowTitle,
          matchedWindow?.className,
        )
      : false;

  const isElevationMismatch =
    isSpecificWindow &&
    checkElevationMismatch(isAppElevated, Boolean(matchedWindow?.isElevated));

  const isAutomaticTrigger = targetMacro ? isAutomaticTriggerMacro(targetMacro) : false;

  // Playback actions
  const play = useCallback(
    async (target?: MacroDefinition): Promise<boolean> => {
      const macro = target ?? currentMacroRef.current;
      if (!macro) {
        setStatusText('No macro selected.');
        return false;
      }

      currentMacroRef.current = macro;

      // Rule 1: Cannot play while recording or countdown
      if (engineState === EngineState.Recording || engineState === EngineState.Countdown) {
        setStatusText('Stop the recording or countdown first.');
        return false;
      }

      // Rule 2: Cannot play macro without events
      if (!macro.events || macro.events.length === 0) {
        setStatusText('This macro has no events.');
        return false;
      }

      // Rule 3: Directed mode validation
      if (macro.playback.targetMode === TargetMode.SpecificWindow) {
        if (!macro.playback.targetWindowTitle || !macro.playback.targetProcessName) {
          setStatusText('Select a target window on the Playback tab first.');
          return false;
        }

        // Validate window presence among open windows
        const windowFound = openWindows.some(
          (w) =>
            w.processName.toLowerCase() === macro.playback.targetProcessName.toLowerCase() &&
            (w.title === macro.playback.targetWindowTitle ||
              w.title.toLowerCase().includes(macro.playback.targetWindowTitle.toLowerCase())),
        );

        if (!windowFound && openWindows.length > 0) {
          setStatusText(
            'The selected window was not found. Refresh the list and select the target again.',
          );
          return false;
        }
      }

      try {
        const result = api.playback?.start
          ? await api.playback.start({ macro })
          : api.invoke
            ? await api.invoke(IpcChannels.PLAYBACK_START, {
                requestId: crypto.randomUUID(),
                macro,
              })
            : null;

        if (!result?.success) {
          setStatusText(`Playback error: ${result?.error?.message ?? 'Playback API is unavailable.'}`);
          return false;
        }
        if (!result.data.started) {
          setStatusText('Playback did not start.');
          return false;
        }

        setElapsedMicroseconds(0);
        setCurrentEvent(macro.events[0] ?? null);
        setLastReceipt(null);
        pausedAccumulatedMsRef.current = 0;
        pauseStartTimestampRef.current = 0;
        setEngineState(EngineState.Playing);
        setActiveMacroId(result.data.activeMacroId || macro.id);
        setActiveMacroName(macro.name);
        setPlaybackBanner(formatPlaybackBanner([{ name: macro.name, isPaused: false }]));
        setStatusText(`▶ ${macro.name} • active macros: 1`);

        if (isAutomaticTriggerMacro(macro)) {
          setAutomaticTriggerStatus('monitoring');
        }

        startTimestampRef.current = performance.now();
        return true;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        setStatusText(`Playback error: ${msg}`);
        return false;
      }
    },
    [api, engineState, openWindows],
  );

  const pause = useCallback(async () => {
    if (engineState !== EngineState.Playing) return;

    pauseStartTimestampRef.current = performance.now();
    setEngineState(EngineState.Paused);
    if (activeMacroName) {
      setPlaybackBanner(formatPlaybackBanner([{ name: activeMacroName, isPaused: true }]));
      setStatusText(`Paused: ${activeMacroName}`);
    }

    try {
      if (api.playback?.pause) {
        await api.playback.pause();
      } else if (api.invoke) {
        await api.invoke(IpcChannels.PLAYBACK_PAUSE, { requestId: crypto.randomUUID() });
      }
    } catch {
      // Non-critical
    }
  }, [activeMacroName, api, engineState]);

  const resume = useCallback(async () => {
    if (engineState !== EngineState.Paused) return;

    if (pauseStartTimestampRef.current > 0) {
      pausedAccumulatedMsRef.current += performance.now() - pauseStartTimestampRef.current;
      pauseStartTimestampRef.current = 0;
    }

    setEngineState(EngineState.Playing);
    if (activeMacroName) {
      setPlaybackBanner(formatPlaybackBanner([{ name: activeMacroName, isPaused: false }]));
      setStatusText(`▶ ${activeMacroName} • active macros: 1`);
    }

    try {
      if (api.playback?.resume) {
        await api.playback.resume();
      } else if (api.invoke) {
        await api.invoke(IpcChannels.PLAYBACK_RESUME, { requestId: crypto.randomUUID() });
      }
    } catch {
      // Non-critical
    }
  }, [activeMacroName, api, engineState]);

  const stop = useCallback(
    async (reason?: string) => {

      const endedMacroId = activeMacroId;
      const durationMs =
        startTimestampRef.current > 0
          ? Math.max(
              0,
              performance.now() - startTimestampRef.current - pausedAccumulatedMsRef.current,
            )
          : 0;

      setEngineState(EngineState.Idle);
      setActiveMacroId(null);
      setActiveMacroName(null);
      setPlaybackBanner('');
      setCurrentEvent(null);
      setStatusText(reason ?? 'Done');

      if (automaticTriggerStatus === 'monitoring') {
        setAutomaticTriggerStatus('cooldown');
        setTimeout(() => setAutomaticTriggerStatus('idle'), 500);
      }

      try {
        if (api.playback?.stop) {
          await api.playback.stop();
        } else if (api.invoke) {
          await api.invoke(IpcChannels.PLAYBACK_STOP, { requestId: crypto.randomUUID() });
        }
      } catch {
        // Non-critical
      }

      if (endedMacroId && options.onPlaybackFinished) {
        options.onPlaybackFinished(endedMacroId, durationMs);
      }
    },
    [activeMacroId, api, automaticTriggerStatus, options],
  );

  const emergencyStop = useCallback(
    async (reason?: string) => {

      setEngineState(EngineState.Idle);
      setActiveMacroId(null);
      setActiveMacroName(null);
      setPlaybackBanner('');
      setCurrentEvent(null);
      setStatusText(reason ?? 'Emergency stop triggered');
      setAutomaticTriggerStatus('idle');

      try {
        if (api.emergencyStop) {
          await api.emergencyStop();
        } else if (api.invoke) {
          await api.invoke(IpcChannels.EMERGENCY_STOP, { requestId: crypto.randomUUID() });
        }
      } catch {
        // Non-critical
      }
    },
    [api],
  );

  // Synchronize renderer telemetry through the canonical playback status channel.
  useEffect(() => {
    if (!api.playback?.onStatusChanged) return;

    return api.playback.onStatusChanged(
      (status: {
        state: EngineState;
        currentMacroId?: string;
        macroName?: string;
        elapsedMicroseconds: number;
        currentActionIndex?: number;
      }) => {
        setEngineState(status.state);
        setElapsedMicroseconds(status.elapsedMicroseconds);
        setActiveMacroId(status.currentMacroId ?? null);

        if (status.macroName !== undefined) {
          setActiveMacroName(status.macroName);
        }
        if (status.currentActionIndex !== undefined) {
          setCurrentEvent(currentMacroRef.current?.events[status.currentActionIndex] ?? null);
        }
        if (status.state === EngineState.Idle) {
          setActiveMacroName(null);
          setPlaybackBanner('');
          setCurrentEvent(null);
          setStatusText('Done');
        }
      },
    );
  }, [api]);

  return {
    engineState,
    activeMacroId,
    elapsedMicroseconds,
    playbackBanner,
    currentEvent,
    lastReceipt,
    openWindows,
    isTargetIncompatible,
    isElevationMismatch,
    isAutomaticTrigger,
    automaticTriggerStatus,
    statusText,
    refreshOpenWindows,
    play,
    pause,
    resume,
    stop,
    emergencyStop,
  };
}
