/**
 * Drag-and-drop reordering hook for timeline table.
 */

import { useState, useCallback, useRef } from 'react';
import type { TimelineDragState } from './types.js';

export interface UseTimelineDragReorderOptions {
  readonly onReorder: (draggedIds: ReadonlyArray<string>, insertionIndex: number) => void;
  readonly scrollContainerRef?: React.RefObject<HTMLDivElement | null> | undefined;
}

export function useTimelineDragReorder({
  onReorder,
  scrollContainerRef,
}: UseTimelineDragReorderOptions) {
  const [dragState, setDragState] = useState<TimelineDragState>({
    isDragging: false,
    draggedIds: [],
    dropTargetIndex: null,
    isDropAfter: false,
  });

  const dragStartPosRef = useRef<{ x: number; y: number } | null>(null);

  const startDrag = useCallback(
    (ids: ReadonlyArray<string>, startX: number, startY: number) => {
      dragStartPosRef.current = { x: startX, y: startY };
      setDragState({
        isDragging: true,
        draggedIds: ids,
        dropTargetIndex: null,
        isDropAfter: false,
      });
    },
    [],
  );

  const updateDropTarget = useCallback(
    (rowIndex: number, isAfter: boolean) => {
      setDragState((prev) => {
        if (prev.dropTargetIndex === rowIndex && prev.isDropAfter === isAfter) {
          return prev;
        }
        return {
          ...prev,
          dropTargetIndex: rowIndex,
          isDropAfter: isAfter,
        };
      });
    },
    [],
  );

  const autoScrollDuringDrag = useCallback(
    (clientY: number) => {
      const container = scrollContainerRef?.current;
      if (!container) return;

      const rect = container.getBoundingClientRect();
      const relativeY = clientY - rect.top;
      const edgeThreshold = 36;
      const scrollSpeed = 12;

      if (relativeY < edgeThreshold) {
        container.scrollTop = Math.max(0, container.scrollTop - scrollSpeed);
      } else if (relativeY > rect.height - edgeThreshold) {
        container.scrollTop = Math.min(
          container.scrollHeight - container.clientHeight,
          container.scrollTop + scrollSpeed,
        );
      }
    },
    [scrollContainerRef],
  );

  const completeDrag = useCallback(
    (totalItemCount: number) => {
      if (dragState.isDragging && dragState.draggedIds.length > 0) {
        let insertionIndex: number;
        if (dragState.dropTargetIndex === null) {
          insertionIndex = totalItemCount;
        } else {
          insertionIndex = dragState.dropTargetIndex + (dragState.isDropAfter ? 1 : 0);
        }
        insertionIndex = Math.max(0, Math.min(totalItemCount, insertionIndex));
        onReorder(dragState.draggedIds, insertionIndex);
      }

      setDragState({
        isDragging: false,
        draggedIds: [],
        dropTargetIndex: null,
        isDropAfter: false,
      });
      dragStartPosRef.current = null;
    },
    [dragState, onReorder],
  );

  const cancelDrag = useCallback(() => {
    setDragState({
      isDragging: false,
      draggedIds: [],
      dropTargetIndex: null,
      isDropAfter: false,
    });
    dragStartPosRef.current = null;
  }, []);

  return {
    dragState,
    startDrag,
    updateDropTarget,
    autoScrollDuringDrag,
    completeDrag,
    cancelDrag,
  };
}
