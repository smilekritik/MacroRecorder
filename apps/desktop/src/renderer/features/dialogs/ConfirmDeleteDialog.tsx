/**
 * @macro-recorder/desktop - Confirm Delete Dialog
 * Modal confirmation for deleting macros, timeline actions, or library folders.
 */

import React from 'react';
import { Modal } from '../../design-system/Modal.js';
import { Button } from '../../design-system/Button.js';
import type { ConfirmDeleteDialogProps } from './types.js';

export function ConfirmDeleteDialog({
  isOpen,
  mode = 'macro',
  targetName = '',
  eventCount = 1,
  macroCount = 0,
  onConfirm,
  onCancel,
}: ConfirmDeleteDialogProps): React.ReactElement | null {
  if (!isOpen) return null;

  let title = 'Delete macro';
  let question = 'Delete this macro?';
  let description = 'The macro and all of its actions will be permanently deleted.';
  let itemSummary = targetName;
  let confirmLabel = 'Delete macro';

  if (mode === 'actions') {
    title = 'Delete actions';
    question = eventCount === 1 ? 'Delete the selected action?' : `Delete ${eventCount} selected actions?`;
    description = 'The timeline will close the empty gap. You can undo the deletion with Ctrl+Z until the macro is saved.';
    itemSummary = `Selected actions: ${eventCount}`;
    confirmLabel = eventCount === 1 ? 'Delete action' : 'Delete actions';
  } else if (mode === 'folder') {
    title = 'Delete folder';
    question = 'Delete this folder?';
    description = 'The folder will be deleted from disk together with every macro and nested folder inside it. This cannot be undone.';
    itemSummary = macroCount === 0 ? `${targetName} — empty folder` : `${targetName} — macros inside: ${macroCount}`;
    confirmLabel = 'Delete folder';
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onCancel}
      title={title}
      maxWidth="max-w-md"
      closeOnEscape={true}
      closeOnBackdropClick={true}
    >
      <div className="flex flex-col gap-4 select-none">
        {/* Warning Icon & Question */}
        <div className="flex items-start gap-3">
          <div className="w-12 h-12 rounded-[10px] bg-[var(--color-danger-surface)] border border-[var(--color-danger)] flex items-center justify-center flex-shrink-0 text-[var(--color-danger)]">
            <svg className="w-6 h-6 fill-none stroke-current stroke-2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </div>
          <div className="flex flex-col gap-1 min-w-0 flex-1">
            <h3 className="text-[17px] font-semibold text-[var(--color-text-primary)]">
              {question}
            </h3>
            <p className="text-[13px] text-[var(--color-text-secondary)] leading-relaxed">
              {description}
            </p>
          </div>
        </div>

        {/* Item Summary box */}
        <div className="p-3 rounded-[6px] bg-[var(--color-surface-sunken)] border border-[var(--color-border-subtle)] text-[13px] font-semibold text-[var(--color-text-primary)] truncate">
          {itemSummary}
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-3 pt-3 border-t border-[var(--color-border-subtle)]">
          <Button variant="base" onClick={onCancel} autoFocus>
            Cancel
          </Button>
          <Button
            variant="critical-danger"
            onClick={onConfirm}
            aria-label={`Confirm ${title.toLowerCase()}`}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
