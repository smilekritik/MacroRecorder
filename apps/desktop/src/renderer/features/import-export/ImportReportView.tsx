/**
 * @macro-recorder/desktop - Import Report View
 * Complete post-import summary displaying converted actions and non-blocking warnings.
 * Satisfies SUCCESS CRITERIA: "Import warnings are complete and do not block successfully converted actions".
 */

import React from 'react';
import { Button } from '../../design-system/Button.js';
import type { ImportReportViewProps } from './types.js';
import type { MacroImportResult } from '../../../../../../packages/contracts/src/domain/import-export.js';

export function ImportReportView({
  report,
  onClose,
}: ImportReportViewProps): React.ReactElement {
  const isImportReport = 'macroCount' in report;
  const formatName = isImportReport ? report.formatName : String((report as MacroImportResult).format);
  const macroCount = isImportReport ? report.macroCount : (report as MacroImportResult).macros.length;
  const eventCount = isImportReport
    ? report.eventCount
    : (report as MacroImportResult).macros.reduce((acc, m) => acc + (m.events?.length ?? 0), 0);
  const warnings = report.warnings ?? [];

  return (
    <div
      role="region"
      aria-label="Import report"
      className="p-5 rounded-[10px] bg-[var(--color-surface)] border border-[var(--color-border-subtle)] text-[var(--color-text-primary)] select-none flex flex-col gap-4 text-[13px]"
    >
      {/* Status Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-[8px] bg-[var(--color-selection)] border border-[var(--color-accent)] flex items-center justify-center text-[var(--color-accent)]">
          <svg className="w-5 h-5 fill-none stroke-current stroke-[2.5]" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <div>
          <h3 className="text-[16px] font-semibold text-[var(--color-text-primary)]">
            Import complete
          </h3>
          <p className="text-[12px] text-[var(--color-text-secondary)]">
            {macroCount === 1 ? '1 macro imported successfully' : `${macroCount} macros imported successfully`}
          </p>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="p-2.5 rounded-[6px] bg-[var(--color-surface-sunken)] border border-[var(--color-border-subtle)] flex flex-col">
          <span className="text-[11px] text-[var(--color-text-muted)]">Format</span>
          <span className="font-semibold text-[13px] truncate">{formatName}</span>
        </div>

        <div className="p-2.5 rounded-[6px] bg-[var(--color-surface-sunken)] border border-[var(--color-border-subtle)] flex flex-col">
          <span className="text-[11px] text-[var(--color-text-muted)]">Macros</span>
          <span className="font-semibold text-[15px]">{macroCount}</span>
        </div>

        <div className="p-2.5 rounded-[6px] bg-[var(--color-surface-sunken)] border border-[var(--color-border-subtle)] flex flex-col">
          <span className="text-[11px] text-[var(--color-text-muted)]">Actions</span>
          <span className="font-semibold text-[15px]">{eventCount}</span>
        </div>
      </div>

      {/* Warnings Panel */}
      {warnings.length > 0 && (
        <div className="p-3.5 rounded-[8px] bg-[var(--color-warning-surface,#fffbeb)] border border-[var(--color-warning,#f59e0b)] flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-[13px] text-[var(--color-warning-text,#b45309)]">
              Non-fatal conversion warnings ({warnings.length})
            </span>
          </div>
          <span className="text-[11px] text-[var(--color-text-muted)]">
            These lines were adapted or skipped without interrupting successfully imported actions.
          </span>
          <ul className="flex flex-col gap-1.5 mt-1 list-none pl-0 max-h-[180px] overflow-y-auto pr-1">
            {warnings.map((warn, i) => (
              <li key={i} className="flex items-start gap-2 text-[12px] text-[var(--color-text-secondary)] leading-tight">
                <span className="text-[var(--color-warning,#f59e0b)] font-bold">•</span>
                <span>
                  {warn.line != null ? `Line ${warn.line}: ` : ''}
                  {warn.message}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {onClose && (
        <div className="flex justify-end pt-2 border-t border-[var(--color-border-subtle)]">
          <Button variant="accent" size="sm" onClick={onClose}>
            Done
          </Button>
        </div>
      )}
    </div>
  );
}
