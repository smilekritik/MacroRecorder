/**
 * Runtime request payload validators for Electron Main IPC.
 * Strictly checks types, required properties, numerical ranges, and path capabilities
 * before request reaches domain handlers.
 */

import { IpcChannels, isKnownEventChannel, type IpcChannelName } from './channels.js';
import { validateMainFilePath, validateMainRelativePath } from './path-security.js';
import type { IpcContractMap, IpcRequestFor } from './types.js';

export interface ValidationSuccess<T> {
  readonly ok: true;
  readonly value: T;
}

export interface ValidationFailure {
  readonly ok: false;
  readonly error: string;
}

export type ValidationResult<T> = ValidationSuccess<T> | ValidationFailure;

function isObject(val: unknown): val is Record<string, unknown> {
  return typeof val === 'object' && val !== null && !Array.isArray(val);
}

function isString(val: unknown): val is string {
  return typeof val === 'string';
}

function isNumber(val: unknown): val is number {
  return typeof val === 'number' && !Number.isNaN(val) && Number.isFinite(val);
}

function isInteger(val: unknown): val is number {
  return typeof val === 'number' && Number.isInteger(val);
}

function isBoolean(val: unknown): val is boolean {
  return typeof val === 'boolean';
}

function validateBase(req: Record<string, unknown>): string | null {
  if (!isString(req.requestId) || req.requestId.trim().length === 0 || req.requestId.length > 128) {
    return 'Missing or invalid "requestId" (must be string between 1 and 128 chars)';
  }
  if (req.cancellationToken !== undefined) {
    if (!isString(req.cancellationToken) || req.cancellationToken.length > 128) {
      return 'Invalid "cancellationToken" (must be string <= 128 chars)';
    }
  }
  return null;
}

/**
 * Validates incoming IPC request payload according to its channel schema.
 */
export function validateIpcPayload<C extends IpcChannelName>(
  channel: C,
  rawPayload: unknown,
): ValidationResult<IpcRequestFor<C>> {
  if (!isObject(rawPayload)) {
    return { ok: false, error: 'Request payload must be a non-null JSON object' };
  }

  const baseError = validateBase(rawPayload);
  if (baseError) {
    return { ok: false, error: baseError };
  }

  switch (channel) {
    case IpcChannels.PLAYBACK_START: {
      if (rawPayload.macroId !== undefined && !isString(rawPayload.macroId)) {
        return { ok: false, error: 'Field "macroId" must be a string if provided' };
      }
      if (rawPayload.macro !== undefined && !isObject(rawPayload.macro)) {
        return { ok: false, error: 'Field "macro" must be an object if provided' };
      }
      if (rawPayload.speed !== undefined && (!isNumber(rawPayload.speed) || rawPayload.speed <= 0 || rawPayload.speed > 100)) {
        return { ok: false, error: 'Field "speed" must be a positive number <= 100' };
      }
      if (rawPayload.targetWindowHandle !== undefined && !isInteger(rawPayload.targetWindowHandle)) {
        return { ok: false, error: 'Field "targetWindowHandle" must be an integer' };
      }
      break;
    }

    case IpcChannels.PLAYBACK_STOP:
    case IpcChannels.EMERGENCY_STOP: {
      if (rawPayload.reason !== undefined && !isString(rawPayload.reason)) {
        return { ok: false, error: 'Field "reason" must be a string' };
      }
      break;
    }

    case IpcChannels.RECORDING_START: {
      if (rawPayload.countdownSeconds !== undefined) {
        if (!isInteger(rawPayload.countdownSeconds) || rawPayload.countdownSeconds < 0 || rawPayload.countdownSeconds > 60) {
          return { ok: false, error: 'Field "countdownSeconds" must be an integer between 0 and 60' };
        }
      }
      if (rawPayload.choice !== undefined) {
        if (!['Overwrite', 'Continue', 'Append'].includes(String(rawPayload.choice))) {
          return { ok: false, error: 'Field "choice" must be Overwrite, Continue, or Append' };
        }
      }
      if (rawPayload.options !== undefined && !isObject(rawPayload.options)) {
        return { ok: false, error: 'Field "options" must be an object' };
      }
      break;
    }

    case IpcChannels.STORAGE_SAVE_MACRO: {
      if (!isObject(rawPayload.macro)) {
        return { ok: false, error: 'Field "macro" is required and must be an object' };
      }
      if (!isString(rawPayload.macro.id) || !isString(rawPayload.macro.name) || !Array.isArray(rawPayload.macro.events)) {
        return { ok: false, error: 'Field "macro" must contain valid id, name, and events array' };
      }
      if (rawPayload.touchModified !== undefined && !isBoolean(rawPayload.touchModified)) {
        return { ok: false, error: 'Field "touchModified" must be a boolean' };
      }
      break;
    }

    case IpcChannels.STORAGE_DELETE_MACRO: {
      if (!isString(rawPayload.macroId) || rawPayload.macroId.trim().length === 0) {
        return { ok: false, error: 'Field "macroId" must be a non-empty string' };
      }
      break;
    }

    case IpcChannels.STORAGE_RESTORE_MACRO: {
      if (!isString(rawPayload.token) || rawPayload.token.trim().length === 0) {
        return { ok: false, error: 'Field "token" must be a non-empty string' };
      }
      if (!isString(rawPayload.folderRelativePath)) {
        return { ok: false, error: 'Field "folderRelativePath" must be a string' };
      }
      const pathCheck = validateMainRelativePath(rawPayload.folderRelativePath);
      if (!pathCheck.valid) {
        return { ok: false, error: pathCheck.error! };
      }
      if (!isString(rawPayload.macroName) || rawPayload.macroName.trim().length === 0) {
        return { ok: false, error: 'Field "macroName" must be a non-empty string' };
      }
      break;
    }

    case IpcChannels.STORAGE_MOVE_MACRO: {
      if (!isString(rawPayload.macroId) || rawPayload.macroId.trim().length === 0) {
        return { ok: false, error: 'Field "macroId" must be a non-empty string' };
      }
      if (!isString(rawPayload.folderRelativePath)) {
        return { ok: false, error: 'Field "folderRelativePath" must be a string' };
      }
      const pathCheck = validateMainRelativePath(rawPayload.folderRelativePath);
      if (!pathCheck.valid) {
        return { ok: false, error: pathCheck.error! };
      }
      break;
    }

    case IpcChannels.STORAGE_CREATE_FOLDER:
    case IpcChannels.STORAGE_DELETE_FOLDER: {
      if (!isString(rawPayload.folderRelativePath) || rawPayload.folderRelativePath.trim().length === 0) {
        return { ok: false, error: 'Field "folderRelativePath" must be a non-empty string' };
      }
      const pathCheck = validateMainRelativePath(rawPayload.folderRelativePath);
      if (!pathCheck.valid || !pathCheck.sanitizedPath) {
        return { ok: false, error: pathCheck.error ?? 'Folder path cannot be empty' };
      }
      break;
    }

    case IpcChannels.STORAGE_RESTORE_FOLDER: {
      if (!isString(rawPayload.token) || rawPayload.token.trim().length === 0) {
        return { ok: false, error: 'Field "token" must be a non-empty string' };
      }
      if (!isString(rawPayload.folderRelativePath)) {
        return { ok: false, error: 'Field "folderRelativePath" must be a string' };
      }
      const pathCheck = validateMainRelativePath(rawPayload.folderRelativePath);
      if (!pathCheck.valid) {
        return { ok: false, error: pathCheck.error! };
      }
      break;
    }

    case IpcChannels.STORAGE_MOVE_FOLDER: {
      if (!isString(rawPayload.sourceRelativePath) || rawPayload.sourceRelativePath.trim().length === 0) {
        return { ok: false, error: 'Field "sourceRelativePath" must be a non-empty string' };
      }
      const srcCheck = validateMainRelativePath(rawPayload.sourceRelativePath);
      if (!srcCheck.valid || !srcCheck.sanitizedPath) {
        return { ok: false, error: srcCheck.error ?? 'Source path cannot be empty' };
      }
      if (!isString(rawPayload.targetRelativePath)) {
        return { ok: false, error: 'Field "targetRelativePath" must be a string' };
      }
      const dstCheck = validateMainRelativePath(rawPayload.targetRelativePath);
      if (!dstCheck.valid) {
        return { ok: false, error: dstCheck.error! };
      }
      break;
    }

    case IpcChannels.STORAGE_EXPORT_MACRO: {
      if (!isString(rawPayload.macroId) || rawPayload.macroId.trim().length === 0) {
        return { ok: false, error: 'Field "macroId" must be a non-empty string' };
      }
      if (!['json', 'ahk', 'csv', 'zip'].includes(String(rawPayload.format))) {
        return { ok: false, error: 'Field "format" must be json, ahk, csv, or zip' };
      }
      if (!isString(rawPayload.destinationPath)) {
        return { ok: false, error: 'Field "destinationPath" must be a string' };
      }
      const fileCheck = validateMainFilePath(rawPayload.destinationPath);
      if (!fileCheck.valid) {
        return { ok: false, error: fileCheck.error! };
      }
      break;
    }

    case IpcChannels.STORAGE_IMPORT_MACRO: {
      if (!isString(rawPayload.sourcePath)) {
        return { ok: false, error: 'Field "sourcePath" must be a string' };
      }
      const fileCheck = validateMainFilePath(rawPayload.sourcePath, {
        allowedExtensions: ['.mrmacro', '.json', '.ahk', '.amc', '.mrf', '.au3', '.xml', '.rec'],
      });
      if (!fileCheck.valid) {
        return { ok: false, error: fileCheck.error! };
      }
      if (rawPayload.targetFolderRelativePath !== undefined) {
        if (!isString(rawPayload.targetFolderRelativePath)) {
          return { ok: false, error: 'Field "targetFolderRelativePath" must be a string' };
        }
        const folderCheck = validateMainRelativePath(rawPayload.targetFolderRelativePath);
        if (!folderCheck.valid) {
          return { ok: false, error: folderCheck.error! };
        }
      }
      break;
    }

    case IpcChannels.STORAGE_EXPORT_BACKUP: {
      if (!isString(rawPayload.destinationPath)) {
        return { ok: false, error: 'Field "destinationPath" must be a string' };
      }
      const fileCheck = validateMainFilePath(rawPayload.destinationPath, {
        allowedExtensions: ['.mrbackup'],
      });
      if (!fileCheck.valid) {
        return { ok: false, error: fileCheck.error! };
      }
      if (!isBoolean(rawPayload.includesSettings)) {
        return { ok: false, error: 'Field "includesSettings" must be a boolean' };
      }
      break;
    }

    case IpcChannels.STORAGE_RESTORE_BACKUP: {
      if (!isString(rawPayload.sourcePath)) {
        return { ok: false, error: 'Field "sourcePath" must be a string' };
      }
      const fileCheck = validateMainFilePath(rawPayload.sourcePath, {
        allowedExtensions: ['.mrbackup'],
      });
      if (!fileCheck.valid) {
        return { ok: false, error: fileCheck.error! };
      }
      if (!['Merge', 'Replace'].includes(String(rawPayload.mode))) {
        return { ok: false, error: 'Field "mode" must be Merge or Replace' };
      }
      break;
    }

    case IpcChannels.STORAGE_EXPORT_DIAGNOSTICS: {
      if (!['json', 'ahk', 'csv', 'zip'].includes(String(rawPayload.format))) {
        return { ok: false, error: 'Field "format" must be json, ahk, csv, or zip' };
      }
      if (!isString(rawPayload.destinationPath)) {
        return { ok: false, error: 'Field "destinationPath" must be a string' };
      }
      const fileCheck = validateMainFilePath(rawPayload.destinationPath);
      if (!fileCheck.valid) {
        return { ok: false, error: fileCheck.error! };
      }
      break;
    }

    case IpcChannels.PREFERENCES_SAVE: {
      if (!isObject(rawPayload.preferences)) {
        return { ok: false, error: 'Field "preferences" must be an object' };
      }
      break;
    }

    case IpcChannels.WINDOWS_GET_OPEN: {
      if (rawPayload.excludedProcessId !== undefined && !isInteger(rawPayload.excludedProcessId)) {
        return { ok: false, error: 'Field "excludedProcessId" must be an integer' };
      }
      break;
    }

    case IpcChannels.WINDOWS_INSPECT: {
      if (!isBoolean(rawPayload.followMouse)) {
        return { ok: false, error: 'Field "followMouse" must be a boolean' };
      }
      if (rawPayload.selfHandle !== undefined && !isInteger(rawPayload.selfHandle)) {
        return { ok: false, error: 'Field "selfHandle" must be an integer' };
      }
      if (rawPayload.ownerHandle !== undefined && !isInteger(rawPayload.ownerHandle)) {
        return { ok: false, error: 'Field "ownerHandle" must be an integer' };
      }
      break;
    }

    case IpcChannels.SYSTEM_COMMAND: {
      if (!isString(rawPayload.command) || rawPayload.command.length === 0 || rawPayload.command.length > 64) {
        return { ok: false, error: 'Field "command" must be a short non-empty string' };
      }
      break;
    }

    case IpcChannels.WINDOWS_ACTIVATE: {
      if (!isString(rawPayload.processName) || rawPayload.processName.trim().length === 0) {
        return { ok: false, error: 'Field "processName" must be a non-empty string' };
      }
      if (!isString(rawPayload.windowTitle)) {
        return { ok: false, error: 'Field "windowTitle" must be a string' };
      }
      break;
    }

    case IpcChannels.WINDOWS_OPEN: {
      if (!isString(rawPayload.windowId) || rawPayload.windowId.trim().length === 0) {
        return { ok: false, error: 'Field "windowId" must be a non-empty string' };
      }
      if (rawPayload.params !== undefined && !isObject(rawPayload.params)) {
        return { ok: false, error: 'Field "params" must be an object if provided' };
      }
      break;
    }

    case IpcChannels.WINDOWS_CLOSE: {
      if (!isString(rawPayload.windowId) || rawPayload.windowId.trim().length === 0) {
        return { ok: false, error: 'Field "windowId" must be a non-empty string' };
      }
      break;
    }

    case IpcChannels.GAMEPAD_INSTALL_DRIVER: {
      if (!['ViGEmBus', 'HidHide'].includes(String(rawPayload.driver))) {
        return { ok: false, error: 'Field "driver" must be ViGEmBus or HidHide' };
      }
      break;
    }

    case IpcChannels.GAMEPAD_SET_HIDING: {
      if (!isBoolean(rawPayload.hide)) {
        return { ok: false, error: 'Field "hide" must be a boolean' };
      }
      break;
    }

    case IpcChannels.PIXEL_CAPTURE: {
      if (!isInteger(rawPayload.x) || !isInteger(rawPayload.y)) {
        return { ok: false, error: 'Fields "x" and "y" must be integers' };
      }
      break;
    }

    case IpcChannels.OVERLAY_UPDATE: {
      if (!isString(rawPayload.macroId) || !isString(rawPayload.macroName)) {
        return { ok: false, error: 'Fields "macroId" and "macroName" must be strings' };
      }
      if (!['Idle', 'Recording', 'Playing', 'Paused', 'Stopping'].includes(String(rawPayload.state))) {
        return { ok: false, error: 'Field "state" must be a valid EngineState' };
      }
      break;
    }

    case IpcChannels.OVERLAY_COUNTDOWN: {
      if (!isInteger(rawPayload.seconds) || rawPayload.seconds < 0 || rawPayload.seconds > 60) {
        return { ok: false, error: 'Field "seconds" must be an integer between 0 and 60' };
      }
      break;
    }

    case IpcChannels.OVERLAY_SET_PLACEMENT: {
      const { infoX, infoY, annotationX, annotationY } = rawPayload;
      if (!isNumber(infoX) || !isNumber(infoY) || !isNumber(annotationX) || !isNumber(annotationY)) {
        return { ok: false, error: 'Overlay coordinate fractions must be valid numbers' };
      }
      break;
    }

    case IpcChannels.IPC_CANCEL: {
      if (!isString(rawPayload.targetRequestId) || rawPayload.targetRequestId.trim().length === 0) {
        return { ok: false, error: 'Field "targetRequestId" must be a non-empty string' };
      }
      if (rawPayload.reason !== undefined && !isString(rawPayload.reason)) {
        return { ok: false, error: 'Field "reason" must be a string' };
      }
      break;
    }

    case IpcChannels.IPC_SUBSCRIBE:
    case IpcChannels.IPC_UNSUBSCRIBE: {
      if (!isString(rawPayload.channel) || !isKnownEventChannel(rawPayload.channel)) {
        return { ok: false, error: 'Field "channel" must be an allowed push event channel' };
      }
      break;
    }
  }

  return { ok: true, value: rawPayload as unknown as IpcContractMap[C]['request'] };
}
