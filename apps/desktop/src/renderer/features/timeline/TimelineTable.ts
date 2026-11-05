/**
 * High-performance virtualized timeline table.
 * Uses the reference EventGrid metrics with viewport-based virtualization.
 */

import { useLocalization } from '../../hooks/useLocalization.js';
import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import type { TimelineRow } from '../../../../../../packages/domain/src/timeline/types.js';
import { computeVirtualRange } from '../../design-system/VirtualList.js';
import { TimelineRowView } from './TimelineRowView.js';
import { useTimelineDragReorder } from './useTimelineDragReorder.js';
import type { InlineEditState, TimelineColumnId, TimelineTableProps } from './types.js';

export function TimelineTable({
  rows,
  selectedKeys,
  focusedKey,
  containerHeight,
  itemHeight = 42,
  onSelectRow,
  onDoubleClickRow,
  onTimeChange,
  onIntervalChange,
  onCommentChange,
  onReorder,
  onClearSelection,
  className = '',
}: TimelineTableProps) {
  const { t } = useLocalization();
  const [measuredHeight, setMeasuredHeight] = useState(450);
  const viewportHeight = containerHeight ?? measuredHeight;
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [inlineEdit, setInlineEdit] = useState<InlineEditState | null>(null);

  const dragReorder = useTimelineDragReorder({
    onReorder: (draggedIds, targetIndex) => {
      onReorder?.(draggedIds, targetIndex);
    },
    scrollContainerRef: containerRef,
  });

  useEffect(() => {
    const viewport = containerRef.current;
    if (!viewport || containerHeight !== undefined || typeof ResizeObserver === 'undefined') return;
    const measure = () => setMeasuredHeight(previous => viewport.clientHeight > 0 && previous !== viewport.clientHeight ? viewport.clientHeight : previous);
    const observer = new ResizeObserver(measure);
    observer.observe(viewport);
    measure();
    return () => observer.disconnect();
  }, [containerHeight]);

  // Calculate virtual range using design-system's computeVirtualRange
  const virtualRange = useMemo(() => {
    return computeVirtualRange({
      itemCount: rows.length,
      itemHeight,
      containerHeight: viewportHeight,
      scrollTop,
      overscan: 10,
    });
  }, [rows.length, itemHeight, viewportHeight, scrollTop]);

  // Keep scroll position updated
  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const nextScrollTop = e.currentTarget.scrollTop;
    setScrollTop(nextScrollTop);
    if (dragReorder.dragState.isDragging) {
      dragReorder.autoScrollDuringDrag(nextScrollTop);
    }
  };

  // Scroll focused row into view if requested
  useEffect(() => {
    if (!focusedKey || !containerRef.current) return;
    const index = rows.findIndex((r) => r.event.id === focusedKey);
    if (index >= 0) {
      const top = index * itemHeight;
      const bottom = top + itemHeight;
      const currentTop = containerRef.current.scrollTop;
      const currentBottom = currentTop + viewportHeight;

      if (top < currentTop) {
        containerRef.current.scrollTop = top;
      } else if (bottom > currentBottom) {
        containerRef.current.scrollTop = bottom - viewportHeight;
      }
    }
  }, [focusedKey, rows, itemHeight, viewportHeight]);

  const handleStartInlineEdit = useCallback(
    (row: TimelineRow, column: TimelineColumnId, initialValue: string) => {
      setInlineEdit({
        rowId: row.event.id,
        column,
        initialValue,
      });
    },
    [],
  );

  const handleCommitInlineEdit = useCallback(
    (row: TimelineRow, column: TimelineColumnId, value: string) => {
      setInlineEdit(null);
      if (column === 'time') {
        const num = parseFloat(value);
        if (Number.isFinite(num)) {
          onTimeChange?.(row, num);
        }
      } else if (column === 'interval') {
        const num = parseFloat(value);
        if (Number.isFinite(num)) {
          onIntervalChange?.(row, num);
        }
      } else if (column === 'comment' || column === 'action') {
        onCommentChange?.(row, value);
      }
    },
    [onTimeChange, onIntervalChange, onCommentChange],
  );

  const handleCancelInlineEdit = useCallback(() => {
    setInlineEdit(null);
  }, []);

  // Empty area click to clear selection
  const handleContainerClick = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target === containerRef.current || target.classList.contains('timeline-viewport')) {
      onClearSelection?.();
    }
  };

  // Drag over detection on the table viewport
  const handleMouseMove = (e: React.MouseEvent) => {
    if (!dragReorder.dragState.isDragging || !containerRef.current) return;

    dragReorder.autoScrollDuringDrag(e.clientY);

    const rect = containerRef.current.getBoundingClientRect();
    const relativeY = e.clientY - rect.top + containerRef.current.scrollTop;
    const hoveredIndex = Math.floor(relativeY / itemHeight);

    if (hoveredIndex >= 0 && hoveredIndex < rows.length) {
      const rowTop = hoveredIndex * itemHeight;
      const isAfter = relativeY >= rowTop + itemHeight / 2;
      dragReorder.updateDropTarget(hoveredIndex, isAfter);
    }
  };

  const handleMouseUp = () => {
    if (dragReorder.dragState.isDragging) {
      dragReorder.completeDrag(rows.length);
    }
  };

  // Render visible rows
  const visibleRows: React.ReactNode[] = [];
  for (let i = virtualRange.startIndex; i < virtualRange.endIndex; i++) {
    const row = rows[i];
    if (!row) continue;
    const rowId = row.event.id;
    const isSelected = selectedKeys.has(rowId);
    const isFocused = focusedKey === rowId;
    const isDropTarget = dragReorder.dragState.dropTargetIndex === i;
    const isDropAfter = dragReorder.dragState.isDropAfter;

    visibleRows.push(
      React.createElement(TimelineRowView, {
        key: rowId,
        row,
        index: i,
        isSelected,
        isFocused,
        inlineEdit,
        isDropTarget,
        isDropAfter,
        onClick: (e) => onSelectRow?.(rowId, e),
        onDoubleClick: (col) => onDoubleClickRow?.(row, col),
        onStartInlineEdit: (col, val) => handleStartInlineEdit(row, col, val),
        onCommitInlineEdit: (col, val) => handleCommitInlineEdit(row, col, val),
        onCancelInlineEdit: handleCancelInlineEdit,
        onDragStart: (e) => {
          const idsToMove = isSelected && selectedKeys.size > 0 ? Array.from(selectedKeys) : [rowId];
          dragReorder.startDrag(idsToMove, e.clientX, e.clientY);
        },
      }),
    );
  }

  const bottomSpacerHeight = Math.max(
    0,
    virtualRange.totalHeight - virtualRange.offsetY - (virtualRange.endIndex - virtualRange.startIndex) * itemHeight,
  );

  return React.createElement(
    'div',
    {
      className: `reference-timeline-table flex flex-col flex-1 min-h-0 w-full rounded-[8px] bg-[var(--color-surface)] border border-[var(--color-border-subtle)] shadow-sm select-none overflow-hidden ${className}`,
    },
    // Table Header
    React.createElement(
      'div',
      {
        role: 'row',
        className:
          'flex items-center h-[42px] min-h-[42px] bg-[var(--color-surface-raised)] border-b border-[var(--color-border)] text-[14px] font-semibold text-[var(--color-text-secondary)]',
      },
      React.createElement(
        'div',
        { className: 'w-[110px] min-w-[80px] px-3 shrink-0 text-left truncate' },
        t('Time, ms'),
      ),
      React.createElement(
        'div',
        { className: 'w-[150px] min-w-[110px] px-3 shrink-0 text-left truncate' },
        t('Since previous, ms'),
      ),
      React.createElement(
        'div',
        { className: 'reference-action-column px-3 text-left truncate' },
        t('Action'),
      ),
      React.createElement(
        'div',
        { className: 'reference-comment-column px-3 text-left truncate' },
        t('Comment'),
      ),
    ),

    // Virtualized Scroll Container
    React.createElement(
      'div',
      {
        ref: containerRef,
        role: 'grid',
        'aria-rowcount': rows.length,
        tabIndex: 0,
        onClick: handleContainerClick,
        onScroll: handleScroll,
        onMouseMove: handleMouseMove,
        onMouseUp: handleMouseUp,
        className:
          'timeline-viewport relative flex-1 min-h-0 overflow-auto bg-[var(--color-surface)]',
        style: containerHeight === undefined ? { minHeight: 0 } : { height: containerHeight, flex: 'none' },
      },
      // Top Spacer
      virtualRange.offsetY > 0 &&
        React.createElement('div', {
          style: { height: virtualRange.offsetY },
          className: 'w-full pointer-events-none',
        }),

      // Visible Rows
      visibleRows,

      // Bottom Spacer
      bottomSpacerHeight > 0 &&
        React.createElement('div', {
          style: { height: bottomSpacerHeight },
          className: 'w-full pointer-events-none',
        }),

      // Empty State
      rows.length === 0 &&
        React.createElement(
          'div',
          {
            className:
              'flex flex-col items-center justify-center h-full text-[var(--color-text-muted)] text-[14px] p-8 text-center',
          },
          t('No actions in this macro timeline. Click “Add action” to start building.'),
        ),
    ),
  );
}
