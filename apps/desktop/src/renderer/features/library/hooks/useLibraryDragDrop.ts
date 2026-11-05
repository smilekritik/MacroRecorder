/**
 * @macro-recorder/desktop - Library Drag and Drop Hook
 * HTML5 drag and drop interaction handling with visual drop target highlighting and validation.
 */

import { useState, useCallback } from 'react';
import type { LibraryTreeNodeData } from '../types.js';
import { canDropInLibrary } from '../utils/drag-drop.js';

export interface UseLibraryDragDropProps {
  readonly onMoveNode: (dragged: LibraryTreeNodeData, destinationFolder: string) => Promise<void>;
  readonly onStatusMessage?: ((msg: string) => void) | undefined;
}

export function useLibraryDragDrop({ onMoveNode, onStatusMessage }: UseLibraryDragDropProps) {
  const [draggedNode, setDraggedNode] = useState<LibraryTreeNodeData | null>(null);
  const [dropTargetNode, setDropTargetNode] = useState<LibraryTreeNodeData | null>(null);

  const handleDragStart = useCallback(
    (e: React.DragEvent, node: LibraryTreeNodeData) => {
      e.stopPropagation();
      setDraggedNode(node);
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData(
        'application/x-macro-recorder-node',
        JSON.stringify({
          id: node.id,
          isFolder: node.isFolder,
          name: node.name,
          relativePath: node.relativePath,
        }),
      );
    },
    [],
  );

  const handleDragOver = useCallback(
    (e: React.DragEvent, target: LibraryTreeNodeData | null) => {
      if (!draggedNode) return;
      e.preventDefault();
      e.stopPropagation();

      const validation = canDropInLibrary(draggedNode, target);
      if (validation.canDrop) {
        e.dataTransfer.dropEffect = 'move';
        setDropTargetNode(target);
      } else {
        e.dataTransfer.dropEffect = 'none';
        setDropTargetNode(null);
      }
    },
    [draggedNode],
  );

  const handleDragLeave = useCallback(
    (e: React.DragEvent, target: LibraryTreeNodeData | null) => {
      e.stopPropagation();
      if (dropTargetNode?.id === target?.id) {
        setDropTargetNode(null);
      }
    },
    [dropTargetNode],
  );

  const handleDragEnd = useCallback(() => {
    setDraggedNode(null);
    setDropTargetNode(null);
  }, []);

  const handleDrop = useCallback(
    async (e: React.DragEvent, target: LibraryTreeNodeData | null) => {
      e.preventDefault();
      e.stopPropagation();

      const currentDragged = draggedNode;
      setDraggedNode(null);
      setDropTargetNode(null);

      if (!currentDragged) return;

      const validation = canDropInLibrary(currentDragged, target);
      if (!validation.canDrop) {
        if (validation.reason && onStatusMessage) {
          onStatusMessage(validation.reason);
        }
        return;
      }

      await onMoveNode(currentDragged, validation.targetFolder);
    },
    [draggedNode, onMoveNode, onStatusMessage],
  );

  return {
    draggedNode,
    dropTargetNode,
    dropTargetId: dropTargetNode?.id ?? null,
    isDragging: Boolean(draggedNode),
    handleDragStart,
    handleDragOver,
    handleDragLeave,
    handleDragEnd,
    handleDrop,
  };
}
