import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { PlaybackHeaderControls } from '../PlaybackHeaderControls.js';
import {
  CurrentActionProgress,
  CurrentActionProgressContent,
} from '../CurrentActionProgress.js';
import { formatPlaybackBanner } from '../target-window-utils.js';
import {
  ActivationMode,
  EngineState,
  type DispatchReceipt,
  type MacroDefinition,
  type MacroEvent,
} from '../../../../../../../packages/contracts/src/index.js';
import {
  createDefaultMacroDefinition,
  createKeyDownEvent,
  createMouseMoveEvent,
} from '../../../../../../../packages/domain/src/model/index.js';

describe('PlaybackHeaderControls rendering and state', () => {
  const dummyMacro: MacroDefinition = {
    ...createDefaultMacroDefinition(),
    id: 'macro-1',
    name: 'Test Automation',
    events: [createKeyDownEvent({ virtualKey: 0x41, timeMicroseconds: 1000 })],
  };

  it('renders idle state with red indicator dot and ready buttons', () => {
    const html = renderToString(
      React.createElement(PlaybackHeaderControls, {
        selectedMacro: dummyMacro,
        engineState: EngineState.Idle,
        playbackBanner: '',
        isMacroEnabled: true,
        isAutomaticTrigger: false,
        onRecordClick: () => {},
        onPlayClick: () => {},
        onPauseClick: () => {},
        onStopClick: () => {},
        onToggleMacroEnabled: () => {},
        onChangeActivationMode: () => {},
      }),
    );

    expect(html).toContain('bg-red-500');
    expect(html).toContain('Record');
    expect(html).toContain('Run');
    expect(html).toContain('Pause');
    expect(html).toContain('Stop');
    expect(html).toContain('Macro Recorder');
  });

  it('renders playing state with blinking green dot and active playback banner', () => {
    const html = renderToString(
      React.createElement(PlaybackHeaderControls, {
        selectedMacro: dummyMacro,
        engineState: EngineState.Playing,
        playbackBanner: 'Playing: Test Automation',
        isMacroEnabled: true,
        isAutomaticTrigger: false,
        onRecordClick: () => {},
        onPlayClick: () => {},
        onPauseClick: () => {},
        onStopClick: () => {},
        onToggleMacroEnabled: () => {},
        onChangeActivationMode: () => {},
      }),
    );

    expect(html).toContain('bg-emerald-500 animate-pulse');
    expect(html).toContain('Playing: Test Automation');
  });

  it('renders paused state with yellow indicator dot and resume label', () => {
    const html = renderToString(
      React.createElement(PlaybackHeaderControls, {
        selectedMacro: dummyMacro,
        engineState: EngineState.Paused,
        playbackBanner: 'Paused: Test Automation',
        isMacroEnabled: true,
        isAutomaticTrigger: false,
        onRecordClick: () => {},
        onPlayClick: () => {},
        onPauseClick: () => {},
        onStopClick: () => {},
        onToggleMacroEnabled: () => {},
        onChangeActivationMode: () => {},
      }),
    );

    expect(html).toContain('bg-amber-500');
    expect(html).toContain('Resume');
  });

  it('renders recording state with blinking blue indicator dot', () => {
    const html = renderToString(
      React.createElement(PlaybackHeaderControls, {
        selectedMacro: dummyMacro,
        engineState: EngineState.Recording,
        playbackBanner: '',
        isMacroEnabled: true,
        isAutomaticTrigger: false,
        onRecordClick: () => {},
        onPlayClick: () => {},
        onPauseClick: () => {},
        onStopClick: () => {},
        onToggleMacroEnabled: () => {},
        onChangeActivationMode: () => {},
      }),
    );

    expect(html).toContain('bg-blue-500 animate-pulse');
  });

  it('locks activation mode to ToggleStop when repeatCount is 0 (infinite repeat)', () => {
    const infiniteMacro: MacroDefinition = {
      ...dummyMacro,
      playback: {
        ...dummyMacro.playback,
        repeatCount: 0,
        activationMode: ActivationMode.ToggleStop,
      },
    };

    const html = renderToString(
      React.createElement(PlaybackHeaderControls, {
        selectedMacro: infiniteMacro,
        engineState: EngineState.Idle,
        playbackBanner: '',
        isMacroEnabled: true,
        isAutomaticTrigger: false,
        onRecordClick: () => {},
        onPlayClick: () => {},
        onPauseClick: () => {},
        onStopClick: () => {},
        onToggleMacroEnabled: () => {},
        onChangeActivationMode: () => {},
      }),
    );

    expect(html).toContain('Infinite repeat forces ToggleStop activation mode');
  });

  it('renders automatic trigger badge when macro has automatic pixel trigger', () => {
    const html = renderToString(
      React.createElement(PlaybackHeaderControls, {
        selectedMacro: dummyMacro,
        engineState: EngineState.Idle,
        playbackBanner: '',
        isMacroEnabled: true,
        isAutomaticTrigger: true,
        onRecordClick: () => {},
        onPlayClick: () => {},
        onPauseClick: () => {},
        onStopClick: () => {},
        onToggleMacroEnabled: () => {},
        onChangeActivationMode: () => {},
      }),
    );

    expect(html).toContain('Automatic trigger');
  });
});

describe('CurrentActionProgress telemetry and diagnostic metrics', () => {
  it('renders progress bar, elapsed time, and event summary', () => {
    const event: MacroEvent = createMouseMoveEvent({
      deltaX: 500,
      deltaY: 300,
      timeMicroseconds: 250_000,
    });
    const receipt: DispatchReceipt = {
      eventId: event.id,
      scheduledMicroseconds: 250_000,
      dispatchStartedMicroseconds: 250_200,
      dispatchCompletedMicroseconds: 251_000,
      hookConfirmedMicroseconds: 251_500,
      success: true,
      dispatchJitterMilliseconds: 0.2,
      confirmationMilliseconds: 0.5,
    };

    const html = renderToString(
      React.createElement(CurrentActionProgressContent, {
        macroName: 'Heavy Workflow',
        engineState: EngineState.Playing,
        elapsedMicroseconds: 500_000,
        totalDurationMicroseconds: 1_000_000,
        currentEvent: event,
        lastReceipt: receipt,
        playbackSpeed: 1.5,
      }),
    );

    expect(html).toContain('Heavy Workflow');
    expect(html).toContain('1.5×');
    expect(html).toContain('Playing');
    expect(html).toContain('500 ms');
    expect(html).toContain('1000 ms');
    expect(html).toContain('50%');
    expect(html).toContain('Mouse movement · X +500, Y +300');
    expect(html).toContain('±0.2 ms');
    expect(html).toContain('0.8 ms');
    expect(html).toContain('0.5 ms');

    // Also verify CurrentActionProgress wrapper
    const wrapperHtml = renderToString(
      React.createElement(CurrentActionProgress, {
        macroName: 'Heavy Workflow',
        engineState: EngineState.Playing,
        elapsedMicroseconds: 500_000,
      }),
    );
    expect(wrapperHtml).toContain('Heavy Workflow');
  });
});

describe('formatPlaybackBanner with PlaybackBannerText', () => {
  it('returns empty string when no sessions are active', () => {
    expect(formatPlaybackBanner([])).toBe('');
  });

  it('formats single playing and paused macros', () => {
    expect(formatPlaybackBanner([{ name: 'Work', isPaused: false }])).toBe(
      'Playing: Work',
    );
    expect(formatPlaybackBanner([{ name: 'Work', isPaused: true }])).toBe(
      'Paused: Work',
    );
  });

  it('formats up to 3 active macros as comma-separated list', () => {
    const sessions = [
      { name: 'Macro A', isPaused: false },
      { name: 'Macro B', isPaused: false },
      { name: 'Macro C', isPaused: false },
    ];
    expect(formatPlaybackBanner(sessions)).toBe(
      'Playing · 3: Macro A, Macro B, Macro C',
    );
  });

  it('formats more than 3 active macros with +N overflow count', () => {
    const sessions = [
      { name: 'Macro 1', isPaused: false },
      { name: 'Macro 2', isPaused: false },
      { name: 'Macro 3', isPaused: false },
      { name: 'Macro 4', isPaused: false },
      { name: 'Macro 5', isPaused: false },
    ];
    expect(formatPlaybackBanner(sessions)).toBe(
      'Playing · 5: Macro 1, Macro 2 +3',
    );
  });
});
