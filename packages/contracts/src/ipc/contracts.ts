/**
 * End-to-end IPC contract mapping correlating channels, requests, and responses.
 */

import { type IpcChannels } from './channels.js';
import * as Req from './requests.js';
import * as Res from './responses.js';

export interface IpcContractMap {
  readonly [IpcChannels.PLAYBACK_START]: {
    readonly request: Req.PlaybackStartRequest;
    readonly response: Res.PlaybackStartResponse;
  };
  readonly [IpcChannels.PLAYBACK_PAUSE]: {
    readonly request: Req.PlaybackPauseRequest;
    readonly response: Res.PlaybackPauseResponse;
  };
  readonly [IpcChannels.PLAYBACK_RESUME]: {
    readonly request: Req.PlaybackResumeRequest;
    readonly response: Res.PlaybackResumeResponse;
  };
  readonly [IpcChannels.PLAYBACK_STOP]: {
    readonly request: Req.PlaybackStopRequest;
    readonly response: Res.PlaybackStopResponse;
  };
  readonly [IpcChannels.PLAYBACK_GET_STATUS]: {
    readonly request: Req.PlaybackGetStatusRequest;
    readonly response: Res.PlaybackGetStatusResponse;
  };

  readonly [IpcChannels.RECORDING_START]: {
    readonly request: Req.RecordingStartRequest;
    readonly response: Res.RecordingStartResponse;
  };
  readonly [IpcChannels.RECORDING_PAUSE]: {
    readonly request: Req.RecordingPauseRequest;
    readonly response: Res.RecordingPauseResponse;
  };
  readonly [IpcChannels.RECORDING_RESUME]: {
    readonly request: Req.RecordingResumeRequest;
    readonly response: Res.RecordingResumeResponse;
  };
  readonly [IpcChannels.RECORDING_STOP]: {
    readonly request: Req.RecordingStopRequest;
    readonly response: Res.RecordingStopResponse;
  };

  readonly [IpcChannels.EMERGENCY_STOP]: {
    readonly request: Req.EmergencyStopRequest;
    readonly response: Res.EmergencyStopResponse;
  };

  readonly [IpcChannels.STORAGE_LOAD_LIBRARY]: {
    readonly request: Req.StorageLoadLibraryRequest;
    readonly response: Res.StorageLoadLibraryResponse;
  };
  readonly [IpcChannels.STORAGE_SAVE_MACRO]: {
    readonly request: Req.StorageSaveMacroRequest;
    readonly response: Res.StorageSaveMacroResponse;
  };
  readonly [IpcChannels.STORAGE_DELETE_MACRO]: {
    readonly request: Req.StorageDeleteMacroRequest;
    readonly response: Res.StorageDeleteMacroResponse;
  };
  readonly [IpcChannels.STORAGE_RESTORE_MACRO]: {
    readonly request: Req.StorageRestoreMacroRequest;
    readonly response: Res.StorageRestoreMacroResponse;
  };
  readonly [IpcChannels.STORAGE_MOVE_MACRO]: {
    readonly request: Req.StorageMoveMacroRequest;
    readonly response: Res.StorageMoveMacroResponse;
  };
  readonly [IpcChannels.STORAGE_CREATE_FOLDER]: {
    readonly request: Req.StorageCreateFolderRequest;
    readonly response: Res.StorageCreateFolderResponse;
  };
  readonly [IpcChannels.STORAGE_DELETE_FOLDER]: {
    readonly request: Req.StorageDeleteFolderRequest;
    readonly response: Res.StorageDeleteFolderResponse;
  };
  readonly [IpcChannels.STORAGE_RESTORE_FOLDER]: {
    readonly request: Req.StorageRestoreFolderRequest;
    readonly response: Res.StorageRestoreFolderResponse;
  };
  readonly [IpcChannels.STORAGE_MOVE_FOLDER]: {
    readonly request: Req.StorageMoveFolderRequest;
    readonly response: Res.StorageMoveFolderResponse;
  };
  readonly [IpcChannels.STORAGE_EXPORT_MACRO]: {
    readonly request: Req.StorageExportMacroRequest;
    readonly response: Res.StorageExportMacroResponse;
  };
  readonly [IpcChannels.STORAGE_IMPORT_MACRO]: {
    readonly request: Req.StorageImportMacroRequest;
    readonly response: Res.StorageImportMacroResponse;
  };
  readonly [IpcChannels.STORAGE_EXPORT_BACKUP]: {
    readonly request: Req.StorageExportBackupRequest;
    readonly response: Res.StorageExportBackupResponse;
  };
  readonly [IpcChannels.STORAGE_RESTORE_BACKUP]: {
    readonly request: Req.StorageRestoreBackupRequest;
    readonly response: Res.StorageRestoreBackupResponse;
  };
  readonly [IpcChannels.STORAGE_EXPORT_DIAGNOSTICS]: {
    readonly request: Req.StorageExportDiagnosticsRequest;
    readonly response: Res.StorageExportDiagnosticsResponse;
  };
  readonly [IpcChannels.STORAGE_LOAD_RUN_HISTORY]: {
    readonly request: Req.StorageLoadRunHistoryRequest;
    readonly response: Res.StorageLoadRunHistoryResponse;
  };
  readonly [IpcChannels.STORAGE_CLEAR_RUN_HISTORY]: {
    readonly request: Req.StorageClearRunHistoryRequest;
    readonly response: Res.StorageClearRunHistoryResponse;
  };

  readonly [IpcChannels.PREFERENCES_LOAD]: {
    readonly request: Req.PreferencesLoadRequest;
    readonly response: Res.PreferencesLoadResponse;
  };
  readonly [IpcChannels.PREFERENCES_SAVE]: {
    readonly request: Req.PreferencesSaveRequest;
    readonly response: Res.PreferencesSaveResponse;
  };
  readonly [IpcChannels.PREFERENCES_RESET]: {
    readonly request: Req.PreferencesResetRequest;
    readonly response: Res.PreferencesResetResponse;
  };

  readonly [IpcChannels.WINDOWS_GET_OPEN]: {
    readonly request: Req.WindowsGetOpenRequest;
    readonly response: Res.WindowsGetOpenResponse;
  };
  readonly [IpcChannels.WINDOWS_INSPECT]: {
    readonly request: Req.WindowsInspectRequest;
    readonly response: Res.WindowsInspectResponse;
  };
  readonly [IpcChannels.SYSTEM_COMMAND]: {
    readonly request: Req.SystemCommandRequest;
    readonly response: Res.SystemCommandResponse;
  };
  readonly [IpcChannels.WINDOWS_ACTIVATE]: {
    readonly request: Req.WindowsActivateRequest;
    readonly response: Res.WindowsActivateResponse;
  };
  readonly [IpcChannels.WINDOWS_OPEN]: {
    readonly request: Req.WindowsOpenRequest;
    readonly response: Res.WindowsOpenResponse;
  };
  readonly [IpcChannels.WINDOWS_CLOSE]: {
    readonly request: Req.WindowsCloseRequest;
    readonly response: Res.WindowsCloseResponse;
  };
  readonly [IpcChannels.WINDOWS_MINIMIZE_MAIN]: {
    readonly request: Req.WindowsMinimizeMainRequest;
    readonly response: Res.WindowsMinimizeMainResponse;
  };
  readonly [IpcChannels.WINDOWS_RESTORE_MAIN]: {
    readonly request: Req.WindowsRestoreMainRequest;
    readonly response: Res.WindowsRestoreMainResponse;
  };

  readonly [IpcChannels.GAMEPAD_GET_READINGS]: {
    readonly request: Req.GamepadGetReadingsRequest;
    readonly response: Res.GamepadGetReadingsResponse;
  };
  readonly [IpcChannels.GAMEPAD_INSTALL_DRIVER]: {
    readonly request: Req.GamepadInstallDriverRequest;
    readonly response: Res.GamepadInstallDriverResponse;
  };
  readonly [IpcChannels.GAMEPAD_SET_HIDING]: {
    readonly request: Req.GamepadSetHidingRequest;
    readonly response: Res.GamepadSetHidingResponse;
  };

  readonly [IpcChannels.PIXEL_CAPTURE]: {
    readonly request: Req.PixelCaptureRequest;
    readonly response: Res.PixelCaptureResponse;
  };

  readonly [IpcChannels.OVERLAY_UPDATE]: {
    readonly request: Req.OverlayUpdateRequest;
    readonly response: Res.OverlayUpdateResponse;
  };
  readonly [IpcChannels.OVERLAY_COUNTDOWN]: {
    readonly request: Req.OverlayCountdownRequest;
    readonly response: Res.OverlayCountdownResponse;
  };
  readonly [IpcChannels.OVERLAY_CLEAR]: {
    readonly request: Req.OverlayClearRequest;
    readonly response: Res.OverlayClearResponse;
  };
  readonly [IpcChannels.OVERLAY_SET_PLACEMENT]: {
    readonly request: Req.OverlaySetPlacementRequest;
    readonly response: Res.OverlaySetPlacementResponse;
  };

  readonly [IpcChannels.IPC_CANCEL]: {
    readonly request: Req.IpcCancelRequest;
    readonly response: Res.IpcCancelResponse;
  };
}

export type IpcChannelName = keyof IpcContractMap;
export type IpcRequestFor<C extends IpcChannelName> = IpcContractMap[C]['request'];
export type IpcResponseFor<C extends IpcChannelName> = IpcContractMap[C]['response'];

export type IpcHandler<C extends IpcChannelName> = (
  request: IpcRequestFor<C>,
) => Promise<IpcResponseFor<C>> | IpcResponseFor<C>;
