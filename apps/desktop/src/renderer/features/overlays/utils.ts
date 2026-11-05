/**
 * @macro-recorder/desktop - Overlays Rendering Utilities
 * Math, color calculations, and text formatters.
 */

import type { EngineState, ResolvedTheme } from './types.js';

export function clamp(val: number, min: number, max: number): number {
  if (Number.isNaN(val) || !Number.isFinite(val)) return min;
  return Math.max(min, Math.min(max, val));
}

/**
 * Computes background RGBA.
 *
 * At 0% transparency: standard overlay theme background (~90% opacity).
 * At 100% transparency: alpha is 0 (text and border only).
 */
export function getOverlayCardBackground(
  theme: ResolvedTheme = 'dark',
  transparencyPercent = 0,
): string {
  const t = clamp(transparencyPercent, 0, 100);
  const visibleFraction = (100 - t) / 100;

  if (theme === 'light') {
    // Light theme overlay background (#FFFFFF with ~92% base alpha)
    const baseAlpha = 0.92;
    const alpha = (baseAlpha * visibleFraction).toFixed(3);
    return `rgba(255, 255, 255, ${alpha})`;
  }

  // Dark theme overlay background (#121720 with ~90% base alpha)
  const baseAlpha = 0.90;
  const alpha = (baseAlpha * visibleFraction).toFixed(3);
  return `rgba(18, 23, 32, ${alpha})`;
}

/**
 * Maps engine state to standard localized badge text.
 */
export function getStateBadgeText(
  state: EngineState | string,
  translate: (key: string) => string = (k) => k,
): string {
  switch (state) {
    case 'Playing':
      return translate('▶ PLAYBACK');
    case 'Paused':
      return translate('Ⅱ PAUSED');
    case 'Stopping':
      return translate('■ STOPPING');
    case 'Recording':
      return translate('● RECORDING');
    case 'Countdown':
      return translate('GET READY');
    default:
      return translate('DONE');
  }
}

/**
 * Formats annotation timing text: "{0} remaining · until {1} ms".
 */
export function formatAnnotationTiming(
  remainingSeconds: number,
  endMilliseconds = 0,
  translate: (key: string) => string = (k) => k,
): string {
  const remSec = Math.max(0, remainingSeconds);
  let remText: string;
  if (remSec >= 1.0) {
    const formatted = remSec % 1 === 0 ? remSec.toFixed(0) : remSec.toFixed(1);
    remText = `${formatted} s`;
  } else {
    remText = `${Math.round(remSec * 1000)} ms`;
  }

  // Without a known end there is no mark to promise, so only the remainder is shown.
  if (endMilliseconds <= 0) {
    return translate('{0} remaining').replace('{0}', remText);
  }

  const basePattern = translate('{0} remaining · until {1} ms');
  if (basePattern.includes('{0}')) {
    return basePattern
      .replace('{0}', remText)
      .replace('{1}', String(Math.round(endMilliseconds)));
  }

  return `${remText} remaining · until ${Math.round(endMilliseconds)} ms`;
}
