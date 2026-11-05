import React from 'react';
import { PillSwitch } from '../../design-system/PillSwitch.js';
import { Select, type SelectOption } from '../../design-system/Select.js';
import {
  FocusLossBehavior,
  OverlayCardOverride,
  TargetMode,
} from '../../../../../../packages/contracts/src/index.js';
import { TargetWindowPicker } from './TargetWindowPicker.js';
import type { PlaybackTargetingViewProps } from './types.js';

const TARGET_MODE_OPTIONS: readonly SelectOption<TargetMode>[] = [
  { value: TargetMode.ForegroundAtStart, label: 'Active window (SendInput)' },
  { value: TargetMode.SpecificWindow, label: 'Specific window (Background messages)' },
];

const FOCUS_LOSS_OPTIONS: readonly SelectOption<FocusLossBehavior>[] = [
  { value: FocusLossBehavior.Continue, label: 'Continue execution' },
  { value: FocusLossBehavior.Pause, label: 'Pause playback' },
  { value: FocusLossBehavior.Stop, label: 'Stop playback' },
];

const OVERLAY_CARD_OPTIONS: readonly SelectOption<OverlayCardOverride>[] = [
  { value: OverlayCardOverride.Inherit, label: 'Inherit global setting' },
  { value: OverlayCardOverride.ForceShow, label: 'Always show' },
  { value: OverlayCardOverride.ForceHide, label: 'Always hide' },
];

/**
 * Playback input mode and targeting view.
 * Supports delivery mode selection, target window picker and compatibility warnings,
 * pass-through hotkey hook toggle, focus loss handling, and overlay card overrides.
 */
export function PlaybackTargetingView({
  options,
  onChange,
  openWindows,
  isAppElevated = false,
  onRefreshWindows,
  disabled = false,
  className = '',
}: PlaybackTargetingViewProps) {
  const isSpecificWindow = options.targetMode === TargetMode.SpecificWindow;

  const handleTargetModeChange = (mode: TargetMode) => {
    const changed = options.targetMode !== mode;
    onChange({
      ...options,
      targetMode: mode,
      // Switching to SpecificWindow automatically enables preferScanCodes
      preferScanCodes: changed && mode === TargetMode.SpecificWindow ? true : options.preferScanCodes,
    });
  };

  const handleSelectWindow = (processName: string, windowTitle: string) => {
    onChange({
      ...options,
      targetProcessName: processName,
      targetWindowTitle: windowTitle,
    });
  };

  const handleToggleScopedToTarget = (scoped: boolean) => {
    onChange({
      ...options,
      hotkeyScopedToTarget: scoped,
    });
  };

  const handleTogglePreferScanCodes = (prefer: boolean) => {
    onChange({
      ...options,
      preferScanCodes: prefer,
    });
  };

  const handleTogglePassThrough = (pass: boolean) => {
    onChange({
      ...options,
      passThroughHotkey: pass,
    });
  };

  const handleFocusLossChange = (behavior: FocusLossBehavior) => {
    onChange({
      ...options,
      focusLossBehavior: behavior,
    });
  };

  const handleInfoCardOverrideChange = (val: OverlayCardOverride) => {
    onChange({
      ...options,
      infoCardOverride: val,
    });
  };

  const handleCustomTextOverrideChange = (val: OverlayCardOverride) => {
    onChange({
      ...options,
      customTextOverride: val,
    });
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
      'Input Mode',
    ),

    // Card 1: Input delivery mode & Target window picker
    React.createElement(
      'div',
      {
        className:
          'flex flex-col rounded-xl bg-[var(--color-surface-raised)] border border-[var(--color-accent)] p-4',
      },
      React.createElement(
        'label',
        {
          htmlFor: 'playback-target-mode-select',
          className: 'text-[14px] font-medium text-[var(--color-text-primary)] mb-2',
        },
        'Input delivery mode',
      ),
      React.createElement(Select, {
        options: TARGET_MODE_OPTIONS,
        value: options.targetMode,
        onChange: (val) => handleTargetModeChange(val as TargetMode),
        disabled,
        'aria-label': 'Macro input delivery mode',
      }),
      React.createElement(
        'p',
        { className: 'text-[12px] text-[var(--color-text-muted)] mt-2.5 leading-relaxed' },
        isSpecificWindow
          ? "Input is delivered as messages straight to the selected window, so windows on top and loss of focus don't interfere."
          : 'System SendInput simulates keyboard and mouse input in the currently active window.',
      ),

      // Target Window Picker (visible when SpecificWindow)
      isSpecificWindow &&
        React.createElement(
          'div',
          { className: 'mt-5 pt-4 border-t border-[var(--color-border-subtle)]' },
          React.createElement(TargetWindowPicker, {
            selectedProcessName: options.targetProcessName,
            selectedWindowTitle: options.targetWindowTitle,
            hotkeyScopedToTarget: options.hotkeyScopedToTarget,
            preferScanCodes: options.preferScanCodes,
            openWindows,
            isAppElevated,
            disabled,
            onSelectWindow: handleSelectWindow,
            onToggleScopedToTarget: handleToggleScopedToTarget,
            onTogglePreferScanCodes: handleTogglePreferScanCodes,
            onRefreshWindows,
          }),
        ),
    ),

    // Card 2: Pass-through hotkey
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
            'Pass the hotkey through to the app',
          ),
          React.createElement(
            'span',
            { className: 'text-[12px] text-[var(--color-text-muted)] mt-1 leading-relaxed' },
            'The bind key both starts the macro and reaches the active window. Handled by a low-level hook. Off by default.',
          ),
        ),
        React.createElement(PillSwitch, {
          checked: options.passThroughHotkey,
          disabled,
          onChange: handleTogglePassThrough,
          'aria-label': 'Pass the hotkey through to the app',
        }),
      ),
    ),

    // Card 3: Focus-loss behavior
    React.createElement(
      'div',
      {
        className:
          'flex flex-col rounded-xl bg-[var(--color-surface-raised)] border border-[var(--color-border-subtle)] p-4',
      },
      React.createElement(
        'label',
        {
          htmlFor: 'playback-focus-loss-select',
          className: 'text-[14px] font-semibold text-[var(--color-text-primary)] mb-1.5',
        },
        'When target loses focus',
      ),
      React.createElement(Select, {
        options: FOCUS_LOSS_OPTIONS,
        value: options.focusLossBehavior,
        onChange: (val) => handleFocusLossChange(val as FocusLossBehavior),
        disabled,
        'aria-label': 'Behavior when target window loses focus',
      }),
      React.createElement(
        'p',
        { className: 'text-[12px] text-[var(--color-text-muted)] mt-2 leading-relaxed' },
        'Defines whether the macro pauses, stops immediately, or continues when the user clicks away.',
      ),
    ),

    // Card 4: On-screen cards
    React.createElement(
      'div',
      {
        className:
          'flex flex-col rounded-xl bg-[var(--color-surface-raised)] border border-[var(--color-border-subtle)] p-4',
      },
      React.createElement(
        'span',
        { className: 'text-[14px] font-semibold text-[var(--color-text-primary)] mb-1' },
        'On-screen cards',
      ),
      React.createElement(
        'p',
        { className: 'text-[12px] text-[var(--color-text-muted)] mb-3 leading-relaxed' },
        'Force a card shown or hidden for this macro specifically — takes priority over the app setting.',
      ),

      React.createElement(
        'div',
        { className: 'flex flex-col gap-3' },
        React.createElement(
          'div',
          { className: 'flex flex-col gap-1.5' },
          React.createElement(
            'label',
            { className: 'text-[13px] font-medium text-[var(--color-text-secondary)]' },
            'Macro information',
          ),
          React.createElement(Select, {
            options: OVERLAY_CARD_OPTIONS,
            value: options.infoCardOverride,
            onChange: (val) => handleInfoCardOverrideChange(val as OverlayCardOverride),
            disabled,
            'aria-label': 'Macro information card for this macro',
          }),
        ),

        React.createElement(
          'div',
          { className: 'flex flex-col gap-1.5' },
          React.createElement(
            'label',
            { className: 'text-[13px] font-medium text-[var(--color-text-secondary)]' },
            'Custom text',
          ),
          React.createElement(Select, {
            options: OVERLAY_CARD_OPTIONS,
            value: options.customTextOverride,
            onChange: (val) => handleCustomTextOverrideChange(val as OverlayCardOverride),
            disabled,
            'aria-label': 'Custom text card for this macro',
          }),
        ),
      ),
    ),
  );
}
