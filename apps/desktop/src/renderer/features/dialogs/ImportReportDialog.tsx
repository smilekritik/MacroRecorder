/**
 * @macro-recorder/desktop - Import Report Dialog
 * Post-import report displaying format, macro count, converted action count,
 * and complete non-blocking warnings.
 */

import React from 'react';
import { Modal } from '../../design-system/Modal.js';
import { Button } from '../../design-system/Button.js';
import type { ImportReportDialogProps } from './types.js';
import type { MacroImportResult } from '../../../../../../packages/contracts/src/domain/import-export.js';

export function ImportReportDialog({
  isOpen,
  report,
  onClose,
}: ImportReportDialogProps): React.ReactElement | null {
  if (!isOpen) return null;

  // Adapt between ImportReport and MacroImportResult
  const isImportReport = 'macroCount' in report;
  const formatName = isImportReport ? report.formatName : String((report as MacroImportResult).format);
  const macroCount = isImportReport ? report.macroCount : (report as MacroImportResult).macros.length;
  const eventCount = isImportReport
    ? report.eventCount
    : (report as MacroImportResult).macros.reduce((acc, m) => acc + (m.events?.length ?? 0), 0);
  const warnings = report.warnings ?? [];

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Import report"
      maxWidth="max-w-xl"
      closeOnEscape={true}
      closeOnBackdropClick={true}
    >
      <div className="flex flex-col gap-5 select-none max-h-[70vh] overflow-y-auto pr-1">
        {/* Success Header */}
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-[10px] bg-[var(--color-selection)] border border-[var(--color-accent)] flex items-center justify-center flex-shrink-0 text-[var(--color-accent)]">
            <svg className="w-7 h-7 fill-none stroke-current stroke-[2.5]" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <div className="flex flex-col gap-0.5">
            <h3 className="text-[20px] font-semibold text-[var(--color-text-primary)]">
              Import complete
            </h3>
            <p className="text-[13px] text-[var(--color-text-secondary)]">
              The macro was added to the local library.
            </p>
          </div>
        </div>

        {/* Statistics Grid */}
        <div className="grid grid-cols-3 gap-3">
          <div className="p-3 rounded-[8px] bg-[var(--color-surface-sunken)] border border-[var(--color-border-subtle)] flex flex-col gap-1">
            <span className="text-[12px] text-[var(--color-text-muted)]">Format</span>
            <span className="font-semibold text-[14px] text-[var(--color-text-primary)] truncate">
              {formatName}
            </span>
          </div>

          <div className="p-3 rounded-[8px] bg-[var(--color-surface-sunken)] border border-[var(--color-border-subtle)] flex flex-col gap-1">
            <span className="text-[12px] text-[var(--color-text-muted)]">Macros</span>
            <span className="font-semibold text-[16px] text-[var(--color-text-primary)]">
              {macroCount}
            </span>
          </div>

          <div className="p-3 rounded-[8px] bg-[var(--color-surface-sunken)] border border-[var(--color-border-subtle)] flex flex-col gap-1">
            <span className="text-[12px] text-[var(--color-text-muted)]">Actions</span>
            <span className="font-semibold text-[16px] text-[var(--color-text-primary)]">
              {eventCount}
            </span>
          </div>
        </div>

        {/* Safe Import Note */}
        <div className="p-3.5 rounded-[8px] bg-[var(--color-selection)] border border-[var(--color-accent)] flex items-start gap-3">
          <div className="w-5 h-5 flex-shrink-0 text-[var(--color-accent)] mt-0.5">
            <svg className="w-5 h-5 fill-none stroke-current stroke-2" viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="9" />
              <path strokeLinecap="round" d="M12 8v4m0 4h.01" />
            </svg>
          </div>
          <div className="flex flex-col gap-0.5 text-[13px]">
            <span className="font-semibold text-[var(--color-text-primary)]">Safe import</span>
            <span className="text-[var(--color-text-secondary)] leading-relaxed">
              All imported macros are added in a disabled state. Review their actions and enable the macros you need manually.
            </span>
          </div>
        </div>

        {/* Non-fatal Conversion Warnings */}
        {warnings.length > 0 && (
          <div className="p-4 rounded-[8px] bg-[var(--color-warning-surface,#fffbeb)] border border-[var(--color-warning,#f59e0b)] flex flex-col gap-2">
            <span className="font-semibold text-[14px] text-[var(--color-warning-text,#b45309)]">
              Needs attention: {warnings.length}
            </span>
            <ul className="flex flex-col gap-1.5 mt-1 list-none pl-0">
              {warnings.map((warning, idx) => (
                <li key={idx} className="flex items-start gap-2 text-[13px] text-[var(--color-text-secondary)] leading-relaxed">
                  <span className="text-[var(--color-warning,#f59e0b)] font-bold">•</span>
                  <span>
                    {warning.line != null ? `Line ${warning.line}: ` : ''}
                    {warning.message}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Footer Action */}
        <div className="flex justify-end pt-2 border-t border-[var(--color-border-subtle)]">
          <Button variant="accent" onClick={onClose} className="min-w-[124px]" autoFocus>
            Done
          </Button>
        </div>
      </div>
    </Modal>
  );
}
