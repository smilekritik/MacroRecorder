/**
 * @macro-recorder/desktop - Dirty Navigation Dialog
 * Navigation confirmation prompt.
 */

import React from 'react';
import { Modal } from '../../../design-system/Modal.js';
import { Button } from '../../../design-system/Button.js';
import type { DirtyNavigationPromptState } from '../hooks/useDirtyNavigation.js';

export interface DirtyNavigationDialogProps {
  readonly state: DirtyNavigationPromptState | null;
}

export function DirtyNavigationDialog({
  state,
}: DirtyNavigationDialogProps): React.ReactElement | null {
  if (!state || !state.isOpen || !state.macro) return null;

  return (
    <Modal
      isOpen={state.isOpen}
      onClose={state.onCancel}
      title="There are unsaved changes"
      maxWidth="max-w-md"
    >
      <div className="flex flex-col gap-4">
        <p className="text-[13px] text-[var(--color-text-secondary)] leading-relaxed">
          The macro <span className="font-semibold text-[var(--color-text-primary)]">“{state.macro.name}”</span> has unsaved edits. Would you like to save before continuing?
        </p>

        <div className="flex items-center justify-end gap-2.5 pt-2">
          <Button variant="base" onClick={state.onCancel}>
            Cancel
          </Button>
          <Button variant="danger" onClick={state.onDiscardAndProceed}>
            Discard changes
          </Button>
          <Button variant="save" onClick={state.onSaveAndProceed} autoFocus>
            Save changes
          </Button>
        </div>
      </div>
    </Modal>
  );
}
