import React from 'react';
import { Button } from '../../design-system/Button.js';
import type { RecordingStatusBarProps } from './types.js';

/**
 * Live recording status bar and controls.
 * Displays countdown timer and live recording telemetry:
 * elapsed milliseconds, recorded event count, and last captured input event.
 */
export function RecordingStatusBar({
  status,
  onPause,
  onResume,
  onStop,
  onCancelCountdown,
  className = '',
}: RecordingStatusBarProps) {
  if (!status.isRecording && !status.isCountdown) {
    return null;
  }

  // Countdown state banner
  if (status.isCountdown) {
    return React.createElement(
      'div',
      {
        role: 'alert',
        'aria-live': 'assertive',
        className: `flex items-center justify-between gap-4 p-3.5 px-5 rounded-xl bg-[var(--color-surface-raised)] border border-[var(--color-focus)] shadow-lg ${className}`,
      },
      React.createElement(
        'div',
        { className: 'flex items-center gap-3' },
        React.createElement('span', {
          className:
            'w-3 h-3 rounded-full bg-[var(--color-focus)] animate-ping inline-block',
        }),
        React.createElement(
          'span',
          { className: 'text-[15px] font-semibold text-[var(--color-text-primary)]' },
          `Recording starts in ${status.countdownRemaining}…`,
        ),
      ),
      onCancelCountdown &&
        React.createElement(
          Button,
          {
            variant: 'base',
            size: 'sm',
            onClick: onCancelCountdown,
          },
          'Cancel countdown',
        ),
    );
  }

  const elapsedMs = Math.round(status.elapsedMicroseconds / 1000);
  const lastEvent = status.lastEventDisplay ?? 'waiting for input…';

  return React.createElement(
    'div',
    {
      role: 'status',
      'aria-live': 'polite',
      className: `flex flex-wrap items-center justify-between gap-4 p-3 px-5 rounded-xl bg-[var(--color-surface-raised)] border border-[var(--color-border)] shadow-md select-none ${className}`,
    },
    // Left: Status indicator dot & telemetry text
    React.createElement(
      'div',
      { className: 'flex items-center gap-3' },
      React.createElement('span', {
        className: `w-3 h-3 rounded-full ${
          status.isPaused
            ? 'bg-[var(--color-warning)]'
            : 'bg-[var(--color-focus)] animate-pulse'
        }`,
      }),
      React.createElement(
        'span',
        {
          className: 'text-[14px] font-medium text-[var(--color-text-primary)]',
        },
        status.isPaused
          ? `● Recording paused • ${elapsedMs} ms • actions: ${status.recordedCount}`
          : `● Recording • ${elapsedMs} ms • actions: ${status.recordedCount} • last: ${lastEvent}`,
      ),
    ),

    // Right: Pause/Resume & Stop buttons
    React.createElement(
      'div',
      { className: 'flex items-center gap-2.5' },
      status.isPaused
        ? onResume &&
          React.createElement(
            Button,
            {
              variant: 'base',
              size: 'sm',
              onClick: onResume,
            },
            'Resume recording',
          )
        : onPause &&
          React.createElement(
            Button,
            {
              variant: 'base',
              size: 'sm',
              onClick: onPause,
            },
            'Pause',
          ),
      onStop &&
        React.createElement(
          Button,
          {
            variant: 'danger',
            size: 'sm',
            onClick: onStop,
          },
          'Stop recording',
        ),
    ),
  );
}
