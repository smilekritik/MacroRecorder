/**
 * @macro-recorder/desktop - Already Running Warning Dialog
 * Informs the user when a second instance is launched without file arguments.
 */

import React from 'react';
import { Modal } from '../../design-system/Modal.js';
import { Button } from '../../design-system/Button.js';
import type { AlreadyRunningDialogProps } from './types.js';

export function AlreadyRunningDialog({
  isOpen,
  onClose,
}: AlreadyRunningDialogProps): React.ReactElement | null {
  if (!isOpen) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Macro Recorder is already running"
      maxWidth="max-w-lg"
      closeOnEscape={true}
      closeOnBackdropClick={true}
    >
      <div className="flex flex-col gap-5 select-none">
        <div className="flex items-start gap-4">
          {/* Accent icon box */}
          <div className="w-14 h-14 rounded-[10px] bg-[var(--color-selection)] border border-[var(--color-accent)] flex items-center justify-center flex-shrink-0 text-[var(--color-accent)]">
            <svg className="w-7 h-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="3" width="13" height="13" rx="2" />
              <path d="M8 21h11a2 2 0 0 0 2-2V8" />
            </svg>
          </div>

          <div className="flex flex-col gap-2 min-w-0 flex-1">
            <h3 className="text-[17px] font-semibold text-[var(--color-text-primary)]">
              Macro Recorder is already running
            </h3>
            <p className="text-[14px] text-[var(--color-text-secondary)] leading-relaxed">
              A second instance will not be opened. Switching to the application that is already running.
            </p>
            <p className="text-[13px] text-[var(--color-text-muted)] leading-normal">
              Close this message and continue in the existing window.
            </p>
          </div>
        </div>

        <div className="flex justify-end pt-3 border-t border-[var(--color-border-subtle)]">
          <Button variant="accent" onClick={onClose} className="min-w-[124px]" autoFocus>
            Got it
          </Button>
        </div>
      </div>
    </Modal>
  );
}
