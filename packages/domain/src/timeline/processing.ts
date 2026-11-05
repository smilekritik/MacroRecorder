/**
 * Timeline processing, normalization, compression, scaling, and statistics algorithms.
 */

import {
  calculateTimingStatistics as modelCalculateStats,
  cloneMacroEvent,
  emptyTimingSummary,
  isCommentEvent,
  isWaitEvent,
} from '../model/index.js';
import {
  type DispatchReceipt,
  type Guid,
  type MacroDefinition,
  type MacroEvent,
  MacroEventType,
  type Microseconds,
  type Milliseconds,
  type MouseMoveEvent,
  type TimingSummary,
} from '../model/types.js';

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
 * blocking waits come first (0) ("wait first, then act"), regular actions (1).
 */
export function getEventOrder(event: MacroEvent): number {
  return isWaitEvent(event) ? 0 : 1;
}

/**
 * Safely reads the virtual key code or 0 from any event object.
 */
export function getEventVirtualKey(event: MacroEvent): number {
  return 'virtualKey' in event && typeof event.virtualKey === 'number'
    ? event.virtualKey
    : (((event as unknown as Record<string, unknown>).VirtualKey as number) ?? 0);
}

/**
 * Helper to clone any MacroEvent preserving or generating an ID.
 */
export function cloneMacroEventPreservingId(event: MacroEvent, preserveId = true): MacroEvent {
  const cloned = cloneMacroEvent(event);
  if (!preserveId) {
    (cloned as unknown as Record<string, unknown>).id = crypto.randomUUID() as Guid;
  }
  return cloned;
}

/**
 * Orders actions by time. Comment rows have no time of their own:
 * each is anchored to the preceding action in input order (or timeline start)
 * and takes its timestamp, so comment placement survives sorting.
 * All event timestamps and overlay durations are rounded to whole milliseconds.
 * Preserves stable input order for simultaneous actions with the same order priority.
 * Returns a new immutably transformed array of events.
 */
export function normalizeEvents(events: readonly MacroEvent[]): MacroEvent[] {
  const source = [...events];
  for (const item of source) {
    const rec = item as unknown as Record<string, unknown>;
    const roundedTime = roundToMilliseconds(item.timeMicroseconds);
    rec.timeMicroseconds = roundedTime;
    if ('TimeMicroseconds' in item) {
      rec.TimeMicroseconds = roundedTime;
    }
    if (item.type === MacroEventType.Delay || item.type === MacroEventType.OverlayText) {
      const roundedDur = roundToMilliseconds(item.durationMicroseconds);
      rec.durationMicroseconds = roundedDur;
      if ('DurationMicroseconds' in item) {
        rec.DurationMicroseconds = roundedDur;
      }
    }
  }

  const hasComments = source.some(isCommentEvent);
  if (!hasComments) {
    // Array.prototype.sort is stable in ES2019+
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
    const rec = comment as unknown as Record<string, unknown>;
    rec.timeMicroseconds = 0;
    if ('TimeMicroseconds' in comment) {
      rec.TimeMicroseconds = 0;
    }
    result.push(comment);
  }

  for (const action of sortedActions) {
    result.push(action);
    const attached = trailingByAnchor.get(action);
    if (attached) {
      for (const comment of attached) {
        const rec = comment as unknown as Record<string, unknown>;
        rec.timeMicroseconds = action.timeMicroseconds;
        if ('TimeMicroseconds' in comment) {
          rec.TimeMicroseconds = action.timeMicroseconds;
        }
        result.push(comment);
      }
    }
  }

  return result;
}

/**
 * Normalizes an array of events in-place, updating time/duration on existing objects
 * and rearranging the array to normalized order.
 * This is used by TimelineEditor to preserve object identity with macro.events.
 */
export function normalizeEventsInPlace(events: MacroEvent[]): MacroEvent[] {
  for (const item of events) {
    const rec = item as unknown as Record<string, unknown>;
    const roundedTime = roundToMilliseconds(item.timeMicroseconds);
    rec.timeMicroseconds = roundedTime;
    if ('TimeMicroseconds' in item) {
      rec.TimeMicroseconds = roundedTime;
    }
    if (item.type === MacroEventType.Delay || item.type === MacroEventType.OverlayText) {
      const roundedDur = roundToMilliseconds(item.durationMicroseconds);
      rec.durationMicroseconds = roundedDur;
      if ('DurationMicroseconds' in item) {
        rec.DurationMicroseconds = roundedDur;
      }
    }
  }

  const hasComments = events.some(isCommentEvent);
  if (!hasComments) {
    events.sort((a, b) => {
      const timeDiff = a.timeMicroseconds - b.timeMicroseconds;
      if (timeDiff !== 0) return timeDiff;
      return getEventOrder(a) - getEventOrder(b);
    });
    return events;
  }

  const leadingComments: MacroEvent[] = [];
  const trailingByAnchor = new Map<MacroEvent, MacroEvent[]>();
  const actions: MacroEvent[] = [];
  let currentAnchor: MacroEvent | null = null;

  for (const item of events) {
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

  actions.sort((a, b) => {
    const timeDiff = a.timeMicroseconds - b.timeMicroseconds;
    if (timeDiff !== 0) return timeDiff;
    return getEventOrder(a) - getEventOrder(b);
  });

  const ordered: MacroEvent[] = [];
  for (const comment of leadingComments) {
    const rec = comment as unknown as Record<string, unknown>;
    rec.timeMicroseconds = 0;
    if ('TimeMicroseconds' in comment) {
      rec.TimeMicroseconds = 0;
    }
    ordered.push(comment);
  }

  for (const action of actions) {
    ordered.push(action);
    const attached = trailingByAnchor.get(action);
    if (attached) {
      for (const comment of attached) {
        const rec = comment as unknown as Record<string, unknown>;
        rec.timeMicroseconds = action.timeMicroseconds;
        if ('TimeMicroseconds' in comment) {
          rec.TimeMicroseconds = action.timeMicroseconds;
        }
        ordered.push(comment);
      }
    }
  }

  events.length = 0;
  events.push(...ordered);
  return events;
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

  for (const item of normalized) {
    const rec = item as unknown as Record<string, unknown>;
    const rebased = Math.max(0, item.timeMicroseconds - origin);
    rec.timeMicroseconds = rebased;
    if ('TimeMicroseconds' in item) {
      rec.TimeMicroseconds = rebased;
    }
  }
  return normalized;
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

  const flush = (): void => {
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
    const currentRec = currentMove as unknown as Record<string, unknown>;
    const moveDx = currentMove.deltaX ?? (currentRec.DeltaX as number) ?? 0;
    const moveDy = currentMove.deltaY ?? (currentRec.DeltaY as number) ?? 0;

    if (
      pending === null ||
      Math.floor(pending.timeMicroseconds / bucketUs) !==
        Math.floor(currentMove.timeMicroseconds / bucketUs)
    ) {
      flush();
      const pRec: Record<string, unknown> = {
        ...currentMove,
        deltaX: moveDx,
        deltaY: moveDy,
        DeltaX: moveDx,
        DeltaY: moveDy,
      };
      pending = pRec as unknown as MouseMoveEvent;
    } else {
      const activeRec = pending as unknown as Record<string, unknown>;
      const activeDx = pending.deltaX ?? (activeRec.DeltaX as number) ?? 0;
      const activeDy = pending.deltaY ?? (activeRec.DeltaY as number) ?? 0;
      const totalDx = activeDx + moveDx;
      const totalDy = activeDy + moveDy;
      const pRec: Record<string, unknown> = {
        ...pending,
        deltaX: totalDx,
        deltaY: totalDy,
        DeltaX: totalDx,
        DeltaY: totalDy,
        timeMicroseconds: currentMove.timeMicroseconds,
        TimeMicroseconds: currentMove.timeMicroseconds,
      };
      pending = pRec as unknown as MouseMoveEvent;
    }
  }

  flush();
  return output;
}

/**
 * Scales timeline timestamps by a speed multiplier.
 * OverlayText durations are also scaled. Factor must be between 0.1 and 10.0.
 * Modifies the macro definition in-place and returns it.
 */
export function scaleTime(macro: MacroDefinition, factor: number): MacroDefinition {
  if (factor < 0.1 || factor > 10.0) {
    throw new RangeError(`Scale factor must be between 0.1 and 10.0, received ${factor}`);
  }

  const events = macro.events ?? (macro as unknown as Record<string, unknown>).Events;
  if (events && Array.isArray(events)) {
    for (const e of events) {
      const rec = e as unknown as Record<string, unknown>;
      const scaledTime = Math.max(0, Math.round(e.timeMicroseconds * factor));
      rec.timeMicroseconds = scaledTime;
      if ('TimeMicroseconds' in e) {
        rec.TimeMicroseconds = scaledTime;
      }
      if (e.type === MacroEventType.OverlayText) {
        const scaledDur = Math.max(0, Math.round(e.durationMicroseconds * factor));
        rec.durationMicroseconds = scaledDur;
        if ('DurationMicroseconds' in e) {
          rec.DurationMicroseconds = scaledDur;
        }
      }
    }
  }

  const now = new Date().toISOString();
  (macro as unknown as Record<string, unknown>).modifiedAt = now;
  if ('ModifiedAt' in macro) {
    (macro as unknown as Record<string, unknown>).ModifiedAt = now;
  }
  return macro;
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
 * Evaluates whether a macro is an automatic pixel-color trigger.
 */
export function isAutomaticTriggerMacro(target: MacroDefinition | readonly MacroEvent[]): boolean {
  const events = Array.isArray(target)
    ? (target as readonly MacroEvent[])
    : ((target as MacroDefinition).events ??
      ((target as unknown as Record<string, unknown>).Events as readonly MacroEvent[]));
  if (!events) return false;
  const nonComments = events.filter((e) => !isCommentEvent(e));
  if (nonComments.length === 0) return false;

  let minTime = nonComments[0]!.timeMicroseconds;
  for (let i = 1; i < nonComments.length; i++) {
    const t = nonComments[i]!.timeMicroseconds;
    if (t < minTime) {
      minTime = t;
    }
  }

  const atMinTime = nonComments.filter((e) => e.timeMicroseconds === minTime);
  atMinTime.sort((a, b) => getEventOrder(a) - getEventOrder(b));

  return atMinTime[0]?.type === MacroEventType.PixelColorTrigger;
}

/**
 * Orders macro definitions for library presentation: enabled macros first,
 * then sorted by last modified timestamp descending.
 */
export function orderLibraryMacros(macros: readonly MacroDefinition[]): MacroDefinition[] {
  return [...macros].sort((a, b) => {
    const aEnabled = a.isEnabled ?? (a as unknown as Record<string, unknown>).IsEnabled ?? true;
    const bEnabled = b.isEnabled ?? (b as unknown as Record<string, unknown>).IsEnabled ?? true;
    if (aEnabled !== bEnabled) {
      return aEnabled ? -1 : 1;
    }
    const aTime = new Date(
      a.modifiedAt ?? ((a as unknown as Record<string, unknown>).ModifiedAt as string) ?? 0,
    ).getTime();
    const bTime = new Date(
      b.modifiedAt ?? ((b as unknown as Record<string, unknown>).ModifiedAt as string) ?? 0,
    ).getTime();
    return bTime - aTime;
  });
}

/**
 * Object-oriented wrapper around TimingSummary providing both camelCase and PascalCase getters.
 */
export class TimingSummaryResult implements TimingSummary {
  public readonly count: number;
  public readonly failed: number;
  public readonly unconfirmed: number;
  public readonly meanMs: Milliseconds;
  public readonly medianMs: Milliseconds;
  public readonly p95Ms: Milliseconds;
  public readonly p99Ms: Milliseconds;
  public readonly maxMs: Milliseconds;

  public constructor(summary: TimingSummary) {
    this.count = summary.count;
    this.failed = summary.failed;
    this.unconfirmed = summary.unconfirmed;
    this.meanMs = summary.meanMs;
    this.medianMs = summary.medianMs;
    this.p95Ms = summary.p95Ms;
    this.p99Ms = summary.p99Ms;
    this.maxMs = summary.maxMs;
  }

  public get Count(): number {
    return this.count;
  }

  public get Failed(): number {
    return this.failed;
  }

  public get Unconfirmed(): number {
    return this.unconfirmed;
  }

  public get MeanMs(): Milliseconds {
    return this.meanMs;
  }

  public get MedianMs(): Milliseconds {
    return this.medianMs;
  }

  public get P95Ms(): Milliseconds {
    return this.p95Ms;
  }

  public get P99Ms(): Milliseconds {
    return this.p99Ms;
  }

  public get MaxMs(): Milliseconds {
    return this.maxMs;
  }
}

/**
 * Calculates aggregate timing and jitter statistics across a collection of receipts.
 */
export function calculateTimingStatistics(
  receipts: readonly DispatchReceipt[],
): TimingSummaryResult {
  const summary = modelCalculateStats(receipts);
  return new TimingSummaryResult(summary);
}

export const MacroProcessing = {
  roundToMilliseconds,
  RoundToMilliseconds: roundToMilliseconds,
  getEventOrder,
  EventOrder: getEventOrder,
  normalize: normalizeEvents,
  Normalize: normalizeEvents,
  rebaseToZero: rebaseEventsToZero,
  RebaseToZero: rebaseEventsToZero,
  compressMouseMoves,
  CompressMouseMoves: compressMouseMoves,
  scaleTime,
  ScaleTime: scaleTime,
  suggestInsertionTime,
  SuggestInsertionTime: suggestInsertionTime,
  isAutomaticTriggerMacro,
  IsAutomaticTriggerMacro: isAutomaticTriggerMacro,
  orderLibrary: orderLibraryMacros,
  OrderLibrary: orderLibraryMacros,
};

export const TimingStatistics = {
  calculate: calculateTimingStatistics,
  Calculate: calculateTimingStatistics,
  empty: new TimingSummaryResult(emptyTimingSummary),
  Empty: new TimingSummaryResult(emptyTimingSummary),
};
