/**
 * Timeline merge and shift transformations for recording insertion modes:
 * Overwrite (Replace), Continue (InsertAtSelection), and Append (AppendToEnd).
 */

import { type MacroDefinition, type MacroEvent, type Microseconds } from '../model/types.js';
import {
  cloneMacroEvent,
  getEventEndTimeMicroseconds,
  getMacroDurationMicroseconds,
  normalizeEvents,
} from '../model/index.js';
import { RecordingMergeMode } from './types.js';

/**
 * Default gap placed before appended recordings or between insertion blocks (10 ms in microseconds).
 */
export const RECORDING_MERGE_GAP_MICROSECONDS: Microseconds = 10_000;

/**
 * Normalizes a merge mode string or enum into canonical Replace, InsertAtSelection, or AppendToEnd.
 */
export function normalizeMergeMode(
  mode: RecordingMergeMode,
): 'Replace' | 'InsertAtSelection' | 'AppendToEnd' {
  switch (mode) {
    case 'replace':
    case 'overwrite':
    case RecordingMergeMode.Replace:
      return 'Replace';
    case 'insertAtSelection':
    case 'continue':
    case RecordingMergeMode.InsertAtSelection:
      return 'InsertAtSelection';
    case 'appendToEnd':
    case 'append':
    case RecordingMergeMode.AppendToEnd:
      return 'AppendToEnd';
    default:
      return 'Replace';
  }
}

function setEventTime(event: MacroEvent, timeMicroseconds: Microseconds): MacroEvent {
  return { ...cloneMacroEvent(event), timeMicroseconds } as MacroEvent;
}

/**
 * Merges newly recorded events into an existing macro definition, returning a new immutable MacroDefinition.
 *
 * Guarantees:
 * - 'Replace' / 'overwrite': replaces all existing events with recorded events.
 * - 'InsertAtSelection' / 'continue': inserts recording at `insertMicroseconds`; all existing actions
 *   at or after the anchor timestamp are shifted forward by `span + 10ms`.
 * - 'AppendToEnd' / 'append': appends recording after `macroDuration + 10ms`; existing actions remain untouched.
 * - Deterministic simultaneous event ordering rules are preserved via `normalizeEvents`.
 */
export function mergeRecordedEvents(
  macro: MacroDefinition,
  recorded: readonly MacroEvent[],
  mode: RecordingMergeMode = RecordingMergeMode.Replace,
  insertMicroseconds: Microseconds = 0,
): MacroDefinition {
  const canonicalMode = normalizeMergeMode(mode);

  if (canonicalMode === 'Replace' || macro.events.length === 0) {
    return {
      ...macro,
      events: recorded.map(cloneMacroEvent),
      modifiedAt: new Date().toISOString(),
    };
  }

  if (recorded.length === 0) {
    return macro;
  }

  const span = Math.max(...recorded.map((e) => getEventEndTimeMicroseconds(e)));
  const gap = RECORDING_MERGE_GAP_MICROSECONDS;

  const start =
    canonicalMode === 'AppendToEnd'
      ? getMacroDurationMicroseconds(macro) + gap
      : Math.max(0, insertMicroseconds);

  const existingEvents: MacroEvent[] = [];

  if (canonicalMode === 'InsertAtSelection') {
    const shift = span + gap;
    for (const item of macro.events) {
      if (item.timeMicroseconds >= start) {
        existingEvents.push(setEventTime(item, item.timeMicroseconds + shift));
      } else {
        existingEvents.push(cloneMacroEvent(item));
      }
    }
  } else {
    for (const item of macro.events) {
      existingEvents.push(cloneMacroEvent(item));
    }
  }

  const shiftedRecorded: MacroEvent[] = recorded.map((item) =>
    setEventTime(item, item.timeMicroseconds + start),
  );

  const combined = [...existingEvents, ...shiftedRecorded];
  const normalized = normalizeEvents(combined);

  return {
    ...macro,
    events: normalized,
    modifiedAt: new Date().toISOString(),
  };
}

/**
 * In-place mutation version.Recording.cs MergeRecordedEvents signature.
 * Updates `macro.events` directly and returns the number of recorded events added.
 */
export function mergeRecordedEventsInPlace(
  macro: { events: MacroEvent[] | readonly MacroEvent[]; modifiedAt?: string },
  recorded: readonly MacroEvent[],
  mode: RecordingMergeMode = RecordingMergeMode.Replace,
  insertMicroseconds: Microseconds = 0,
): number {
  const canonicalMode = normalizeMergeMode(mode);

  if (canonicalMode === 'Replace' || macro.events.length === 0) {
    (macro as { events: MacroEvent[] }).events = recorded.map(cloneMacroEvent);
    if (macro.modifiedAt !== undefined) {
      macro.modifiedAt = new Date().toISOString();
    }
    return recorded.length;
  }

  if (recorded.length === 0) {
    return 0;
  }

  const span = Math.max(...recorded.map((e) => getEventEndTimeMicroseconds(e)));
  const gap = RECORDING_MERGE_GAP_MICROSECONDS;

  let currentDuration: Microseconds = 0;
  for (const e of macro.events) {
    const end = getEventEndTimeMicroseconds(e);
    if (end > currentDuration) {
      currentDuration = end;
    }
  }

  const start =
    canonicalMode === 'AppendToEnd' ? currentDuration + gap : Math.max(0, insertMicroseconds);

  const existingEvents: MacroEvent[] = [];

  if (canonicalMode === 'InsertAtSelection') {
    const shift = span + gap;
    for (const item of macro.events) {
      if (item.timeMicroseconds >= start) {
        existingEvents.push(setEventTime(item, item.timeMicroseconds + shift));
      } else {
        existingEvents.push(cloneMacroEvent(item));
      }
    }
  } else {
    for (const item of macro.events) {
      existingEvents.push(cloneMacroEvent(item));
    }
  }

  const shiftedRecorded: MacroEvent[] = recorded.map((item) =>
    setEventTime(item, item.timeMicroseconds + start),
  );

  const combined = [...existingEvents, ...shiftedRecorded];
  const normalized = normalizeEvents(combined);

  (macro as { events: MacroEvent[] }).events = normalized;
  if (macro.modifiedAt !== undefined) {
    macro.modifiedAt = new Date().toISOString();
  }

  return recorded.length;
}
