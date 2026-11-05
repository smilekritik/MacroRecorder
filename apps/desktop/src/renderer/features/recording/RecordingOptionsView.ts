import React from 'react';
import { RecordingSourceToggles } from './RecordingSourceToggles.js';
import type { RecordingOptionsViewProps } from './types.js';

/**
 * Recording options tab view
 * Integrates independent source toggles, mouse bucket compression, and countdown delay.
 */
export function RecordingOptionsView({
  options,
  onChange,
  disabled = false,
  className = '',
}: RecordingOptionsViewProps) {
  const handleBucketChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.trim();
    if (raw === '') {
      onChange({ ...options, mouseMoveBucketMilliseconds: 0 });
      return;
    }
    const val = parseInt(raw, 10);
    if (!isNaN(val)) {
      onChange({
        ...options,
        mouseMoveBucketMilliseconds: Math.max(0, val),
      });
    }
  };

  const handleCountdownChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.trim();
    if (raw === '') {
      onChange({ ...options, countdownSeconds: 0 });
      return;
    }
    const val = parseInt(raw, 10);
    if (!isNaN(val)) {
      onChange({
        ...options,
        countdownSeconds: Math.max(0, Math.min(60, val)),
      });
    }
  };

  return React.createElement(
    'div',
    {
      className: `w-full max-w-5xl select-none ${className}`,
    },
    React.createElement(
      'div',
      { className: 'grid grid-cols-1 md:grid-cols-2 gap-7' },
      // Column 1: Sources
      React.createElement(
        'div',
        { className: 'flex flex-col' },
        React.createElement(RecordingSourceToggles, {
          options,
          onChange,
          disabled,
        }),
      ),

      // Column 2: Recording Options
      React.createElement(
        'div',
        { className: 'flex flex-col' },
        React.createElement(
          'div',
          {
            className:
              'flex flex-col rounded-xl bg-[var(--color-surface-raised)] border border-[var(--color-border-subtle)] p-4',
          },
          React.createElement(
            'h3',
            {
              className:
                'text-[12px] font-bold tracking-wider text-[var(--color-text-secondary)] uppercase mb-4 select-none',
            },
            'Recording Options',
          ),

          // Movement compression
          React.createElement(
            'div',
            { className: 'flex flex-col mb-6' },
            React.createElement(
              'label',
              {
                htmlFor: 'recording-mouse-bucket-input',
                className: 'text-[14px] font-medium text-[var(--color-text-primary)] mb-1.5',
              },
              'Movement compression',
            ),
            React.createElement(
              'div',
              { className: 'relative flex items-center w-full max-w-[200px]' },
              React.createElement('input', {
                id: 'recording-mouse-bucket-input',
                type: 'number',
                min: 0,
                max: 1000,
                disabled,
                value: options.mouseMoveBucketMilliseconds,
                onChange: handleBucketChange,
                'aria-label': 'Movement compression in milliseconds',
                className:
                  'w-full h-10 px-3.5 pr-10 text-[14px] font-medium rounded-lg bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-focus)] disabled:opacity-50 transition-colors',
              }),
              React.createElement(
                'span',
                {
                  className:
                    'absolute right-3.5 text-[13px] font-medium text-[var(--color-text-muted)] pointer-events-none select-none',
                },
                'ms',
              ),
            ),
            React.createElement(
              'p',
              {
                className: 'text-[12px] text-[var(--color-text-muted)] mt-2 leading-relaxed',
              },
              'Mouse moves close in time are merged into one step: fewer events, lighter recording. 0 keeps every move.',
            ),
          ),

          // Countdown
          React.createElement(
            'div',
            { className: 'flex flex-col' },
            React.createElement(
              'label',
              {
                htmlFor: 'recording-countdown-input',
                className: 'text-[14px] font-medium text-[var(--color-text-primary)] mb-1.5',
              },
              'Countdown',
            ),
            React.createElement(
              'div',
              { className: 'relative flex items-center w-full max-w-[200px]' },
              React.createElement('input', {
                id: 'recording-countdown-input',
                type: 'number',
                min: 0,
                max: 60,
                disabled,
                value: options.countdownSeconds,
                onChange: handleCountdownChange,
                'aria-label': 'Recording countdown in seconds',
                className:
                  'w-full h-10 px-3.5 pr-12 text-[14px] font-medium rounded-lg bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-focus)] disabled:opacity-50 transition-colors',
              }),
              React.createElement(
                'span',
                {
                  className:
                    'absolute right-3.5 text-[13px] font-medium text-[var(--color-text-muted)] pointer-events-none select-none',
                },
                'sec',
              ),
            ),
            React.createElement(
              'p',
              {
                className: 'text-[12px] text-[var(--color-text-muted)] mt-2 leading-relaxed',
              },
              'Delay before recording starts, so you can switch to the right window. 0 starts immediately.',
            ),
          ),
        ),
      ),
    ),
  );
}
