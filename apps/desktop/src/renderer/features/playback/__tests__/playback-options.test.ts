import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { PlaybackTimingView } from '../PlaybackTimingView.js';
import {
  formatRepeatCountDisplay,
  formatTimingSpreadHint,
  stepRepeatCount,
} from '../target-window-utils.js';
import {
  createDefaultPlaybackOptions,
  validatePlaybackOptions,
} from '../../../../../../../packages/domain/src/model/index.js';
import { ActivationMode } from '../../../../../../../packages/contracts/src/index.js';

describe('PlaybackTimingView and timing options', () => {
  it('renders default timing controls correctly', () => {
    const options = createDefaultPlaybackOptions();
    const html = renderToString(
      React.createElement(PlaybackTimingView, {
        options,
        onChange: () => {},
      }),
    );

    expect(html).toContain('Playback Timing');
    expect(html).toContain('Random timings');
    expect(html).toContain('Speed');
    expect(html).toContain('Repeat count');
    expect(html).toContain('Repeat indefinitely');
    expect(html).toContain('Delay between repeats');
  });

  it('renders timing spread input and hint when randomize timings is enabled', () => {
    const options = {
      ...createDefaultPlaybackOptions(),
      randomizeTiming: true,
      timingJitterMilliseconds: 25,
    };

    const html = renderToString(
      React.createElement(PlaybackTimingView, {
        options,
        onChange: () => {},
      }),
    );

    expect(html).toContain('Spread, ± ms');
    expect(html).toContain('25');
    expect(html).toContain(
      '±25 ms: intervals between actions will vary smoothly by up to 25 ms',
    );
  });

  it('formats timing spread hints', () => {
    expect(formatTimingSpreadHint(0)).toBe('±0 ms: timings stay exactly as recorded');
    expect(formatTimingSpreadHint(15)).toBe(
      '±15 ms: intervals between actions will vary smoothly by up to 15 ms',
    );
  });

  it('formats repeat count display correctly', () => {
    expect(formatRepeatCountDisplay(0)).toBe('Indefinitely');
    expect(formatRepeatCountDisplay(1)).toBe('1');
    expect(formatRepeatCountDisplay(10)).toBe('10');
  });

  it('steps repeat count according to stepper rules', () => {
    // Stepping up from 0 (infinite) goes to 1
    expect(stepRepeatCount(0, 1)).toBe(1);
    // Stepping down from 0 goes to 1
    expect(stepRepeatCount(0, -1)).toBe(1);
    // Stepping up from 1 goes to 2
    expect(stepRepeatCount(1, 1)).toBe(2);
    // Stepping down from 1 stays at 1
    expect(stepRepeatCount(1, -1)).toBe(1);
    // Stepping down from 5 goes to 4
    expect(stepRepeatCount(5, -1)).toBe(4);
  });

  it('renders infinite repeat notice explaining forced ToggleStop mode', () => {
    const options = {
      ...createDefaultPlaybackOptions(),
      repeatCount: 0,
    };

    const html = renderToString(
      React.createElement(PlaybackTimingView, {
        options,
        onChange: () => {},
      }),
    );

    expect(html).toContain(
      'Infinite repeat forces ToggleStop activation mode so playback can be stopped.',
    );
    expect(html).toContain('Indefinitely');
  });

  it('validates playback options and round-trips to schema-compatible structure', () => {
    const defaultOptions = createDefaultPlaybackOptions();
    const validation = validatePlaybackOptions(defaultOptions);
    expect(validation.success).toBe(true);

    const infiniteOptions = {
      ...defaultOptions,
      repeatCount: 0,
      activationMode: ActivationMode.ToggleStop,
      speed: 2.5,
      randomizeTiming: true,
      timingJitterMilliseconds: 50,
      repeatDelayMilliseconds: 1000,
    };

    const infiniteValidation = validatePlaybackOptions(infiniteOptions);
    expect(infiniteValidation.success).toBe(true);
  });
});
