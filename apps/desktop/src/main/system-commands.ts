/**
 * Operations that need the operating system's shell: file pickers, Explorer, the log, and the
 * application-level changes behind Settings. Paths chosen here come from the user through native
 * dialogs; a renderer can only name locations relative to folders this application owns.
 */

import fs from 'node:fs';
import path from 'node:path';
import { BrowserWindow, app, dialog, shell, type FileFilter } from 'electron';
import type { SystemCommandRequest, SystemCommandResponse } from './ipc/types.js';
import { AppLog, AppResetManager } from './lifecycle/index.js';
import { WindowsAutostart } from './windows-integration/index.js';

export interface SystemCommandsOptions {
  readonly dataRoot: string;
  readonly libraryRoot: string;
  readonly logFilePath: string;
  readonly savePreference: (partial: Record<string, unknown>) => void;
  readonly fitWindow: (windowId: string, contentHeight: number) => boolean;
  readonly openFirstRunWelcome: () => void;
  readonly overlayReady: () => void;
  readonly setMouseThrough: (windowId: string, ignore: boolean) => boolean;
  readonly keyInfo: (virtualKey: number) => { scanCode?: number; extended?: boolean };
  readonly probeHotkeys: (gestures: readonly unknown[]) => readonly boolean[];
}

/** Resolves `relative` inside `root`, refusing anything that would leave it. */
export function resolveInside(root: string, relative: string): string | null {
  const resolved = path.resolve(root, relative);
  const fromRoot = path.relative(root, resolved);
  return fromRoot.startsWith('..') || path.isAbsolute(fromRoot) ? null : resolved;
}

function filtersOf(request: SystemCommandRequest): FileFilter[] {
  return (request.filters ?? []).map((filter) => ({ name: filter.name, extensions: [...filter.extensions] }));
}

async function openLocation(target: string): Promise<SystemCommandResponse> {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const error = await shell.openPath(target);
  return error ? { ok: false, error } : { ok: true };
}

export function createSystemCommands(options: SystemCommandsOptions) {
  return async (request: SystemCommandRequest): Promise<SystemCommandResponse> => {
    const owner = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
    switch (request.command) {
      case 'pickOpenFiles': {
        const result = await dialog.showOpenDialog(owner!, {
          ...(request.title ? { title: request.title } : {}),
          filters: filtersOf(request),
          properties: request.multiple ? ['openFile', 'multiSelections'] : ['openFile'],
        });
        return { ok: true, paths: result.canceled ? [] : result.filePaths };
      }
      case 'pickSaveFile': {
        const result = await dialog.showSaveDialog(owner!, {
          ...(request.title ? { title: request.title } : {}),
          ...(request.suggestedName ? { defaultPath: request.suggestedName } : {}),
          filters: filtersOf(request),
        });
        return { ok: true, paths: result.canceled || !result.filePath ? [] : [result.filePath] };
      }
      case 'pickFolder': {
        const result = await dialog.showOpenDialog(owner!, {
          ...(request.title ? { title: request.title } : {}),
          properties: ['openDirectory', 'createDirectory'],
        });
        return { ok: true, paths: result.canceled ? [] : result.filePaths };
      }
      case 'openLibraryFolder': {
        const macros = path.join(options.libraryRoot, 'Macros');
        const target = resolveInside(macros, request.relativePath ?? '');
        if (!target) return { ok: false, error: 'The folder is outside the macro library.' };
        fs.mkdirSync(target, { recursive: true });
        return openLocation(target);
      }
      case 'openLogFile':
        if (!fs.existsSync(options.logFilePath)) {
          fs.mkdirSync(path.dirname(options.logFilePath), { recursive: true });
          fs.writeFileSync(options.logFilePath, '');
        }
        return openLocation(options.logFilePath);
      case 'openLogFolder':
        fs.mkdirSync(path.dirname(options.logFilePath), { recursive: true });
        return openLocation(path.dirname(options.logFilePath));
      case 'setLibraryPath': {
        // The library root is fixed for a session, because stores and history are bound to it.
        options.savePreference({ macroLibraryPath: request.path ?? '' });
        app.relaunch();
        app.quit();
        return { ok: true };
      }
      case 'resetApplication': {
        const result = await AppResetManager.executeReset({
          confirmed: true,
          libraryPath: options.libraryRoot,
          preferencesPath: path.join(options.dataRoot, 'settings.json'),
          removeAutostart: async () => {
            await WindowsAutostart.setEnabled(false);
          },
        });
        if (!result.success) return { ok: false, error: result.error ?? 'Reset failed.' };
        AppLog.info('Restarting after application reset.');
        app.relaunch();
        app.quit();
        return { ok: true };
      }
      case 'fitWindow':
        return { ok: options.fitWindow(String(request.windowId ?? ''), Number(request.contentHeight ?? 0)) };
      case 'finishFirstRun':
        options.openFirstRunWelcome();
        return { ok: true };
      case 'overlayReady':
        options.overlayReady();
        return { ok: true };
      case 'setMouseThrough':
        return { ok: options.setMouseThrough(String(request.windowId ?? ''), Boolean(request.multiple)) };
      case 'keyInfo':
        return { ok: true, ...options.keyInfo(Number(request.contentHeight ?? 0)) };
      case 'probeHotkeys':
        return { ok: true, available: options.probeHotkeys(request.gestures ?? []) };
      default:
        return { ok: false, error: `Unknown command: ${String(request.command)}` };
    }
  };
}
