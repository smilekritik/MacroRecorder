import React from 'react';
import { Checkbox } from '../../design-system/Checkbox.js';
import type { RecordingSourceTogglesProps } from './types.js';

/**
 * Independent recording source toggles Record tab.
 */
export function RecordingSourceToggles({
  options,
  onChange,
  disabled = false,
  className = '',
}: RecordingSourceTogglesProps) {
  const updateSource = (field: keyof typeof options, checked: boolean) => {
    onChange({
      ...options,
      [field]: checked,
    });
  };

  return React.createElement(
    'div',
    {
      className: `flex flex-col rounded-xl bg-[var(--color-surface-raised)] border border-[var(--color-border-subtle)] p-4 ${className}`,
    },
    React.createElement(
      'h3',
      {
        className: 'text-[12px] font-bold tracking-wider text-[var(--color-text-secondary)] uppercase mb-3 select-none',
      },
      'Recording Sources',
    ),
    React.createElement(
      'p',
      {
        className: 'text-[13px] text-[var(--color-text-muted)] mb-4 select-none leading-relaxed',
      },
      'Tick which input sources are captured. Unticked sources are not recorded.',
    ),
    React.createElement(
      'div',
      { className: 'flex flex-col gap-3.5' },
      React.createElement(Checkbox, {
        id: 'record-source-keyboard',
        checked: options.keyboard,
        disabled,
        onChange: (val) => updateSource('keyboard', val),
        label: 'Keyboard',
        'aria-label': 'Record keyboard input',
      }),
      React.createElement(Checkbox, {
        id: 'record-source-mouse-buttons',
        checked: options.mouseButtons,
        disabled,
        onChange: (val) => updateSource('mouseButtons', val),
        label: 'Mouse buttons',
        'aria-label': 'Record mouse button clicks',
      }),
      React.createElement(Checkbox, {
        id: 'record-source-mouse-movement',
        checked: options.mouseMovement,
        disabled,
        onChange: (val) => updateSource('mouseMovement', val),
        label: 'Mouse movement',
        'aria-label': 'Record mouse movement',
      }),
      React.createElement(Checkbox, {
        id: 'record-source-mouse-wheel',
        checked: options.mouseWheel,
        disabled,
        onChange: (val) => updateSource('mouseWheel', val),
        label: 'Mouse wheel',
        'aria-label': 'Record mouse wheel scrolling',
      }),
      React.createElement(Checkbox, {
        id: 'record-source-gamepad',
        checked: options.gamepad,
        disabled,
        onChange: (val) => updateSource('gamepad', val),
        label: 'Gamepad (Xbox / DualShock 4)',
        'aria-label': 'Record gamepad input',
      }),
    ),
  );
}
