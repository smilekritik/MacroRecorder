/**
 * Strongly-typed named IPC responses and unified response envelopes.
 */

import { type AppError } from '../common/errors.js';
import { type MacroDefinition } from '../domain/macro.js';
import { type EngineState } from '../domain/enums.js';
import { type MacroImportResult } from '../domain/import-export.js';
import { type LibraryBackupResult } from '../domain/packages.js';
import { type RunHistoryEntry } from '../domain/diagnostics.js';
import { type AppPreferences } from '../preferences/preferences.js';
import { type OpenWindowInfo, type WindowInspectionSnapshot } from '../descriptors/window.js';
import { type GamepadPadReading } from '../descriptors/controller.js';
import { type OverlayPlacement } from '../overlay/overlay.js';

export type IpcResult<T> =
  | {
      readonly success: true;
      readonly data: T;
      readonly requestId: string;
      readonly error?: undefined;
    }
  | {
      readonly success: false;
      readonly error: AppError;
      readonly requestId: string;
      readonly data?: undefined;
    };

// Playback & Recording
export interface PlaybackStartResponse {
  readonly started: boolean;
  readonly activeMacroId: string;
}

export interface PlaybackPauseResponse {
  readonly isPaused: boolean;
}

export interface PlaybackResumeResponse {
  readonly isPlaying: boolean;
}

export interface PlaybackStopResponse {
  readonly stopped: boolean;
}

export interface PlaybackGetStatusResponse {
  readonly state: EngineState;
  readonly currentMacroId?: string | undefined;
  readonly elapsedMicroseconds: number;
}

export interface RecordingStartResponse {
  readonly isRecording: boolean;
}

export interface RecordingPauseResponse {
  readonly isPaused: boolean;
}

export interface RecordingResumeResponse {
  readonly isRecording: boolean;
}

export interface RecordingStopResponse {
  readonly macro: MacroDefinition;
}

export interface EmergencyStopResponse {
  readonly stopped: boolean;
  readonly inputsReleased: boolean;
}

// Storage & Library
export interface StorageLoadLibraryResponse {
  readonly macros: readonly MacroDefinition[];
  readonly folders: readonly string[];
}

export interface StorageSaveMacroResponse {
  readonly success: boolean;
  readonly storagePath: string;
}

export interface StorageDeleteMacroResponse {
  readonly token: string;
}

export interface StorageRestoreMacroResponse {
  readonly restored: boolean;
}

export interface StorageMoveMacroResponse {
  readonly moved: boolean;
}

export interface StorageCreateFolderResponse {
  readonly created: boolean;
}

export interface StorageDeleteFolderResponse {
  readonly token: string;
}

export interface StorageRestoreFolderResponse {
  readonly restored: boolean;
}

export interface StorageMoveFolderResponse {
  readonly moved: boolean;
}

export interface StorageExportMacroResponse {
  readonly exportedPath: string;
}

export interface StorageImportMacroResponse {
  readonly result: MacroImportResult;
}

export interface StorageExportBackupResponse {
  readonly exportedPath: string;
}

export interface StorageRestoreBackupResponse {
  readonly result: LibraryBackupResult;
}

export interface StorageExportDiagnosticsResponse {
  readonly exportedPath: string;
}

export interface StorageLoadRunHistoryResponse {
  readonly entries: readonly RunHistoryEntry[];
}

export interface StorageClearRunHistoryResponse {
  readonly cleared: boolean;
}

// Preferences
export interface PreferencesLoadResponse {
  readonly preferences: AppPreferences;
}

export interface PreferencesSaveResponse {
  readonly preferences: AppPreferences;
}

export interface PreferencesResetResponse {
  readonly reset: boolean;
}

// Windows
export interface WindowsGetOpenResponse {
  readonly windows: readonly OpenWindowInfo[];
}

export interface WindowsInspectResponse {
  readonly snapshot: WindowInspectionSnapshot;
}

export interface SystemCommandResponse {
  readonly ok: boolean;
  readonly error?: string | undefined;
  readonly paths?: readonly string[] | undefined;
  readonly scanCode?: number | undefined;
  readonly extended?: boolean | undefined;
  readonly available?: readonly boolean[] | undefined;
  readonly run?: unknown;
}

export interface WindowsActivateResponse {
  readonly activated: boolean;
}

export interface WindowsOpenResponse {
  readonly opened: boolean;
}

export interface WindowsCloseResponse {
  readonly closed: boolean;
}

export interface WindowsMinimizeMainResponse {
  readonly minimized: boolean;
}

export interface WindowsRestoreMainResponse {
  readonly restored: boolean;
}

// Gamepad
export interface GamepadGetReadingsResponse {
  readonly readings: readonly GamepadPadReading[];
}

export interface GamepadInstallDriverResponse {
  readonly success: boolean;
  readonly rebootRequired: boolean;
}

export interface GamepadSetHidingResponse {
  readonly hidingActive: boolean;
}

// Pixel
export interface PixelCaptureResponse {
  readonly rgb: number;
  readonly hex: string;
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

// Overlay
export interface OverlayUpdateResponse {
  readonly updated: boolean;
}

export interface OverlayCountdownResponse {
  readonly shown: boolean;
}

export interface OverlayClearResponse {
  readonly cleared: boolean;
}

export interface OverlaySetPlacementResponse {
  readonly placement: OverlayPlacement;
}

// Cancellation
export interface IpcCancelResponse {
  readonly cancelled: boolean;
}
