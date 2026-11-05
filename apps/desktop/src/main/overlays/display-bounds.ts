/**
 * @macro-recorder/desktop - Display and DPI-Aware Bounds Calculator
 * Coordinates mapping between normalized desktop positions [0.0, 1.0] and
 * physical/logical pixel bounds on displays.
 *
 * Guarantees overlay cards and floating toolbar clamp safely within work areas
 * and survive monitor topology changes, resolution updates, and DPI changes.
 *
 * OverlayPlacementWindow.PositionFromNormalized.
 */

import { screen, type Display, type Rectangle } from 'electron';
import type { CardDimensions, DisplayWorkArea, NormalizedCoordinates } from './types.js';

export const DEFAULT_CARD_DIMENSIONS: CardDimensions = {
  width: 430,
  height: 150,
};

export const DEFAULT_TOOLBAR_DIMENSIONS: CardDimensions = {
  width: 172,
  height: 48,
};

/**
 * Clamps a normalized scalar strictly into the range [0, 1].
 */
export function clampNormalized(value: number): number {
  if (Number.isNaN(value) || !Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.min(1, value));
}

/**
 * Clamps a scale percent to legacy supported range [25, 200].
 */
export function clampScalePercent(scalePercent: number): number {
  if (Number.isNaN(scalePercent) || !Number.isFinite(scalePercent)) {
    return 100;
  }
  return Math.max(25, Math.min(200, Math.round(scalePercent)));
}

/**
 * Clamps a transparency percent to legacy supported range [0, 100].
 */
export function clampTransparencyPercent(transparencyPercent: number): number {
  if (Number.isNaN(transparencyPercent) || !Number.isFinite(transparencyPercent)) {
    return 0;
  }
  return Math.max(0, Math.min(100, Math.round(transparencyPercent)));
}

/**
 * Computes logical pixel coordinates from normalized screen coordinates [0, 1].
 *
 * Formula:
 * effectiveWidth = Math.max(1, cardWidth * scale)
 * effectiveHeight = Math.max(1, cardHeight * scale)
 * availableWidth = Math.max(0, workArea.width - effectiveWidth)
 * availableHeight = Math.max(0, workArea.height - effectiveHeight)
 * x = workArea.x + availableWidth * clamp(normalizedX)
 * y = workArea.y + availableHeight * clamp(normalizedY)
 */
export function calculatePixelCoordinates(
  normalizedX: number,
  normalizedY: number,
  cardWidth: number,
  cardHeight: number,
  workArea: DisplayWorkArea,
  scale = 1.0,
): { readonly x: number; readonly y: number; readonly width: number; readonly height: number } {
  const effectiveWidth = Math.max(1, Math.round(cardWidth * scale));
  const effectiveHeight = Math.max(1, Math.round(cardHeight * scale));

  const availableWidth = Math.max(0, workArea.width - effectiveWidth);
  const availableHeight = Math.max(0, workArea.height - effectiveHeight);

  const clampedNormX = clampNormalized(normalizedX);
  const clampedNormY = clampNormalized(normalizedY);

  const pixelX = Math.round(workArea.x + availableWidth * clampedNormX);
  const pixelY = Math.round(workArea.y + availableHeight * clampedNormY);

  return {
    x: pixelX,
    y: pixelY,
    width: effectiveWidth,
    height: effectiveHeight,
  };
}

/**
 * Inverts logical pixel coordinates into normalized [0, 1] placement.
 */
export function calculateNormalizedCoordinates(
  pixelX: number,
  pixelY: number,
  cardWidth: number,
  cardHeight: number,
  workArea: DisplayWorkArea,
  scale = 1.0,
): NormalizedCoordinates {
  const effectiveWidth = Math.max(1, Math.round(cardWidth * scale));
  const effectiveHeight = Math.max(1, Math.round(cardHeight * scale));

  const availableWidth = Math.max(1, workArea.width - effectiveWidth);
  const availableHeight = Math.max(1, workArea.height - effectiveHeight);

  const normalizedX = clampNormalized((pixelX - workArea.x) / availableWidth);
  const normalizedY = clampNormalized((pixelY - workArea.y) / availableHeight);

  return {
    x: Number(normalizedX.toFixed(4)),
    y: Number(normalizedY.toFixed(4)),
  };
}

/**
 * Clamps arbitrary window bounds completely within the target work area.
 */
export function clampBoundsToWorkArea(
  bounds: { x: number; y: number; width: number; height: number },
  workArea: DisplayWorkArea,
): { x: number; y: number; width: number; height: number } {
  const width = Math.min(bounds.width, workArea.width);
  const height = Math.min(bounds.height, workArea.height);

  const maxX = workArea.x + Math.max(0, workArea.width - width);
  const maxY = workArea.y + Math.max(0, workArea.height - height);

  const clampedX = Math.max(workArea.x, Math.min(maxX, bounds.x));
  const clampedY = Math.max(workArea.y, Math.min(maxY, bounds.y));

  return {
    x: clampedX,
    y: clampedY,
    width,
    height,
  };
}

/**
 * Extracts a DisplayWorkArea structure from an Electron Display or Rectangle.
 */
export function toDisplayWorkArea(displayOrRect: Display | Rectangle): DisplayWorkArea {
  if ('workArea' in displayOrRect) {
    const d = displayOrRect as Display;
    return {
      x: d.workArea.x,
      y: d.workArea.y,
      width: d.workArea.width,
      height: d.workArea.height,
      scaleFactor: d.scaleFactor,
    };
  }
  const r = displayOrRect as Rectangle;
  return {
    x: r.x,
    y: r.y,
    width: r.width,
    height: r.height,
    scaleFactor: 1.0,
  };
}

/**
 * Safely resolves the current primary display work area with fallback defaults.
 */
export function getPrimaryWorkArea(screenAdapter: typeof screen = screen): DisplayWorkArea {
  try {
    if (screenAdapter && typeof screenAdapter.getPrimaryDisplay === 'function') {
      const primary = screenAdapter.getPrimaryDisplay();
      if (primary && primary.workArea) {
        return toDisplayWorkArea(primary);
      }
    }
  } catch {
    // Fallback if screen unavailable
  }

  return {
    x: 0,
    y: 0,
    width: 1920,
    height: 1080,
    scaleFactor: 1.0,
  };
}

/**
 * Resolves the display nearest to a given point or matching given bounds.
 */
export function getDisplayForBounds(
  bounds: { x: number; y: number; width: number; height: number },
  screenAdapter: typeof screen = screen,
): DisplayWorkArea {
  try {
    if (screenAdapter && typeof screenAdapter.getDisplayMatching === 'function') {
      const matching = screenAdapter.getDisplayMatching(bounds);
      if (matching && matching.workArea) {
        return toDisplayWorkArea(matching);
      }
    }
  } catch {
    // Best effort fallback
  }

  return getPrimaryWorkArea(screenAdapter);
}

/**
 * Subscribes to display topology changes (screen added, removed, metrics changed).
 */
export function observeDisplayChanges(
  onChanged: () => void,
  screenAdapter: typeof screen = screen,
): () => void {
  if (!screenAdapter || typeof screenAdapter.on !== 'function') {
    return () => {};
  }

  const handler = () => {
    try {
      onChanged();
    } catch (err) {
      console.warn('[DisplayBounds] Error handling display change:', err);
    }
  };

  try {
    screenAdapter.on('display-metrics-changed', handler);
    screenAdapter.on('display-added', handler);
    screenAdapter.on('display-removed', handler);

    return () => {
      try {
        screenAdapter.removeListener('display-metrics-changed', handler);
        screenAdapter.removeListener('display-added', handler);
        screenAdapter.removeListener('display-removed', handler);
      } catch {
        // Ignored on cleanup
      }
    };
  } catch {
    return () => {};
  }
}
