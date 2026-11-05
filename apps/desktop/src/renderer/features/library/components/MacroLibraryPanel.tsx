/**
 * @macro-recorder/desktop - Macro Library Panel
 * Complete sidebar panel hosting tree hierarchy, search, CRUD buttons, modals,
 * and dirty-state navigation prompts.
 */

import { useLocalization } from '../../../hooks/useLocalization.js';
import React, { useState, useCallback } from 'react';
import type { MacroDefinition } from '../../../../../../../packages/contracts/src/index.js';
import type { LibraryTreeNodeData } from '../types.js';
import { Button } from '../../../design-system/Button.js';
import { TextPromptDialog } from '../../../design-system/ConfirmDialog.js';
import { LibraryTreeView } from './LibraryTreeView.js';
import { ConfirmDeleteDialog } from './ConfirmDeleteDialog.js';
import { DirtyNavigationDialog } from './DirtyNavigationDialog.js';
import { useLibraryTree } from '../hooks/useLibraryTree.js';
import { useLibraryDragDrop } from '../hooks/useLibraryDragDrop.js';
import { useLibraryActions } from '../hooks/useLibraryActions.js';
import { useDirtyNavigation } from '../hooks/useDirtyNavigation.js';

export interface MacroLibraryPanelProps {
  readonly macros: readonly MacroDefinition[];
  readonly folders: readonly string[];
  readonly selectedMacroId?: string | null | undefined;
  readonly selectedFolder?: string | null | undefined;
  readonly onSaveMacro: (macro: MacroDefinition, touchModified?: boolean) => Promise<unknown>;
  readonly onDeleteMacro: (macroId: string) => Promise<{ token?: string } | string | unknown>;
  readonly onRestoreMacro: (params: { token: string; folderRelativePath: string; macroName: string }) => Promise<unknown>;
  readonly onMoveMacro: (params: { macroId: string; folderRelativePath: string }) => Promise<unknown>;
  readonly onCreateFolder: (folderRelativePath: string) => Promise<unknown>;
  readonly onDeleteFolder: (folderRelativePath: string) => Promise<{ token?: string } | string | unknown>;
  readonly onRestoreFolder?: ((params: { token: string; folderRelativePath: string }) => Promise<unknown>) | undefined;
  readonly onMoveFolder: (params: { sourceRelativePath: string; targetRelativePath: string }) => Promise<unknown>;
  readonly onImport?: ((targetFolder?: string) => void) | undefined;
  readonly onMacroCreated?: ((macroId: string) => void) | undefined;
  readonly onExport?: ((macro?: MacroDefinition | null) => void) | undefined;
  readonly onOpenFolderInExplorer?: ((folderPath: string) => void) | undefined;
  readonly onSelectMacro?: ((macro: MacroDefinition | null) => void) | undefined;
  readonly onSelectFolder?: ((folderPath: string | null) => void) | undefined;
  readonly onStatusMessage?: ((msg: string) => void) | undefined;
  readonly className?: string | undefined;
}

export function MacroLibraryPanel({
  macros,
  folders,
  selectedMacroId = null,
  selectedFolder: initialFolder = null,
  onSaveMacro,
  onDeleteMacro,
  onRestoreMacro,
  onMoveMacro,
  onCreateFolder,
  onDeleteFolder,
  onRestoreFolder,
  onMoveFolder,
  onImport,
  onMacroCreated,
  onExport,
  onOpenFolderInExplorer,
  onSelectMacro,
  onSelectFolder,
  onStatusMessage,
  className = '',
}: MacroLibraryPanelProps): React.ReactElement {
  // Modal states
  const { t } = useLocalization();
  const [promptDialog, setPromptDialog] = useState<{
    readonly isOpen: boolean;
    readonly title: string;
    readonly message?: string;
    readonly initialValue?: string;
    readonly placeholder?: string;
    readonly confirmLabel?: string;
    readonly onConfirm: (val: string) => void;
  } | null>(null);

  const [deleteConfirm, setDeleteConfirm] = useState<{
    readonly isOpen: boolean;
    readonly isFolder: boolean;
    readonly targetName: string;
    readonly macroCount?: number;
    readonly onConfirm: () => void;
  } | null>(null);

  // Selected macro lookup
  const currentMacro = macros.find((m) => m.id === selectedMacroId) ?? null;

  // Dirty navigation hook
  const {
    modifiedMacroIds,
    guardNavigation,
    promptState,
  } = useDirtyNavigation({
    currentMacro,
    onSaveMacro: async (m) => {
      await onSaveMacro(m, true);
    },
    onDiscardMacro: () => {
      // Discarding simply leaves unmodified state
    },
  });

  // Library Tree hook
  const {
    toggleFolder,
    expandFolder,
    collapseFolder,
    searchQuery,
    setSearchQuery,
    selectedNodeId,
    selectedMacro,
    selectedFolder: currentSelectedFolder,
    selectNode,
    selectMacro,
    selectFolder,
    treeNodes,
    flattenedVisibleNodes,
    dropTargetId,
  } = useLibraryTree({
    macros,
    folders,
    initialSelectedMacroId: selectedMacroId,
    initialSelectedFolder: initialFolder,
    modifiedMacroIds,
    onSelectionChange: (macro, folder) => {
      onSelectMacro?.(macro);
      onSelectFolder?.(folder);
    },
  });

  // Actions hook
  const {
    clipboard,
    undo,
    createMacro,
    duplicateMacro,
    renameMacro,
    deleteMacro,
    createFolder,
    renameFolder,
    deleteFolder,
    moveFolder,
    setFolderMacrosEnabled,
    copyToClipboard,
    pasteClipboard,
  } = useLibraryActions({
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
    onSelectMacro: (m) => selectMacro(m),
    onSelectFolder: (f) => selectFolder(f),
    onStatusMessage,
  });

  // Drag and drop hook
  const {
    handleDragStart,
    handleDragOver,
    handleDragLeave,
    handleDragEnd,
    handleDrop,
  } = useLibraryDragDrop({
    onMoveNode: async (dragged, destinationFolder) => {
      if (dragged.isFolder) {
        await moveFolder(dragged.relativePath, destinationFolder);
      } else if (dragged.macro) {
        await onMoveMacro({
          macroId: dragged.macro.id,
          folderRelativePath: destinationFolder,
        });
      }
    },
    onStatusMessage,
  });

  // Safe navigation wrapper
  const handleSelectNodeGuarded = useCallback(
    (node: LibraryTreeNodeData) => {
      const targetMacroId = !node.isFolder && node.macro ? node.macro.id : null;
      guardNavigation(targetMacroId, () => {
        selectNode(node.id);
      });
    },
    [guardNavigation, selectNode],
  );

  // --- Modal Triggers ---

  const handleNewFolderClick = useCallback(
    (parentPath = currentSelectedFolder ?? '') => {
      setPromptDialog({
        isOpen: true,
        title: 'New folder',
        message: parentPath
          ? `The folder will be created on disk inside: ${parentPath}`
          : 'The folder will be created in the library root.',
        initialValue: 'New folder',
        placeholder: 'Folder name',
        confirmLabel: 'Create folder',
        onConfirm: async (val) => {
          setPromptDialog(null);
          await createFolder(parentPath, val);
        },
      });
    },
    [currentSelectedFolder, createFolder],
  );

  const handleRenameNode = useCallback(
    (node: LibraryTreeNodeData) => {
      if (node.isFolder) {
        setPromptDialog({
          isOpen: true,
          title: 'Rename folder',
          message: 'The folder will be renamed on disk as well.',
          initialValue: node.name,
          placeholder: 'New folder name',
          confirmLabel: 'Rename',
          onConfirm: async (val) => {
            setPromptDialog(null);
            await renameFolder(node.relativePath, val);
          },
        });
      } else if (node.macro) {
        const macro = node.macro;
        setPromptDialog({
          isOpen: true,
          title: 'Rename macro',
          initialValue: macro.name,
          placeholder: 'New macro name',
          confirmLabel: 'Rename',
          onConfirm: async (val) => {
            setPromptDialog(null);
            await renameMacro(macro, val);
          },
        });
      }
    },
    [renameFolder, renameMacro],
  );

  const handleDeleteNode = useCallback(
    (node: LibraryTreeNodeData) => {
      if (node.isFolder) {
        setDeleteConfirm({
          isOpen: true,
          isFolder: true,
          targetName: node.name,
          macroCount: node.macroCount,
          onConfirm: async () => {
            setDeleteConfirm(null);
            await deleteFolder(node.relativePath);
          },
        });
      } else if (node.macro) {
        const macro = node.macro;
        setDeleteConfirm({
          isOpen: true,
          isFolder: false,
          targetName: macro.name,
          onConfirm: async () => {
            setDeleteConfirm(null);
            await deleteMacro(macro);
          },
        });
      }
    },
    [deleteFolder, deleteMacro],
  );

  const handleDeleteSelectedMacro = useCallback(() => {
    if (!selectedMacro) return;
    handleDeleteNode({
      id: `macro:${selectedMacro.id}`,
      isFolder: false,
      name: selectedMacro.name,
      relativePath: selectedMacro.folder ?? '',
      macro: selectedMacro,
      hotkeyDisplay: '',
      isMacroEnabled: selectedMacro.isEnabled,
      isAutomaticTrigger: false,
      isModified: false,
      isSelected: true,
      isDropTarget: false,
      tags: selectedMacro.tags ?? [],
      description: selectedMacro.description ?? '',
    });
  }, [selectedMacro, handleDeleteNode]);

  const handleDuplicateSelected = useCallback(() => {
    if (selectedMacro) {
      void duplicateMacro(selectedMacro);
    } else if (selectedNodeId?.startsWith('folder:')) {
      const folderPath = selectedNodeId.substring(7);
      copyToClipboard({
        id: selectedNodeId,
        isFolder: true,
        name: folderPath,
        relativePath: folderPath,
        parentPath: '',
        children: [],
        macroCount: 0,
        directMacroCount: 0,
        isExpanded: false,
        isSelected: true,
        isDropTarget: false,
      });
    }
  }, [selectedMacro, selectedNodeId, duplicateMacro, copyToClipboard]);

  const handleOpenFolder = useCallback(() => {
    const target = currentSelectedFolder ?? '';
    onOpenFolderInExplorer?.(target);
  }, [currentSelectedFolder, onOpenFolderInExplorer]);

  return (
    <aside
      aria-label={t('Macro library sidebar')}
      className={`reference-library flex flex-col h-full ${className}`}
    >
      <div className="reference-library-header">
        <div className="reference-library-search-row">
          <h1>{t('Macro library')}</h1>
          <input value={searchQuery} onChange={event => setSearchQuery(event.target.value)} title={t('Search by name and tags')} aria-label={t('Search by name and tags')} />
        </div>
        <div className="reference-library-actions">
          <Button variant="base" size="sm" onClick={() => void createMacro(currentSelectedFolder ?? '').then((macro) => onMacroCreated?.(macro.id))}>{t('New')}</Button>
          <Button variant="base" size="sm" onClick={handleDuplicateSelected} disabled={!selectedMacro}>{t('Copy')}</Button>
          <Button variant="base" size="sm" onClick={() => onImport?.(currentSelectedFolder ?? '')}>{t('Import')}</Button>
          <Button variant="base" size="sm" onClick={() => onExport?.(selectedMacro)}>{t('Export')}</Button>
        </div>
      </div>

      {/* Center: Tree View */}
      <div className="reference-library-tree flex-1 min-h-0">
        <LibraryTreeView
          nodes={treeNodes}
          flattenedNodes={flattenedVisibleNodes}
          selectedNodeId={selectedNodeId}
          dropTargetId={dropTargetId}
          hasClipboardContent={Boolean(clipboard)}
          onSelectNode={handleSelectNodeGuarded}
          onToggleExpand={toggleFolder}
          onExpandFolder={expandFolder}
          onCollapseFolder={collapseFolder}
          onRenameNode={handleRenameNode}
          onDeleteNode={handleDeleteNode}
          onDuplicateNode={(node) => {
            if (node.isFolder) copyToClipboard(node);
            else if (node.macro) void duplicateMacro(node.macro);
          }}
          onToggleEnableNode={async (node) => {
            if (!node.isFolder && node.macro) {
              const updated = { ...node.macro, isEnabled: !node.macro.isEnabled };
              await onSaveMacro(updated, false);
            }
          }}
          onEnableAllInside={async (fNode) => {
            await setFolderMacrosEnabled(fNode.relativePath, true);
          }}
          onDisableAllInside={async (fNode) => {
            await setFolderMacrosEnabled(fNode.relativePath, false);
          }}
          onNewFolderInside={(fNode) => handleNewFolderClick(fNode.relativePath)}
          onOpenLocation={(node) => {
            const path = node ? node.relativePath : '';
            onOpenFolderInExplorer?.(path);
          }}
          onExportMacro={(node) => {
            if (!node.isFolder && node.macro) {
              onExport?.(node.macro);
            }
          }}
          onNewMacro={() => void createMacro(currentSelectedFolder ?? '')}
          onNewFolder={() => handleNewFolderClick()}
          onPaste={() => void pasteClipboard(currentSelectedFolder ?? '')}
          onUndo={() => void undo()}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onDragEnd={handleDragEnd}
          className="h-full"
        />
      </div>

      {/* Bottom Section: Folder & Delete Buttons */}
      <div className="reference-library-bottom">
        <div className="grid grid-cols-2 gap-2">
          <Button
            variant="base"
            size="sm"
            onClick={() => handleNewFolderClick()}
            title="Creates a real folder inside the selected one"
          >
            {t('New folder')}
          </Button>
          <Button
            variant="base"
            size="sm"
            onClick={handleOpenFolder}
            title="Opens the library folder in Explorer"
          >
            {t('Open folder')}
          </Button>
        </div>

        <Button
          variant="critical-danger"
          size="sm"
          disabled={!selectedMacro}
          onClick={handleDeleteSelectedMacro}
          className="w-full justify-center"
        >
          {t('Delete macro')}
        </Button>
      </div>

      {/* Prompt Dialog (New / Rename Folder & Macro) */}
      {promptDialog && (
        <TextPromptDialog
          isOpen={promptDialog.isOpen}
          title={promptDialog.title}
          message={promptDialog.message}
          initialValue={promptDialog.initialValue}
          placeholder={promptDialog.placeholder}
          confirmLabel={promptDialog.confirmLabel}
          onConfirm={promptDialog.onConfirm}
          onCancel={() => setPromptDialog(null)}
        />
      )}

      {/* Confirm Delete Dialog */}
      {deleteConfirm && (
        <ConfirmDeleteDialog
          isOpen={deleteConfirm.isOpen}
          isFolder={deleteConfirm.isFolder}
          targetName={deleteConfirm.targetName}
          macroCount={deleteConfirm.macroCount}
          onConfirm={deleteConfirm.onConfirm}
          onCancel={() => setDeleteConfirm(null)}
        />
      )}

      {/* Dirty Navigation Dialog */}
      <DirtyNavigationDialog state={promptState} />
    </aside>
  );
}
