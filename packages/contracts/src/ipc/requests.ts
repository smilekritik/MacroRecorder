/**
 * Typed IPC request contracts with cancellation token and request ID.
 */

import {
  type LibraryBackupMode,
  type MacroExportFormat,
  type RecordingChoice,
} from '../domain/enums.js';
import { type MacroDefinition } from '../domain/macro.js';
import { type MacroEvent } from '../domain/event.js';
import { type DispatchReceipt } from '../domain/diagnostics.js';
import { type RecordingOptions } from '../domain/options.js';
import { type AppPreferences } from '../preferences/preferences.js';
import { type EngineState, type OverlayCardOverride } from '../domain/enums.js';

export interface IpcRequestBase {
  readonly requestId: string;
  readonly cancellationToken?: string | undefined;
}

// Playback & Recording
export interface PlaybackStartRequest extends IpcRequestBase {
  readonly macroId?: string | undefined;
  readonly macro?: MacroDefinition | undefined;
  readonly speed?: number | undefined;
  readonly targetWindowHandle?: number | undefined;
}

export type PlaybackPauseRequest = IpcRequestBase;
export type PlaybackResumeRequest = IpcRequestBase;

export interface PlaybackStopRequest extends IpcRequestBase {
  readonly reason?: string | undefined;
}

export type PlaybackGetStatusRequest = IpcRequestBase;

export interface RecordingStartRequest extends IpcRequestBase {
  readonly options?: Partial<RecordingOptions> | undefined;
  readonly countdownSeconds?: number | undefined;
  readonly choice?: RecordingChoice | undefined;
  /** The macro receiving the result; it is saved when recording stops. */
  readonly macroId?: string | undefined;
  /** Where `Continue` inserts the recording; later actions shift down. */
  readonly insertAtMicroseconds?: number | undefined;
}

export type RecordingPauseRequest = IpcRequestBase;
export type RecordingResumeRequest = IpcRequestBase;
export type RecordingStopRequest = IpcRequestBase;

export interface EmergencyStopRequest extends IpcRequestBase {
  readonly reason?: string | undefined;
}

// Storage & Library
export type StorageLoadLibraryRequest = IpcRequestBase;

export interface StorageSaveMacroRequest extends IpcRequestBase {
  readonly macro: MacroDefinition;
  readonly touchModified?: boolean | undefined;
}

export interface StorageDeleteMacroRequest extends IpcRequestBase {
  readonly macroId: string;
}

export interface StorageRestoreMacroRequest extends IpcRequestBase {
  readonly token: string;
  readonly folderRelativePath: string;
  readonly macroName: string;
}

export interface StorageMoveMacroRequest extends IpcRequestBase {
  readonly macroId: string;
  readonly folderRelativePath: string;
}

export interface StorageCreateFolderRequest extends IpcRequestBase {
  readonly folderRelativePath: string;
}

export interface StorageDeleteFolderRequest extends IpcRequestBase {
  readonly folderRelativePath: string;
}

export interface StorageRestoreFolderRequest extends IpcRequestBase {
  readonly token: string;
  readonly folderRelativePath: string;
}

export interface StorageMoveFolderRequest extends IpcRequestBase {
  readonly sourceRelativePath: string;
  readonly targetRelativePath: string;
}

export interface StorageExportMacroRequest extends IpcRequestBase {
  readonly macroId: string;
  readonly format: MacroExportFormat;
  readonly destinationPath: string;
}

export interface StorageImportMacroRequest extends IpcRequestBase {
  readonly sourcePath: string;
  readonly targetFolderRelativePath?: string | undefined;
}

export interface StorageExportBackupRequest extends IpcRequestBase {
  readonly destinationPath: string;
  readonly includesSettings: boolean;
}

export interface StorageRestoreBackupRequest extends IpcRequestBase {
  readonly sourcePath: string;
  readonly mode: LibraryBackupMode;
}

export interface StorageExportDiagnosticsRequest extends IpcRequestBase {
  readonly format: MacroExportFormat;
  readonly destinationPath: string;
}

export type StorageLoadRunHistoryRequest = IpcRequestBase;
export type StorageClearRunHistoryRequest = IpcRequestBase;

// Preferences
export type PreferencesLoadRequest = IpcRequestBase;

export interface PreferencesSaveRequest extends IpcRequestBase {
  readonly preferences: Partial<AppPreferences>;
}

export type PreferencesResetRequest = IpcRequestBase;

// Windows
export interface WindowsGetOpenRequest extends IpcRequestBase {
  readonly excludedProcessId?: number | undefined;
}

export interface WindowsInspectRequest extends IpcRequestBase {
  readonly followMouse: boolean;
  readonly selfHandle?: number | undefined;
  readonly ownerHandle?: number | undefined;
}

export interface SystemCommandRequest extends IpcRequestBase {
  readonly command: string;
  readonly title?: string | undefined;
  readonly filters?: readonly { readonly name: string; readonly extensions: readonly string[] }[] | undefined;
  readonly multiple?: boolean | undefined;
  readonly suggestedName?: string | undefined;
  readonly relativePath?: string | undefined;
  readonly path?: string | undefined;
  readonly windowId?: string | undefined;
  readonly contentHeight?: number | undefined;
  readonly gestures?: readonly unknown[] | undefined;
}

export interface WindowsActivateRequest extends IpcRequestBase {
  readonly processName: string;
  readonly windowTitle: string;
}

export interface WindowsOpenRequest extends IpcRequestBase {
  readonly windowId: string;
  readonly params?: Readonly<Record<string, unknown>> | undefined;
}

export interface WindowsCloseRequest extends IpcRequestBase {
  readonly windowId: string;
}

export type WindowsMinimizeMainRequest = IpcRequestBase;
export type WindowsRestoreMainRequest = IpcRequestBase;

// Gamepad
export type GamepadGetReadingsRequest = IpcRequestBase;

export interface GamepadInstallDriverRequest extends IpcRequestBase {
  readonly driver: 'ViGEmBus' | 'HidHide';
}

export interface GamepadSetHidingRequest extends IpcRequestBase {
  readonly hide: boolean;
}

// Pixel
export interface PixelCaptureRequest extends IpcRequestBase {
  readonly x: number;
  readonly y: number;
}

// Overlay
export interface OverlayUpdateRequest extends IpcRequestBase {
  readonly macroId: string;
  readonly state: EngineState;
  readonly macroName: string;
  readonly receipt?: DispatchReceipt | null | undefined;
  readonly item?: MacroEvent | null | undefined;
  readonly playbackSpeed?: number | undefined;
  readonly infoOverride?: OverlayCardOverride | undefined;
  readonly customTextOverride?: OverlayCardOverride | undefined;
}

export interface OverlayCountdownRequest extends IpcRequestBase {
  readonly seconds: number;
}

export type OverlayClearRequest = IpcRequestBase;

export interface OverlaySetPlacementRequest extends IpcRequestBase {
  readonly infoX: number;
  readonly infoY: number;
  readonly annotationX: number;
  readonly annotationY: number;
}

// Cancellation
export interface IpcCancelRequest extends IpcRequestBase {
  readonly targetRequestId: string;
  readonly reason?: string | undefined;
}
