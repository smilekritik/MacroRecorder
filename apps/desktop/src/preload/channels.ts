/**
 * Strongly-typed IPC channel constants for Electron preload bridge.
 * Mirrors the canonical IpcChannels from shared contracts to ensure zero cross-rootDir compilation issues.
 */

export const IpcChannels = {
  // Playback & Recording
  PLAYBACK_START: 'playback:start',
  PLAYBACK_PAUSE: 'playback:pause',
  PLAYBACK_RESUME: 'playback:resume',
  PLAYBACK_STOP: 'playback:stop',
  PLAYBACK_GET_STATUS: 'playback:get-status',
  RECORDING_START: 'recording:start',
  RECORDING_PAUSE: 'recording:pause',
  RECORDING_RESUME: 'recording:resume',
  RECORDING_STOP: 'recording:stop',
  EMERGENCY_STOP: 'emergency:stop',

  // Storage & Library
  STORAGE_LOAD_LIBRARY: 'storage:load-library',
  STORAGE_SAVE_MACRO: 'storage:save-macro',
  STORAGE_DELETE_MACRO: 'storage:delete-macro',
  STORAGE_RESTORE_MACRO: 'storage:restore-macro',
  STORAGE_MOVE_MACRO: 'storage:move-macro',
  STORAGE_CREATE_FOLDER: 'storage:create-folder',
  STORAGE_DELETE_FOLDER: 'storage:delete-folder',
  STORAGE_RESTORE_FOLDER: 'storage:restore-folder',
  STORAGE_MOVE_FOLDER: 'storage:move-folder',
  STORAGE_EXPORT_MACRO: 'storage:export-macro',
  STORAGE_IMPORT_MACRO: 'storage:import-macro',
  STORAGE_EXPORT_BACKUP: 'storage:export-backup',
  STORAGE_RESTORE_BACKUP: 'storage:restore-backup',
  STORAGE_EXPORT_DIAGNOSTICS: 'storage:export-diagnostics',
  STORAGE_LOAD_RUN_HISTORY: 'storage:load-run-history',
  STORAGE_CLEAR_RUN_HISTORY: 'storage:clear-run-history',

  // Preferences
  PREFERENCES_LOAD: 'preferences:load',
  PREFERENCES_SAVE: 'preferences:save',
  PREFERENCES_RESET: 'preferences:reset',

  // Windows
  WINDOWS_GET_OPEN: 'windows:get-open',
  WINDOWS_INSPECT: 'windows:inspect',
  WINDOWS_ACTIVATE: 'windows:activate',
  WINDOWS_OPEN: 'windows:open',
  WINDOWS_CLOSE: 'windows:close',
  WINDOWS_MINIMIZE_MAIN: 'windows:minimize-main',
  WINDOWS_RESTORE_MAIN: 'windows:restore-main',

  // Gamepad
  GAMEPAD_GET_READINGS: 'gamepad:get-readings',
  GAMEPAD_INSTALL_DRIVER: 'gamepad:install-driver',
  GAMEPAD_SET_HIDING: 'gamepad:set-hiding',

  // Pixel
  PIXEL_CAPTURE: 'pixel:capture',

  // Overlay
  OVERLAY_UPDATE: 'overlay:update',
  OVERLAY_COUNTDOWN: 'overlay:countdown',
  OVERLAY_CLEAR: 'overlay:clear',
  OVERLAY_SET_PLACEMENT: 'overlay:set-placement',

  // Operating system shell
  SYSTEM_COMMAND: 'system:command',

  // IPC lifecycle
  IPC_CANCEL: 'ipc:cancel',
  IPC_SUBSCRIBE: 'ipc:subscribe',
  IPC_UNSUBSCRIBE: 'ipc:unsubscribe',
} as const;

export type IpcChannel = (typeof IpcChannels)[keyof typeof IpcChannels];
export type IpcChannelName = IpcChannel;

/**
 * Whitelisted push event channels emitted from Main to Renderer.
 */
export const IpcEventChannels = {
  PLAYBACK_STATUS_CHANGED: 'playback:status-changed',
  RECORDING_EVENT: 'recording:event',
  RECORDING_STATE_CHANGED: 'recording:state-changed',
  HOTKEY_TRIGGERED: 'hotkey:triggered',
  GAMEPAD_STATE_CHANGED: 'gamepad:state-changed',
  WINDOW_STATE_CHANGED: 'window:state-changed',
  OVERLAY_CHANGED: 'overlay:changed',
  OVERLAY_STATE: 'overlay:state',
  LIBRARY_CHANGED: 'library:changed',
} as const;

export type IpcEventChannel = (typeof IpcEventChannels)[keyof typeof IpcEventChannels];

const ALLOWED_INVOKE_CHANNELS = new Set<string>(Object.values(IpcChannels));
const ALLOWED_EVENT_CHANNELS = new Set<string>(Object.values(IpcEventChannels));

export function isAllowedInvokeChannel(channel: string): channel is IpcChannel {
  return ALLOWED_INVOKE_CHANNELS.has(channel);
}

export function isAllowedEventChannel(channel: string): channel is IpcEventChannel {
  return ALLOWED_EVENT_CHANNELS.has(channel);
}
