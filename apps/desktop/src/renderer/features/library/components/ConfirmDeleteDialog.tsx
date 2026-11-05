/**
 * @macro-recorder/desktop - Confirm Delete Dialog
 * Explicit confirmation dialog for macro and folder deletion.
 */

import React from 'react';
import { Modal } from '../../../design-system/Modal.js';
import { Button } from '../../../design-system/Button.js';

export interface ConfirmDeleteDialogProps {
  readonly isOpen: boolean;
  readonly isFolder: boolean;
  readonly targetName: string;
  readonly macroCount?: number | undefined; // For folder deletion
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
}

export function ConfirmDeleteDialog({
  isOpen,
  isFolder,
  targetName,
  macroCount = 0,
  onConfirm,
  onCancel,
}: ConfirmDeleteDialogProps): React.ReactElement | null {
  if (!isOpen) return null;

  const title = isFolder ? 'Delete folder' : 'Delete macro';
  const question = isFolder ? 'Delete this folder?' : 'Delete this macro?';
  const description = isFolder
    ? 'The folder will be deleted from disk together with every macro and nested folder inside it. This cannot be undone.'
    : 'The macro and all of its actions will be permanently deleted.';

  const itemSummary = isFolder
    ? macroCount === 0
      ? `${targetName} — empty folder`
      : `${targetName} — macros inside: ${macroCount}`
    : targetName;

  const buttonLabel = isFolder ? 'Delete folder' : 'Delete macro';

  return (
    <Modal isOpen={isOpen} onClose={onCancel} title={title} maxWidth="max-w-md">
      <div className="flex flex-col gap-4">
        {/* Warning Icon & Question */}
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-[8px] bg-[var(--color-danger-surface)] border border-[var(--color-danger)] flex items-center justify-center flex-shrink-0 text-[var(--color-danger)]">
            <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
              <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z" />
            </svg>
          </div>
          <div className="flex flex-col gap-1 min-w-0 flex-1">
            <h3 className="text-[16px] font-semibold text-[var(--color-text-primary)]">
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
        <div className="flex items-center justify-end gap-3 pt-2">
          <Button variant="base" onClick={onCancel} autoFocus>
            Cancel
          </Button>
          <Button
            variant="critical-danger"
            onClick={onConfirm}
            aria-label={`Confirm ${title.toLowerCase()}`}
          >
            {buttonLabel}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
