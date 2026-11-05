/**
 * Preload script entry point for Macro Recorder.
 * Exposes narrow, capability-based APIs to the unprivileged renderer via contextBridge.
 * Strictly adheres to:
 * - contextIsolation enabled
 * - nodeIntegration disabled
 * - No Node, filesystem, shell, registry, or native-addon access exposed
 * - No generic invoke, execute, readFile, writeFile, openPath, or arbitrary channel bridge exists
 */

import { contextBridge, ipcRenderer } from 'electron';
import { createApiBridge } from './api-bridge.js';
import type { MacroRecorderApi, MacroRecorderCapabilities } from './types.js';

export * from './channels.js';
export * from './types.js';
export * from './path-guard.js';
export * from './capabilities.js';
export * from './api-bridge.js';

/**
 * Recursively freezes an object to prevent runtime tampering or prototype pollution in the renderer.
 */
function deepFreeze<T extends object>(obj: T): Readonly<T> {
  Object.freeze(obj);
  for (const key of Object.getOwnPropertyNames(obj)) {
    const value = (obj as Record<string, unknown>)[key];
    if (value !== null && (typeof value === 'object' || typeof value === 'function') && !Object.isFrozen(value)) {
      deepFreeze(value as object);
    }
  }
  return obj;
}

/**
 * Initializes and exposes the preload APIs to the window context.
 */
export function initializePreload(rendererBridge = ipcRenderer): void {
  const { api, disposeAll } = createApiBridge(rendererBridge);

  // Expose standard MacroRecorderApi (used by React useApi/useIpcQuery/useIpcMutation hooks)
  const frozenApi: MacroRecorderApi = deepFreeze(api);
  contextBridge.exposeInMainWorld('macroRecorderApi', frozenApi);

  // Also expose the pure capability-based interface under window.macroRecorder
  const capabilities: MacroRecorderCapabilities = {
    library: frozenApi.library,
    recording: frozenApi.recording,
    playback: frozenApi.playback,
    hotkeys: frozenApi.hotkeys,
    windows: frozenApi.windows,
    pixels: frozenApi.pixels,
    gamepads: frozenApi.gamepads,
    overlays: frozenApi.overlays,
    settings: frozenApi.settings,
    imports: frozenApi.imports,
    exports: frozenApi.exports,
    diagnostics: frozenApi.diagnostics,
    cancellation: frozenApi.cancellation,
  };
  contextBridge.exposeInMainWorld('macroRecorder', deepFreeze(capabilities));

  // Automatically dispose all active push subscriptions when the window navigates or unloads
  if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
    window.addEventListener('beforeunload', () => {
      disposeAll();
    });
  }
}

// Self-initialize if running in Electron renderer/preload context
if (typeof process !== 'undefined' && process.type === 'renderer') {
  initializePreload();
}
