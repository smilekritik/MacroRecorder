/**
 * Utilities for window inspection, compatibility warning heuristics,
 * and timing/repeat formatting.
 * ValueConverters.cs TimingSpreadHintConverter / RepeatCountDisplayConverter.
 */

import type { OpenWindowInfo } from '../../../../../../packages/contracts/src/index.js';
import type { TargetWindowItem } from './types.js';

const CHROMIUM_PROCESS_NAMES = new Set([
  'chrome.exe',
  'chrome',
  'msedge.exe',
  'msedge',
  'brave.exe',
  'brave',
  'opera.exe',
  'opera',
  'vivaldi.exe',
  'vivaldi',
  'electron.exe',
  'electron',
  'code.exe',
  'code',
  'discord.exe',
  'discord',
  'slack.exe',
  'slack',
  'spotify.exe',
  'spotify',
  'teams.exe',
  'teams',
]);

/**
 * Checks if a target window runs on Chromium or UWP wrapper.
 * PostMessage input delivery does not reach controls in such windows.
 */
export function isChromiumOrUwpWindow(
  processName: string,
  _windowTitle?: string,
  className?: string,
): boolean {
  if (className) {
    if (className.startsWith('Chrome_WidgetWin')) return true;
    if (className === 'ApplicationFrameWindow' || className === 'Windows.UI.Core.CoreWindow') {
      return true;
    }
  }

  const normalizedProc = processName.trim().toLowerCase();
  if (CHROMIUM_PROCESS_NAMES.has(normalizedProc)) {
    return true;
  }

  return false;
}

/**
 * Evaluates whether an integrity level mismatch exists between the application and target.
 * In Windows, non-elevated applications cannot inject messages into elevated windows (UIPI).
 */
export function isElevationMismatch(
  isAppElevated: boolean,
  targetProcessElevated = false,
): boolean {
  if (isAppElevated) {
    return false;
  }
  return targetProcessElevated || !isAppElevated;
}

/**
 * Formats the timing jitter spread helper text.
 */
export function formatTimingSpreadHint(jitterMs: number): string {
  if (jitterMs <= 0) {
    return '±0 ms: timings stay exactly as recorded';
  }
  return `±${jitterMs} ms: intervals between actions will vary smoothly by up to ${jitterMs} ms`;
}

/**
 * Formats repeat count for display:
 * 0 is displayed as 'Indefinitely', positive integers as numeric string.
 */
export function formatRepeatCountDisplay(count: number): string {
  if (count === 0) {
    return 'Indefinitely';
  }
  return String(count);
}

/**
 * Steps repeat count up (+1) or down (-1) according to stepper rules:
 * - From 0 (infinite), any step goes to 1.
 * - Negative step: if current count <= 1, stays at 1; otherwise decrements.
 * - Positive step: increments by 1.
 */
export function stepRepeatCount(currentCount: number, delta: number): number {
  if (delta > 0) {
    return currentCount === 0 ? 1 : currentCount + 1;
  }
  return currentCount <= 1 ? 1 : currentCount - 1;
}

/**
 * Enriches a list of OpenWindowInfo items with display names and Chromium/UWP detection.
 */
export function enrichOpenWindows(
  windows: readonly (OpenWindowInfo & { isElevated?: boolean })[],
): readonly TargetWindowItem[] {
  return windows.map((win) => {
    const isChromium = isChromiumOrUwpWindow(win.processName, win.title, win.className);
    const title = win.title.trim();
    const displayName = title ? `${title} (${win.processName})` : win.processName;
    return {
      ...win,
      displayName,
      isChromiumOrUwp: isChromium,
    };
  });
}

/**
 * Formats the header playback banner according to rules:
 * - Empty string if no active sessions.
 * - Up to 3 names listed; beyond 3: "first, second +N".
 * - "Playing: {list}" or "Paused: {list}" (or "Playing · {count}: {list}" if multiple).
 */
export function formatPlaybackBanner(
  sessions: readonly { name: string; isPaused: boolean }[],
): string {
  if (sessions.length === 0) return '';
  const names = sessions.map((s) => s.name);
  const list =
    names.length <= 3
      ? names.join(', ')
      : `${names[0]}, ${names[1]} +${names.length - 2}`;

  const allPaused = sessions.every((s) => s.isPaused);
  const label = allPaused
    ? sessions.length === 1
      ? 'Paused'
      : `Paused · ${sessions.length}`
    : sessions.length === 1
      ? 'Playing'
      : `Playing · ${sessions.length}`;

  return `${label}: ${list}`;
}

