import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { PlaybackTargetingView } from '../PlaybackTargetingView.js';
import { TargetWindowPicker } from '../TargetWindowPicker.js';
import { PlaybackOptionsView } from '../PlaybackOptionsView.js';
import {
  isChromiumOrUwpWindow,
  isElevationMismatch,
  enrichOpenWindows,
} from '../target-window-utils.js';
import { TargetMode } from '../../../../../../../packages/contracts/src/index.js';
import { createDefaultPlaybackOptions } from '../../../../../../../packages/domain/src/model/index.js';
import type { TargetWindowItem } from '../types.js';

const MOCK_OPEN_WINDOWS: readonly TargetWindowItem[] = [
  {
    handle: 0x1001,
    title: 'Notepad - Untitled',
    processName: 'notepad.exe',
    processId: 101,
    className: 'Notepad',
    isElevated: false,
    displayName: 'Notepad - Untitled (notepad.exe)',
  },
  {
    handle: 0x1002,
    title: 'Visual Studio Code',
    processName: 'code.exe',
    processId: 102,
    className: 'Chrome_WidgetWin_1',
    isElevated: false,
    displayName: 'Visual Studio Code (code.exe)',
  },
  {
    handle: 0x1003,
    title: 'Elevated Terminal',
    processName: 'cmd.exe',
    processId: 103,
    className: 'ConsoleWindowClass',
    isElevated: true,
    displayName: 'Elevated Terminal (cmd.exe)',
  },
];

describe('PlaybackTargetingView and targeting controls', () => {
  it('renders active window delivery mode by default', () => {
    const options = createDefaultPlaybackOptions();
    const html = renderToString(
      React.createElement(PlaybackTargetingView, {
        options,
        openWindows: MOCK_OPEN_WINDOWS,
        onChange: () => {},
        onRefreshWindows: () => {},
      }),
    );

    expect(html).toContain('Input delivery mode');
    expect(html).toContain(
      'System SendInput simulates keyboard and mouse input in the currently active window.',
    );
    expect(html).toContain('Pass the hotkey through to the app');
    expect(html).toContain('When target loses focus');
    expect(html).toContain('On-screen cards');
  });

  it('renders target window picker when SpecificWindow delivery mode is active', () => {
    const options = {
      ...createDefaultPlaybackOptions(),
      targetMode: TargetMode.SpecificWindow,
      targetProcessName: 'notepad.exe',
      targetWindowTitle: 'Notepad - Untitled',
    };

    const html = renderToString(
      React.createElement(PlaybackTargetingView, {
        options,
        openWindows: MOCK_OPEN_WINDOWS,
        isAppElevated: true,
        onChange: () => {},
        onRefreshWindows: () => {},
      }),
    );

    expect(html).toContain('Target window');
    expect(html).toContain('Notepad - Untitled (notepad.exe)');
    expect(html).toContain('Bind only when this window is active');
    expect(html).toContain('Prefer hardware scan codes for background messages');
  });

  it('detects Chromium and UWP windows and displays incompatibility warning', () => {
    expect(isChromiumOrUwpWindow('chrome.exe', 'Google Chrome')).toBe(true);
    expect(isChromiumOrUwpWindow('msedge.exe', 'Microsoft Edge')).toBe(true);
    expect(isChromiumOrUwpWindow('code.exe', 'VS Code')).toBe(true);
    expect(isChromiumOrUwpWindow('discord.exe', 'Discord')).toBe(true);
    expect(isChromiumOrUwpWindow('custom.exe', 'App', 'Chrome_WidgetWin_1')).toBe(true);
    expect(isChromiumOrUwpWindow('custom.exe', 'Calculator', 'ApplicationFrameWindow')).toBe(true);
    expect(isChromiumOrUwpWindow('notepad.exe', 'Notepad')).toBe(false);

    const html = renderToString(
      React.createElement(TargetWindowPicker, {
        selectedProcessName: 'code.exe',
        selectedWindowTitle: 'Visual Studio Code',
        hotkeyScopedToTarget: false,
        preferScanCodes: true,
        openWindows: MOCK_OPEN_WINDOWS,
        isAppElevated: true,
        onSelectWindow: () => {},
        onToggleScopedToTarget: () => {},
        onTogglePreferScanCodes: () => {},
        onRefreshWindows: () => {},
      }),
    );

    expect(html).toContain('This window runs on Chromium (browsers, Electron');
  });

  it('displays administrator warning when app is not elevated', () => {
    expect(isElevationMismatch(false, true)).toBe(true);
    expect(isElevationMismatch(false, false)).toBe(true);
    expect(isElevationMismatch(true, true)).toBe(false);
    expect(isElevationMismatch(true, false)).toBe(false);

    const html = renderToString(
      React.createElement(TargetWindowPicker, {
        selectedProcessName: 'notepad.exe',
        selectedWindowTitle: 'Notepad - Untitled',
        hotkeyScopedToTarget: true,
        preferScanCodes: false,
        openWindows: MOCK_OPEN_WINDOWS,
        isAppElevated: false,
        onSelectWindow: () => {},
        onToggleScopedToTarget: () => {},
        onTogglePreferScanCodes: () => {},
        onRefreshWindows: () => {},
      }),
    );

    expect(html).toContain('Run Macro Recorder as administrator.');
  });

  it('enriches open windows list with display names and flags', () => {
    const enriched = enrichOpenWindows([
      {
        handle: 0x2001,
        title: 'Document1',
        processName: 'word.exe',
        processId: 200,
        className: 'OpusApp',
      },
    ]);

    expect(enriched[0]?.displayName).toBe('Document1 (word.exe)');
    expect(enriched[0]?.isChromiumOrUwp).toBe(false);
  });

  it('renders combined PlaybackOptionsView with both columns', () => {
    const options = createDefaultPlaybackOptions();
    const html = renderToString(
      React.createElement(PlaybackOptionsView, {
        options,
        openWindows: MOCK_OPEN_WINDOWS,
        onChange: () => {},
        onRefreshWindows: () => {},
      }),
    );

    expect(html).toContain('Playback Timing');
    expect(html).toContain('Input Mode');
  });
});
