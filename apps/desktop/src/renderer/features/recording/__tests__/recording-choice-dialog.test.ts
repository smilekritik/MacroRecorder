import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import {
  RecordingChoiceContent,
  RecordingChoiceDialog,
} from '../RecordingChoiceDialog.js';
import {
  GamepadDriverContent,
  GamepadDriverDialog,
} from '../GamepadDriverDialog.js';

describe('RecordingChoiceDialog and GamepadDriverDialog', () => {
  it('renders RecordingChoiceContent with all 3 choices', () => {
    const html = renderToString(
      React.createElement(RecordingChoiceContent, {
        eventCount: 42,
        macroDurationMs: 1500,
        selectedActionTimeMs: 500,
        onSelectChoice: () => {},
        onCancel: () => {},
      }),
    );

    expect(html).toContain('This macro already has actions');
    expect(html).toContain('Choose what to do with the new recording.');
    expect(html).toContain('Record from scratch');
    expect(html).toContain('Deletes all 42 actions and starts the timeline over.');
    expect(html).toContain('Continue from the selected action');
    expect(html).toContain('The recording is inserted at 500 ms; later actions shift down.');
    expect(html).toContain('Append to the end');
    expect(html).toContain('Recording starts after 1500 ms; existing actions stay untouched.');
    expect(html).toContain('Cancel');
  });

  it('disables Continue option when no timeline row is selected', () => {
    const html = renderToString(
      React.createElement(RecordingChoiceContent, {
        eventCount: 10,
        macroDurationMs: 800,
        selectedActionTimeMs: null,
        onSelectChoice: () => {},
        onCancel: () => {},
      }),
    );

    expect(html).toContain('Select a timeline row first');
    expect(html).toContain('disabled');
  });

  it('renders RecordingChoiceDialog definition when closed', () => {
    const html = renderToString(
      React.createElement(RecordingChoiceDialog, {
        isOpen: false,
        eventCount: 10,
        macroDurationMs: 800,
        selectedActionTimeMs: 100,
        onSelectChoice: () => {},
        onCancel: () => {},
      }),
    );

    expect(html).toBe('');
    expect(typeof RecordingChoiceDialog).toBe('function');
  });

  it('renders GamepadDriverContent with install and not now choices', () => {
    const html = renderToString(
      React.createElement(GamepadDriverContent, {
        onInstallNow: () => {},
        onDismiss: () => {},
      }),
    );

    expect(html).toContain('Install the gamepad driver?');
    expect(html).toContain('Playing back gamepad actions requires the ViGEmBus driver.');
    expect(html).toContain('Install now');
    expect(html).toContain('Not now');
  });

  it('renders GamepadDriverDialog definition when closed', () => {
    const html = renderToString(
      React.createElement(GamepadDriverDialog, {
        isOpen: false,
        onInstallNow: () => {},
        onDismiss: () => {},
      }),
    );

    expect(html).toBe('');
    expect(typeof GamepadDriverDialog).toBe('function');
  });
});
