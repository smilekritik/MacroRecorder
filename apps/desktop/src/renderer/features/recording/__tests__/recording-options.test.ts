import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { RecordingSourceToggles } from '../RecordingSourceToggles.js';
import { RecordingOptionsView } from '../RecordingOptionsView.js';
import {
  createDefaultRecordingOptions,
  validateRecordingOptions,
} from '../../../../../../../packages/domain/src/model/index.js';
import { parseRecordingOptionsWire } from '../../../../../../../packages/contracts/src/index.js';

describe('Recording Options and Source Toggles', () => {
  it('renders RecordingSourceToggles with all 5 input sources', () => {
    const defaultOptions = createDefaultRecordingOptions();
    const html = renderToString(
      React.createElement(RecordingSourceToggles, {
        options: defaultOptions,
        onChange: () => {},
      }),
    );

    expect(html).toContain('Recording Sources');
    expect(html).toContain('Keyboard');
    expect(html).toContain('Mouse buttons');
    expect(html).toContain('Mouse movement');
    expect(html).toContain('Mouse wheel');
    expect(html).toContain('Gamepad (Xbox / DualShock 4)');
  });

  it('renders RecordingOptionsView with both Sources and Options columns', () => {
    const defaultOptions = createDefaultRecordingOptions({
      countdownSeconds: 5,
      mouseMoveBucketMilliseconds: 25,
    });
    const html = renderToString(
      React.createElement(RecordingOptionsView, {
        options: defaultOptions,
        onChange: () => {},
      }),
    );

    expect(html).toContain('Recording Sources');
    expect(html).toContain('Recording Options');
    expect(html).toContain('Movement compression');
    expect(html).toContain('25');
    expect(html).toContain('Countdown');
    expect(html).toContain('5');
    expect(html).toContain('sec');
    expect(html).toContain('ms');
  });

  it('round-trips recording options with contract schemas', () => {
    const rawOptions = {
      keyboard: true,
      mouseButtons: false,
      mouseMovement: true,
      mouseWheel: false,
      gamepad: true,
      mouseMoveBucketMilliseconds: 15,
      countdownSeconds: 3,
    };

    const parsed = parseRecordingOptionsWire(rawOptions);
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;

    expect(parsed.data.keyboard).toBe(true);
    expect(parsed.data.mouseButtons).toBe(false);
    expect(parsed.data.mouseMovement).toBe(true);
    expect(parsed.data.mouseWheel).toBe(false);
    expect(parsed.data.gamepad).toBe(true);
    expect(parsed.data.mouseMoveBucketMilliseconds).toBe(15);
    expect(parsed.data.countdownSeconds).toBe(3);

    const validated = validateRecordingOptions(parsed.data);
    expect(validated.success).toBe(true);
  });

  it('normalizes invalid negative values or out-of-bounds countdown', () => {
    const rawOptions = {
      keyboard: true,
      mouseButtons: true,
      mouseMovement: true,
      mouseWheel: true,
      gamepad: true,
      mouseMoveBucketMilliseconds: -50,
      countdownSeconds: -10,
    };

    const parsed = parseRecordingOptionsWire(rawOptions);
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;

    expect(parsed.data.mouseMoveBucketMilliseconds).toBe(0);
    expect(parsed.data.countdownSeconds).toBe(0);
  });
});
