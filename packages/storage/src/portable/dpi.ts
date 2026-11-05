/**
 * Screen coordinate DPI rescaling for portable macros.
 */

import {
  MacroEventType,
  type MacroDefinition,
  type MacroEvent,
} from '../../../contracts/src/index.js';
import type { RescaleDpiResult } from './types.js';

/**
 * Rescales screen coordinates (pixel triggers, color waits, absolute moves)
 * from sourceDpi to targetDpi. Returns false if source DPI is unknown (0/undefined)
 * or matches targetDpi — leaving all coordinates untouched.
 */
export function rescaleForDpi(
  macro: MacroDefinition,
  sourceDpi?: number | undefined,
  targetDpi?: number | undefined,
): RescaleDpiResult {
  if (
    sourceDpi === undefined ||
    targetDpi === undefined ||
    sourceDpi <= 0 ||
    targetDpi <= 0 ||
    sourceDpi === targetDpi
  ) {
    return { rescaled: false, macro };
  }

  const factor = targetDpi / sourceDpi;
  let touched = false;

  const newEvents: MacroEvent[] = macro.events.map((item) => {
    if (
      item.type === MacroEventType.PixelColorTrigger ||
      item.type === MacroEventType.WaitForPixelGone
    ) {
      touched = true;
      return {
        ...item,
        pixelX: Math.round(item.pixelX * factor),
        pixelY: Math.round(item.pixelY * factor),
      };
    }

    if (item.type === MacroEventType.MouseMove && item.absoluteMove) {
      touched = true;
      return {
        ...item,
        deltaX: Math.round(item.deltaX * factor),
        deltaY: Math.round(item.deltaY * factor),
      };
    }

    return item;
  });

  if (!touched) {
    return { rescaled: false, macro };
  }

  return {
    rescaled: true,
    macro: {
      ...macro,
      events: newEvents,
    },
  };
}
