import React from 'react';
import { Button } from '../../design-system/Button.js';
import { Checkbox } from '../../design-system/Checkbox.js';
import { Select, type SelectOption } from '../../design-system/Select.js';
import { isChromiumOrUwpWindow } from './target-window-utils.js';
import type { TargetWindowPickerProps } from './types.js';

/**
 * Target window selector with Chromium/UWP incompatibility and integrity elevation warnings.
 */
export function TargetWindowPicker({
  selectedProcessName,
  selectedWindowTitle,
  hotkeyScopedToTarget,
  preferScanCodes,
  openWindows,
  isAppElevated = false,
  disabled = false,
  onSelectWindow,
  onToggleScopedToTarget,
  onTogglePreferScanCodes,
  onRefreshWindows,
  className = '',
}: TargetWindowPickerProps) {
  const hasTarget = selectedProcessName.trim() !== '' && selectedWindowTitle.trim() !== '';

  const matchedWindow = openWindows.find(
    (w) =>
      w.processName.toLowerCase() === selectedProcessName.toLowerCase() &&
      (w.title === selectedWindowTitle ||
        w.title.toLowerCase().includes(selectedWindowTitle.toLowerCase())),
  );

  const isChromiumOrUwp = hasTarget
    ? isChromiumOrUwpWindow(
        selectedProcessName,
        selectedWindowTitle,
        matchedWindow?.className,
      )
    : false;

  const selectOptions: SelectOption<string>[] = openWindows.map((win) => ({
    value: `${win.processName}:::${win.title}`,
    label: win.displayName || `${win.title} (${win.processName})`,
  }));

  const currentValue = hasTarget
    ? `${selectedProcessName}:::${selectedWindowTitle}`
    : selectOptions[0]?.value ?? '';

  const handleWindowChange = (compoundValue: string) => {
    const parts = compoundValue.split(':::');
    const proc = parts[0] ?? '';
    const title = parts.slice(1).join(':::');
    onSelectWindow(proc, title);
  };

  return React.createElement(
    'div',
    {
      className: `flex flex-col gap-3.5 ${className}`,
    },
    React.createElement(
      'label',
      {
        htmlFor: 'target-window-picker-select',
        className: 'text-[14px] font-medium text-[var(--color-text-primary)] select-none',
      },
      'Target window',
    ),
    // Dropdown + Refresh button row
    React.createElement(
      'div',
      { className: 'flex items-center gap-2.5' },
      React.createElement(
        'div',
        { className: 'flex-1 min-w-0' },
        selectOptions.length > 0
          ? React.createElement(Select, {
              options: selectOptions,
              value: currentValue,
              onChange: (val) => handleWindowChange(String(val)),
              disabled,
              placeholder: 'Select a running window...',
              'aria-label': 'Select a running target window',
            })
          : React.createElement(
              'div',
              {
                className:
                  'h-10 px-3.5 flex items-center text-[13px] text-[var(--color-text-muted)] bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg',
              },
              'No running windows found',
            ),
      ),
      React.createElement(
        Button,
        {
          variant: 'base',
          size: 'md',
          onClick: onRefreshWindows,
          disabled,
          title: 'Refresh open windows list',
        },
        'Refresh list',
      ),
    ),

    // Saved target indicator
    React.createElement(
      'div',
      { className: 'text-[12px] text-[var(--color-text-muted)] select-none' },
      React.createElement('span', { className: 'font-semibold' }, 'Saved target: '),
      React.createElement(
        'span',
        { className: hasTarget ? 'text-[var(--color-text-primary)]' : 'italic' },
        hasTarget ? `${selectedWindowTitle} (${selectedProcessName})` : 'None selected',
      ),
    ),

    // Warning 1: Chromium / UWP limitation
    isChromiumOrUwp &&
      React.createElement(
        'div',
        {
          role: 'alert',
          'aria-live': 'assertive',
          className:
            'p-3.5 rounded-lg bg-[var(--color-warning-surface)] border border-[var(--color-warning)] text-[var(--color-warning)] text-[13px] leading-relaxed select-none',
        },
        React.createElement(
          'p',
          { className: 'font-semibold' },
          'This window runs on Chromium (browsers, Electron — VS Code, Discord) or UWP/a game. Such apps ignore window messages, so background delivery will not work — use the “Active window” mode instead.',
        ),
      ),

    // Warning 2: Non-elevated administrator warning banner (Integrity mismatch)
    !isAppElevated &&
      React.createElement(
        'div',
        {
          role: 'alert',
          'aria-live': 'assertive',
          className:
            'p-3.5 rounded-lg bg-[var(--color-danger-surface)] border border-[var(--color-danger)] text-[var(--color-danger)] text-[13px] leading-relaxed select-none',
        },
        React.createElement(
          'div',
          { className: 'flex items-center gap-2 font-semibold' },
          React.createElement(
            'svg',
            {
              className: 'w-4 h-4 shrink-0',
              viewBox: '0 0 24 24',
              fill: 'none',
              stroke: 'currentColor',
              strokeWidth: 2,
            },
            React.createElement('path', {
              d: 'M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z',
            }),
          ),
          React.createElement('span', null, 'Run Macro Recorder as administrator.'),
        ),
      ),

    // Warning 3: Missing selection warning if empty
    !hasTarget &&
      React.createElement(
        'p',
        { className: 'text-[12px] text-[var(--color-warning)] italic select-none' },
        'Select a target window on the Playback tab first.',
      ),

    // Scoped hotkey Checkbox
    React.createElement(
      'div',
      { className: 'pt-1' },
      React.createElement(Checkbox, {
        id: 'hotkey-scoped-to-target-checkbox',
        checked: hotkeyScopedToTarget,
        disabled,
        onChange: onToggleScopedToTarget,
        label: 'Bind only when this window is active',
        'aria-label':
          'The hotkey starts the macro only when the selected window is active; in other windows the key works as usual.',
      }),
      React.createElement(
        'p',
        { className: 'text-[12px] text-[var(--color-text-muted)] mt-1.5 ml-7 leading-relaxed select-none' },
        'The hotkey starts the macro only when the selected window is active; in other windows the key works as usual. Off by default.',
      ),
    ),

    // Prefer scan codes Checkbox
    React.createElement(
      'div',
      { className: 'pt-1' },
      React.createElement(Checkbox, {
        id: 'prefer-scan-codes-checkbox',
        checked: preferScanCodes,
        disabled,
        onChange: onTogglePreferScanCodes,
        label: 'Prefer hardware scan codes for background messages',
        'aria-label': 'Prefer scan codes for window messages',
      }),
    ),
  );
}
