/**
 * @macro-recorder/desktop - Factory Reset Confirmation Dialog
 * Explicit safety modal for clean factory reset.
 * Deletes macros and settings, and restarts as first run.
 */

import React from 'react';
import { Modal } from '../../design-system/Modal.js';
import { Button } from '../../design-system/Button.js';
import type { ResetConfirmDialogProps } from './types.js';

export function ResetConfirmDialog({
  isOpen,
  libraryPath,
  onConfirm,
  onCancel,
}: ResetConfirmDialogProps): React.ReactElement | null {
  if (!isOpen) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onCancel}
      title="Delete all macros and settings?"
      maxWidth="max-w-lg"
      closeOnEscape={true}
      closeOnBackdropClick={true}
    >
      <div className="flex flex-col gap-5 select-none">
        {/* Warning Icon & Question */}
        <div className="flex items-start gap-3">
          <div className="w-12 h-12 rounded-[10px] bg-[var(--color-danger-surface)] border border-[var(--color-danger)] flex items-center justify-center flex-shrink-0 text-[var(--color-danger)]">
            <svg className="w-6 h-6 fill-none stroke-current stroke-2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <div className="flex flex-col gap-1 min-w-0 flex-1">
            <h3 className="text-[17px] font-semibold text-[var(--color-text-primary)]">
              Delete all macros and settings?
            </h3>
            <p className="text-[13px] text-[var(--color-text-secondary)] leading-relaxed">
              The macro library and settings will be deleted from disk. The application will restart as on a first run.
            </p>
          </div>
        </div>

        {/* Location display */}
        {libraryPath && (
          <div className="p-3 rounded-[6px] bg-[var(--color-surface-sunken)] border border-[var(--color-border-subtle)] text-[12px] font-mono text-[var(--color-text-secondary)] truncate">
            {libraryPath}
          </div>
        )}

        {/* Danger Action Button */}
        <div className="p-3 rounded-[8px] border border-[var(--color-danger)] bg-[var(--color-danger-surface)] flex items-center justify-between gap-3">
          <div className="flex flex-col">
            <span className="font-semibold text-[14px] text-[var(--color-danger)]">
              Permanent Deletion
            </span>
            <span className="text-[12px] text-[var(--color-text-secondary)]">
              Deleted macros cannot be recovered.
            </span>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-3 pt-2 border-t border-[var(--color-border-subtle)]">
          <Button variant="base" onClick={onCancel} autoFocus>
            Cancel
          </Button>
          <Button
            variant="critical-danger"
            onClick={onConfirm}
            className="min-w-[220px]"
          >
            Delete everything and restart
          </Button>
        </div>
      </div>
    </Modal>
  );
}
