import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  MacroDefinition,
  MacroEvent,
  RecordingChoice,
  RecordingOptions,
} from '../../../../../../packages/contracts/src/index.js';
import { getMacroDurationMilliseconds } from '../../../../../../packages/domain/src/model/index.js';
import { useApiContext } from '../../state/ApiContext.js';
import type { MacroRecorderApi } from '../../hooks/useApi.js';
import type { RecordingController } from './types.js';

export interface UseRecordingControllerOptions {
  readonly apiOverride?: MacroRecorderApi | undefined;
  readonly onRecordingFinished?: (recordedEvents: readonly MacroEvent[], choice: RecordingChoice) => void;
  readonly onSessionEnded?: (() => void) | undefined;
}

/**
 * Hook coordinating full recording session lifecycle:
 * - Overwrite / Continue / Append choice resolution
 * - Pre-capture countdown timer with instant cancellation
 * - Window minimization on start and restoration on stop
 * - Real-time event counter and telemetry updates
 * - Gamepad driver checking and prompt handling
 */
export function useRecordingController(
  options: UseRecordingControllerOptions = {},
): RecordingController {
  const api = (options.apiOverride ?? useApiContext()) as any;

  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [isCountdown, setIsCountdown] = useState(false);
  const [countdownRemaining, setCountdownRemaining] = useState(0);
  const [elapsedMicroseconds, setElapsedMicroseconds] = useState(0);
  const [recordedCount, setRecordedCount] = useState(0);
  const [lastEventDisplay, setLastEventDisplay] = useState<string | null>(null);
  const [statusText, setStatusText] = useState('Idle');

  const [isChoiceDialogOpen, setIsChoiceDialogOpen] = useState(false);
  const [isGamepadDialogOpen, setIsGamepadDialogOpen] = useState(false);

  const [pendingMacro, setPendingMacro] = useState<MacroDefinition | null>(null);
  const [pendingChoice, setPendingChoice] = useState<RecordingChoice>('Overwrite');
  const [selectedActionTimeMs, setSelectedActionTimeMs] = useState<number | null>(null);

  const countdownTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const recordingStartTimestampRef = useRef<number>(0);
  const pausedAccumulatedMsRef = useRef<number>(0);
  const pauseStartTimestampRef = useRef<number>(0);

  const clearCountdownTimer = useCallback(() => {
    if (countdownTimerRef.current !== null) {
      clearInterval(countdownTimerRef.current);
      countdownTimerRef.current = null;
    }
  }, []);

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      clearCountdownTimer();
    };
  }, [clearCountdownTimer]);

  const executeStart = useCallback(
    async (macro: MacroDefinition, choice: RecordingChoice) => {
      const recordingOptions: Partial<RecordingOptions> = macro.recording ?? {};
      const countdownSec = Math.max(0, Math.min(60, recordingOptions.countdownSeconds ?? 0));

      setRecordedCount(0);
      setElapsedMicroseconds(0);
      setLastEventDisplay(null);
      pausedAccumulatedMsRef.current = 0;

      // Check countdown requirement
      if (countdownSec > 0) {
        setIsCountdown(true);
        setCountdownRemaining(countdownSec);
        setStatusText(`Recording starts in ${countdownSec}…`);

        if (api.overlays?.countdown) {
          void api.overlays.countdown(countdownSec);
        }

        let remaining = countdownSec;
        clearCountdownTimer();

        await new Promise<boolean>((resolve) => {
          countdownTimerRef.current = setInterval(() => {
            remaining -= 1;
            if (remaining <= 0) {
              clearCountdownTimer();
              setIsCountdown(false);
              if (api.overlays?.clear) {
                void api.overlays.clear();
              }
              resolve(true);
            } else {
              setCountdownRemaining(remaining);
              setStatusText(`Recording starts in ${remaining}…`);
              if (api.overlays?.countdown) {
                void api.overlays.countdown(remaining);
              }
            }
          }, 1000);
        });
      }

      // Start actual recording session
      const insertAt = choice === 'Continue' && selectedActionTimeMs !== null
        ? Math.round(selectedActionTimeMs * 1000)
        : undefined;
      const startResult = await api.recording.start(recordingOptions, 0, choice, macro.id, insertAt);
      if (!startResult.success) {
        setStatusText(`Error starting recording: ${startResult.error?.message ?? 'Unknown error'}`);
        return;
      }

      // Minimize main window on record start
      if (api.windows?.minimizeMain) {
        try {
          await api.windows.minimizeMain();
        } catch {
          // Non-critical if window cannot be minimized
        }
      }

      setIsRecording(true);
      setIsPaused(false);
      recordingStartTimestampRef.current = performance.now();
      setStatusText('● Recording…');

    },
    [api, clearCountdownTimer, selectedActionTimeMs],
  );

  const startRecording = useCallback(
    async (targetMacro: MacroDefinition, selectedTimeMs?: number | null) => {
      setPendingMacro(targetMacro);
      setSelectedActionTimeMs(selectedTimeMs ?? null);

      if (targetMacro.events && targetMacro.events.length > 0) {
        setIsChoiceDialogOpen(true);
      } else {
        await executeStart(targetMacro, 'Overwrite');
      }
    },
    [executeStart],
  );

  const handleChoiceSelected = useCallback(
    async (choice: RecordingChoice) => {
      setIsChoiceDialogOpen(false);
      setPendingChoice(choice);
      if (pendingMacro) {
        await executeStart(pendingMacro, choice);
      }
    },
    [executeStart, pendingMacro],
  );

  const handleChoiceCancelled = useCallback(() => {
    setIsChoiceDialogOpen(false);
    setPendingMacro(null);
  }, []);

  const cancelCountdown = useCallback(() => {
    clearCountdownTimer();
    setIsCountdown(false);
    setCountdownRemaining(0);
    setStatusText('Recording countdown canceled.');
    if (api.overlays?.clear) {
      void api.overlays.clear();
    }
  }, [api.overlays, clearCountdownTimer]);

  const pauseRecording = useCallback(async () => {
    pauseStartTimestampRef.current = performance.now();
    const result = await api.recording.pause();
    if (result.success) {
      setIsPaused(true);
      setStatusText('● Recording paused');
    }
  }, [api.recording]);

  const resumeRecording = useCallback(async () => {
    if (pauseStartTimestampRef.current > 0) {
      pausedAccumulatedMsRef.current += performance.now() - pauseStartTimestampRef.current;
      pauseStartTimestampRef.current = 0;
    }
    const result = await api.recording.resume();
    if (result.success) {
      setIsPaused(false);
      setStatusText('● Recording…');
    }
  }, [api.recording]);

  const stopRecording = useCallback(async (): Promise<readonly MacroEvent[] | null> => {
    clearCountdownTimer();

    const stopResult = await api.recording.stop();

    // Restore main window on stop
    if (api.windows?.restoreMain) {
      try {
        await api.windows.restoreMain();
      } catch {
        // Non-critical
      }
    }

    setIsRecording(false);
    setIsPaused(false);
    setIsCountdown(false);

    if (!stopResult.success) {
      setStatusText(`Error stopping recording: ${stopResult.error?.message ?? 'Unknown error'}`);
      return null;
    }

    const recordedEvents = stopResult.data.macro?.events ?? [];
    setStatusText(`Recorded events: ${recordedEvents.length}`);

    if (options.onRecordingFinished) {
      options.onRecordingFinished(recordedEvents, pendingChoice);
    }

    return recordedEvents;
  }, [api.recording, api.windows, clearCountdownTimer, options, pendingChoice]);

  // The session can end without this window asking: the stop bind, or the emergency stop.
  useEffect(() => {
    if (!api.recording?.onStateChanged) return;
    return api.recording.onStateChanged((state: string) => {
      if (state === 'Idle') {
        setIsRecording(false);
        setIsPaused(false);
        options.onSessionEnded?.();
      }
    });
  }, [api.recording]);

  // Subscribe to live recording input events from IPC
  useEffect(() => {
    if (!api.recording?.onEvent) return;

    const unsubscribe = api.recording.onEvent((event: MacroEvent) => {
      setRecordedCount((prev) => prev + 1);
      const display =
        (event as { display?: string }).display ??
        (event.type ? String(event.type) : 'Input');
      setLastEventDisplay(display);
    });

    return () => {
      unsubscribe();
    };
  }, [api.recording]);

  const handleInstallGamepadDriver = useCallback(async () => {
    setIsGamepadDialogOpen(false);
    if (api.gamepads?.installDriver) {
      const res = await api.gamepads.installDriver('ViGEmBus');
      if (res.success) {
        setStatusText('The driver installer has started. Restart the app after installation.');
      } else {
        setStatusText(res.error?.message ?? 'Could not start the installer.');
      }
    }
  }, [api.gamepads]);

  const handleDismissGamepadDriver = useCallback(() => {
    setIsGamepadDialogOpen(false);
    setStatusText('OK. You can install the gamepad driver in Settings.');
  }, []);

  const macroDurationMs = pendingMacro ? getMacroDurationMilliseconds(pendingMacro) : 0;
  const eventCount = pendingMacro?.events?.length ?? 0;

  return {
    isRecording,
    isPaused,
    isCountdown,
    countdownRemaining,
    elapsedMicroseconds,
    recordedCount,
    lastEventDisplay,
    statusText,
    isChoiceDialogOpen,
    isGamepadDialogOpen,
    choiceDialogProps: {
      eventCount,
      macroDurationMs,
      selectedActionTimeMs,
    },
    startRecording,
    handleChoiceSelected,
    handleChoiceCancelled,
    cancelCountdown,
    pauseRecording,
    resumeRecording,
    stopRecording,
    handleInstallGamepadDriver,
    handleDismissGamepadDriver,
  };
}
