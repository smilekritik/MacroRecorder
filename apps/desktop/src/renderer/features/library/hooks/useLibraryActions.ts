/**
 * @macro-recorder/desktop - Library Actions Hook & Core Operations
 * Complete CRUD, copy/duplicate, move, rename, bulk toggle, undo stack,
 * and clipboard operations.
 */

import { useState, useCallback, useRef } from 'react';
import {
  type MacroDefinition,
  createDefaultMacroDefinition,
} from '../../../../../../../packages/contracts/src/index.js';
import type {
  LibraryTreeNodeData,
  LibraryClipboardItem,
  LibraryUndoAction,
} from '../types.js';
import {
  normalizeFolder,
  folderName,
  parentFolder,
} from '../utils/tree-builder.js';
import {
  resolveUniqueMacroName,
  resolveUniqueFolderName,
  sanitizeName,
} from '../utils/naming.js';
import { findHotkeyConflict } from '../utils/hotkey.js';

// --- Pure Action Operations ---

export interface CreateMacroParams {
  readonly macros: readonly MacroDefinition[];
  readonly targetFolder?: string | undefined;
  readonly onSaveMacro: (macro: MacroDefinition, touchModified?: boolean) => Promise<unknown>;
}

export async function createMacroAction({
  macros,
  targetFolder = '',
  onSaveMacro,
}: CreateMacroParams): Promise<MacroDefinition> {
  const normFolder = normalizeFolder(targetFolder);
  const uniqueName = resolveUniqueMacroName(
    'New macro',
    macros.map((m) => m.name),
  );

  const newMacro = createDefaultMacroDefinition({
    name: uniqueName,
    folder: normFolder,
    description: '',
    isEnabled: true,
    tags: [],
    events: [],
  });

  await onSaveMacro(newMacro, true);
  return newMacro;
}

export interface DuplicateMacroParams {
  readonly sourceMacro: MacroDefinition;
  readonly targetFolder?: string | undefined;
  readonly allMacros: readonly MacroDefinition[];
  readonly onSaveMacro: (macro: MacroDefinition, touchModified?: boolean) => Promise<unknown>;
}

export async function duplicateMacroAction({
  sourceMacro,
  targetFolder,
  allMacros,
  onSaveMacro,
}: DuplicateMacroParams): Promise<MacroDefinition> {
  const destinationFolder =
    targetFolder !== undefined ? normalizeFolder(targetFolder) : normalizeFolder(sourceMacro.folder);

  const uniqueName = resolveUniqueMacroName(
    sourceMacro.name,
    allMacros.map((m) => m.name),
  );

  const copyMacro: MacroDefinition = {
    ...sourceMacro,
    id: crypto.randomUUID(),
    name: uniqueName,
    folder: destinationFolder,
    modifiedAt: new Date().toISOString(),
    tags: [...(sourceMacro.tags ?? [])],
    events: [...(sourceMacro.events ?? [])],
  };

  await onSaveMacro(copyMacro, true);
  return copyMacro;
}

export interface RenameMacroParams {
  readonly macro: MacroDefinition;
  readonly newName: string;
  readonly allMacros: readonly MacroDefinition[];
  readonly onSaveMacro: (macro: MacroDefinition, touchModified?: boolean) => Promise<unknown>;
}

export async function renameMacroAction({
  macro,
  newName,
  allMacros,
  onSaveMacro,
}: RenameMacroParams): Promise<string> {
  const previousName = macro.name;
  const cleanDesired = sanitizeName(newName, previousName);
  const unique = resolveUniqueMacroName(
    cleanDesired,
    allMacros.map((m) => m.name),
    macro.id,
  );

  if (unique === previousName) {
    return previousName;
  }

  const updated: MacroDefinition = {
    ...macro,
    name: unique,
    modifiedAt: new Date().toISOString(),
  };

  await onSaveMacro(updated, true);
  return unique;
}

export interface DeleteMacroParams {
  readonly macro: MacroDefinition;
  readonly onDeleteMacro: (macroId: string) => Promise<{ token?: string } | string | unknown>;
}

export async function deleteMacroAction({
  macro,
  onDeleteMacro,
}: DeleteMacroParams): Promise<string> {
  const res = await onDeleteMacro(macro.id);
  return typeof res === 'string' ? res : (res as { token?: string })?.token ?? '';
}

export interface MoveMacroParams {
  readonly macro: MacroDefinition;
  readonly targetFolder: string;
  readonly onMoveMacro: (params: { macroId: string; folderRelativePath: string }) => Promise<unknown>;
}

export async function moveMacroAction({
  macro,
  targetFolder,
  onMoveMacro,
}: MoveMacroParams): Promise<boolean> {
  const previousFolder = normalizeFolder(macro.folder);
  const destination = normalizeFolder(targetFolder);

  if (previousFolder.toLowerCase() === destination.toLowerCase()) {
    return false;
  }

  await onMoveMacro({ macroId: macro.id, folderRelativePath: destination });
  return true;
}

export interface ToggleMacroParams {
  readonly macro: MacroDefinition;
  readonly allMacros: readonly MacroDefinition[];
  readonly enabled?: boolean | undefined;
  readonly onSaveMacro: (macro: MacroDefinition, touchModified?: boolean) => Promise<unknown>;
}

export async function toggleMacroEnabledAction({
  macro,
  allMacros,
  enabled,
  onSaveMacro,
}: ToggleMacroParams): Promise<{ success: boolean; newEnabled: boolean; reason?: string }> {
  const nextEnabled = enabled !== undefined ? enabled : !macro.isEnabled;
  if (nextEnabled === macro.isEnabled) {
    return { success: true, newEnabled: nextEnabled };
  }

  if (nextEnabled) {
    const conflict = findHotkeyConflict(macro.hotkey, macro.id, allMacros);
    if (conflict) {
      return {
        success: false,
        newEnabled: macro.isEnabled,
        reason: `Cannot enable: shortcut is already used by macro “${conflict.name}”.`,
      };
    }
  }

  const updated: MacroDefinition = {
    ...macro,
    isEnabled: nextEnabled,
    modifiedAt: new Date().toISOString(),
  };

  await onSaveMacro(updated, true);
  return { success: true, newEnabled: nextEnabled };
}

export interface CreateFolderParams {
  readonly parentPath?: string | undefined;
  readonly folderNameInput?: string | undefined;
  readonly allFolders: readonly string[];
  readonly onCreateFolder: (folderRelativePath: string) => Promise<unknown>;
}

export async function createFolderAction({
  parentPath = '',
  folderNameInput = 'New folder',
  allFolders,
  onCreateFolder,
}: CreateFolderParams): Promise<string> {
  const normParent = normalizeFolder(parentPath);
  const uniqueName = resolveUniqueFolderName(folderNameInput, normParent, allFolders);
  const relativePath = normParent ? `${normParent}/${uniqueName}` : uniqueName;

  await onCreateFolder(relativePath);
  return relativePath;
}

export interface RenameFolderParams {
  readonly oldRelativePath: string;
  readonly newName: string;
  readonly allFolders: readonly string[];
  readonly onMoveFolder: (params: { sourceRelativePath: string; targetRelativePath: string }) => Promise<unknown>;
}

export async function renameFolderAction({
  oldRelativePath,
  newName,
  allFolders,
  onMoveFolder,
}: RenameFolderParams): Promise<string> {
  const normOld = normalizeFolder(oldRelativePath);
  const currentParent = parentFolder(normOld);
  const uniqueName = resolveUniqueFolderName(newName, currentParent, allFolders);
  const newRelativePath = currentParent ? `${currentParent}/${uniqueName}` : uniqueName;

  if (newRelativePath.toLowerCase() === normOld.toLowerCase()) {
    return normOld;
  }

  await onMoveFolder({
    sourceRelativePath: normOld,
    targetRelativePath: newRelativePath,
  });

  return newRelativePath;
}

export interface DeleteFolderParams {
  readonly folderRelativePath: string;
  readonly onDeleteFolder: (folderRelativePath: string) => Promise<{ token?: string } | string | unknown>;
}

export async function deleteFolderAction({
  folderRelativePath,
  onDeleteFolder,
}: DeleteFolderParams): Promise<string> {
  const norm = normalizeFolder(folderRelativePath);
  const res = await onDeleteFolder(norm);
  return typeof res === 'string' ? res : (res as { token?: string })?.token ?? '';
}

export interface MoveFolderParams {
  readonly sourcePath: string;
  readonly destinationParentPath: string;
  readonly onMoveFolder: (params: { sourceRelativePath: string; targetRelativePath: string }) => Promise<unknown>;
}

export async function moveFolderAction({
  sourcePath,
  destinationParentPath,
  onMoveFolder,
}: MoveFolderParams): Promise<string> {
  const normSource = normalizeFolder(sourcePath);
  const normDestParent = normalizeFolder(destinationParentPath);
  const name = folderName(normSource);
  const targetPath = normDestParent ? `${normDestParent}/${name}` : name;

  if (targetPath.toLowerCase() === normSource.toLowerCase()) {
    return normSource;
  }

  await onMoveFolder({
    sourceRelativePath: normSource,
    targetRelativePath: targetPath,
  });

  return targetPath;
}

export interface SetFolderMacrosEnabledParams {
  readonly folderPath: string;
  readonly enabled: boolean;
  readonly macros: readonly MacroDefinition[];
  readonly onSaveMacro: (macro: MacroDefinition, touchModified?: boolean) => Promise<unknown>;
}

export async function setFolderMacrosEnabledAction({
  folderPath,
  enabled,
  macros,
  onSaveMacro,
}: SetFolderMacrosEnabledParams): Promise<{ changed: number; skipped: number }> {
  const norm = normalizeFolder(folderPath).toLowerCase();
  const inFolder = macros.filter((m) => {
    const mf = normalizeFolder(m.folder).toLowerCase();
    if (norm.length === 0) return true; // root enables/disables all
    return mf === norm || mf.startsWith(`${norm}/`);
  });

  let changed = 0;
  let skipped = 0;

  for (const m of inFolder) {
    if (m.isEnabled === enabled) continue;

    if (enabled) {
      const conflict = findHotkeyConflict(m.hotkey, m.id, macros);
      if (conflict) {
        skipped++;
        continue;
      }
    }

    const updated: MacroDefinition = {
      ...m,
      isEnabled: enabled,
      modifiedAt: new Date().toISOString(),
    };

    await onSaveMacro(updated, false);
    changed++;
  }

  return { changed, skipped };
}

// --- React Hook ---

export interface UseLibraryActionsProps {
  readonly macros: readonly MacroDefinition[];
  readonly folders: readonly string[];
  readonly onSaveMacro: (macro: MacroDefinition, touchModified?: boolean) => Promise<unknown>;
  readonly onDeleteMacro: (macroId: string) => Promise<{ token?: string } | string | unknown>;
  readonly onRestoreMacro: (params: { token: string; folderRelativePath: string; macroName: string }) => Promise<unknown>;
  readonly onMoveMacro: (params: { macroId: string; folderRelativePath: string }) => Promise<unknown>;
  readonly onCreateFolder: (folderRelativePath: string) => Promise<unknown>;
  readonly onDeleteFolder: (folderRelativePath: string) => Promise<{ token?: string } | string | unknown>;
  readonly onRestoreFolder?: ((params: { token: string; folderRelativePath: string }) => Promise<unknown>) | undefined;
  readonly onMoveFolder: (params: { sourceRelativePath: string; targetRelativePath: string }) => Promise<unknown>;
  readonly onSelectMacro?: ((macro: MacroDefinition | null) => void) | undefined;
  readonly onSelectFolder?: ((folderPath: string | null) => void) | undefined;
  readonly onStatusMessage?: ((msg: string) => void) | undefined;
}

export function useLibraryActions({
  macros,
  folders,
  onSaveMacro,
  onDeleteMacro,
  onRestoreMacro,
  onMoveMacro,
  onCreateFolder,
  onDeleteFolder,
  onRestoreFolder,
  onMoveFolder,
  onSelectMacro,
  onSelectFolder,
  onStatusMessage,
}: UseLibraryActionsProps) {
  const [clipboard, setClipboard] = useState<LibraryClipboardItem | null>(null);
  const undoStackRef = useRef<LibraryUndoAction[]>([]);
  const [canUndo, setCanUndo] = useState<boolean>(false);
  const [lastUndoTitle, setLastUndoTitle] = useState<string>('');

  const reportStatus = useCallback(
    (msg: string) => {
      onStatusMessage?.(msg);
    },
    [onStatusMessage],
  );

  const pushUndo = useCallback((action: LibraryUndoAction) => {
    undoStackRef.current.push(action);
    setCanUndo(true);
    setLastUndoTitle(action.title);
  }, []);

  const undo = useCallback(async () => {
    const action = undoStackRef.current.pop();
    setCanUndo(undoStackRef.current.length > 0);
    setLastUndoTitle(undoStackRef.current[undoStackRef.current.length - 1]?.title ?? '');

    if (!action) {
      reportStatus('Nothing to undo.');
      return;
    }

    try {
      await action.undo();
      reportStatus(`Undone: ${action.title}.`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      reportStatus(`Undo failed: ${msg}`);
    }
  }, [reportStatus]);

  // --- Macro Operations ---

  const createMacro = useCallback(
    async (targetFolder = ''): Promise<MacroDefinition> => {
      const newMacro = await createMacroAction({ macros, targetFolder, onSaveMacro });
      onSelectMacro?.(newMacro);
      reportStatus(`Macro created: “${newMacro.name}”.`);
      return newMacro;
    },
    [macros, onSaveMacro, onSelectMacro, reportStatus],
  );

  const duplicateMacro = useCallback(
    async (sourceMacro: MacroDefinition, targetFolder?: string): Promise<MacroDefinition> => {
      const copyMacro = await duplicateMacroAction({
        sourceMacro,
        targetFolder,
        allMacros: macros,
        onSaveMacro,
      });

      pushUndo({
        title: `copying “${copyMacro.name}”`,
        undo: async () => {
          await onDeleteMacro(copyMacro.id);
        },
      });

      onSelectMacro?.(copyMacro);
      reportStatus(`Copy created: “${copyMacro.name}”.`);
      return copyMacro;
    },
    [macros, onSaveMacro, onDeleteMacro, onSelectMacro, pushUndo, reportStatus],
  );

  const renameMacro = useCallback(
    async (macro: MacroDefinition, newName: string): Promise<string> => {
      const previousName = macro.name;
      const cleanDesired = sanitizeName(newName, previousName);
      const unique = await renameMacroAction({
        macro,
        newName,
        allMacros: macros,
        onSaveMacro,
      });

      pushUndo({
        title: `renaming to “${unique}”`,
        undo: async () => {
          const reverted: MacroDefinition = {
            ...macro,
            name: previousName,
            modifiedAt: new Date().toISOString(),
          };
          await onSaveMacro(reverted, true);
        },
      });

      if (unique !== cleanDesired) {
        reportStatus(`The name “${cleanDesired}” is already taken; renamed to “${unique}”.`);
      } else {
        reportStatus(`Macro renamed to “${unique}”.`);
      }

      return unique;
    },
    [macros, onSaveMacro, pushUndo, reportStatus],
  );

  const deleteMacro = useCallback(
    async (macro: MacroDefinition): Promise<void> => {
      const name = macro.name;
      const folder = normalizeFolder(macro.folder);
      const token = await deleteMacroAction({ macro, onDeleteMacro });

      if (token) {
        pushUndo({
          title: `deleting “${name}”`,
          undo: async () => {
            await onRestoreMacro({ token, folderRelativePath: folder, macroName: name });
          },
        });
      }

      onSelectMacro?.(null);
      reportStatus(`Macro deleted: “${name}”. Ctrl+Z restores it from the trash.`);
    },
    [onDeleteMacro, onRestoreMacro, onSelectMacro, pushUndo, reportStatus],
  );

  const moveMacro = useCallback(
    async (macro: MacroDefinition, targetFolder: string): Promise<void> => {
      const previousFolder = normalizeFolder(macro.folder);
      const destination = normalizeFolder(targetFolder);

      const moved = await moveMacroAction({ macro, targetFolder: destination, onMoveMacro });
      if (!moved) return;

      pushUndo({
        title: `moving “${macro.name}”`,
        undo: async () => {
          await onMoveMacro({ macroId: macro.id, folderRelativePath: previousFolder });
        },
      });

      const display = destination.length === 0 ? 'library root' : `folder “${destination}”`;
      reportStatus(`“${macro.name}” moved to ${display}.`);
    },
    [onMoveMacro, pushUndo, reportStatus],
  );

  const toggleMacroEnabled = useCallback(
    async (macro: MacroDefinition, enabled?: boolean): Promise<boolean> => {
      const res = await toggleMacroEnabledAction({
        macro,
        allMacros: macros,
        enabled,
        onSaveMacro,
      });

      if (!res.success && res.reason) {
        reportStatus(res.reason);
      } else if (res.success) {
        reportStatus(res.newEnabled ? `Macro enabled: “${macro.name}”.` : `Macro disabled: “${macro.name}”.`);
      }

      return res.newEnabled;
    },
    [macros, onSaveMacro, reportStatus],
  );

  // --- Folder Operations ---

  const createFolder = useCallback(
    async (parentPath = '', folderNameInput = 'New folder'): Promise<string> => {
      const relativePath = await createFolderAction({
        parentPath,
        folderNameInput,
        allFolders: folders,
        onCreateFolder,
      });

      const name = folderName(relativePath);

      pushUndo({
        title: `creating folder “${name}”`,
        undo: async () => {
          await onDeleteFolder(relativePath);
        },
      });

      onSelectFolder?.(relativePath);
      reportStatus(`Folder created: “${relativePath}”.`);
      return relativePath;
    },
    [folders, onCreateFolder, onDeleteFolder, onSelectFolder, pushUndo, reportStatus],
  );

  const renameFolder = useCallback(
    async (oldRelativePath: string, newName: string): Promise<string> => {
      const newRelativePath = await renameFolderAction({
        oldRelativePath,
        newName,
        allFolders: folders,
        onMoveFolder,
      });

      const uniqueName = folderName(newRelativePath);

      pushUndo({
        title: `renaming folder to “${uniqueName}”`,
        undo: async () => {
          await onMoveFolder({
            sourceRelativePath: newRelativePath,
            targetRelativePath: oldRelativePath,
          });
        },
      });

      onSelectFolder?.(newRelativePath);
      reportStatus(`Folder renamed: “${newRelativePath}”.`);
      return newRelativePath;
    },
    [folders, onMoveFolder, onSelectFolder, pushUndo, reportStatus],
  );

  const deleteFolder = useCallback(
    async (folderRelativePath: string): Promise<void> => {
      const norm = normalizeFolder(folderRelativePath);
      const name = folderName(norm);
      const token = await deleteFolderAction({ folderRelativePath: norm, onDeleteFolder });

      if (token && onRestoreFolder) {
        pushUndo({
          title: `deleting folder “${name}”`,
          undo: async () => {
            await onRestoreFolder({ token, folderRelativePath: norm });
          },
        });
      }

      onSelectFolder?.(null);
      reportStatus(`Folder deleted: “${name}”. Ctrl+Z restores it from the trash.`);
    },
    [onDeleteFolder, onRestoreFolder, onSelectFolder, pushUndo, reportStatus],
  );

  const moveFolder = useCallback(
    async (sourcePath: string, destinationParentPath: string): Promise<string> => {
      const name = folderName(sourcePath);
      const previousParent = parentFolder(sourcePath);
      const targetPath = await moveFolderAction({
        sourcePath,
        destinationParentPath,
        onMoveFolder,
      });

      pushUndo({
        title: `moving folder “${name}”`,
        undo: async () => {
          const originalTarget = previousParent ? `${previousParent}/${name}` : name;
          await onMoveFolder({
            sourceRelativePath: targetPath,
            targetRelativePath: originalTarget,
          });
        },
      });

      reportStatus(`Folder moved: “${targetPath}”.`);
      return targetPath;
    },
    [onMoveFolder, pushUndo, reportStatus],
  );

  const setFolderMacrosEnabled = useCallback(
    async (folderPath: string, enabled: boolean): Promise<{ changed: number; skipped: number }> => {
      const res = await setFolderMacrosEnabledAction({
        folderPath,
        enabled,
        macros,
        onSaveMacro,
      });

      if (res.changed === 0 && res.skipped === 0) {
        reportStatus(
          enabled ? 'Every macro is already enabled.' : 'Every macro is already disabled.',
        );
      } else if (res.skipped === 0) {
        reportStatus(enabled ? `Macros enabled: ${res.changed}.` : `Macros disabled: ${res.changed}.`);
      } else {
        reportStatus(
          enabled
            ? `Macros enabled: ${res.changed}, skipped due to shortcut binding: ${res.skipped}.`
            : `Macros disabled: ${res.changed}, skipped: ${res.skipped}.`,
        );
      }

      return res;
    },
    [macros, onSaveMacro, reportStatus],
  );

  // --- Clipboard (Copy / Paste) ---

  const copyToClipboard = useCallback(
    (node: LibraryTreeNodeData) => {
      if (node.isFolder) {
        setClipboard({
          type: 'folder',
          folderRelativePath: node.relativePath,
          name: node.name,
        });
        reportStatus(`Folder “${node.name}” copied. Ctrl+V pastes a copy of it.`);
      } else {
        setClipboard({
          type: 'macro',
          macro: node.macro,
          name: node.name,
        });
        reportStatus(`Macro “${node.name}” copied. Ctrl+V pastes a copy of it.`);
      }
    },
    [reportStatus],
  );

  const pasteClipboard = useCallback(
    async (targetFolder = ''): Promise<void> => {
      if (!clipboard) {
        reportStatus('The library clipboard is empty: copy a macro or folder with Ctrl+C first.');
        return;
      }

      if (clipboard.type === 'macro' && clipboard.macro) {
        await duplicateMacro(clipboard.macro, targetFolder);
      } else if (clipboard.type === 'folder' && clipboard.folderRelativePath !== undefined) {
        const sourcePath = clipboard.folderRelativePath;
        const baseName = folderName(sourcePath) || 'Folder';
        const newFolderPath = await createFolder(targetFolder, `${baseName} (Copy)`);

        const normSource = normalizeFolder(sourcePath).toLowerCase();
        const macrosInSource = macros.filter(
          (m) => normalizeFolder(m.folder).toLowerCase() === normSource,
        );

        for (const m of macrosInSource) {
          await duplicateMacro(m, newFolderPath);
        }

        reportStatus(`Folder copy created: “${newFolderPath}”.`);
      }
    },
    [clipboard, duplicateMacro, createFolder, macros, reportStatus],
  );

  return {
    clipboard,
    canUndo,
    lastUndoTitle,
    undo,
    createMacro,
    duplicateMacro,
    renameMacro,
    deleteMacro,
    moveMacro,
    toggleMacroEnabled,
    createFolder,
    renameFolder,
    deleteFolder,
    moveFolder,
    setFolderMacrosEnabled,
    copyToClipboard,
    pasteClipboard,
  };
}
