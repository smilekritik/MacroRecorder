/**
 * Single timeline row component for the virtualized table.
 * Supports inline editing for time, interval, comment, and comment row action text.
 */

import React, { useState, useEffect, useRef } from 'react';
import type { TimelineRow } from '../../../../../../packages/domain/src/timeline/types.js';
import type { InlineEditState, TimelineColumnId } from './types.js';

export interface TimelineRowViewProps {
  readonly row: TimelineRow;
  readonly index: number;
  readonly isSelected: boolean;
  readonly isFocused: boolean;
  readonly inlineEdit: InlineEditState | null;
  readonly isDropTarget: boolean;
  readonly isDropAfter: boolean;
  readonly onClick: (e: React.MouseEvent) => void;
  readonly onDoubleClick: (column: TimelineColumnId) => void;
  readonly onStartInlineEdit: (column: TimelineColumnId, initialValue: string) => void;
  readonly onCommitInlineEdit: (column: TimelineColumnId, value: string) => void;
  readonly onCancelInlineEdit: () => void;
  readonly onDragStart?: ((e: React.MouseEvent) => void) | undefined;
}

export function TimelineRowView({
  row,
  index: _index,
  isSelected,
  isFocused,
  inlineEdit,
  isDropTarget,
  isDropAfter,
  onClick,
  onDoubleClick,
  onStartInlineEdit,
  onCommitInlineEdit,
  onCancelInlineEdit,
  onDragStart,
}: TimelineRowViewProps) {
  const isEditing = inlineEdit?.rowId === row.event.id;
  const editingCol = isEditing ? inlineEdit.column : null;

  const [editValue, setEditValue] = useState('');
  const editInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (isEditing && inlineEdit) {
      setEditValue(inlineEdit.initialValue);
      setTimeout(() => {
        if (editInputRef.current) {
          editInputRef.current.focus();
          editInputRef.current.select();
        }
      }, 10);
    }
  }, [isEditing, inlineEdit]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      if (editingCol) {
        onCommitInlineEdit(editingCol, editValue);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      onCancelInlineEdit();
    }
  };

  const handleBlur = () => {
    if (editingCol) {
      onCommitInlineEdit(editingCol, editValue);
    }
  };

  // Drag initiation
  const handleMouseDown = (e: React.MouseEvent) => {
    if (isEditing) return;
    if (e.button === 0 && onDragStart) {
      onDragStart(e);
    }
  };

  const isComment = row.isComment;

  return React.createElement(
    'div',
    {
      role: 'row',
      'aria-selected': isSelected,
      tabIndex: -1,
      onClick,
      onMouseDown: handleMouseDown,
      className: `group relative flex items-center h-[42px] min-h-[42px] border-b border-[var(--color-border-subtle)] text-[14px] cursor-default select-none transition-colors
        ${isComment ? 'bg-[var(--color-surface-raised)]' : ''}
        ${isSelected ? 'bg-[var(--color-table-selection)] text-[var(--color-text-primary)]' : 'hover:bg-[var(--color-surface-hover)] text-[var(--color-text-primary)]'}
        ${isFocused ? 'ring-1 ring-inset ring-[var(--color-focus)]' : ''}`,
      'data-row-id': row.event.id,
    },
    // Drop indicator lines (top or bottom)
    isDropTarget &&
      !isDropAfter &&
      React.createElement('div', {
        className:
          'absolute top-0 left-0 right-0 h-[2px] bg-[var(--color-accent)] z-20 pointer-events-none shadow-sm',
      }),
    isDropTarget &&
      isDropAfter &&
      React.createElement('div', {
        className:
          'absolute bottom-0 left-0 right-0 h-[2px] bg-[var(--color-accent)] z-20 pointer-events-none shadow-sm',
      }),

    // 1. Time, ms (110px min 80px)
    React.createElement(
      'div',
      {
        role: 'gridcell',
        className: 'w-[110px] min-w-[80px] px-3 shrink-0 text-left truncate',
        onDoubleClick: (e: React.MouseEvent) => {
          e.stopPropagation();
          if (!isComment) {
            onStartInlineEdit('time', Math.round(row.timeMilliseconds).toString());
          }
        },
      },
      editingCol === 'time'
        ? React.createElement('input', {
            ref: editInputRef,
            type: 'text',
            value: editValue,
            onChange: (e) => setEditValue(e.target.value),
            onKeyDown: handleKeyDown,
            onBlur: handleBlur,
            className:
              'w-full h-[28px] px-1.5 rounded-[4px] bg-[var(--color-input-bg)] border border-[var(--color-border)] text-left text-[14px] text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-accent)]',
          })
        : isComment ? null : Math.round(row.timeMilliseconds),
    ),

    // 2. Since previous, ms (150px min 110px)
    React.createElement(
      'div',
      {
        role: 'gridcell',
        className: 'w-[150px] min-w-[110px] px-3 shrink-0 text-left truncate',
        onDoubleClick: (e: React.MouseEvent) => {
          e.stopPropagation();
          if (!isComment) {
            onStartInlineEdit('interval', Math.round(row.intervalMilliseconds).toString());
          }
        },
      },
      editingCol === 'interval'
        ? React.createElement('input', {
            ref: editInputRef,
            type: 'text',
            value: editValue,
            onChange: (e) => setEditValue(e.target.value),
            onKeyDown: handleKeyDown,
            onBlur: handleBlur,
            className:
              'w-full h-[28px] px-1.5 rounded-[4px] bg-[var(--color-input-bg)] border border-[var(--color-border)] text-left text-[14px] text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-accent)]',
          })
        : isComment ? null : Math.round(row.intervalMilliseconds),
    ),

    // 3. Action column (flex-1 min 220px)
    React.createElement(
      'div',
      {
        role: 'gridcell',
        className: `reference-action-column px-3 truncate ${
          isComment
            ? 'text-center italic text-[var(--color-text-muted)]'
            : 'text-left cursor-default'
        }`,
        onDoubleClick: (e: React.MouseEvent) => {
          e.stopPropagation();
          if (isComment) {
            onStartInlineEdit('action', row.comment);
          } else {
            onDoubleClick('action');
          }
        },
      },
      isComment && editingCol === 'action'
        ? React.createElement('input', {
            ref: editInputRef,
            type: 'text',
            value: editValue,
            onChange: (e) => setEditValue(e.target.value),
            onKeyDown: handleKeyDown,
            onBlur: handleBlur,
            maxLength: 240,
            className:
              'w-full h-[28px] px-2 text-center rounded-[4px] bg-[var(--color-input-bg)] border border-[var(--color-border)] font-italic text-[14px] text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-accent)]',
          })
        : row.display,
    ),

    // 4. Comment column (w-[200px] flex-none md:flex-initial min-w-[160px])
    React.createElement(
      'div',
      {
        role: 'gridcell',
        className:
          'reference-comment-column px-3 text-left text-[var(--color-text-secondary)] truncate',
        onDoubleClick: (e: React.MouseEvent) => {
          e.stopPropagation();
          onStartInlineEdit('comment', row.comment);
        },
      },
      editingCol === 'comment'
        ? React.createElement('input', {
            ref: editInputRef,
            type: 'text',
            value: editValue,
            onChange: (e) => setEditValue(e.target.value),
            onKeyDown: handleKeyDown,
            onBlur: handleBlur,
            maxLength: 240,
            className:
              'w-full h-[28px] px-1.5 rounded-[4px] bg-[var(--color-input-bg)] border border-[var(--color-border)] text-[14px] text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-accent)]',
          })
        : isComment ? null : row.comment,
    ),
  );
}
