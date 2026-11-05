/**
 * @macro-recorder/desktop - Library Context Menu
 * Themed popup context menu, macros, and background.
 */

import React, { useEffect, useRef, useCallback } from 'react';
import type { LibraryTreeNodeData } from '../types.js';

export interface ContextMenuPosition {
  readonly x: number;
  readonly y: number;
}

export interface LibraryContextMenuProps {
  readonly node: LibraryTreeNodeData | null; // null for blank library background
  readonly position: ContextMenuPosition | null;
  readonly hasClipboardContent?: boolean | undefined;
  readonly onClose: () => void;
  readonly onRename?: ((node: LibraryTreeNodeData) => void) | undefined;
  readonly onDuplicate?: ((node: LibraryTreeNodeData) => void) | undefined;
  readonly onToggleEnable?: ((node: LibraryTreeNodeData) => void) | undefined;
  readonly onEnableAllInside?: ((folderNode: LibraryTreeNodeData) => void) | undefined;
  readonly onDisableAllInside?: ((folderNode: LibraryTreeNodeData) => void) | undefined;
  readonly onNewFolderInside?: ((folderNode: LibraryTreeNodeData) => void) | undefined;
  readonly onOpenLocation?: ((node: LibraryTreeNodeData | null) => void) | undefined;
  readonly onExportMacro?: ((node: LibraryTreeNodeData) => void) | undefined;
  readonly onDelete?: ((node: LibraryTreeNodeData) => void) | undefined;
  readonly onNewMacro?: (() => void) | undefined;
  readonly onNewFolder?: (() => void) | undefined;
  readonly onPaste?: (() => void) | undefined;
}

export function LibraryContextMenu({
  node,
  position,
  hasClipboardContent = false,
  onClose,
  onRename,
  onDuplicate,
  onToggleEnable,
  onEnableAllInside,
  onDisableAllInside,
  onNewFolderInside,
  onOpenLocation,
  onExportMacro,
  onDelete,
  onNewMacro,
  onNewFolder,
  onPaste,
}: LibraryContextMenuProps): React.ReactElement | null {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        onClose();
      }
    }

    window.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  const handleAction = useCallback(
    (action?: () => void) => {
      onClose();
      action?.();
    },
    [onClose],
  );

  if (!position) return null;

  // Prevent overflowing window bounds
  const adjustedX = Math.min(position.x, window.innerWidth - 240);
  const adjustedY = Math.min(position.y, window.innerHeight - 300);

  return (
    <div
      ref={menuRef}
      role="menu"
      style={{ top: `${adjustedY}px`, left: `${adjustedX}px` }}
      className="fixed z-50 min-w-[220px] py-1.5 rounded-[8px] bg-[var(--color-surface-raised)] border border-[var(--color-border-subtle)] shadow-lg text-[13px] text-[var(--color-text-primary)] animate-in fade-in zoom-in-95 duration-100"
    >
      {node === null ? (
        // Background Context Menu
        <>
          <button
            type="button"
            role="menuitem"
            onClick={() => handleAction(onNewMacro)}
            className="w-full text-left px-3 py-1.5 hover:bg-[var(--color-surface-hover)] focus:bg-[var(--color-surface-hover)] outline-none flex items-center justify-between"
          >
            <span>New macro</span>
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => handleAction(onNewFolder)}
            className="w-full text-left px-3 py-1.5 hover:bg-[var(--color-surface-hover)] focus:bg-[var(--color-surface-hover)] outline-none flex items-center justify-between"
          >
            <span>New folder</span>
          </button>
          {hasClipboardContent && (
            <button
              type="button"
              role="menuitem"
              onClick={() => handleAction(onPaste)}
              className="w-full text-left px-3 py-1.5 hover:bg-[var(--color-surface-hover)] focus:bg-[var(--color-surface-hover)] outline-none flex items-center justify-between"
            >
              <span>Paste</span>
              <span className="text-[11px] text-[var(--color-text-muted)]">Ctrl+V</span>
            </button>
          )}
          <div className="my-1 border-t border-[var(--color-border-subtle)]" />
          <button
            type="button"
            role="menuitem"
            onClick={() => handleAction(() => onOpenLocation?.(null))}
            className="w-full text-left px-3 py-1.5 hover:bg-[var(--color-surface-hover)] focus:bg-[var(--color-surface-hover)] outline-none flex items-center justify-between"
          >
            <span>Open library folder</span>
          </button>
        </>
      ) : node.isFolder ? (
        // Folder Context Menu
        <>
          <button
            type="button"
            role="menuitem"
            onClick={() => handleAction(() => onRename?.(node))}
            className="w-full text-left px-3 py-1.5 hover:bg-[var(--color-surface-hover)] focus:bg-[var(--color-surface-hover)] outline-none flex items-center justify-between"
          >
            <span>Rename</span>
            <span className="text-[11px] text-[var(--color-text-muted)]">F2</span>
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => handleAction(() => onEnableAllInside?.(node))}
            className="w-full text-left px-3 py-1.5 hover:bg-[var(--color-surface-hover)] focus:bg-[var(--color-surface-hover)] outline-none flex items-center justify-between"
          >
            <span>Enable every macro inside</span>
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => handleAction(() => onDisableAllInside?.(node))}
            className="w-full text-left px-3 py-1.5 hover:bg-[var(--color-surface-hover)] focus:bg-[var(--color-surface-hover)] outline-none flex items-center justify-between"
          >
            <span>Disable every macro inside</span>
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => handleAction(() => onNewFolderInside?.(node))}
            className="w-full text-left px-3 py-1.5 hover:bg-[var(--color-surface-hover)] focus:bg-[var(--color-surface-hover)] outline-none flex items-center justify-between"
          >
            <span>New folder inside</span>
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => handleAction(() => onOpenLocation?.(node))}
            className="w-full text-left px-3 py-1.5 hover:bg-[var(--color-surface-hover)] focus:bg-[var(--color-surface-hover)] outline-none flex items-center justify-between"
          >
            <span>Open location</span>
          </button>
          <div className="my-1 border-t border-[var(--color-border-subtle)]" />
          <button
            type="button"
            role="menuitem"
            onClick={() => handleAction(() => onDelete?.(node))}
            className="w-full text-left px-3 py-1.5 text-[var(--color-danger)] hover:bg-[var(--color-danger-surface)] focus:bg-[var(--color-danger-surface)] outline-none flex items-center justify-between"
          >
            <span>Delete</span>
            <span className="text-[11px] opacity-80">Del</span>
          </button>
        </>
      ) : (
        // Macro Context Menu
        <>
          <button
            type="button"
            role="menuitem"
            onClick={() => handleAction(() => onRename?.(node))}
            className="w-full text-left px-3 py-1.5 hover:bg-[var(--color-surface-hover)] focus:bg-[var(--color-surface-hover)] outline-none flex items-center justify-between"
          >
            <span>Rename</span>
            <span className="text-[11px] text-[var(--color-text-muted)]">F2</span>
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => handleAction(() => onDuplicate?.(node))}
            className="w-full text-left px-3 py-1.5 hover:bg-[var(--color-surface-hover)] focus:bg-[var(--color-surface-hover)] outline-none flex items-center justify-between"
          >
            <span>Copy / Duplicate</span>
            <span className="text-[11px] text-[var(--color-text-muted)]">Ctrl+C</span>
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => handleAction(() => onToggleEnable?.(node))}
            className="w-full text-left px-3 py-1.5 hover:bg-[var(--color-surface-hover)] focus:bg-[var(--color-surface-hover)] outline-none flex items-center justify-between"
          >
            <span>{node.isMacroEnabled ? 'Disable macro' : 'Enable macro'}</span>
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => handleAction(() => onExportMacro?.(node))}
            className="w-full text-left px-3 py-1.5 hover:bg-[var(--color-surface-hover)] focus:bg-[var(--color-surface-hover)] outline-none flex items-center justify-between"
          >
            <span>Export macro...</span>
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => handleAction(() => onOpenLocation?.(node))}
            className="w-full text-left px-3 py-1.5 hover:bg-[var(--color-surface-hover)] focus:bg-[var(--color-surface-hover)] outline-none flex items-center justify-between"
          >
            <span>Open location</span>
          </button>
          <div className="my-1 border-t border-[var(--color-border-subtle)]" />
          <button
            type="button"
            role="menuitem"
            onClick={() => handleAction(() => onDelete?.(node))}
            className="w-full text-left px-3 py-1.5 text-[var(--color-danger)] hover:bg-[var(--color-danger-surface)] focus:bg-[var(--color-danger-surface)] outline-none flex items-center justify-between"
          >
            <span>Delete</span>
            <span className="text-[11px] opacity-80">Del</span>
          </button>
        </>
      )}
    </div>
  );
}
