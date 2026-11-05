/**
 * Factory creating narrow capability-based preload modules.
 * Strictly adheres to: no generic invoke, no shell/fs access.
 */

import {
  IpcChannels,
  IpcEventChannels,
  type IpcChannelName,
  type IpcEventChannel,
} from './channels.js';
import { validatePreloadFilePath, validatePreloadRelativePath } from './path-guard.js';
import {
  IpcErrorCode,
  type AppPreferences,
  type CancellationCapability,
  type DiagnosticsCapability,
  type EngineState,
  type ExportsCapability,
  type GamepadPadReading,
  type GamepadsCapability,
  type HotkeyTriggeredEvent,
  type HotkeysCapability,
  type ImportsCapability,
  type IpcEventPayloadFor,
  type IpcRequestFor,
  type IpcResponseFor,
  type IpcResult,
  type LibraryBackupMode,
  type LibraryCapability,
  type MacroDefinition,
  type MacroEvent,
  type MacroExportFormat,
  type MacroRecorderCapabilities,
  type OverlaysCapability,
  type PlaybackCapability,
  type PlaybackStatusChangedEvent,
  type RecordingCapability,
  type RecordingChoice,
  type RecordingOptions,
  type SettingsCapability,
  type Unsubscribe,
  type WindowStateChangedEvent,
  type WindowsCapability,
} from './types.js';

type InvokeFn = <C extends IpcChannelName>(
  channel: C,
  request: IpcRequestFor<C>,
) => Promise<IpcResult<IpcResponseFor<C>>>;

type OnFn = <C extends IpcEventChannel>(
  channel: C,
  callback: (event: IpcEventPayloadFor<C>) => void,
) => Unsubscribe;

let requestCounter = 0;
function nextRequestId(prefix: string): string {
  requestCounter = (requestCounter + 1) % 1_000_000;
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${requestCounter}`;
}

function createErrorResult<T>(code: IpcErrorCode, message: string, requestId: string): IpcResult<T> {
  return {
    success: false,
    error: {
      code,
      message,
    },
    requestId,
  };
}

// ============================================================================
// Capability Implementations
// ============================================================================

export function createLibraryCapability(invoke: InvokeFn): LibraryCapability {
  return {
    async loadLibrary() {
      const requestId = nextRequestId('lib-load');
      return invoke(IpcChannels.STORAGE_LOAD_LIBRARY, { requestId });
    },

    async saveMacro(macro: MacroDefinition, touchModified?: boolean) {
      const requestId = nextRequestId('lib-save');
      if (!macro || typeof macro !== 'object' || !macro.id || !macro.name) {
        return createErrorResult(IpcErrorCode.INVALID_ARGUMENT, 'Invalid macro definition provided', requestId);
      }
      return invoke(IpcChannels.STORAGE_SAVE_MACRO, {
        requestId,
        macro,
        ...(touchModified !== undefined ? { touchModified } : {}),
      });
    },

    async deleteMacro(macroId: string) {
      const requestId = nextRequestId('lib-del');
      if (!macroId || typeof macroId !== 'string') {
        return createErrorResult(IpcErrorCode.INVALID_ARGUMENT, 'Macro ID is required', requestId);
      }
      return invoke(IpcChannels.STORAGE_DELETE_MACRO, { requestId, macroId });
    },

    async restoreMacro(token: string, folderRelativePath: string, macroName: string) {
      const requestId = nextRequestId('lib-restore');
      const pathCheck = validatePreloadRelativePath(folderRelativePath);
      if (!pathCheck.ok) {
        return createErrorResult(IpcErrorCode.INVALID_ARGUMENT, pathCheck.error!, requestId);
      }
      return invoke(IpcChannels.STORAGE_RESTORE_MACRO, {
        requestId,
        token,
        folderRelativePath: pathCheck.sanitizedPath ?? '',
        macroName,
      });
    },

    async moveMacro(macroId: string, folderRelativePath: string) {
      const requestId = nextRequestId('lib-move');
      const pathCheck = validatePreloadRelativePath(folderRelativePath);
      if (!pathCheck.ok) {
        return createErrorResult(IpcErrorCode.INVALID_ARGUMENT, pathCheck.error!, requestId);
      }
      return invoke(IpcChannels.STORAGE_MOVE_MACRO, {
        requestId,
        macroId,
        folderRelativePath: pathCheck.sanitizedPath ?? '',
      });
    },

    async createFolder(folderRelativePath: string) {
      const requestId = nextRequestId('lib-mkdir');
      const pathCheck = validatePreloadRelativePath(folderRelativePath);
      if (!pathCheck.ok || !pathCheck.sanitizedPath) {
        return createErrorResult(
          IpcErrorCode.INVALID_ARGUMENT,
          pathCheck.error ?? 'Folder path cannot be empty',
          requestId,
        );
      }
      return invoke(IpcChannels.STORAGE_CREATE_FOLDER, {
        requestId,
        folderRelativePath: pathCheck.sanitizedPath,
      });
    },

    async deleteFolder(folderRelativePath: string) {
      const requestId = nextRequestId('lib-rmdir');
      const pathCheck = validatePreloadRelativePath(folderRelativePath);
      if (!pathCheck.ok || !pathCheck.sanitizedPath) {
        return createErrorResult(
          IpcErrorCode.INVALID_ARGUMENT,
          pathCheck.error ?? 'Folder path cannot be empty',
          requestId,
        );
      }
      return invoke(IpcChannels.STORAGE_DELETE_FOLDER, {
        requestId,
        folderRelativePath: pathCheck.sanitizedPath,
      });
    },

    async restoreFolder(token: string, folderRelativePath: string) {
      const requestId = nextRequestId('lib-resdir');
      const pathCheck = validatePreloadRelativePath(folderRelativePath);
      if (!pathCheck.ok) {
        return createErrorResult(IpcErrorCode.INVALID_ARGUMENT, pathCheck.error!, requestId);
      }
      return invoke(IpcChannels.STORAGE_RESTORE_FOLDER, {
        requestId,
        token,
        folderRelativePath: pathCheck.sanitizedPath ?? '',
      });
    },

    async moveFolder(sourceRelativePath: string, targetRelativePath: string) {
      const requestId = nextRequestId('lib-mvdir');
      const srcCheck = validatePreloadRelativePath(sourceRelativePath);
      if (!srcCheck.ok || !srcCheck.sanitizedPath) {
        return createErrorResult(IpcErrorCode.INVALID_ARGUMENT, srcCheck.error ?? 'Source path required', requestId);
      }
      const dstCheck = validatePreloadRelativePath(targetRelativePath);
      if (!dstCheck.ok) {
        return createErrorResult(IpcErrorCode.INVALID_ARGUMENT, dstCheck.error!, requestId);
      }
      return invoke(IpcChannels.STORAGE_MOVE_FOLDER, {
        requestId,
        sourceRelativePath: srcCheck.sanitizedPath,
        targetRelativePath: dstCheck.sanitizedPath ?? '',
      });
    },

    async loadRunHistory() {
      const requestId = nextRequestId('hist-load');
      return invoke(IpcChannels.STORAGE_LOAD_RUN_HISTORY, { requestId });
    },

    async clearRunHistory() {
      const requestId = nextRequestId('hist-clear');
      return invoke(IpcChannels.STORAGE_CLEAR_RUN_HISTORY, { requestId });
    },
  };
}

export function createRecordingCapability(invoke: InvokeFn, on: OnFn): RecordingCapability {
  return {
    async start(options?: Partial<RecordingOptions>, countdownSeconds?: number, choice?: RecordingChoice, macroId?: string, insertAtMicroseconds?: number) {
      const requestId = nextRequestId('rec-start');
      return invoke(IpcChannels.RECORDING_START, {
        requestId,
        ...(options !== undefined ? { options } : {}),
        ...(countdownSeconds !== undefined ? { countdownSeconds } : {}),
        ...(choice !== undefined ? { choice } : {}),
        ...(macroId !== undefined ? { macroId } : {}),
        ...(insertAtMicroseconds !== undefined ? { insertAtMicroseconds } : {}),
      });
    },

    async pause() {
      const requestId = nextRequestId('rec-pause');
      return invoke(IpcChannels.RECORDING_PAUSE, { requestId });
    },

    async resume() {
      const requestId = nextRequestId('rec-resume');
      return invoke(IpcChannels.RECORDING_RESUME, { requestId });
    },

    async stop() {
      const requestId = nextRequestId('rec-stop');
      return invoke(IpcChannels.RECORDING_STOP, { requestId });
    },

    onEvent(callback: (event: MacroEvent) => void): Unsubscribe {
      return on(IpcEventChannels.RECORDING_EVENT, callback);
    },

    onStateChanged(callback: (state: EngineState) => void): Unsubscribe {
      return on(IpcEventChannels.RECORDING_STATE_CHANGED, callback);
    },
  };
}

export function createPlaybackCapability(invoke: InvokeFn, on: OnFn): PlaybackCapability {
  return {
    async start(params?: {
      macroId?: string;
      macro?: MacroDefinition;
      speed?: number;
      targetWindowHandle?: number;
    }) {
      const requestId = nextRequestId('play-start');
      return invoke(IpcChannels.PLAYBACK_START, {
        requestId,
        ...(params?.macroId !== undefined ? { macroId: params.macroId } : {}),
        ...(params?.macro !== undefined ? { macro: params.macro } : {}),
        ...(params?.speed !== undefined ? { speed: params.speed } : {}),
        ...(params?.targetWindowHandle !== undefined ? { targetWindowHandle: params.targetWindowHandle } : {}),
      });
    },

    async pause() {
      const requestId = nextRequestId('play-pause');
      return invoke(IpcChannels.PLAYBACK_PAUSE, { requestId });
    },

    async resume() {
      const requestId = nextRequestId('play-resume');
      return invoke(IpcChannels.PLAYBACK_RESUME, { requestId });
    },

    async stop(reason?: string) {
      const requestId = nextRequestId('play-stop');
      return invoke(IpcChannels.PLAYBACK_STOP, {
        requestId,
        ...(reason !== undefined ? { reason } : {}),
      });
    },

    async getStatus() {
      const requestId = nextRequestId('play-status');
      return invoke(IpcChannels.PLAYBACK_GET_STATUS, { requestId });
    },

    async emergencyStop(reason?: string) {
      const requestId = nextRequestId('emerg-stop');
      return invoke(IpcChannels.EMERGENCY_STOP, {
        requestId,
        ...(reason !== undefined ? { reason } : {}),
      });
    },

    onStatusChanged(callback: (status: PlaybackStatusChangedEvent) => void): Unsubscribe {
      return on(IpcEventChannels.PLAYBACK_STATUS_CHANGED, callback);
    },
  };
}

export function createHotkeysCapability(on: OnFn): HotkeysCapability {
  return {
    onTriggered(callback: (info: HotkeyTriggeredEvent) => void): Unsubscribe {
      return on(IpcEventChannels.HOTKEY_TRIGGERED, callback);
    },
  };
}

export function createWindowsCapability(invoke: InvokeFn, on: OnFn): WindowsCapability {
  return {
    async getOpen(excludedProcessId?: number) {
      const requestId = nextRequestId('win-getopen');
      return invoke(IpcChannels.WINDOWS_GET_OPEN, {
        requestId,
        ...(excludedProcessId !== undefined ? { excludedProcessId } : {}),
      });
    },

    async inspect(followMouse: boolean, selfHandle?: number, ownerHandle?: number) {
      const requestId = nextRequestId('win-inspect');
      return invoke(IpcChannels.WINDOWS_INSPECT, {
        requestId,
        followMouse,
        ...(selfHandle !== undefined ? { selfHandle } : {}),
        ...(ownerHandle !== undefined ? { ownerHandle } : {}),
      });
    },

    async activate(processName: string, windowTitle: string) {
      const requestId = nextRequestId('win-activate');
      return invoke(IpcChannels.WINDOWS_ACTIVATE, {
        requestId,
        processName,
        windowTitle,
      });
    },

    async open(windowId: string, params?: Readonly<Record<string, unknown>>) {
      const requestId = nextRequestId('win-open');
      return invoke(IpcChannels.WINDOWS_OPEN, {
        requestId,
        windowId,
        ...(params !== undefined ? { params } : {}),
      });
    },

    async close(windowId: string) {
      const requestId = nextRequestId('win-close');
      return invoke(IpcChannels.WINDOWS_CLOSE, {
        requestId,
        windowId,
      });
    },

    async minimizeMain() {
      const requestId = nextRequestId('win-min');
      return invoke(IpcChannels.WINDOWS_MINIMIZE_MAIN, { requestId });
    },

    async restoreMain() {
      const requestId = nextRequestId('win-rest');
      return invoke(IpcChannels.WINDOWS_RESTORE_MAIN, { requestId });
    },

    onWindowStateChanged(callback: (info: WindowStateChangedEvent) => void): Unsubscribe {
      return on(IpcEventChannels.WINDOW_STATE_CHANGED, callback);
    },
  };
}

export function createPixelsCapability(invoke: InvokeFn): {
  capture(x: number, y: number): Promise<IpcResult<{ rgb: number; hex: string; r: number; g: number; b: number }>>;
} {
  return {
    async capture(x: number, y: number) {
      const requestId = nextRequestId('pix-cap');
      return invoke(IpcChannels.PIXEL_CAPTURE, { requestId, x, y });
    },
  };
}

export function createGamepadsCapability(invoke: InvokeFn, on: OnFn): GamepadsCapability {
  return {
    async getReadings() {
      const requestId = nextRequestId('pad-read');
      return invoke(IpcChannels.GAMEPAD_GET_READINGS, { requestId });
    },

    async installDriver(driver: 'ViGEmBus' | 'HidHide') {
      const requestId = nextRequestId('pad-inst');
      return invoke(IpcChannels.GAMEPAD_INSTALL_DRIVER, { requestId, driver });
    },

    async setHiding(hide: boolean) {
      const requestId = nextRequestId('pad-hide');
      return invoke(IpcChannels.GAMEPAD_SET_HIDING, { requestId, hide });
    },

    onStateChanged(callback: (readings: readonly GamepadPadReading[]) => void): Unsubscribe {
      return on(IpcEventChannels.GAMEPAD_STATE_CHANGED, callback);
    },
  };
}

export function createOverlaysCapability(invoke: InvokeFn): OverlaysCapability {
  return {
    async update(params: {
      macroId: string;
      state: EngineState;
      macroName: string;
      playbackSpeed?: number;
      [key: string]: unknown;
    }) {
      const requestId = nextRequestId('ovl-upd');
      return invoke(IpcChannels.OVERLAY_UPDATE, {
        requestId,
        ...params,
      });
    },

    async countdown(seconds: number) {
      const requestId = nextRequestId('ovl-count');
      return invoke(IpcChannels.OVERLAY_COUNTDOWN, { requestId, seconds });
    },

    async clear() {
      const requestId = nextRequestId('ovl-clear');
      return invoke(IpcChannels.OVERLAY_CLEAR, { requestId });
    },

    async setPlacement(infoX: number, infoY: number, annotationX: number, annotationY: number) {
      const requestId = nextRequestId('ovl-pos');
      return invoke(IpcChannels.OVERLAY_SET_PLACEMENT, {
        requestId,
        infoX,
        infoY,
        annotationX,
        annotationY,
      });
    },
  };
}

export function createSettingsCapability(invoke: InvokeFn): SettingsCapability {
  return {
    async load() {
      const requestId = nextRequestId('set-load');
      return invoke(IpcChannels.PREFERENCES_LOAD, { requestId });
    },

    async save(preferences: Partial<AppPreferences>) {
      const requestId = nextRequestId('set-save');
      return invoke(IpcChannels.PREFERENCES_SAVE, { requestId, preferences });
    },

    async reset() {
      const requestId = nextRequestId('set-reset');
      return invoke(IpcChannels.PREFERENCES_RESET, { requestId });
    },
  };
}

export function createImportsCapability(invoke: InvokeFn): ImportsCapability {
  return {
    async importMacro(sourcePath: string, targetFolderRelativePath?: string) {
      const requestId = nextRequestId('imp-macro');
      const fileCheck = validatePreloadFilePath(sourcePath, [
        '.mrmacro', '.json', '.ahk', '.amc', '.mrf', '.au3', '.xml', '.rec',
      ]);
      if (!fileCheck.ok) {
        return createErrorResult(IpcErrorCode.INVALID_ARGUMENT, fileCheck.error!, requestId);
      }
      if (targetFolderRelativePath !== undefined) {
        const folderCheck = validatePreloadRelativePath(targetFolderRelativePath);
        if (!folderCheck.ok) {
          return createErrorResult(IpcErrorCode.INVALID_ARGUMENT, folderCheck.error!, requestId);
        }
      }
      return invoke(IpcChannels.STORAGE_IMPORT_MACRO, {
        requestId,
        sourcePath: fileCheck.sanitizedPath ?? sourcePath,
        ...(targetFolderRelativePath !== undefined ? { targetFolderRelativePath } : {}),
      });
    },

    async restoreBackup(sourcePath: string, mode: LibraryBackupMode) {
      const requestId = nextRequestId('imp-backup');
      const fileCheck = validatePreloadFilePath(sourcePath, ['.mrbackup']);
      if (!fileCheck.ok) {
        return createErrorResult(IpcErrorCode.INVALID_ARGUMENT, fileCheck.error!, requestId);
      }
      return invoke(IpcChannels.STORAGE_RESTORE_BACKUP, {
        requestId,
        sourcePath: fileCheck.sanitizedPath ?? sourcePath,
        mode,
      });
    },
  };
}

export function createExportsCapability(invoke: InvokeFn): ExportsCapability {
  return {
    async exportMacro(macroId: string, format: MacroExportFormat, destinationPath: string) {
      const requestId = nextRequestId('exp-macro');
      const fileCheck = validatePreloadFilePath(destinationPath);
      if (!fileCheck.ok) {
        return createErrorResult(IpcErrorCode.INVALID_ARGUMENT, fileCheck.error!, requestId);
      }
      return invoke(IpcChannels.STORAGE_EXPORT_MACRO, {
        requestId,
        macroId,
        format,
        destinationPath: fileCheck.sanitizedPath ?? destinationPath,
      });
    },

    async exportBackup(destinationPath: string, includesSettings: boolean) {
      const requestId = nextRequestId('exp-backup');
      const fileCheck = validatePreloadFilePath(destinationPath, ['.mrbackup']);
      if (!fileCheck.ok) {
        return createErrorResult(IpcErrorCode.INVALID_ARGUMENT, fileCheck.error!, requestId);
      }
      return invoke(IpcChannels.STORAGE_EXPORT_BACKUP, {
        requestId,
        destinationPath: fileCheck.sanitizedPath ?? destinationPath,
        includesSettings,
      });
    },

    async exportDiagnostics(format: MacroExportFormat, destinationPath: string) {
      const requestId = nextRequestId('exp-diag');
      const fileCheck = validatePreloadFilePath(destinationPath);
      if (!fileCheck.ok) {
        return createErrorResult(IpcErrorCode.INVALID_ARGUMENT, fileCheck.error!, requestId);
      }
      return invoke(IpcChannels.STORAGE_EXPORT_DIAGNOSTICS, {
        requestId,
        format,
        destinationPath: fileCheck.sanitizedPath ?? destinationPath,
      });
    },
  };
}

export function createDiagnosticsCapability(invoke: InvokeFn): DiagnosticsCapability {
  return {
    async exportDiagnostics(format: MacroExportFormat, destinationPath: string) {
      const requestId = nextRequestId('diag-exp');
      const fileCheck = validatePreloadFilePath(destinationPath);
      if (!fileCheck.ok) {
        return createErrorResult(IpcErrorCode.INVALID_ARGUMENT, fileCheck.error!, requestId);
      }
      return invoke(IpcChannels.STORAGE_EXPORT_DIAGNOSTICS, {
        requestId,
        format,
        destinationPath: fileCheck.sanitizedPath ?? destinationPath,
      });
    },

    async loadRunHistory() {
      const requestId = nextRequestId('diag-load');
      return invoke(IpcChannels.STORAGE_LOAD_RUN_HISTORY, { requestId });
    },

    async clearRunHistory() {
      const requestId = nextRequestId('diag-clear');
      return invoke(IpcChannels.STORAGE_CLEAR_RUN_HISTORY, { requestId });
    },
  };
}

export function createCancellationCapability(invoke: InvokeFn): CancellationCapability {
  return {
    async cancel(targetRequestId: string, reason?: string) {
      const requestId = nextRequestId('cancel');
      return invoke(IpcChannels.IPC_CANCEL, {
        requestId,
        targetRequestId,
        ...(reason !== undefined ? { reason } : {}),
      });
    },

    async cancelIpc(cancellationToken: string) {
      const requestId = nextRequestId('cancel-tok');
      await invoke(IpcChannels.IPC_CANCEL, {
        requestId,
        targetRequestId: cancellationToken,
        reason: 'Client-requested cancellation',
      });
    },
  };
}

/**
 * Builds the complete set of capabilities given low-level transport functions.
 */
export function buildAllCapabilities(invoke: InvokeFn, on: OnFn): MacroRecorderCapabilities {
  return {
    library: createLibraryCapability(invoke),
    recording: createRecordingCapability(invoke, on),
    playback: createPlaybackCapability(invoke, on),
    hotkeys: createHotkeysCapability(on),
    windows: createWindowsCapability(invoke, on),
    pixels: createPixelsCapability(invoke),
    gamepads: createGamepadsCapability(invoke, on),
    overlays: createOverlaysCapability(invoke),
    settings: createSettingsCapability(invoke),
    imports: createImportsCapability(invoke),
    exports: createExportsCapability(invoke),
    diagnostics: createDiagnosticsCapability(invoke),
    cancellation: createCancellationCapability(invoke),
  };
}
