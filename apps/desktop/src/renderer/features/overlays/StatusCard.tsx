/**
 * @macro-recorder/desktop - Macro Information Status Card
 * Displays live macro state, current action, schedule, and dispatch latency.
 *
 * Supports configurable scale (25%-200%), background transparency (0%-100%),
 * and individual field toggles.
 */

import React from 'react';
import type { StatusCardProps } from './types.js';
import { clamp, getOverlayCardBackground, getStateBadgeText } from './utils.js';

export const StatusCard: React.FC<StatusCardProps> = ({
  card,
  scalePercent = 100,
  transparencyPercent = 0,
  fieldConfig = {},
  theme = 'dark',
  t = (k) => k,
  className = '',
}) => {
  const {
    showState = true,
    showMacroName = true,
    showCurrentAction = true,
    showSchedule = true,
    showLatency = true,
  } = fieldConfig;

  // If card is explicitly marked invisible, do not render
  if (card.visible === false) {
    return null;
  }

  const scale = clamp(scalePercent, 25, 200) / 100;
  const background = getOverlayCardBackground(theme, transparencyPercent);
  const stateText = getStateBadgeText(card.state, t);

  return (
    <div
      data-testid={`status-card-${card.macroId}`}
      role="status"
      aria-live="polite"
      aria-label={showState ? `${card.macroName}: ${stateText}` : card.macroName}
      style={{
        width: 430,
        backgroundColor: background,
        transform: scale !== 1.0 ? `scale(${scale})` : undefined,
        transformOrigin: 'top left',
      }}
      className={`relative rounded-[10px] border border-[var(--color-accent)] p-4 shadow-lg select-none ${className}`}
    >
      <div className="flex items-stretch gap-3.5">
        {/* Left vertical accent pillar */}
        <div
          data-testid="status-accent-pillar"
          className="w-2 rounded-[4px] bg-[var(--color-accent)] shrink-0 self-stretch"
          aria-hidden="true"
        />

        {/* Info content stack */}
        <div className="flex flex-col gap-1.5 flex-1 min-w-0">
          {showState && (
            <span
              data-testid="status-card-state"
              className="font-mono text-[13px] font-bold tracking-wide text-[var(--color-accent)] leading-tight"
            >
              {stateText}
            </span>
          )}

          {showMacroName && (
            <h4
              data-testid="status-card-name"
              className="text-[16px] font-semibold text-[var(--color-text-primary)] truncate leading-tight"
              title={card.macroName}
            >
              {card.macroName}
            </h4>
          )}

          {showCurrentAction && card.actionText && (
            <p
              data-testid="status-card-action"
              className="text-[14px] text-[var(--color-text-primary)] break-words leading-snug"
            >
              {card.actionText}
            </p>
          )}

          {showSchedule && card.scheduleText && (
            <span
              data-testid="status-card-schedule"
              className="font-mono text-[12px] text-[var(--color-text-secondary)] leading-tight"
            >
              {card.scheduleText}
            </span>
          )}

          {showLatency && card.latencyText && (
            <span
              data-testid="status-card-latency"
              className="font-mono text-[12px] text-[var(--color-text-secondary)] break-words leading-tight"
            >
              {card.latencyText}
            </span>
          )}
        </div>
      </div>
    </div>
  );
};
