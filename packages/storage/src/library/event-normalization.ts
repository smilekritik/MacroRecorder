/**
 * Timeline action normalization and ordering according to legacy MacroProcessing rules.
 */

import { type MacroEvent, MacroEventType } from '../../../contracts/src/index.js';

/**
 * Rounds microseconds to whole milliseconds. Clamps negative values to zero.
 */
export function roundToMilliseconds(microseconds: number): number {
  return microseconds <= 0 ? 0 : Math.round(microseconds / 1000) * 1000;
}

/**
 * Checks if an event is a blocking wait ("wait first, then act").
 */
function isWaitEvent(event: MacroEvent): boolean {
  return (
    event.type === MacroEventType.PixelColorTrigger ||
    event.type === MacroEventType.WaitForPixelGone ||
    event.type === MacroEventType.WaitForWindow ||
    event.type === MacroEventType.WaitForKey
  );
}

/**
 * Event priority within the same timestamp: waits come first (0), actions come second (1).
 */
function eventOrder(event: MacroEvent): number {
  return isWaitEvent(event) ? 0 : 1;
}

/**
 * Normalizes macro actions:
 * - Rounds timestamps and durations to whole milliseconds; negative clamped to 0.
 * - Anchors comment rows to preceding actions (or timeline start).
 * - Stable sorts actions by timestamp ascending, prioritizing blocking waits.
 */
export function normalizeMacroEvents(events: readonly MacroEvent[]): MacroEvent[] {
  const source: MacroEvent[] = events.map((e) => {
    const roundedTime = roundToMilliseconds(e.timeMicroseconds);
    const hasDuration = 'durationMicroseconds' in e && typeof e.durationMicroseconds === 'number';
    const roundedDuration = hasDuration ? roundToMilliseconds(e.durationMicroseconds) : undefined;

    return {
      ...e,
      timeMicroseconds: roundedTime,
      ...(roundedDuration !== undefined ? { durationMicroseconds: roundedDuration } : {}),
    } as MacroEvent;
  });

  const hasComments = source.some((e) => e.type === MacroEventType.Comment);
  if (!hasComments) {
    return source.slice().sort((a, b) => {
      const diff = a.timeMicroseconds - b.timeMicroseconds;
      if (diff !== 0) return diff;
      return eventOrder(a) - eventOrder(b);
    });
  }

  const leading: MacroEvent[] = [];
  const trailingByAction = new Map<MacroEvent, MacroEvent[]>();
  const actions: MacroEvent[] = [];
  let anchor: MacroEvent | null = null;

  for (const item of source) {
    if (item.type === MacroEventType.Comment) {
      if (anchor === null) {
        leading.push(item);
      } else {
        const list = trailingByAction.get(anchor) ?? [];
        list.push(item);
        trailingByAction.set(anchor, list);
      }
      continue;
    }
    actions.push(item);
    anchor = item;
  }

  const result: MacroEvent[] = [];
  for (const comment of leading) {
    result.push({ ...comment, timeMicroseconds: 0 });
  }

  const sortedActions = actions.slice().sort((a, b) => {
    const diff = a.timeMicroseconds - b.timeMicroseconds;
    if (diff !== 0) return diff;
    return eventOrder(a) - eventOrder(b);
  });

  for (const action of sortedActions) {
    result.push(action);
    const attached = trailingByAction.get(action);
    if (attached) {
      for (const comment of attached) {
        result.push({ ...comment, timeMicroseconds: action.timeMicroseconds });
      }
    }
  }

  return result;
}
