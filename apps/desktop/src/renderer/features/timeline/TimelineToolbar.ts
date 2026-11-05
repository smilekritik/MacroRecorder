/**
 * Action toolbar underneath the timeline table.
 */

import React from 'react';
import { useLocalization } from '../../hooks/useLocalization.js';
import { Button } from '../../design-system/Button.js';
import type { TimelineToolbarProps } from './types.js';

export function TimelineToolbar({
  isDirty,
  canUndo,
  selectedCount,
  statusText,
  onAddAction,
  onAddDelay,
  onAddComment,
  onEditSelected,
  onDeleteSelected,
  onUndo,
  onSave,
}: TimelineToolbarProps) {
  const { t } = useLocalization();
  return React.createElement(
    'div',
    { className: 'reference-timeline-toolbar select-none' },
    // Status text / dirty indicator line
    statusText &&
      React.createElement(
        'div',
        { className: 'sr-only', role: 'status' },
        isDirty &&
          React.createElement('span', { className: 'text-[var(--color-warning)] mr-1.5' }, '●'),
        statusText,
      ),

    // Button groups row
    React.createElement(
      'div',
      { className: 'reference-timeline-button-groups' },
      // Left Group: Add controls
      React.createElement(
        'div',
        { className: 'reference-timeline-add-actions' },
        React.createElement(
          Button,
          {
            variant: 'soft-accent',
            size: 'sm',
            onClick: onAddAction,
          },
          t('Add action'),
        ),
        React.createElement(
          Button,
          {
            variant: 'base',
            size: 'sm',
            onClick: onAddDelay,
          },
          t('Add delay'),
        ),
        React.createElement(
          Button,
          {
            variant: 'base',
            size: 'sm',
            onClick: onAddComment,
            title: t('An empty separator row with centred text; it does not affect playback'),
          },
          t('Add comment'),
        ),
      ),

      // Right Group: Edit, Delete, Undo, Save
      React.createElement(
        'div',
        { className: 'reference-timeline-edit-actions' },
        React.createElement(
          Button,
          {
            variant: 'base',
            size: 'sm',
            disabled: selectedCount !== 1,
            onClick: onEditSelected,
          },
          t('Edit'),
        ),
        React.createElement(
          Button,
          {
            variant: 'soft-danger',
            size: 'sm',
            disabled: selectedCount === 0,
            onClick: onDeleteSelected,
          },
          t('Delete selected'),
        ),
        React.createElement(
          Button,
          {
            variant: 'base',
            size: 'sm',
            disabled: !canUndo,
            onClick: onUndo,
            title: t('Undoes the last timeline change (Ctrl+Z)'),
          },
          t('Undo change'),
        ),
        React.createElement(
          Button,
          {
            variant: 'save',
            size: 'sm',
            disabled: !isDirty,
            onClick: onSave,
            title: t('Saves changes to the macro and clears undo history'),
          },
          t('Save changes'),
        ),
      ),
    ),
  );
}
