/**
 * @macro-recorder/desktop - Import Confirmation View
 * Pre-import review presentation component.
 */

import React from 'react';
import { Button } from '../../design-system/Button.js';
import type { ImportConfirmationViewProps } from './types.js';

export function ImportConfirmationView({
  sourcePath,
  targetFolder,
  onConfirm,
  onCancel,
}: ImportConfirmationViewProps): React.ReactElement {
  const parts = sourcePath.split(/[/\\]/);
  const fileName = parts[parts.length - 1] ?? sourcePath;
  const dirName = targetFolder ?? (parts.length > 1 ? parts.slice(0, -1).join('/') : '');

  const ext = sourcePath.includes('.') ? sourcePath.slice(sourcePath.lastIndexOf('.') + 1).toUpperCase() : 'MACRO';

  return (
    <div className="p-5 rounded-[10px] bg-[var(--color-surface)] border border-[var(--color-border-subtle)] text-[var(--color-text-primary)] select-none flex flex-col gap-4 text-[13px]">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-[8px] bg-[var(--color-selection)] border border-[var(--color-accent)] flex items-center justify-center text-[var(--color-accent)]">
          <svg className="w-5 h-5 fill-none stroke-current stroke-2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v12m0 0l-5-5m5 5l5-5M5 18v3h14v-3" />
          </svg>
        </div>
        <div>
          <h3 className="text-[16px] font-semibold text-[var(--color-text-primary)]">
            Import macro
          </h3>
          <p className="text-[12px] text-[var(--color-text-secondary)]">
            Review file details before adding to library.
          </p>
        </div>
      </div>

      <div className="p-3 rounded-[6px] bg-[var(--color-surface-sunken)] border border-[var(--color-border-subtle)] flex items-center justify-between gap-4">
        <div className="flex flex-col min-w-0 flex-1">
          <span className="font-semibold truncate">{fileName}</span>
          {dirName && <span className="text-[11px] text-[var(--color-text-muted)] truncate">{dirName}</span>}
        </div>
        <span className="px-2 py-0.5 rounded-[4px] bg-[var(--color-surface-raised)] border border-[var(--color-border-subtle)] text-[11px] font-semibold">
          {ext}
        </span>
      </div>

      <p className="text-[12px] text-[var(--color-text-secondary)] leading-relaxed">
        The macro will be imported in a disabled state so you can safely inspect actions before execution.
      </p>

      <div className="flex items-center justify-end gap-2 pt-2 border-t border-[var(--color-border-subtle)]">
        <Button variant="base" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button variant="accent" size="sm" onClick={() => onConfirm(sourcePath, targetFolder)}>
          Import
        </Button>
      </div>
    </div>
  );
}
