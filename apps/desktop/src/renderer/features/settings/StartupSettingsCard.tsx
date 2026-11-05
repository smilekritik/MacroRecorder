/**
 * @macro-recorder/desktop - Startup Settings Card
 * Windows autostart configuration.
 */

import React from 'react';
import { Checkbox } from '../../design-system/Checkbox.js';

export interface StartupSettingsCardProps {
  readonly startWithWindows: boolean;
  readonly onChangeStartWithWindows: (enabled: boolean) => void;
  readonly errorText?: string | undefined;
}

export function StartupSettingsCard({
  startWithWindows,
  onChangeStartWithWindows,
  errorText,
}: StartupSettingsCardProps): React.ReactElement {
  return (
    <section id="section-startup" aria-label="Application startup" className="flex flex-col gap-3 select-none">
      <h3 className="text-[17px] font-semibold text-[var(--color-text-primary)]">
        Application startup
      </h3>

      <div className="p-4 rounded-[10px] bg-[var(--color-surface)] border border-[var(--color-border-subtle)] flex flex-col gap-2">
        <Checkbox
          checked={startWithWindows}
          onChange={onChangeStartWithWindows}
          label="Start with Windows"
        />
        <p className="text-[13px] text-[var(--color-text-secondary)] ml-6">
          The application starts minimized. All enabled macros start automatically; disabled macros remain stopped.
        </p>

        {errorText && (
          <span className="text-[13px] font-semibold text-[var(--color-danger)] pt-1">
            {errorText}
          </span>
        )}
      </div>
    </section>
  );
}
