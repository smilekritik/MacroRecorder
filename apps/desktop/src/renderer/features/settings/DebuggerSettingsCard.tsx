/**
 * @macro-recorder/desktop - Debugger Settings Card
 * Launches inspector tools and logs.
 */

import React from 'react';
import { Button } from '../../design-system/Button.js';

export interface DebuggerSettingsCardProps {
  readonly onOpenPixelInspector: () => void;
  readonly onOpenKeyCodes: () => void;
  readonly onOpenWindowInspector: () => void;
  readonly onOpenLogFile?: (() => void) | undefined;
  readonly onOpenLogFolder?: (() => void) | undefined;
  readonly statusText?: string | undefined;
}

export function DebuggerSettingsCard({
  onOpenPixelInspector,
  onOpenKeyCodes,
  onOpenWindowInspector,
  onOpenLogFile,
  onOpenLogFolder,
  statusText,
}: DebuggerSettingsCardProps): React.ReactElement {
  return (
    <section id="section-debugger" aria-label="Debugger" className="flex flex-col gap-3 select-none">
      <h3 className="text-[17px] font-semibold text-[var(--color-text-primary)]">
        Debugger
      </h3>

      <div className="p-4 rounded-[10px] bg-[var(--color-surface)] border border-[var(--color-border-subtle)] flex flex-col gap-4">
        {/* Diagnostic Tools */}
        <div className="flex flex-col gap-2">
          <span className="text-[15px] font-semibold text-[var(--color-text-primary)]">
            Diagnostic tools
          </span>
          <p className="text-[13px] text-[var(--color-text-secondary)] leading-relaxed">
            Each tool opens in its own window on top of other applications and keeps working while you interact with other windows.
          </p>
          <div className="flex items-center gap-2 pt-1">
            <Button variant="base" size="sm" onClick={onOpenPixelInspector}>
              Pixel and coordinates
            </Button>
            <Button variant="base" size="sm" onClick={onOpenKeyCodes}>
              Key codes
            </Button>
            <Button variant="base" size="sm" onClick={onOpenWindowInspector}>
              Window inspector
            </Button>
          </div>
        </div>

        {/* Application Log */}
        <div className="flex flex-col gap-2 pt-3 border-t border-[var(--color-border-subtle)]">
          <span className="text-[15px] font-semibold text-[var(--color-text-primary)]">
            Application log
          </span>
          <p className="text-[13px] text-[var(--color-text-secondary)] leading-relaxed">
            Open the log file or the folder it lives in.
          </p>
          <div className="flex items-center gap-2 pt-1">
            <Button variant="base" size="sm" onClick={onOpenLogFile ?? (() => {})}>
              Open file
            </Button>
            <Button variant="base" size="sm" onClick={onOpenLogFolder ?? (() => {})}>
              Open folder
            </Button>
          </div>
        </div>

        {statusText && (
          <span className="text-[12px] text-[var(--color-text-secondary)]">
            {statusText}
          </span>
        )}
      </div>
    </section>
  );
}
