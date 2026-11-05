/**
 * @macro-recorder/desktop - Confirm Import Dialog
 * Pre-import review dialog showing file details, format badge, and safe disabled notice.
 */

import React from 'react';
import { Modal } from '../../design-system/Modal.js';
import { Button } from '../../design-system/Button.js';
import type { ConfirmImportDialogProps } from './types.js';

function getFormatBadge(path: string): string {
  if (path.endsWith('.mrmacro')) return '.MRMACRO';
  if (path.endsWith('.macro.json')) return 'MACRO JSON';
  const dotIndex = path.lastIndexOf('.');
  if (dotIndex >= 0) {
    return path.slice(dotIndex + 1).toUpperCase();
  }
  return 'FILE';
}

function getBaseName(path: string): string {
  const parts = path.split(/[/\\]/);
  return parts[parts.length - 1] ?? path;
}

function getDirName(path: string): string {
  const parts = path.split(/[/\\]/);
  if (parts.length <= 1) return '';
  parts.pop();
  return parts.join('/');
}

export function ConfirmImportDialog({
  isOpen,
  sourcePath,
  targetFolder,
  onConfirm,
  onCancel,
}: ConfirmImportDialogProps): React.ReactElement | null {
  if (!isOpen) return null;

  const fileName = getBaseName(sourcePath);
  const dirName = targetFolder ?? getDirName(sourcePath);
  const formatBadge = getFormatBadge(sourcePath);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onCancel}
      title="Import macro"
      maxWidth="max-w-lg"
      closeOnEscape={true}
      closeOnBackdropClick={true}
    >
      <div className="flex flex-col gap-5 select-none">
        <div className="flex items-start gap-4">
          {/* Accent Import Icon */}
          <div className="w-14 h-14 rounded-[10px] bg-[var(--color-selection)] border border-[var(--color-accent)] flex items-center justify-center flex-shrink-0 text-[var(--color-accent)]">
            <svg className="w-7 h-7 fill-none stroke-current stroke-2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v12m0 0l-5-5m5 5l5-5M5 18v3h14v-3" />
            </svg>
          </div>

          <div className="flex flex-col gap-1.5 min-w-0 flex-1">
            <h3 className="text-[18px] font-semibold text-[var(--color-text-primary)]">
              Import this macro?
            </h3>
            <p className="text-[13px] text-[var(--color-text-secondary)] leading-relaxed">
              The file will be added to the local library in a disabled state, so you can review its actions before running it.
            </p>
          </div>
        </div>

        {/* File Details Box */}
        <div className="p-3.5 rounded-[8px] bg-[var(--color-surface-sunken)] border border-[var(--color-border-subtle)] flex items-center justify-between gap-4">
          <div className="flex flex-col gap-0.5 min-w-0 flex-1">
            <span className="font-semibold text-[14px] text-[var(--color-text-primary)] truncate">
              {fileName}
            </span>
            {dirName && (
              <span className="text-[12px] text-[var(--color-text-muted)] truncate">
                {dirName}
              </span>
            )}
          </div>
          <span className="px-2.5 py-1 rounded-[4px] bg-[var(--color-surface-raised)] border border-[var(--color-border-subtle)] text-[11px] font-semibold text-[var(--color-text-primary)] flex-shrink-0">
            {formatBadge}
          </span>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-3 pt-2 border-t border-[var(--color-border-subtle)]">
          <Button variant="base" onClick={onCancel}>
            Cancel
          </Button>
          <Button variant="accent" onClick={onConfirm} className="min-w-[130px]" autoFocus>
            Import
          </Button>
        </div>
      </div>
    </Modal>
  );
}
