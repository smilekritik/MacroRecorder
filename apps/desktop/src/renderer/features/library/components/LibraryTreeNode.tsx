/**
 * @macro-recorder/desktop - Library Tree Node Component
 * Visual presentation for folders and macros,
 * drop highlights, enabled status, modified badges, and context menu triggers.
 */

import { useLocalization } from '../../../hooks/useLocalization.js';
import React, { useCallback } from 'react';
import type { LibraryTreeNodeData } from '../types.js';

export interface LibraryTreeNodeProps {
  readonly node: LibraryTreeNodeData;
  readonly depth?: number | undefined;
  readonly isSelected: boolean;
  readonly isDropTarget: boolean;
  readonly onSelect: (node: LibraryTreeNodeData) => void;
  readonly onToggleExpand?: ((folderPath: string) => void) | undefined;
  readonly onContextMenu: (e: React.MouseEvent, node: LibraryTreeNodeData) => void;
  readonly onDragStart: (e: React.DragEvent, node: LibraryTreeNodeData) => void;
  readonly onDragOver: (e: React.DragEvent, node: LibraryTreeNodeData) => void;
  readonly onDragLeave: (e: React.DragEvent, node: LibraryTreeNodeData) => void;
  readonly onDrop: (e: React.DragEvent, node: LibraryTreeNodeData) => void;
  readonly onDragEnd: (e: React.DragEvent) => void;
  readonly className?: string | undefined;
}

export function LibraryTreeNode({
  node,
  depth = 0,
  isSelected,
  isDropTarget,
  onSelect,
  onToggleExpand,
  onContextMenu,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
  onDragEnd,
  className = '',
}: LibraryTreeNodeProps) {
  const { t } = useLocalization();
  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onSelect(node);
    },
    [node, onSelect],
  );

  const handleContextMenu = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      onContextMenu(e, node);
    },
    [node, onContextMenu],
  );

  const handleExpanderClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (node.isFolder && onToggleExpand) {
        onToggleExpand(node.relativePath);
      }
    },
    [node, onToggleExpand],
  );

  // Indentation padding per level
  const paddingLeft = `${depth * 16 + 8}px`;

  return (
    <div
      role="treeitem"
      aria-selected={isSelected}
      aria-expanded={node.isFolder ? node.isExpanded : undefined}
      tabIndex={0}
      draggable
      onClick={handleClick}
      onContextMenu={handleContextMenu}
      onDragStart={(e) => onDragStart(e, node)}
      onDragOver={(e) => onDragOver(e, node)}
      onDragLeave={(e) => onDragLeave(e, node)}
      onDrop={(e) => onDrop(e, node)}
      onDragEnd={onDragEnd}
      style={{ paddingLeft }}
      className={`reference-library-node ${node.isFolder ? 'is-folder' : 'is-macro'} ${!node.isFolder && node.isMacroEnabled ? 'is-enabled' : ''} ${isSelected ? 'is-selected' : ''} group relative flex items-center justify-between py-1.5 pr-2 rounded-[6px] transition-colors border select-none ${
        isDropTarget
          ? 'bg-[var(--color-selection)] border-[var(--color-accent)] ring-1 ring-[var(--color-accent)]'
          : isSelected
            ? 'bg-[var(--color-selection)] border-[var(--color-accent)]/40 text-[var(--color-text-primary)]'
            : 'border-transparent hover:bg-[var(--color-surface-hover)] text-[var(--color-text-primary)]'
      } ${className}`}
    >
      {/* Left side: Expander / Icon / Name & Subtext */}
      <div className="flex items-center gap-1.5 min-w-0 flex-1">
        {node.isFolder ? (
          <>
            {/* Folder expander chevron */}
            <button
              type="button"
              onClick={handleExpanderClick}
              className="w-4 h-4 flex items-center justify-center text-[10px] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] flex-shrink-0"
              aria-label={node.isExpanded ? t('Collapse folder') : t('Expand folder')}
            >
              <span
                className={`inline-block transition-transform duration-150 ${
                  node.isExpanded ? 'rotate-90' : 'rotate-0'
                }`}
              >
                ▶
              </span>
            </button>

            {/* Folder icon */}
            <svg
              className="w-4 h-3.5 flex-shrink-0 text-[var(--color-accent)] opacity-85 fill-current"
              viewBox="0 0 14 12"
            >
              <path d="M 0,2 L 5,2 L 6.5,4 L 14,4 L 14,12 L 0,12 Z" />
            </svg>

            {/* Folder Name */}
            <span className="text-[14px] font-medium text-[var(--color-text-primary)] truncate">
              {node.name}
            </span>

          </>
        ) : (
          <>
            {/* Macro Name and Hotkey Display */}
            <div className="flex flex-col min-w-0 flex-1">
              <span className="text-[14px] font-semibold text-[var(--color-text-primary)] truncate leading-snug">
                {node.name}
              </span>
              {(
                <span className="text-[12px] text-[var(--color-text-muted)] truncate leading-tight">
                  {node.isAutomaticTrigger ? t('Automatic trigger') : node.hotkeyDisplay || t('Not assigned')}
                </span>
              )}
            </div>
          </>
        )}
      </div>

      {/* Right side: Macro Enabled state and Modified badge */}
      {!node.isFolder && (
        <div className="flex flex-col items-end flex-shrink-0 ml-2">
          <span
            className={`text-[11px] font-semibold ${
              node.isMacroEnabled
                ? 'text-[var(--color-accent)]'
                : 'text-[var(--color-text-muted)]'
            }`}
          >
            {node.isMacroEnabled ? t('Active') : t('Disabled')}
          </span>
          {node.isModified && (
            <span className="text-[10px] font-medium text-[var(--color-warning)]">
              {t('edited')}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
