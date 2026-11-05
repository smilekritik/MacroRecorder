import React, { useRef } from 'react';
import { Button } from '../../design-system/Button.js';
import { Checkbox } from '../../design-system/Checkbox.js';
import { PillSwitch } from '../../design-system/PillSwitch.js';
import { Slider } from '../../design-system/Slider.js';
import {
  clampPlaybackSpeed,
  applyRepeatForever,
} from '../../../../../../packages/domain/src/model/index.js';
import {
  formatRepeatCountDisplay,
  formatTimingSpreadHint,
  stepRepeatCount,
} from './target-window-utils.js';
import type { PlaybackTimingViewProps } from './types.js';

/**
 * Playback timing options view.
 * Supports timing randomization, speed slider/input, repeat count steppers,
 * infinite repeat forcing stoppable activation policy, and repeat delay.
 */
export function PlaybackTimingView({
  options,
  onChange,
  disabled = false,
  className = '',
}: PlaybackTimingViewProps) {
  const lastFiniteRepeatRef = useRef<number>(
    options.repeatCount > 0 ? options.repeatCount : 1,
  );

  const isRepeatForever = options.repeatCount === 0;

  // 1. Randomize timing
  const handleToggleRandomize = (checked: boolean) => {
    onChange({
      ...options,
      randomizeTiming: checked,
    });
  };

  const handleJitterChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.trim();
    if (raw === '') {
      onChange({ ...options, timingJitterMilliseconds: 0 });
      return;
    }
    const val = parseInt(raw, 10);
    if (!isNaN(val)) {
      onChange({
        ...options,
        timingJitterMilliseconds: Math.max(0, val),
      });
    }
  };

  // 2. Speed
  const handleSpeedSliderChange = (newSpeed: number) => {
    onChange({
      ...options,
      speed: clampPlaybackSpeed(newSpeed),
    });
  };

  const handleSpeedInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.trim().replace(',', '.');
    if (raw === '') return;
    const val = parseFloat(raw);
    if (!isNaN(val)) {
      onChange({
        ...options,
        speed: clampPlaybackSpeed(val),
      });
    }
  };

  // 3. Repeat Count Steppers & Infinite Repeat
  const handleStepRepeat = (delta: number) => {
    const stepped = stepRepeatCount(options.repeatCount, delta);
    if (stepped > 0) {
      lastFiniteRepeatRef.current = stepped;
    }
    onChange({
      ...options,
      repeatCount: stepped,
    });
  };

  const handleRepeatCountInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.trim().toLowerCase();
    if (raw === 'indefinitely' || raw === '0') {
      handleToggleRepeatForever(true);
      return;
    }
    const val = parseInt(raw, 10);
    if (!isNaN(val)) {
      const normalized = Math.max(1, val);
      lastFiniteRepeatRef.current = normalized;
      onChange({
        ...options,
        repeatCount: normalized,
      });
    }
  };

  const handleToggleRepeatForever = (checked: boolean) => {
    const res = applyRepeatForever(options, checked, lastFiniteRepeatRef.current);
    lastFiniteRepeatRef.current = res.lastFiniteRepeatCount;
    onChange(res.options);
  };

  const handleRepeatDelayChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.trim();
    if (raw === '') {
      onChange({ ...options, repeatDelayMilliseconds: 0 });
      return;
    }
    const val = parseInt(raw, 10);
    if (!isNaN(val)) {
      onChange({
        ...options,
        repeatDelayMilliseconds: Math.max(0, val),
      });
    }
  };

  return React.createElement(
    'div',
    {
      className: `flex flex-col gap-4 select-none ${className}`,
    },
    React.createElement(
      'h3',
      {
        className:
          'text-[12px] font-bold tracking-wider text-[var(--color-text-secondary)] uppercase mb-1',
      },
      'Playback Timing',
    ),

    // Card 1: Random timings
    React.createElement(
      'div',
      {
        className:
          'flex flex-col rounded-xl bg-[var(--color-surface-raised)] border border-[var(--color-border-subtle)] p-4',
      },
      React.createElement(
        'div',
        { className: 'flex items-start justify-between gap-3' },
        React.createElement(
          'div',
          { className: 'flex flex-col' },
          React.createElement(
            'span',
            { className: 'text-[14px] font-semibold text-[var(--color-text-primary)]' },
            'Random timings',
          ),
          React.createElement(
            'span',
            { className: 'text-[12px] text-[var(--color-text-muted)] mt-0.5' },
            'Off by default',
          ),
        ),
        React.createElement(PillSwitch, {
          checked: options.randomizeTiming,
          disabled,
          onChange: handleToggleRandomize,
          'aria-label': 'Toggle random timings',
        }),
      ),

      options.randomizeTiming &&
        React.createElement(
          'div',
          { className: 'mt-4 pt-3 border-t border-[var(--color-border-subtle)] flex flex-col gap-2' },
          React.createElement(
            'div',
            { className: 'flex items-center justify-between gap-3' },
            React.createElement(
              'label',
              {
                htmlFor: 'timing-jitter-input',
                className: 'text-[13px] font-medium text-[var(--color-text-secondary)]',
              },
              'Spread, ± ms',
            ),
            React.createElement(
              'div',
              { className: 'relative flex items-center w-28' },
              React.createElement('input', {
                id: 'timing-jitter-input',
                type: 'number',
                min: 0,
                max: 10000,
                disabled,
                value: options.timingJitterMilliseconds,
                onChange: handleJitterChange,
                'aria-label': 'Timing spread in milliseconds',
                className:
                  'w-full h-9 px-3 pr-8 text-[13px] font-medium rounded-lg bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-text-primary)] text-right focus:outline-none focus:border-[var(--color-focus)] disabled:opacity-50 transition-colors',
              }),
              React.createElement(
                'span',
                {
                  className:
                    'absolute right-2.5 text-[12px] text-[var(--color-text-muted)] pointer-events-none',
                },
                'ms',
              ),
            ),
          ),
          React.createElement(
            'p',
            { className: 'text-[12px] text-[var(--color-text-muted)] mt-1' },
            formatTimingSpreadHint(options.timingJitterMilliseconds),
          ),
        ),
    ),

    // Card 2: Speed
    React.createElement(
      'div',
      {
        className:
          'flex flex-col rounded-xl bg-[var(--color-surface-raised)] border border-[var(--color-border-subtle)] p-4',
      },
      React.createElement(
        'div',
        { className: 'flex items-center justify-between gap-3 mb-3' },
        React.createElement(
          'span',
          { className: 'text-[14px] font-semibold text-[var(--color-text-primary)]' },
          'Speed',
        ),
        React.createElement(
          'div',
          { className: 'relative flex items-center w-24' },
          React.createElement('input', {
            id: 'playback-speed-input',
            type: 'number',
            step: 0.1,
            min: 0.1,
            max: 10.0,
            disabled,
            value: options.speed,
            onChange: handleSpeedInputChange,
            'aria-label': 'Playback speed',
            className:
              'w-full h-9 px-3 pr-7 text-[13px] font-medium rounded-lg bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-text-primary)] text-right focus:outline-none focus:border-[var(--color-focus)] disabled:opacity-50 transition-colors',
          }),
          React.createElement(
            'span',
            {
              className:
                'absolute right-2.5 text-[13px] text-[var(--color-text-muted)] pointer-events-none font-semibold',
            },
            '×',
          ),
        ),
      ),
      React.createElement(Slider, {
        value: options.speed,
        onChange: handleSpeedSliderChange,
        min: 0.1,
        max: 10.0,
        step: 0.1,
        disabled,
        'aria-label': 'Playback speed slider',
      }),
      React.createElement(
        'div',
        { className: 'flex justify-between items-center text-[11px] text-[var(--color-text-muted)] mt-2' },
        React.createElement('span', null, '0,1×'),
        React.createElement('span', null, '1×'),
        React.createElement('span', null, '10×'),
      ),
    ),

    // Card 3: Repeats
    React.createElement(
      'div',
      {
        className:
          'flex flex-col rounded-xl bg-[var(--color-surface-raised)] border border-[var(--color-border-subtle)] p-4',
      },
      React.createElement(
        'div',
        { className: 'flex items-center justify-between gap-3 mb-3' },
        React.createElement(
          'span',
          { className: 'text-[14px] font-semibold text-[var(--color-text-primary)]' },
          'Repeat count',
        ),
        React.createElement(
          'div',
          { className: 'flex items-center gap-1.5' },
          React.createElement(
            Button,
            {
              variant: 'stepper',
              size: 'sm',
              disabled: disabled || isRepeatForever,
              onClick: () => handleStepRepeat(-1),
              title: 'Fewer repeats',
              'aria-label': 'Fewer repeats',
            },
            '−',
          ),
          React.createElement('input', {
            id: 'playback-repeat-count-input',
            type: 'text',
            disabled: disabled || isRepeatForever,
            value: formatRepeatCountDisplay(options.repeatCount),
            onChange: handleRepeatCountInputChange,
            'aria-label': 'Macro repeat count',
            className:
              'w-24 h-9 px-2 text-[13px] font-medium rounded-lg bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-text-primary)] text-center focus:outline-none focus:border-[var(--color-focus)] disabled:opacity-50 transition-colors',
          }),
          React.createElement(
            Button,
            {
              variant: 'stepper',
              size: 'sm',
              disabled: disabled || isRepeatForever,
              onClick: () => handleStepRepeat(1),
              title: 'More repeats',
              'aria-label': 'More repeats',
            },
            '+',
          ),
        ),
      ),

      // Inset panel: Repeat indefinitely Checkbox
      React.createElement(
        'div',
        {
          className:
            'p-3 rounded-lg bg-[var(--color-surface)] border border-[var(--color-border-subtle)] mb-3 flex flex-col gap-1.5',
        },
        React.createElement(Checkbox, {
          id: 'repeat-indefinitely-checkbox',
          checked: isRepeatForever,
          disabled,
          onChange: handleToggleRepeatForever,
          label: 'Repeat indefinitely',
          'aria-label': 'Repeat macro indefinitely',
        }),
        isRepeatForever &&
          React.createElement(
            'div',
            {
              role: 'note',
              className:
                'text-[12px] text-[var(--color-accent)] font-medium ml-7 mt-0.5 leading-snug',
            },
            '● Infinite repeat forces ToggleStop activation mode so playback can be stopped.',
          ),
      ),

      // Delay between repeats
      React.createElement(
        'div',
        { className: 'flex items-center justify-between gap-3 pt-1' },
        React.createElement(
          'label',
          {
            htmlFor: 'repeat-delay-input',
            className: 'text-[13px] font-medium text-[var(--color-text-secondary)]',
          },
          'Delay between repeats',
        ),
        React.createElement(
          'div',
          { className: 'relative flex items-center w-28' },
          React.createElement('input', {
            id: 'repeat-delay-input',
            type: 'number',
            min: 0,
            max: 3600000,
            disabled,
            value: options.repeatDelayMilliseconds,
            onChange: handleRepeatDelayChange,
            'aria-label': 'Delay between repeats in milliseconds',
            className:
              'w-full h-9 px-3 pr-8 text-[13px] font-medium rounded-lg bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-text-primary)] text-right focus:outline-none focus:border-[var(--color-focus)] disabled:opacity-50 transition-colors',
          }),
          React.createElement(
            'span',
            {
              className:
                'absolute right-2.5 text-[12px] text-[var(--color-text-muted)] pointer-events-none',
            },
            'ms',
          ),
        ),
      ),
    ),
  );
}
