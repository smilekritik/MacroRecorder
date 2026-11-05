/**
 * @macro-recorder/desktop - Application Reset Settings Card
 * Clean factory reset trigger at bottom of settings.
 * Note: Intentionally hidden from navigation sidebar to prevent accidental execution.
 */

import React, { useState } from 'react';
import { Button } from '../../design-system/Button.js';
import { ResetConfirmDialog } from '../dialogs/ResetConfirmDialog.js';

export interface ResetSettingsCardProps {
  readonly libraryPath: string;
  readonly onResetConfirmed: () => Promise<void> | void;
}

export function ResetSettingsCard({
  libraryPath,
  onResetConfirmed,
}: ResetSettingsCardProps): React.ReactElement {
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [errorText, setErrorText] = useState('');

  const handleConfirm = async () => {
    setIsConfirmOpen(false);
    try {
      await onResetConfirmed();
    } catch (err: unknown) {
      setErrorText(`Reset failed: ${String(err)}`);
    }
  };

  return (
    <section id="section-reset" aria-label="Application reset" className="flex flex-col gap-3 select-none">
      <h3 className="text-[17px] font-semibold text-[var(--color-text-primary)]">
        Application reset
      </h3>

      <div className="p-4 rounded-[10px] bg-[var(--color-surface)] border border-[var(--color-danger)] flex flex-col gap-3">
        <div className="flex flex-col gap-0.5">
          <span className="text-[15px] font-semibold text-[var(--color-text-primary)]">
            Delete all macros and settings
          </span>
          <span className="text-[13px] text-[var(--color-text-secondary)] leading-relaxed">
            The macro library and every setting will be deleted permanently, and the application will restart as if you were launching it for the first time. This cannot be undone.
          </span>
        </div>

        <div className="pt-1">
          <Button
            variant="critical-danger"
            size="sm"
            onClick={() => setIsConfirmOpen(true)}
          >
            Reset to the first-run state
          </Button>
        </div>

        {errorText && (
          <span className="text-[12px] font-semibold text-[var(--color-danger)]">
            {errorText}
          </span>
        )}
      </div>

      {isConfirmOpen && (
        <ResetConfirmDialog
          isOpen={isConfirmOpen}
          libraryPath={libraryPath}
          onConfirm={handleConfirm}
          onCancel={() => setIsConfirmOpen(false)}
        />
      )}
    </section>
  );
}
