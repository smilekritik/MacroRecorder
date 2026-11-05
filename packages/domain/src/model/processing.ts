/**
 * Macro processing, timeline normalization, compression, and scaling algorithms.
 */

import { cloneMacroEvent, isCommentEvent, isWaitEvent } from './event.js';
import {
  type MacroDefinition,
  type MacroEvent,
  MacroEventType,
  type Microseconds,
  type MouseMoveEvent,
} from './types.js';

/**
 * Rounds time to whole milliseconds in integer microseconds.
 * Negative values are clamped to zero. Away-from-zero rounding.
 */
export function roundToMilliseconds(microseconds: Microseconds): Microseconds {
  if (microseconds <= 0) return 0;
  return Math.round(microseconds / 1000) * 1000;
}

/**
 * Determines ordering priority within identical timestamps:
 * blocking waits come first ("wait first, then act").
 */
export function getEventOrder(event: MacroEvent): number {
  return isWaitEvent(event) ? 0 : 1;
}

/**
 * Orders actions by time. Comment rows have no time of their own:
 * each is anchored to the preceding action in input order (or timeline start)
 * and takes its timestamp, so comment placement survives sorting.
 * All event timestamps and overlay durations are rounded to whole milliseconds.
 * Returns a new immutably transformed array of events.
 */
export function normalizeEvents(events: readonly MacroEvent[]): MacroEvent[] {
  const source = events.map((e) => {
    const cloned = cloneMacroEvent(e);
    const timeMicroseconds = roundToMilliseconds(cloned.timeMicroseconds);
    if (cloned.type === MacroEventType.Delay || cloned.type === MacroEventType.OverlayText) {
      return {
        ...cloned,
        timeMicroseconds,
        durationMicroseconds: roundToMilliseconds(cloned.durationMicroseconds),
      } as MacroEvent;
    }
    return { ...cloned, timeMicroseconds } as MacroEvent;
  });

  const hasComments = source.some(isCommentEvent);
  if (!hasComments) {
    return [...source].sort((a, b) => {
      const timeDiff = a.timeMicroseconds - b.timeMicroseconds;
      if (timeDiff !== 0) return timeDiff;
      return getEventOrder(a) - getEventOrder(b);
    });
  }

  const leadingComments: MacroEvent[] = [];
  const trailingByAnchor = new Map<MacroEvent, MacroEvent[]>();
  const actions: MacroEvent[] = [];
  let currentAnchor: MacroEvent | null = null;

  for (const item of source) {
    if (isCommentEvent(item)) {
      if (currentAnchor === null) {
        leadingComments.push(item);
      } else {
        const attached = trailingByAnchor.get(currentAnchor) ?? [];
        attached.push(item);
        trailingByAnchor.set(currentAnchor, attached);
      }
      continue;
    }
    actions.push(item);
    currentAnchor = item;
  }

  const sortedActions = [...actions].sort((a, b) => {
    const timeDiff = a.timeMicroseconds - b.timeMicroseconds;
    if (timeDiff !== 0) return timeDiff;
    return getEventOrder(a) - getEventOrder(b);
  });

  const result: MacroEvent[] = [];
  for (const comment of leadingComments) {
    result.push({ ...comment, timeMicroseconds: 0 });
  }

  for (const action of sortedActions) {
    result.push(action);
    const attached = trailingByAnchor.get(action);
    if (attached) {
      for (const comment of attached) {
        result.push({ ...comment, timeMicroseconds: action.timeMicroseconds });
      }
    }
  }

  return result;
}

/**
 * Re-bases timeline actions so the first non-comment action starts at 0 microseconds.
 * Preserves interval structure between subsequent events.
 */
export function rebaseEventsToZero(events: readonly MacroEvent[]): MacroEvent[] {
  const normalized = normalizeEvents(events);
  if (normalized.length === 0) return normalized;

  const firstNonComment = normalized.find((e) => !isCommentEvent(e));
  const origin = firstNonComment?.timeMicroseconds ?? 0;
  if (origin === 0) return normalized;

  return normalized.map((item) => ({
    ...item,
    timeMicroseconds: Math.max(0, item.timeMicroseconds - origin),
  }));
}

/**
 * Compresses high-frequency mouse movements into time buckets.
 * Combines relative mouse movements within the same bucket while strictly preserving
 * button clicks, wheel scrolls, and other interleaved inputs.
 */
export function compressMouseMoves(
  events: readonly MacroEvent[],
  bucketMilliseconds: number,
): MacroEvent[] {
  const source = normalizeEvents(events);
  if (bucketMilliseconds <= 0) return source;

  const output: MacroEvent[] = [];
  let pending: MouseMoveEvent | null = null;
  const bucketUs = bucketMilliseconds * 1000;

  const flush = () => {
    if (pending !== null) {
      output.push(pending);
      pending = null;
    }
  };

  for (const item of source) {
    if (item.type !== MacroEventType.MouseMove) {
      flush();
      output.push(item);
      continue;
    }

    const currentMove = item as MouseMoveEvent;
    if (
      pending === null ||
      Math.floor(pending.timeMicroseconds / bucketUs) !==
        Math.floor(currentMove.timeMicroseconds / bucketUs)
    ) {
      flush();
      pending = { ...currentMove };
    } else {
      const active: MouseMoveEvent = pending;
      pending = {
        ...active,
        deltaX: active.deltaX + currentMove.deltaX,
        deltaY: active.deltaY + currentMove.deltaY,
        timeMicroseconds: currentMove.timeMicroseconds,
      };
    }
  }

  flush();
  return output;
}

/**
 * Scales timeline timestamps by a speed multiplier.
 * OverlayText durations are also scaled. Factor must be between 0.1 and 10.0.
 * Returns a new cloned and scaled MacroDefinition.
 */
export function scaleTime(macro: MacroDefinition, factor: number): MacroDefinition {
  if (factor < 0.1 || factor > 10.0) {
    throw new RangeError(`Scale factor must be between 0.1 and 10.0, received ${factor}`);
  }

  const scaledEvents = macro.events.map((e) => {
    const timeMicroseconds = Math.max(0, Math.round(e.timeMicroseconds * factor));
    if (e.type === MacroEventType.OverlayText) {
      const durationMicroseconds = Math.max(0, Math.round(e.durationMicroseconds * factor));
      return {
        ...e,
        timeMicroseconds,
        durationMicroseconds,
      };
    }
    return {
      ...e,
      timeMicroseconds,
    };
  });

  return {
    ...macro,
    events: scaledEvents,
    modifiedAt: new Date().toISOString(),
  };
}

/**
 * Suggests start time for a newly inserted action: exactly the anchor's time
 * (the selected action, or the latest non-comment action by time). No automatic gap.
 */
export function suggestInsertionTime(
  events: readonly MacroEvent[],
  selected?: MacroEvent | null,
): Microseconds {
  if (selected) {
    return selected.timeMicroseconds;
  }
  const nonComments = events.filter((e) => !isCommentEvent(e));
  if (nonComments.length === 0) {
    return 0;
  }
  let maxTime: Microseconds = 0;
  for (const e of nonComments) {
    if (e.timeMicroseconds > maxTime) {
      maxTime = e.timeMicroseconds;
    }
  }
  return maxTime;
}

/**
 * Orders macro definitions for library presentation: enabled macros first,
 * then sorted by last modified timestamp descending.
 */
export function orderLibraryMacros(macros: readonly MacroDefinition[]): MacroDefinition[] {
  return [...macros].sort((a, b) => {
    if (a.isEnabled !== b.isEnabled) {
      return a.isEnabled ? -1 : 1;
    }
    return new Date(b.modifiedAt).getTime() - new Date(a.modifiedAt).getTime();
  });
}
