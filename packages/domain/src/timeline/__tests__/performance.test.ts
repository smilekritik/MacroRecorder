/**
 * Performance, scalability, and time-drift integrity tests for the timeline module.
 * Verifies:
 * - Zero floating-point drift across repeated reversible edit cycles (64-bit integer microseconds).
 * - Bounded undo history eviction and memory isolation.
 * - Linear scalability on 10,000+ event timelines without quadratic regressions.
 */

import { describe, expect, it } from 'vitest';
import {
  createCommentEvent,
  createDefaultMacroDefinition,
  createDelayEvent,
  createKeyDownEvent,
  createKeyUpEvent,
  createMouseButtonDownEvent,
  createMouseButtonUpEvent,
  createMouseMoveEvent,
  MouseButton,
} from '../../model/index.js';
import type { MacroDefinition, MacroEvent } from '../../model/types.js';
import { TimelineEditor } from '../editor.js';
import { compressMouseMoves, normalizeEventsInPlace } from '../processing.js';

function createTestMacro(events: MacroEvent[]): MacroDefinition {
  const macro = createDefaultMacroDefinition();
  (macro as unknown as { events: MacroEvent[] }).events = events;
  return macro;
}

describe('Timeline Performance & Reversibility Integrity', () => {
  it('guarantees zero floating-point time drift across 50 edit and undo cycles', () => {
    const initialEvents: MacroEvent[] = [
      createKeyDownEvent({ timeMicroseconds: 0, virtualKey: 0x41 }),
      createKeyUpEvent({ timeMicroseconds: 50_000, virtualKey: 0x41 }),
      createDelayEvent({ timeMicroseconds: 100_000, durationMicroseconds: 0 }),
      createMouseButtonDownEvent({ timeMicroseconds: 120_000, button: MouseButton.Left }),
      createMouseButtonUpEvent({ timeMicroseconds: 170_000, button: MouseButton.Left }),
      createCommentEvent({ timeMicroseconds: 170_000, text: 'step 1 done' }),
      createKeyDownEvent({ timeMicroseconds: 250_000, virtualKey: 0x42 }),
      createKeyUpEvent({ timeMicroseconds: 300_000, virtualKey: 0x42 }),
    ];

    const initialTimes = initialEvents.map((e) => e.timeMicroseconds);
    const macro = createTestMacro(initialEvents);
    const editor = new TimelineEditor();
    editor.load(macro);

    // Perform 50 cycles of mutations and undos
    for (let cycle = 0; cycle < 50; cycle++) {
      // Scale by 2, then undo
      editor.scale(2);
      expect(editor.canUndo).toBe(true);
      editor.undo();

      // Shift interval on row 3, then undo
      editor.rows[3]!.intervalMilliseconds = 50;
      editor.undo();

      // Insert delay, then undo
      editor.insertDelay(macro.events[2]!, 30_000);
      editor.undo();
    }

    // Verify exact integer microseconds match initial timestamps with 0 drift
    const finalTimes = macro.events.map((e) => e.timeMicroseconds);
    expect(finalTimes).toEqual(initialTimes);
    for (let i = 0; i < finalTimes.length; i++) {
      expect(Number.isInteger(finalTimes[i])).toBe(true);
      expect(finalTimes[i]).toBe(initialTimes[i]);
    }
  });

  it('enforces bounded undo history depth and evicts oldest states FIFO', () => {
    const maxUndoDepth = 5;
    const editor = new TimelineEditor({ maxUndoDepth });
    const macro = createTestMacro([createKeyDownEvent({ timeMicroseconds: 0, virtualKey: 0x41 })]);
    editor.load(macro);

    // Perform 12 consecutive edits
    for (let i = 1; i <= 12; i++) {
      editor.addEvents(
        [createKeyDownEvent({ timeMicroseconds: i * 100_000, virtualKey: 0x41 + (i % 26) })],
        null,
        i * 100_000,
        0,
      );
    }

    // Undo stack must not exceed maxUndoDepth (5)
    let undoCount = 0;
    while (editor.canUndo) {
      const res = editor.undo();
      if (res.changed) {
        undoCount++;
      }
    }

    expect(undoCount).toBe(maxUndoDepth);
    expect(editor.canUndo).toBe(false);
  });

  it('maintains independent undo histories between different macros', () => {
    const editor = new TimelineEditor();
    const macroA = createTestMacro([createKeyDownEvent({ timeMicroseconds: 0, virtualKey: 0x41 })]);
    const macroB = createTestMacro([createKeyDownEvent({ timeMicroseconds: 0, virtualKey: 0x42 })]);

    editor.load(macroA);
    editor.insertDelay(null, 50_000);
    expect(editor.canUndo).toBe(true);
    expect(editor.isDirty(macroA)).toBe(true);
    expect(editor.isDirty(macroB)).toBe(false);

    editor.load(macroB);
    expect(editor.canUndo).toBe(false);
    editor.insertDelay(null, 70_000);
    expect(editor.canUndo).toBe(true);
    expect(editor.isDirty(macroB)).toBe(true);

    // Saving macroA clears only macroA's dirty/undo state
    editor.markSaved(macroA);
    expect(editor.isDirty(macroA)).toBe(false);
    expect(editor.isDirty(macroB)).toBe(true);

    // Switch back to macroA
    editor.load(macroA);
    expect(editor.canUndo).toBe(false);

    // Switch back to macroB
    editor.load(macroB);
    expect(editor.canUndo).toBe(true);
    editor.undo();
    expect(macroB.events.length).toBe(1);
  });

  it('processes 10,000+ events without quadratic slowdowns in common edit paths', () => {
    const count = 10_000;
    const events: MacroEvent[] = new Array(count);

    for (let i = 0; i < count; i++) {
      events[i] = createKeyDownEvent({
        timeMicroseconds: i * 10_000,
        virtualKey: 0x41 + (i % 26),
      });
    }

    const macro = createTestMacro(events);
    const editor = new TimelineEditor();

    // 1. Loading 10,000 events into TimelineEditor
    const loadStart = performance.now();
    editor.load(macro);
    const loadDuration = performance.now() - loadStart;
    expect(editor.rows.length).toBe(count);
    expect(loadDuration).toBeLessThan(1000); // Well under 1s

    // 2. Normalize 10,000 events in place
    const normStart = performance.now();
    normalizeEventsInPlace(macro.events as MacroEvent[]);
    const normDuration = performance.now() - normStart;
    expect(normDuration).toBeLessThan(500);

    // 3. Move a block of events
    const toMove = [macro.events[100]!, macro.events[101]!];
    const moveStart = performance.now();
    const moveResult = editor.moveEvents(toMove, 500);
    const moveDuration = performance.now() - moveStart;
    expect(moveResult.changed).toBe(true);
    expect(moveDuration).toBeLessThan(500);

    // 4. Delete a chunk of events
    const toDelete = [macro.events[200]!, macro.events[201]!, macro.events[202]!];
    const deleteStart = performance.now();
    const deleteResult = editor.deleteEvents(toDelete);
    const deleteDuration = performance.now() - deleteStart;
    expect(deleteResult.changed).toBe(true);
    expect(deleteDuration).toBeLessThan(500);

    // 5. Undo the delete
    const undoStart = performance.now();
    const undoResult = editor.undo();
    const undoDuration = performance.now() - undoStart;
    expect(undoResult.changed).toBe(true);
    expect(undoDuration).toBeLessThan(500);

    // 6. Linear compression of 10,000 mouse moves
    const moveEvents: MacroEvent[] = new Array(count);
    for (let i = 0; i < count; i++) {
      moveEvents[i] = createMouseMoveEvent({
        timeMicroseconds: i * 500, // 2 moves per millisecond
        deltaX: 1,
        deltaY: -1,
      });
    }

    const compressStart = performance.now();
    const compressed = compressMouseMoves(moveEvents, 10);
    const compressDuration = performance.now() - compressStart;

    expect(compressed.length).toBeLessThan(count);
    expect(compressDuration).toBeLessThan(500);
  });
});
