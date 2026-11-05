/**
 * Strongly-typed request, response, and handler contracts for Electron Main IPC.
 * Fully compatible with @macro-recorder/contracts.
 */

import type { WebContents } from 'electron';
import type { IpcChannelName, IpcEventChannel } from './channels.js';

// ============================================================================
// Error Codes & Envelopes
// ============================================================================

export const IpcErrorCode = {
  INVALID_ARGUMENT: 'INVALID_ARGUMENT',
  NOT_FOUND: 'NOT_FOUND',
  ALREADY_EXISTS: 'ALREADY_EXISTS',
  PERMISSION_DENIED: 'PERMISSION_DENIED',
  RESOURCE_EXHAUSTED: 'RESOURCE_EXHAUSTED',
  FAILED_PRECONDITION: 'FAILED_PRECONDITION',
  ABORTED: 'ABORTED',
  CANCELLED: 'CANCELLED',
  UNAVAILABLE: 'UNAVAILABLE',
  INTERNAL: 'INTERNAL',
  UNSUPPORTED_VERSION: 'UNSUPPORTED_VERSION',
  CHECKSUM_MISMATCH: 'CHECKSUM_MISMATCH',
  CORRUPT_DATA: 'CORRUPT_DATA',
  HOTKEY_CONFLICT: 'HOTKEY_CONFLICT',
  RECURSION_LIMIT_EXCEEDED: 'RECURSION_LIMIT_EXCEEDED',
  CYCLE_DETECTED: 'CYCLE_DETECTED',
  DRIVER_NOT_FOUND: 'DRIVER_NOT_FOUND',
  NATIVE_HOOK_ERROR: 'NATIVE_HOOK_ERROR',
  WINDOW_NOT_FOUND: 'WINDOW_NOT_FOUND',
} as const;

export type IpcErrorCode = (typeof IpcErrorCode)[keyof typeof IpcErrorCode];

export interface AppError {
  readonly code: IpcErrorCode;
  readonly message: string;
  readonly details?: Readonly<Record<string, unknown>> | undefined;
  readonly stack?: string | undefined;
}

export class MacroRecorderIpcError extends Error implements AppError {
  public readonly code: IpcErrorCode;
  public readonly details?: Readonly<Record<string, unknown>> | undefined;

  constructor(code: IpcErrorCode, message: string, details?: Readonly<Record<string, unknown>>) {
    super(message);
    this.name = 'MacroRecorderIpcError';
    this.code = code;
    this.details = details;
  }
}

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

// ============================================================================
// Domain Entities
// ============================================================================

export type EngineState = 'Idle' | 'Countdown' | 'Recording' | 'Saving' | 'Playing' | 'Paused' | 'Stopping';
export type RecordingChoice = 'Overwrite' | 'Continue' | 'Append';
export type MacroExportFormat = 'json' | 'ahk' | 'csv' | 'zip';
export type LibraryBackupMode = 'Merge' | 'Replace';

export interface MacroEvent {
  readonly id?: string | undefined;
  readonly type?: string | undefined;
  readonly eventType: string;
  readonly timeMicroseconds: number;
  readonly durationMicroseconds?: number | undefined;
  readonly [key: string]: unknown;
}

export interface MacroDefinition {
  readonly schemaVersion: number;
  readonly id: string;
  readonly name: string;
  readonly description?: string | undefined;
  readonly folderRelativePath?: string | undefined;
  readonly events: readonly MacroEvent[];
  readonly [key: string]: unknown;
}

export interface RecordingOptions {
  readonly keyboard?: boolean | undefined;
  readonly mouseButtons?: boolean | undefined;
  readonly mouseMovement?: boolean | undefined;
  readonly mouseWheel?: boolean | undefined;
  readonly gamepad?: boolean | undefined;
  readonly mouseMoveBucketMilliseconds?: number | undefined;
  readonly countdownSeconds?: number | undefined;
}

export interface AppPreferences {
  readonly [key: string]: unknown;
}

export interface OpenWindowInfo {
  readonly handle: number;
  readonly title: string;
  readonly processName: string;
  readonly processId: number;
  readonly className?: string | undefined;
}

export interface WindowInspectionSnapshot {
  readonly handle: number;
  readonly title: string;
  readonly processName: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly [key: string]: unknown;
}

export interface GamepadPadReading {
  readonly slot: number;
  readonly connected: boolean;
  readonly buttons: number;
  readonly leftStickX: number;
  readonly leftStickY: number;
  readonly rightStickX: number;
  readonly rightStickY: number;
  readonly leftTrigger: number;
  readonly rightTrigger: number;
}

export interface PlaybackStatusChangedEvent extends PlaybackGetStatusResponse {
  readonly macroName?: string | undefined;
  readonly currentActionIndex?: number | undefined;
  readonly totalActions?: number | undefined;
}

export interface HotkeyTriggeredEvent {
  readonly id: number;
  readonly key: string;
}

export interface WindowStateChangedEvent {
  readonly windowId: string;
  readonly state: string;
}

export interface IpcEventMap {
  readonly 'playback:status-changed': PlaybackStatusChangedEvent;
  readonly 'recording:event': MacroEvent;
  readonly 'recording:state-changed': EngineState;
  readonly 'hotkey:triggered': HotkeyTriggeredEvent;
  readonly 'gamepad:state-changed': readonly GamepadPadReading[];
  readonly 'window:state-changed': WindowStateChangedEvent;
  readonly 'overlay:changed': unknown;
  readonly 'overlay:state': unknown;
  readonly 'library:changed': unknown;
}

export type IpcEventPayloadFor<C extends IpcEventChannel> = IpcEventMap[C];

export interface OverlayPlacement {
  readonly infoX: number;
  readonly infoY: number;
  readonly annotationX: number;
  readonly annotationY: number;
}

export interface RunHistoryEntry {
  readonly macroId: string;
  readonly macroName: string;
  readonly runCount: number;
  readonly lastRunAt: string;
  readonly lastActivation: string;
  readonly totalDurationMs: number;
  readonly averageJitterMs: number;
  readonly maxJitterMs: number;
  readonly totalDispatched: number;
  readonly totalFailed: number;
  readonly totalUnconfirmed: number;
}

export interface MacroImportResult {
  readonly macro: MacroDefinition;
  readonly sourceFormat: string;
  readonly warnings: readonly string[];
}

export interface LibraryBackupResult {
  readonly macrosRestored: number;
  readonly foldersRestored: number;
  readonly replacedLibraryTrashToken?: string | undefined;
}

// ============================================================================
// Request Types
// ============================================================================

export interface IpcRequestBase {
  readonly requestId: string;
  readonly cancellationToken?: string | undefined;
}

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

export type PreferencesLoadRequest = IpcRequestBase;

export interface PreferencesSaveRequest extends IpcRequestBase {
  readonly preferences: Partial<AppPreferences>;
}

export type PreferencesResetRequest = IpcRequestBase;

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

export type GamepadGetReadingsRequest = IpcRequestBase;

export interface GamepadInstallDriverRequest extends IpcRequestBase {
  readonly driver: 'ViGEmBus' | 'HidHide';
}

export interface GamepadSetHidingRequest extends IpcRequestBase {
  readonly hide: boolean;
}

export interface PixelCaptureRequest extends IpcRequestBase {
  readonly x: number;
  readonly y: number;
}

export interface OverlayUpdateRequest extends IpcRequestBase {
  readonly macroId: string;
  readonly state: EngineState;
  readonly macroName: string;
  readonly playbackSpeed?: number | undefined;
  readonly [key: string]: unknown;
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

export interface IpcCancelRequest extends IpcRequestBase {
  readonly targetRequestId: string;
  readonly reason?: string | undefined;
}

export interface IpcSubscriptionRequest extends IpcRequestBase {
  readonly channel: IpcEventChannel;
}

// ============================================================================
// Response Types
// ============================================================================

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

export interface PreferencesLoadResponse {
  readonly preferences: AppPreferences;
}

export interface PreferencesSaveResponse {
  readonly preferences: AppPreferences;
}

export interface PreferencesResetResponse {
  readonly reset: boolean;
}

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

export interface PixelCaptureResponse {
  readonly rgb: number;
  readonly hex: string;
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

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

export interface IpcCancelResponse {
  readonly cancelled: boolean;
}

export interface IpcSubscribeResponse {
  readonly subscribed: boolean;
}

export interface IpcUnsubscribeResponse {
  readonly unsubscribed: boolean;
}

// ============================================================================
// Contract Map
// ============================================================================

export interface IpcContractMap {
  readonly 'playback:start': { readonly request: PlaybackStartRequest; readonly response: PlaybackStartResponse };
  readonly 'playback:pause': { readonly request: PlaybackPauseRequest; readonly response: PlaybackPauseResponse };
  readonly 'playback:resume': { readonly request: PlaybackResumeRequest; readonly response: PlaybackResumeResponse };
  readonly 'playback:stop': { readonly request: PlaybackStopRequest; readonly response: PlaybackStopResponse };
  readonly 'playback:get-status': { readonly request: PlaybackGetStatusRequest; readonly response: PlaybackGetStatusResponse };

  readonly 'recording:start': { readonly request: RecordingStartRequest; readonly response: RecordingStartResponse };
  readonly 'recording:pause': { readonly request: RecordingPauseRequest; readonly response: RecordingPauseResponse };
  readonly 'recording:resume': { readonly request: RecordingResumeRequest; readonly response: RecordingResumeResponse };
  readonly 'recording:stop': { readonly request: RecordingStopRequest; readonly response: RecordingStopResponse };

  readonly 'emergency:stop': { readonly request: EmergencyStopRequest; readonly response: EmergencyStopResponse };

  readonly 'storage:load-library': { readonly request: StorageLoadLibraryRequest; readonly response: StorageLoadLibraryResponse };
  readonly 'storage:save-macro': { readonly request: StorageSaveMacroRequest; readonly response: StorageSaveMacroResponse };
  readonly 'storage:delete-macro': { readonly request: StorageDeleteMacroRequest; readonly response: StorageDeleteMacroResponse };
  readonly 'storage:restore-macro': { readonly request: StorageRestoreMacroRequest; readonly response: StorageRestoreMacroResponse };
  readonly 'storage:move-macro': { readonly request: StorageMoveMacroRequest; readonly response: StorageMoveMacroResponse };
  readonly 'storage:create-folder': { readonly request: StorageCreateFolderRequest; readonly response: StorageCreateFolderResponse };
  readonly 'storage:delete-folder': { readonly request: StorageDeleteFolderRequest; readonly response: StorageDeleteFolderResponse };
  readonly 'storage:restore-folder': { readonly request: StorageRestoreFolderRequest; readonly response: StorageRestoreFolderResponse };
  readonly 'storage:move-folder': { readonly request: StorageMoveFolderRequest; readonly response: StorageMoveFolderResponse };
  readonly 'storage:export-macro': { readonly request: StorageExportMacroRequest; readonly response: StorageExportMacroResponse };
  readonly 'storage:import-macro': { readonly request: StorageImportMacroRequest; readonly response: StorageImportMacroResponse };
  readonly 'storage:export-backup': { readonly request: StorageExportBackupRequest; readonly response: StorageExportBackupResponse };
  readonly 'storage:restore-backup': { readonly request: StorageRestoreBackupRequest; readonly response: StorageRestoreBackupResponse };
  readonly 'storage:export-diagnostics': { readonly request: StorageExportDiagnosticsRequest; readonly response: StorageExportDiagnosticsResponse };
  readonly 'storage:load-run-history': { readonly request: StorageLoadRunHistoryRequest; readonly response: StorageLoadRunHistoryResponse };
  readonly 'storage:clear-run-history': { readonly request: StorageClearRunHistoryRequest; readonly response: StorageClearRunHistoryResponse };

  readonly 'preferences:load': { readonly request: PreferencesLoadRequest; readonly response: PreferencesLoadResponse };
  readonly 'preferences:save': { readonly request: PreferencesSaveRequest; readonly response: PreferencesSaveResponse };
  readonly 'preferences:reset': { readonly request: PreferencesResetRequest; readonly response: PreferencesResetResponse };

  readonly 'windows:get-open': { readonly request: WindowsGetOpenRequest; readonly response: WindowsGetOpenResponse };
  readonly 'windows:inspect': { readonly request: WindowsInspectRequest; readonly response: WindowsInspectResponse };
  readonly 'system:command': { readonly request: SystemCommandRequest; readonly response: SystemCommandResponse };
  readonly 'windows:activate': { readonly request: WindowsActivateRequest; readonly response: WindowsActivateResponse };
  readonly 'windows:open': { readonly request: WindowsOpenRequest; readonly response: WindowsOpenResponse };
  readonly 'windows:close': { readonly request: WindowsCloseRequest; readonly response: WindowsCloseResponse };
  readonly 'windows:minimize-main': { readonly request: WindowsMinimizeMainRequest; readonly response: WindowsMinimizeMainResponse };
  readonly 'windows:restore-main': { readonly request: WindowsRestoreMainRequest; readonly response: WindowsRestoreMainResponse };

  readonly 'gamepad:get-readings': { readonly request: GamepadGetReadingsRequest; readonly response: GamepadGetReadingsResponse };
  readonly 'gamepad:install-driver': { readonly request: GamepadInstallDriverRequest; readonly response: GamepadInstallDriverResponse };
  readonly 'gamepad:set-hiding': { readonly request: GamepadSetHidingRequest; readonly response: GamepadSetHidingResponse };

  readonly 'pixel:capture': { readonly request: PixelCaptureRequest; readonly response: PixelCaptureResponse };

  readonly 'overlay:update': { readonly request: OverlayUpdateRequest; readonly response: OverlayUpdateResponse };
  readonly 'overlay:countdown': { readonly request: OverlayCountdownRequest; readonly response: OverlayCountdownResponse };
  readonly 'overlay:clear': { readonly request: OverlayClearRequest; readonly response: OverlayClearResponse };
  readonly 'overlay:set-placement': { readonly request: OverlaySetPlacementRequest; readonly response: OverlaySetPlacementResponse };

  readonly 'ipc:cancel': { readonly request: IpcCancelRequest; readonly response: IpcCancelResponse };
  readonly 'ipc:subscribe': { readonly request: IpcSubscriptionRequest; readonly response: IpcSubscribeResponse };
  readonly 'ipc:unsubscribe': { readonly request: IpcSubscriptionRequest; readonly response: IpcUnsubscribeResponse };
}

export type IpcRequestFor<C extends IpcChannelName> = IpcContractMap[C]['request'];
export type IpcResponseFor<C extends IpcChannelName> = IpcContractMap[C]['response'];

export interface IpcHandlerContext {
  readonly senderWebContentsId: number;
  readonly senderWebContents: WebContents;
  readonly senderProcessId?: number | undefined;
  readonly senderFrameUrl: string;
  readonly signal: AbortSignal;
}

export type IpcHandler<C extends IpcChannelName> = (
  request: IpcRequestFor<C>,
  context: IpcHandlerContext,
) => Promise<IpcResponseFor<C>> | IpcResponseFor<C>;
