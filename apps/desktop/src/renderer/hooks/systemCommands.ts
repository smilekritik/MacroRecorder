/**
 * Renderer access to shell operations. Everything goes through one validated IPC command,
 * and all user-facing pickers are native dialogs owned by the main process.
 */

import { useCallback, useMemo } from 'react';
import { IpcChannels } from '../../../../../packages/contracts/src/index.js';
import { useApi } from './useApi.js';

export interface SystemFileFilter {
  readonly name: string;
  readonly extensions: readonly string[];
}

export interface SystemCommandResult {
  readonly ok: boolean;
  readonly error?: string | undefined;
  readonly paths?: readonly string[] | undefined;
  readonly scanCode?: number | undefined;
  readonly extended?: boolean | undefined;
  readonly available?: readonly boolean[] | undefined;
  readonly run?: unknown;
}

export const IMPORT_FILE_FILTERS: readonly SystemFileFilter[] = [
  { name: 'Macros', extensions: ['mrmacro', 'json', 'ahk', 'amc', 'mrf', 'au3', 'xml', 'rec'] },
  { name: 'All files', extensions: ['*'] },
];

export const EXPORT_FILE_FILTERS: readonly SystemFileFilter[] = [
  { name: 'Portable macro package', extensions: ['mrmacro'] },
  { name: 'Macro JSON', extensions: ['json'] },
  { name: 'AutoHotkey v2', extensions: ['ahk'] },
];

/** Chooses the export format from the name the user picked. */
export function exportFormatForPath(filePath: string): 'zip' | 'json' | 'ahk' {
  const lower = filePath.toLowerCase();
  if (lower.endsWith('.ahk')) return 'ahk';
  if (lower.endsWith('.json')) return 'json';
  return 'zip';
}

export function useSystemCommands() {
  const api = useApi();
  const run = useCallback(
    async (request: Record<string, unknown>): Promise<SystemCommandResult> => {
      const invoke = api.invoke as unknown as (
        channel: string,
        payload: Record<string, unknown>,
      ) => Promise<{ success: boolean; data?: SystemCommandResult; error?: { message?: string } }>;
      const result = await invoke(IpcChannels.SYSTEM_COMMAND, {
        requestId: `system-${Date.now()}-${Math.random()}`,
        ...request,
      });
      if (!result.success || !result.data) {
        return { ok: false, error: result.error?.message ?? 'The command failed.' };
      }
      return result.data;
    },
    [api],
  );

  return useMemo(
    () => ({
      pickOpenFiles: async (filters: readonly SystemFileFilter[], multiple = false, title?: string) =>
        (await run({ command: 'pickOpenFiles', filters, multiple, title })).paths ?? [],
      pickSaveFile: async (suggestedName: string, filters: readonly SystemFileFilter[], title?: string) =>
        (await run({ command: 'pickSaveFile', suggestedName, filters, title })).paths?.[0] ?? null,
      pickFolder: async (title?: string) => (await run({ command: 'pickFolder', title })).paths?.[0] ?? null,
      openLibraryFolder: (relativePath = '') => run({ command: 'openLibraryFolder', relativePath }),
      openLogFile: () => run({ command: 'openLogFile' }),
      openLogFolder: () => run({ command: 'openLogFolder' }),
      setLibraryPath: (path: string) => run({ command: 'setLibraryPath', path }),
      resetApplication: () => run({ command: 'resetApplication' }),
      fitWindow: (windowId: string, contentHeight: number) => run({ command: 'fitWindow', windowId, contentHeight }),
      finishFirstRun: () => run({ command: 'finishFirstRun' }),
      lastRun: (macroId: string) => run({ command: 'lastRun', relativePath: macroId }),
      setMouseThrough: (windowId: string, ignore: boolean) => run({ command: 'setMouseThrough', windowId, multiple: ignore }),
      keyInfo: (virtualKey: number) => run({ command: 'keyInfo', contentHeight: virtualKey }),
      probeHotkeys: (gestures: readonly unknown[]) => run({ command: 'probeHotkeys', gestures }),
    }),
    [run],
  );
}
