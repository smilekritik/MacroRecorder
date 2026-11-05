/**
 * @macro-recorder/desktop - Bind Map Legend Component
 * Bottom indicator bar and Close button.
 */

import React from 'react';
import { Button } from '../../design-system/Button.js';

export interface BindMapLegendProps {
  readonly onClose?: (() => void) | undefined;
  readonly t?: ((k: string) => string) | undefined;
  readonly className?: string | undefined;
}

export const BindMapLegend: React.FC<BindMapLegendProps> = ({
  onClose,
  t = (k) => k,
  className = '',
}) => {
  const legendItems = [
    {
      bg: 'var(--color-selection)',
      border: 'var(--color-accent)',
      label: t('enabled macro'),
      testId: 'legend-enabled-macro',
    },
    {
      bg: 'var(--color-danger-surface)',
      border: 'var(--color-danger)',
      label: t('disabled macro — click to enable'),
      testId: 'legend-disabled-macro',
    },
    {
      bg: 'var(--color-table-selection)',
      border: 'var(--color-focus)',
      label: t('application shortcut'),
      testId: 'legend-app-shortcut',
    },
    {
      bg: 'var(--color-warning-surface)',
      border: 'var(--color-warning)',
      label: t('second key of a combination'),
      testId: 'legend-second-key',
    },
    {
      bg: 'var(--color-conflict-surface)',
      border: 'var(--color-conflict)',
      label: t('held by another application'),
      testId: 'legend-conflict',
    },
  ];

  return (
    <div
      className={`flex flex-wrap items-center justify-between gap-4 pt-4 border-t border-[var(--color-border-subtle)]/50 select-none ${className}`}
      data-testid="bind-map-legend"
    >
      {/* Indicator Pills */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
        {legendItems.map((item) => (
          <div
            key={item.label}
            data-testid={item.testId}
            className="flex items-center gap-2"
          >
            <div
              className="w-3.5 h-3.5 rounded-[4px] border flex-shrink-0"
              style={{
                backgroundColor: item.bg,
                borderColor: item.border,
              }}
            />
            <span className="text-[12.5px] text-[var(--color-text-secondary)]">
              {item.label}
            </span>
          </div>
        ))}
      </div>

      {/* Close Action */}
      {onClose && (
        <div className="flex-shrink-0">
          <Button
            variant="base"
            size="md"
            onClick={onClose}
            className="min-w-[120px]"
            data-testid="bind-map-close-btn"
          >
            {t('Close')}
          </Button>
        </div>
      )}
    </div>
  );
};
