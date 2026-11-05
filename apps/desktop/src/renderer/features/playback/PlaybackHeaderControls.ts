import React from 'react';
import { Button } from '../../design-system/Button.js';
import { PillSwitch } from '../../design-system/PillSwitch.js';
import { Select, type SelectOption } from '../../design-system/Select.js';
import { ActivationMode, EngineState } from '../../../../../../packages/contracts/src/index.js';
import type { PlaybackHeaderControlsProps } from './types.js';

const ACTIVATION_MODE_OPTIONS: readonly SelectOption<ActivationMode>[] = [
  { value: ActivationMode.WhileHeld, label: 'While shortcut is held' },
  { value: ActivationMode.Once, label: 'Run once to completion' },
  { value: ActivationMode.ToggleStop, label: 'Press again to stop' },
  { value: ActivationMode.Restart, label: 'Press again to restart' },
];

/**
 * Derives the indicator dot styling:
 * - Idle: Red (#EF4444)
 * - Recording or Countdown: Blinking blue (#3B82F6)
 * - Playing: Blinking green (#10B981)
 * - Paused: Yellow (#F59E0B)
 */
function getIndicatorDotClass(engineState: EngineState): string {
  switch (engineState) {
    case EngineState.Recording:
    case EngineState.Countdown:
      return 'bg-blue-500 animate-pulse ring-4 ring-blue-500/20';
    case EngineState.Playing:
      return 'bg-emerald-500 animate-pulse ring-4 ring-emerald-500/20';
    case EngineState.Paused:
      return 'bg-amber-500 ring-2 ring-amber-500/20';
    case EngineState.Idle:
    default:
      return 'bg-red-500';
  }
}

function getIndicatorDotLabel(engineState: EngineState): string {
  switch (engineState) {
    case EngineState.Recording:
      return 'Recording in progress';
    case EngineState.Countdown:
      return 'Recording countdown';
    case EngineState.Playing:
      return 'Playback in progress';
    case EngineState.Paused:
      return 'Playback paused';
    case EngineState.Stopping:
      return 'Stopping';
    case EngineState.Idle:
    default:
      return 'Engine idle';
  }
}

/**
 * Header playback controls:
 * - Status indicator dot (red, blinking blue, blinking green, yellow)
 * - Center playback banner ("Playing: ...", "Paused: ...")
 * - Primary buttons: Record, Run, Pause/Resume, Stop
 * - Secondary macro controls: Activation mode (forced to ToggleStop on infinite repeat),
 *   macro enabled toggle, and automatic trigger badge.
 */
export function PlaybackHeaderControls({
  selectedMacro,
  engineState,
  playbackBanner,
  isMacroEnabled,
  isAutomaticTrigger,
  onRecordClick,
  onPlayClick,
  onPauseClick,
  onStopClick,
  onToggleMacroEnabled,
  onChangeActivationMode,
  onOpenSettings,
  emergencyStopHotkeyText,
  className = '',
}: PlaybackHeaderControlsProps) {
  const isBusyRecording =
    engineState === EngineState.Recording || engineState === EngineState.Countdown;
  const isPlaying = engineState === EngineState.Playing;
  const isPaused = engineState === EngineState.Paused;
  const isStopping = engineState === EngineState.Stopping;
  const isRunning = isPlaying || isPaused;

  const isRepeatForever = selectedMacro?.playback?.repeatCount === 0;
  const effectiveActivationMode = isRepeatForever
    ? ActivationMode.ToggleStop
    : (selectedMacro?.playback?.activationMode ?? ActivationMode.Once);

  const dotClass = getIndicatorDotClass(engineState);
  const dotLabel = getIndicatorDotLabel(engineState);

  const stopTitle = emergencyStopHotkeyText
    ? `Stop playback or recording (${emergencyStopHotkeyText})`
    : 'Stop playback or recording';

  return React.createElement(
    'header',
    {
      className: `w-full h-16 px-6 bg-[var(--color-surface)] border-b border-[var(--color-border-subtle)] flex items-center justify-between gap-4 select-none ${className}`,
    },
    // Left cluster: Indicator dot + Title
    React.createElement(
      'div',
      { className: 'flex items-center gap-3 shrink-0' },
      React.createElement('span', {
        className: `w-[11px] h-[11px] rounded-full transition-colors ${dotClass}`,
        title: dotLabel,
        'aria-label': dotLabel,
        role: 'status',
      }),
      React.createElement(
        'h1',
        { className: 'text-[19px] font-bold text-[var(--color-text-primary)] tracking-tight' },
        'Macro Recorder',
      ),
    ),

    // Centre cluster: Playback Banner (what is running now)
    React.createElement(
      'div',
      {
        className:
          'flex-1 max-w-xl mx-4 text-center min-h-[36px] flex items-center justify-center',
      },
      playbackBanner
        ? React.createElement(
            'div',
            {
              className:
                'text-[13px] font-semibold text-[var(--color-accent)] leading-tight line-clamp-2 px-3 py-1 rounded-md bg-[var(--color-surface-raised)] border border-[var(--color-border-subtle)]',
              title: playbackBanner,
              role: 'status',
              'aria-live': 'polite',
            },
            playbackBanner,
          )
        : null,
    ),

    // Right cluster: Primary action buttons + Settings + Macro state
    React.createElement(
      'div',
      { className: 'flex items-center gap-2.5 shrink-0' },
      // Record button
      React.createElement(
        Button,
        {
          variant: 'accent',
          size: 'md',
          disabled: isRunning || isBusyRecording || isStopping,
          onClick: onRecordClick,
          title: 'Start recording',
          'aria-label': 'Start recording',
        },
        React.createElement('span', {
          className: 'w-2.5 h-2.5 rounded-full bg-red-500 mr-2 shrink-0 inline-block',
        }),
        'Record',
      ),

      // Play / Run button
      React.createElement(
        Button,
        {
          variant: 'base',
          size: 'md',
          disabled: !selectedMacro || isBusyRecording || isRunning || isStopping,
          onClick: onPlayClick,
          title: 'Run selected macro',
          'aria-label': 'Run selected macro',
        },
        React.createElement(
          'svg',
          {
            className: 'w-3.5 h-3.5 mr-1.5 fill-current shrink-0',
            viewBox: '0 0 24 24',
          },
          React.createElement('path', { d: 'M8 5v14l11-7z' }),
        ),
        'Run',
      ),

      // Pause / Resume button
      React.createElement(
        Button,
        {
          variant: 'base',
          size: 'md',
          disabled: !isRunning || isStopping,
          onClick: onPauseClick,
          title: isPaused ? 'Resume playback' : 'Pause playback',
          'aria-label': isPaused ? 'Resume playback' : 'Pause playback',
        },
        isPaused
          ? React.createElement(
              'svg',
              {
                className: 'w-3.5 h-3.5 mr-1.5 fill-current shrink-0',
                viewBox: '0 0 24 24',
              },
              React.createElement('path', { d: 'M8 5v14l11-7z' }),
            )
          : React.createElement(
              'svg',
              {
                className: 'w-3.5 h-3.5 mr-1.5 fill-current shrink-0',
                viewBox: '0 0 24 24',
              },
              React.createElement('path', { d: 'M6 19h4V5H6v14zm8-14v14h4V5h-4z' }),
            ),
        isPaused ? 'Resume' : 'Pause',
      ),

      // Stop button
      React.createElement(
        Button,
        {
          variant: 'danger',
          size: 'md',
          disabled: !isRunning && !isBusyRecording,
          onClick: onStopClick,
          title: stopTitle,
          'aria-label': stopTitle,
        },
        React.createElement('span', {
          className: 'w-2.5 h-2.5 rounded-sm bg-current mr-1.5 inline-block shrink-0',
        }),
        'Stop',
      ),

      // Divider
      React.createElement('div', {
        className: 'w-[1px] h-7 bg-[var(--color-border-subtle)] mx-1.5',
      }),

      // Macro context controls (if a macro is selected)
      selectedMacro &&
        React.createElement(
          'div',
          { className: 'flex items-center gap-3 pl-1' },
          // Automatic trigger indicator OR ActivationMode selector
          isAutomaticTrigger
            ? React.createElement(
                'div',
                {
                  className:
                    'flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--color-accent-surface,#10b98115)] border border-[var(--color-accent)] text-[var(--color-accent)] text-[12px] font-semibold',
                  title: 'Runs automatically when pixel condition is detected. Manual shortcut is disabled.',
                },
                React.createElement('span', {
                  className: 'w-2 h-2 rounded-full bg-[var(--color-accent)] animate-pulse',
                }),
                'Automatic trigger',
              )
            : React.createElement(
                'div',
                {
                  className: 'flex items-center gap-2',
                  title: isRepeatForever
                    ? 'Infinite repeat forces ToggleStop activation mode'
                    : undefined,
                },
                React.createElement(
                  'span',
                  {
                    className:
                      'text-[12px] font-medium text-[var(--color-text-secondary)] whitespace-nowrap hidden xl:inline',
                  },
                  'Shortcut behavior:',
                ),
                React.createElement(
                  'div',
                  { className: 'w-48' },
                  React.createElement(Select, {
                    options: ACTIVATION_MODE_OPTIONS,
                    value: effectiveActivationMode,
                    disabled: isRepeatForever || isRunning || isBusyRecording,
                    onChange: (val) => onChangeActivationMode(val as ActivationMode),
                    'aria-label': 'Macro shortcut behavior',
                  }),
                ),
              ),

          // Macro enabled PillSwitch
          React.createElement(
            'div',
            {
              className: 'flex items-center gap-2 pl-1',
              title: 'Enables or disables the global shortcut of the selected macro',
            },
            React.createElement(PillSwitch, {
              checked: isMacroEnabled,
              disabled: isRunning || isBusyRecording,
              onChange: onToggleMacroEnabled,
              'aria-label': 'Macro enabled',
            }),
            React.createElement(
              'span',
              {
                className: `text-[13px] font-semibold ${
                  isMacroEnabled
                    ? 'text-[var(--color-text-primary)]'
                    : 'text-[var(--color-text-muted)]'
                }`,
              },
              isMacroEnabled ? 'Enabled' : 'Disabled',
            ),
          ),
        ),

      // Settings button
      onOpenSettings &&
        React.createElement(
          Button,
          {
            variant: 'base',
            size: 'md',
            onClick: onOpenSettings,
            title: 'Application settings',
            'aria-label': 'Application settings',
            className: 'ml-1',
          },
          React.createElement(
            'svg',
            {
              className: 'w-4 h-4 text-[var(--color-text-secondary)]',
              viewBox: '0 0 24 24',
              fill: 'none',
              stroke: 'currentColor',
              strokeWidth: 2,
            },
            React.createElement('circle', { cx: 12, cy: 12, r: 3 }),
            React.createElement('path', {
              d: 'M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z',
            }),
          ),
        ),
    ),
  );
}
