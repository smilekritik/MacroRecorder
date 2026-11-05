import React from 'react';
import { EngineState, type MacroEvent } from '../../../../../../packages/contracts/src/index.js';
import { formatMacroEventDisplay } from '../../../../../../packages/domain/src/model/index.js';
import type { CurrentActionProgressProps } from './types.js';

function formatEventSummary(event: MacroEvent): string {
  try {
    return formatMacroEventDisplay(event);
  } catch {
    return String(event.type);
  }
}

/**
 * Pure layout component for current action progress.
 */
export function CurrentActionProgressContent({
  macroName,
  engineState,
  elapsedMicroseconds,
  totalDurationMicroseconds = 0,
  currentEvent,
  lastReceipt,
  playbackSpeed = 1.0,
  className = '',
}: CurrentActionProgressProps) {
  const elapsedMs = Math.max(0, Math.round(elapsedMicroseconds / 1000));
  const totalMs = Math.max(0, Math.round(totalDurationMicroseconds / 1000));

  const percent =
    totalMs > 0 ? Math.min(100, Math.max(0, Math.round((elapsedMs / totalMs) * 100))) : 0;

  const isPlaying = engineState === EngineState.Playing;
  const isPaused = engineState === EngineState.Paused;

  const stateBadgeClass = isPlaying
    ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30'
    : isPaused
      ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30'
      : 'bg-zinc-500/15 text-zinc-500 border-zinc-500/30';

  return React.createElement(
    'div',
    {
      className: `flex flex-col rounded-xl bg-[var(--color-surface-raised)] border border-[var(--color-border-subtle)] p-4 shadow-sm select-none ${className}`,
      role: 'region',
      'aria-label': 'Playback progress',
    },
    // Top row: Macro title & engine state badge
    React.createElement(
      'div',
      { className: 'flex items-center justify-between gap-3 mb-3' },
      React.createElement(
        'div',
        { className: 'flex items-center gap-2 min-w-0' },
        React.createElement(
          'span',
          { className: 'text-[14px] font-bold text-[var(--color-text-primary)] truncate' },
          macroName || 'Playback Progress',
        ),
        playbackSpeed !== 1.0 &&
          React.createElement(
            'span',
            {
              className:
                'px-1.5 py-0.5 text-[11px] font-bold rounded bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-text-secondary)]',
            },
            `${playbackSpeed}×`,
          ),
      ),
      React.createElement(
        'span',
        {
          className: `px-2.5 py-0.5 text-[12px] font-semibold rounded-full border ${stateBadgeClass}`,
        },
        engineState,
      ),
    ),

    // Progress bar (when total duration is known)
    totalMs > 0 &&
      React.createElement(
        'div',
        { className: 'w-full mb-3 flex flex-col gap-1' },
        React.createElement(
          'div',
          {
            className: 'w-full h-2 rounded-full bg-[var(--color-surface)] overflow-hidden',
            role: 'progressbar',
            'aria-valuenow': percent,
            'aria-valuemin': 0,
            'aria-valuemax': 100,
          },
          React.createElement('div', {
            className:
              'h-full bg-[var(--color-accent)] transition-all duration-150 ease-out rounded-full',
            style: { width: `${percent}%` },
          }),
        ),
        React.createElement(
          'div',
          {
            className:
              'flex justify-between items-center text-[11px] text-[var(--color-text-muted)] font-medium',
          },
          React.createElement('span', null, `${elapsedMs} ms`),
          React.createElement('span', null, `${percent}%`),
          React.createElement('span', null, `${totalMs} ms`),
        ),
      ),

    // When total duration is not known, display elapsed ms
    totalMs <= 0 &&
      React.createElement(
        'div',
        { className: 'text-[13px] font-medium text-[var(--color-text-secondary)] mb-3' },
        `Elapsed: ${elapsedMs} ms`,
      ),

    // Current action row
    React.createElement(
      'div',
      {
        className:
          'p-3 rounded-lg bg-[var(--color-surface)] border border-[var(--color-border-subtle)] flex flex-col gap-1',
      },
      React.createElement(
        'span',
        {
          className:
            'text-[11px] font-bold uppercase tracking-wider text-[var(--color-text-muted)]',
        },
        'Current Action',
      ),
      React.createElement(
        'span',
        {
          className:
            'text-[13px] font-semibold text-[var(--color-text-primary)] font-mono truncate',
        },
        currentEvent ? formatEventSummary(currentEvent) : 'Idle / waiting…',
      ),
    ),

    // Diagnostics / Jitter metrics (if lastReceipt is present)
    lastReceipt &&
      React.createElement(
        'div',
        {
          className:
            'mt-3 pt-3 border-t border-[var(--color-border-subtle)] grid grid-cols-3 gap-2 text-center',
        },
        React.createElement(
          'div',
          { className: 'flex flex-col' },
          React.createElement(
            'span',
            { className: 'text-[10px] uppercase text-[var(--color-text-muted)] font-bold' },
            'Jitter',
          ),
          React.createElement(
            'span',
            { className: 'text-[12px] font-medium text-[var(--color-text-primary)]' },
            `±${lastReceipt.dispatchJitterMilliseconds.toFixed(1)} ms`,
          ),
        ),
        React.createElement(
          'div',
          { className: 'flex flex-col' },
          React.createElement(
            'span',
            { className: 'text-[10px] uppercase text-[var(--color-text-muted)] font-bold' },
            'Dispatch',
          ),
          React.createElement(
            'span',
            { className: 'text-[12px] font-medium text-[var(--color-text-primary)]' },
            `${(
              (lastReceipt.dispatchCompletedMicroseconds -
                lastReceipt.dispatchStartedMicroseconds) /
              1000
            ).toFixed(1)} ms`,
          ),
        ),
        React.createElement(
          'div',
          { className: 'flex flex-col' },
          React.createElement(
            'span',
            { className: 'text-[10px] uppercase text-[var(--color-text-muted)] font-bold' },
            'Confirmed',
          ),
          React.createElement(
            'span',
            { className: 'text-[12px] font-medium text-[var(--color-text-primary)]' },
            lastReceipt.confirmationMilliseconds != null
              ? `${lastReceipt.confirmationMilliseconds.toFixed(1)} ms`
              : 'N/A',
          ),
        ),
      ),
  );
}

/**
 * Real-time action progress display during playback.
 */
export function CurrentActionProgress(props: CurrentActionProgressProps) {
  return React.createElement(CurrentActionProgressContent, props);
}
