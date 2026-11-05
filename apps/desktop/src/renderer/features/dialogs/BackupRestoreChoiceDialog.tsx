/**
 * @macro-recorder/desktop - Backup Restore Mode Choice Dialog
 * Prompts user to choose Merge vs Replace when restoring an .mrbackup package.
 */

import React from 'react';
import { ChoiceDialog } from './ChoiceDialog.js';
import type { BackupRestoreChoiceDialogProps } from './types.js';

export function BackupRestoreChoiceDialog({
  isOpen,
  onSelectMode,
  onCancel,
}: BackupRestoreChoiceDialogProps): React.ReactElement | null {
  if (!isOpen) return null;

  return (
    <ChoiceDialog
      isOpen={isOpen}
      question="Restore from backup"
      description="Add macros from the backup to the current ones, or replace the whole library?"
      details="On replace, the current library is moved to the app's trash. Settings from the backup are not applied."
      options={[
        {
          title: 'Add',
          description: 'Merge with the current library.',
          tone: 'accent',
        },
        {
          title: 'Replace',
          description: 'Move the current one to trash and restore from the backup.',
          tone: 'danger',
        },
      ]}
      onSelect={(index) => {
        onSelectMode(index === 1 ? 'replace' : 'merge');
      }}
      onCancel={onCancel}
    />
  );
}
