/**
 * @macro-recorder/desktop - Library Tree View
 * Accessible tree container with full keyboard navigation (arrows, F2, Del, Ctrl+C/V/Z),
 * drag and drop event dispatch, and context menu triggers.
 */

import React, { useRef, useCallback, useState } from 'react';
import type { LibraryTreeNodeData } from '../types.js';
import { LibraryTreeNode } from './LibraryTreeNode.js';
import {
  LibraryContextMenu,
  type ContextMenuPosition,
} from './LibraryContextMenu.js';

export interface LibraryTreeViewProps {
  readonly nodes: readonly LibraryTreeNodeData[];
  readonly flattenedNodes: readonly LibraryTreeNodeData[];
  readonly selectedNodeId: string | null;
  readonly dropTargetId: string | null;
  readonly hasClipboardContent?: boolean | undefined;
  readonly onSelectNode: (node: LibraryTreeNodeData) => void;
  readonly onToggleExpand: (folderPath: string) => void;
  readonly onExpandFolder: (folderPath: string) => void;
  readonly onCollapseFolder: (folderPath: string) => void;
  readonly onRenameNode: (node: LibraryTreeNodeData) => void;
  readonly onDeleteNode: (node: LibraryTreeNodeData) => void;
  readonly onDuplicateNode: (node: LibraryTreeNodeData) => void;
  readonly onToggleEnableNode?: ((node: LibraryTreeNodeData) => void) | undefined;
  readonly onEnableAllInside?: ((folderNode: LibraryTreeNodeData) => void) | undefined;
  readonly onDisableAllInside?: ((folderNode: LibraryTreeNodeData) => void) | undefined;
  readonly onNewFolderInside?: ((folderNode: LibraryTreeNodeData) => void) | undefined;
  readonly onOpenLocation?: ((node: LibraryTreeNodeData | null) => void) | undefined;
  readonly onExportMacro?: ((node: LibraryTreeNodeData) => void) | undefined;
  readonly onNewMacro?: (() => void) | undefined;
  readonly onNewFolder?: (() => void) | undefined;
  readonly onPaste?: (() => void) | undefined;
  readonly onUndo?: (() => void) | undefined;
  readonly onDragStart: (e: React.DragEvent, node: LibraryTreeNodeData) => void;
  readonly onDragOver: (e: React.DragEvent, node: LibraryTreeNodeData | null) => void;
  readonly onDragLeave: (e: React.DragEvent, node: LibraryTreeNodeData | null) => void;
  readonly onDrop: (e: React.DragEvent, node: LibraryTreeNodeData | null) => void;
  readonly onDragEnd: (e: React.DragEvent) => void;
  readonly className?: string | undefined;
}

export function LibraryTreeView({
  nodes,
  flattenedNodes,
  selectedNodeId,
  dropTargetId,
  hasClipboardContent = false,
  onSelectNode,
  onToggleExpand,
  onExpandFolder,
  onCollapseFolder,
  onRenameNode,
  onDeleteNode,
  onDuplicateNode,
  onToggleEnableNode,
  onEnableAllInside,
  onDisableAllInside,
  onNewFolderInside,
  onOpenLocation,
  onExportMacro,
  onNewMacro,
  onNewFolder,
  onPaste,
  onUndo,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
  onDragEnd,
  className = '',
}: LibraryTreeViewProps) {
  const treeContainerRef = useRef<HTMLDivElement>(null);
  const [contextMenuState, setContextMenuState] = useState<{
    node: LibraryTreeNodeData | null;
    position: ContextMenuPosition;
  } | null>(null);

  const handleNodeContextMenu = useCallback(
    (e: React.MouseEvent, node: LibraryTreeNodeData) => {
      setContextMenuState({
        node,
        position: { x: e.clientX, y: e.clientY },
      });
    },
    [],
  );

  const handleBackgroundContextMenu = useCallback((e: React.MouseEvent) => {
    if (e.target === treeContainerRef.current) {
      e.preventDefault();
      setContextMenuState({
        node: null,
        position: { x: e.clientX, y: e.clientY },
      });
    }
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const selectedIndex = flattenedNodes.findIndex((n) => n.id === selectedNodeId);
      const currentNode = selectedIndex >= 0 ? flattenedNodes[selectedIndex] : null;

      // F2: Rename
      if (e.key === 'F2' && currentNode) {
        e.preventDefault();
        onRenameNode(currentNode);
        return;
      }

      // Delete: Delete node
      if (e.key === 'Delete' && currentNode) {
        e.preventDefault();
        onDeleteNode(currentNode);
        return;
      }

      // Ctrl + shortcuts
      if (e.ctrlKey || e.metaKey) {
        if (e.key === 'c' || e.key === 'C') {
          if (currentNode) {
            e.preventDefault();
            onDuplicateNode(currentNode);
          }
          return;
        }
        if (e.key === 'v' || e.key === 'V') {
          e.preventDefault();
          onPaste?.();
          return;
        }
        if (e.key === 'z' || e.key === 'Z') {
          e.preventDefault();
          onUndo?.();
          return;
        }
      }

      // Arrow navigation
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        const nextIndex = selectedIndex < flattenedNodes.length - 1 ? selectedIndex + 1 : 0;
        const nextNode = flattenedNodes[nextIndex];
        if (nextNode) onSelectNode(nextNode);
        return;
      }

      if (e.key === 'ArrowUp') {
        e.preventDefault();
        const prevIndex = selectedIndex > 0 ? selectedIndex - 1 : flattenedNodes.length - 1;
        const prevNode = flattenedNodes[prevIndex];
        if (prevNode) onSelectNode(prevNode);
        return;
      }

      if (e.key === 'ArrowRight' && currentNode?.isFolder) {
        e.preventDefault();
        if (!currentNode.isExpanded) {
          onExpandFolder(currentNode.relativePath);
        }
        return;
      }

      if (e.key === 'ArrowLeft' && currentNode?.isFolder) {
        e.preventDefault();
        if (currentNode.isExpanded) {
          onCollapseFolder(currentNode.relativePath);
        }
        return;
      }
    },
    [
      flattenedNodes,
      selectedNodeId,
      onSelectNode,
      onRenameNode,
      onDeleteNode,
      onDuplicateNode,
      onPaste,
      onUndo,
      onExpandFolder,
      onCollapseFolder,
    ],
  );

  // Recursive tree rendering
  function renderNodes(list: readonly LibraryTreeNodeData[], depth = 0): React.ReactNode[] {
    const elements: React.ReactNode[] = [];
    for (const node of list) {
      elements.push(
        <LibraryTreeNode
          key={node.id}
          node={node}
          depth={depth}
          isSelected={node.id === selectedNodeId}
          isDropTarget={node.id === dropTargetId}
          onSelect={onSelectNode}
          onToggleExpand={onToggleExpand}
          onContextMenu={handleNodeContextMenu}
          onDragStart={onDragStart}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
          onDragEnd={onDragEnd}
        />,
      );

      if (node.isFolder && node.isExpanded && node.children.length > 0) {
        elements.push(...renderNodes(node.children, depth + 1));
      }
    }
    return elements;
  }

  return (
    <div
      ref={treeContainerRef}
      role="tree"
      aria-label="Macro library tree"
      tabIndex={0}
      onKeyDown={handleKeyDown}
      onContextMenu={handleBackgroundContextMenu}
      onDragOver={(e) => onDragOver(e, null)}
      onDrop={(e) => onDrop(e, null)}
      className={`relative flex flex-col gap-0.5 overflow-y-auto overflow-x-hidden select-none outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-accent)] ${className}`}
    >
      {nodes.length === 0 ? (
        <div className="p-4 text-center text-[13px] text-[var(--color-text-muted)] italic">
          No macros found. Click &quot;New&quot; to create one.
        </div>
      ) : (
        renderNodes(nodes)
      )}

      {/* Context Menu Popup */}
      <LibraryContextMenu
        node={contextMenuState?.node ?? null}
        position={contextMenuState?.position ?? null}
        hasClipboardContent={hasClipboardContent}
        onClose={() => setContextMenuState(null)}
        onRename={onRenameNode}
        onDuplicate={onDuplicateNode}
        onToggleEnable={onToggleEnableNode}
        onEnableAllInside={onEnableAllInside}
        onDisableAllInside={onDisableAllInside}
        onNewFolderInside={onNewFolderInside}
        onOpenLocation={onOpenLocation}
        onExportMacro={onExportMacro}
        onDelete={onDeleteNode}
        onNewMacro={onNewMacro}
        onNewFolder={onNewFolder}
        onPaste={onPaste}
      />
    </div>
  );
}
