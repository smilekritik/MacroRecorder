/**
 * Runtime schema validators for incoming renderer IPC requests.
 * Rejects malformed or unsafe renderer input at the IPC boundary.
 */

import {
  boolean,
  integer,
  number,
  object,
  optional,
  string,
  type Schema,
  type ValidationResult,
} from '../common/validation.js';
import { IpcChannels, type IpcChannel } from './channels.js';
import { type IpcContractMap, type IpcRequestFor } from './contracts.js';
import {
  engineStateSchema,
  libraryBackupModeSchema,
  macroExportFormatSchema,
  overlayCardOverrideSchema,
  recordingChoiceSchema,
} from '../domain/enums.js';
import { macroDefinitionSchema } from '../domain/macro.js';
import { macroEventSchema } from '../domain/event.js';
import { dispatchReceiptSchema } from '../domain/diagnostics.js';

const baseRequestSchema = {
  requestId: string({ min: 1, max: 128 }),
  cancellationToken: optional(string({ min: 1, max: 128 })),
};

const playbackStartRequestSchema = object({
  ...baseRequestSchema,
  macroId: optional(string({ min: 1 })),
  macro: optional(macroDefinitionSchema),
  speed: optional(number({ min: 0.1, max: 10.0 })),
  targetWindowHandle: optional(integer()),
});

const recordingStartRequestSchema = object({
  ...baseRequestSchema,
  countdownSeconds: optional(integer({ min: 0, max: 60 })),
  choice: optional(recordingChoiceSchema),
  options: optional(
    object({
      keyboard: optional(boolean()),
      mouseButtons: optional(boolean()),
      mouseMovement: optional(boolean()),
      mouseWheel: optional(boolean()),
      gamepad: optional(boolean()),
      mouseMoveBucketMilliseconds: optional(integer({ min: 0 })),
      countdownSeconds: optional(integer({ min: 0, max: 60 })),
    }),
  ),
  macroId: optional(string({ max: 256 })),
  insertAtMicroseconds: optional(number({ min: 0 })),
});

const emergencyStopRequestSchema = object({
  ...baseRequestSchema,
  reason: optional(string({ max: 256 })),
});

const systemCommandRequestSchema = object({
  ...baseRequestSchema,
  command: string({ max: 64 }),
  title: optional(string({ max: 256 })),
  suggestedName: optional(string({ max: 512 })),
  relativePath: optional(string({ max: 1024 })),
  path: optional(string({ max: 4096 })),
  windowId: optional(string({ max: 64 })),
  multiple: optional(boolean()),
  contentHeight: optional(number({ min: 0 })),
}) as unknown as Schema<unknown>;

const storageSaveMacroRequestSchema = object({
  ...baseRequestSchema,
  macro: macroDefinitionSchema,
  touchModified: optional(boolean()),
});

const storageDeleteMacroRequestSchema = object({
  ...baseRequestSchema,
  macroId: string({ min: 1 }),
});

const storageRestoreMacroRequestSchema = object({
  ...baseRequestSchema,
  token: string({ min: 1 }),
  folderRelativePath: string(),
  macroName: string({ min: 1, max: 96 }),
});

const storageMoveMacroRequestSchema = object({
  ...baseRequestSchema,
  macroId: string({ min: 1 }),
  folderRelativePath: string(),
});

const storageCreateFolderRequestSchema = object({
  ...baseRequestSchema,
  folderRelativePath: string({ min: 1, max: 260 }),
});

const storageDeleteFolderRequestSchema = object({
  ...baseRequestSchema,
  folderRelativePath: string({ min: 1, max: 260 }),
});

const storageRestoreFolderRequestSchema = object({
  ...baseRequestSchema,
  token: string({ min: 1 }),
  folderRelativePath: string({ min: 1, max: 260 }),
});

const storageMoveFolderRequestSchema = object({
  ...baseRequestSchema,
  sourceRelativePath: string({ min: 1, max: 260 }),
  targetRelativePath: string({ min: 1, max: 260 }),
});

const storageExportMacroRequestSchema = object({
  ...baseRequestSchema,
  macroId: string({ min: 1 }),
  format: macroExportFormatSchema,
  destinationPath: string({ min: 1, max: 1024 }),
});

const storageImportMacroRequestSchema = object({
  ...baseRequestSchema,
  sourcePath: string({ min: 1, max: 1024 }),
  targetFolderRelativePath: optional(string({ max: 260 })),
});

const storageExportBackupRequestSchema = object({
  ...baseRequestSchema,
  destinationPath: string({ min: 1, max: 1024 }),
  includesSettings: boolean(),
});

const storageRestoreBackupRequestSchema = object({
  ...baseRequestSchema,
  sourcePath: string({ min: 1, max: 1024 }),
  mode: libraryBackupModeSchema,
});

const storageExportDiagnosticsRequestSchema = object({
  ...baseRequestSchema,
  format: macroExportFormatSchema,
  destinationPath: string({ min: 1, max: 1024 }),
});

const preferencesSaveRequestSchema = object({
  ...baseRequestSchema,
  preferences: object({}, { passthrough: true }),
});

const windowsGetOpenRequestSchema = object({
  ...baseRequestSchema,
  excludedProcessId: optional(integer({ min: 0 })),
});

const windowsInspectRequestSchema = object({
  ...baseRequestSchema,
  followMouse: boolean(),
  selfHandle: optional(integer()),
  ownerHandle: optional(integer()),
});

const windowsActivateRequestSchema = object({
  ...baseRequestSchema,
  processName: string({ min: 1 }),
  windowTitle: string(),
});

const windowsOpenRequestSchema = object({
  ...baseRequestSchema,
  windowId: string({ min: 1 }),
  params: optional(object({}, { passthrough: true })),
});

const windowsCloseRequestSchema = object({
  ...baseRequestSchema,
  windowId: string({ min: 1 }),
});

const pixelCaptureRequestSchema = object({
  ...baseRequestSchema,
  x: integer(),
  y: integer(),
});

const overlayUpdateRequestSchema = object({
  ...baseRequestSchema,
  macroId: string({ min: 1 }),
  state: engineStateSchema,
  macroName: string(),
  receipt: optional(dispatchReceiptSchema),
  item: optional(macroEventSchema),
  playbackSpeed: optional(number({ min: 0.1, max: 10.0 })),
  infoOverride: optional(overlayCardOverrideSchema),
  customTextOverride: optional(overlayCardOverrideSchema),
});

const overlayCountdownRequestSchema = object({
  ...baseRequestSchema,
  seconds: integer({ min: 0, max: 60 }),
});

const overlaySetPlacementRequestSchema = object({
  ...baseRequestSchema,
  infoX: number({ min: 0, max: 1 }),
  infoY: number({ min: 0, max: 1 }),
  annotationX: number({ min: 0, max: 1 }),
  annotationY: number({ min: 0, max: 1 }),
});

const ipcCancelRequestSchema = object({
  ...baseRequestSchema,
  targetRequestId: string({ min: 1, max: 128 }),
  reason: optional(string({ max: 256 })),
});

const genericBaseRequestSchema = object({ ...baseRequestSchema });

const requestSchemasByChannel: Partial<Record<IpcChannel, Schema<unknown>>> = {
  [IpcChannels.PLAYBACK_START]: playbackStartRequestSchema,
  [IpcChannels.PLAYBACK_PAUSE]: genericBaseRequestSchema,
  [IpcChannels.PLAYBACK_RESUME]: genericBaseRequestSchema,
  [IpcChannels.PLAYBACK_STOP]: object({
    ...baseRequestSchema,
    reason: optional(string({ max: 256 })),
  }),
  [IpcChannels.PLAYBACK_GET_STATUS]: genericBaseRequestSchema,
  [IpcChannels.RECORDING_START]: recordingStartRequestSchema,
  [IpcChannels.RECORDING_PAUSE]: genericBaseRequestSchema,
  [IpcChannels.RECORDING_RESUME]: genericBaseRequestSchema,
  [IpcChannels.RECORDING_STOP]: genericBaseRequestSchema,
  [IpcChannels.EMERGENCY_STOP]: emergencyStopRequestSchema,
  [IpcChannels.STORAGE_LOAD_LIBRARY]: genericBaseRequestSchema,
  [IpcChannels.STORAGE_SAVE_MACRO]: storageSaveMacroRequestSchema,
  [IpcChannels.STORAGE_DELETE_MACRO]: storageDeleteMacroRequestSchema,
  [IpcChannels.STORAGE_RESTORE_MACRO]: storageRestoreMacroRequestSchema,
  [IpcChannels.STORAGE_MOVE_MACRO]: storageMoveMacroRequestSchema,
  [IpcChannels.STORAGE_CREATE_FOLDER]: storageCreateFolderRequestSchema,
  [IpcChannels.STORAGE_DELETE_FOLDER]: storageDeleteFolderRequestSchema,
  [IpcChannels.STORAGE_RESTORE_FOLDER]: storageRestoreFolderRequestSchema,
  [IpcChannels.STORAGE_MOVE_FOLDER]: storageMoveFolderRequestSchema,
  [IpcChannels.STORAGE_EXPORT_MACRO]: storageExportMacroRequestSchema,
  [IpcChannels.STORAGE_IMPORT_MACRO]: storageImportMacroRequestSchema,
  [IpcChannels.STORAGE_EXPORT_BACKUP]: storageExportBackupRequestSchema,
  [IpcChannels.STORAGE_RESTORE_BACKUP]: storageRestoreBackupRequestSchema,
  [IpcChannels.STORAGE_EXPORT_DIAGNOSTICS]: storageExportDiagnosticsRequestSchema,
  [IpcChannels.STORAGE_LOAD_RUN_HISTORY]: genericBaseRequestSchema,
  [IpcChannels.STORAGE_CLEAR_RUN_HISTORY]: genericBaseRequestSchema,
  [IpcChannels.PREFERENCES_LOAD]: genericBaseRequestSchema,
  [IpcChannels.PREFERENCES_SAVE]: preferencesSaveRequestSchema,
  [IpcChannels.PREFERENCES_RESET]: genericBaseRequestSchema,
  [IpcChannels.WINDOWS_GET_OPEN]: windowsGetOpenRequestSchema,
  [IpcChannels.WINDOWS_INSPECT]: windowsInspectRequestSchema,
  [IpcChannels.SYSTEM_COMMAND]: systemCommandRequestSchema,
  [IpcChannels.WINDOWS_ACTIVATE]: windowsActivateRequestSchema,
  [IpcChannels.WINDOWS_OPEN]: windowsOpenRequestSchema,
  [IpcChannels.WINDOWS_CLOSE]: windowsCloseRequestSchema,
  [IpcChannels.WINDOWS_MINIMIZE_MAIN]: genericBaseRequestSchema,
  [IpcChannels.WINDOWS_RESTORE_MAIN]: genericBaseRequestSchema,
  [IpcChannels.GAMEPAD_GET_READINGS]: genericBaseRequestSchema,
  [IpcChannels.GAMEPAD_INSTALL_DRIVER]: object({
    ...baseRequestSchema,
    driver: string({ min: 1 }),
  }),
  [IpcChannels.GAMEPAD_SET_HIDING]: object({ ...baseRequestSchema, hide: boolean() }),
  [IpcChannels.PIXEL_CAPTURE]: pixelCaptureRequestSchema,
  [IpcChannels.OVERLAY_UPDATE]: overlayUpdateRequestSchema,
  [IpcChannels.OVERLAY_COUNTDOWN]: overlayCountdownRequestSchema,
  [IpcChannels.OVERLAY_CLEAR]: genericBaseRequestSchema,
  [IpcChannels.OVERLAY_SET_PLACEMENT]: overlaySetPlacementRequestSchema,
  [IpcChannels.IPC_CANCEL]: ipcCancelRequestSchema,
};

export function validateIpcRequest<C extends keyof IpcContractMap>(
  channel: C,
  raw: unknown,
): ValidationResult<IpcRequestFor<C>> {
  const schema = requestSchemasByChannel[channel];
  if (!schema) {
    return genericBaseRequestSchema.parse(raw) as ValidationResult<IpcRequestFor<C>>;
  }
  return schema.parse(raw) as ValidationResult<IpcRequestFor<C>>;
}
