import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { RecordingStatusBar } from '../RecordingStatusBar.js';

describe('RecordingStatusBar rendering and state', () => {
  it('renders countdown state with cancel button', () => {
    const html = renderToString(
      React.createElement(RecordingStatusBar, {
        status: {
          isRecording: false,
          isPaused: false,
          isCountdown: true,
          countdownRemaining: 3,
          elapsedMicroseconds: 0,
          recordedCount: 0,
          lastEventDisplay: null,
          statusText: 'Recording starts in 3…',
        },
        onCancelCountdown: () => {},
      }),
    );

    expect(html).toContain('Recording starts in 3…');
    expect(html).toContain('Cancel countdown');
  });

  it('renders live recording state with telemetry and controls', () => {
    const html = renderToString(
      React.createElement(RecordingStatusBar, {
        status: {
          isRecording: true,
          isPaused: false,
          isCountdown: false,
          countdownRemaining: 0,
          elapsedMicroseconds: 125_000,
          recordedCount: 5,
          lastEventDisplay: "Key 'A' Down",
          statusText: '● Recording…',
        },
        onPause: () => {},
        onStop: () => {},
      }),
    );

    expect(html).toContain('● Recording • 125 ms • actions: 5 • last: Key &#x27;A&#x27; Down');
    expect(html).toContain('Pause');
    expect(html).toContain('Stop recording');
  });

  it('renders paused recording state with resume button', () => {
    const html = renderToString(
      React.createElement(RecordingStatusBar, {
        status: {
          isRecording: true,
          isPaused: true,
          isCountdown: false,
          countdownRemaining: 0,
          elapsedMicroseconds: 250_000,
          recordedCount: 8,
          lastEventDisplay: "Mouse Left Down",
          statusText: '● Recording paused',
        },
        onResume: () => {},
        onStop: () => {},
      }),
    );

    expect(html).toContain('● Recording paused • 250 ms • actions: 8');
    expect(html).toContain('Resume recording');
    expect(html).toContain('Stop recording');
  });

  it('renders null when neither recording nor countdown is active', () => {
    const html = renderToString(
      React.createElement(RecordingStatusBar, {
        status: {
          isRecording: false,
          isPaused: false,
          isCountdown: false,
          countdownRemaining: 0,
          elapsedMicroseconds: 0,
          recordedCount: 0,
          lastEventDisplay: null,
          statusText: 'Idle',
        },
      }),
    );

    expect(html).toBe('');
  });
});
