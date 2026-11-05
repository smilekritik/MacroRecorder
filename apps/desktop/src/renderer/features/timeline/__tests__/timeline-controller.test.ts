import { describe, it, expect } from 'vitest';
import {
  createDefaultMacroDefinition,
  createKeyDownEvent,
  createKeyUpEvent,
  createPixelColorTriggerEvent,
  MacroEventType,
} from '../../../../../../../packages/domain/src/model/index.js';
import type { MacroDefinition, MacroEvent } from '../../../../../../../packages/contracts/src/index.js';
import { TimelineEditor } from '../../../../../../../packages/domain/src/timeline/index.js';

function createTestMacro(events: MacroEvent[], id = 'macro-test-1', name = 'Test Macro'): MacroDefinition {
  const macro = createDefaultMacroDefinition({ id, name });
  (macro as unknown as { events: MacroEvent[] }).events = events;
  return macro;
}

describe('Timeline Controller and Domain', () => {
  it('links absolute time and previous interval identically', () => {
    const macro = createTestMacro([
      createKeyDownEvent({ timeMicroseconds: 0, virtualKey: 0x41 }),
      createKeyDownEvent({ timeMicroseconds: 30_000, virtualKey: 0x42 }),
      createKeyDownEvent({ timeMicroseconds: 350_000, virtualKey: 0x43 }),
      createKeyDownEvent({ timeMicroseconds: 365_000, virtualKey: 0x44 }),
    ]);
    const editor = new TimelineEditor();
    editor.load(macro);

    expect(editor.rows.map((x) => x.intervalMilliseconds)).toEqual([0, 30, 320, 15]);

    // Edit interval
    editor.rows[2]!.intervalMilliseconds = 300;
    expect(macro.events.map((x) => x.timeMicroseconds)).toEqual([0, 30_000, 330_000, 345_000]);
    expect(editor.rows.map((x) => x.intervalMilliseconds)).toEqual([0, 30, 300, 15]);

    // Edit absolute time
    editor.rows[1]!.timeMilliseconds = 50;
    expect(macro.events.map((x) => x.timeMicroseconds)).toEqual([0, 50_000, 350_000, 365_000]);
    expect(editor.rows.map((x) => x.intervalMilliseconds)).toEqual([0, 50, 300, 15]);

    // Clamps negative time
    editor.rows[1]!.timeMilliseconds = -5;
    expect(macro.events.map((x) => x.timeMicroseconds)).toEqual([0, 0, 300_000, 315_000]);
    expect(editor.rows.map((x) => x.intervalMilliseconds)).toEqual([0, 0, 300, 15]);
  });

  it('drag reorder preserves intervals and rebases trigger to zero', () => {
    const firstDown = createKeyDownEvent({ timeMicroseconds: 0, virtualKey: 0x41 });
    const firstUp = createKeyUpEvent({ timeMicroseconds: 50_000, virtualKey: 0x41 });
    const trigger = createPixelColorTriggerEvent({
      pixelX: 0,
      pixelY: 0,
      pixelColor: 0,
      timeMicroseconds: 60_000,
    });
    const secondDown = createKeyDownEvent({ timeMicroseconds: 60_000, virtualKey: 0x42 });
    const secondUp = createKeyUpEvent({ timeMicroseconds: 110_000, virtualKey: 0x42 });

    const macro = createTestMacro([firstDown, firstUp, trigger, secondDown, secondUp]);
    const editor = new TimelineEditor();
    editor.load(macro);

    const result = editor.moveEvents([firstDown, firstUp], 3);
    expect(result.changed).toBe(true);

    expect(macro.events).toEqual([trigger, firstDown, firstUp, secondDown, secondUp]);
    expect(macro.events.map((item) => item.timeMicroseconds)).toEqual([
      0, 0, 50_000, 50_000, 100_000,
    ]);
    expect(editor.rows.map((row) => row.intervalMilliseconds)).toEqual([0, 0, 50, 0, 50]);
  });

  it('deletes selected actions and undo restores selection', () => {
    const events: MacroEvent[] = [
      createKeyDownEvent({ timeMicroseconds: 0, virtualKey: 0x41 }),
      createKeyDownEvent({ timeMicroseconds: 30_000, virtualKey: 0x42 }),
      createKeyDownEvent({ timeMicroseconds: 350_000, virtualKey: 0x43 }),
      createKeyDownEvent({ timeMicroseconds: 365_000, virtualKey: 0x44 }),
      createKeyDownEvent({ timeMicroseconds: 550_000, virtualKey: 0x45 }),
    ];
    const macro = createTestMacro([...events]);
    const editor = new TimelineEditor();
    editor.load(macro);

    const deleted = editor.deleteEvents([events[1]!, events[3]!], [events[1]!.id, events[3]!.id]);
    expect(deleted.changed).toBe(true);
    expect(macro.events.map((item) => item.timeMicroseconds)).toEqual([0, 320_000, 505_000]);

    const undone = editor.undo();
    expect(undone.changed).toBe(true);
    expect(undone.selectedEventIds).toEqual([events[1]!.id, events[3]!.id]);
    expect(macro.events.map((item) => item.timeMicroseconds)).toEqual([
      0, 30_000, 350_000, 365_000, 550_000,
    ]);
  });

  it('inserts actions after anchor without auto-pause when touching anchor', () => {
    const firstDown = createKeyDownEvent({ timeMicroseconds: 0, virtualKey: 0x41 });
    const firstUp = createKeyUpEvent({ timeMicroseconds: 50_000, virtualKey: 0x41 });
    const macro = createTestMacro([firstDown, firstUp]);
    const editor = new TimelineEditor();
    editor.load(macro);

    const down = createKeyDownEvent({ timeMicroseconds: 50_000, virtualKey: 0x42 });
    const up = createKeyUpEvent({ timeMicroseconds: 100_000, virtualKey: 0x42 });
    const result = editor.addEvents([down, up], firstUp, 50_000, 50_000);

    expect(result.changed).toBe(true);
    expect(macro.events.some((item) => item.type === MacroEventType.Delay)).toBe(false);
    expect(editor.rows.map((row) => row.event.timeMicroseconds)).toEqual([
      0, 50_000, 50_000, 100_000,
    ]);
  });

  it('inserts single gap pause when adding action with later start', () => {
    const firstDown = createKeyDownEvent({ timeMicroseconds: 0, virtualKey: 0x41 });
    const firstUp = createKeyUpEvent({ timeMicroseconds: 50_000, virtualKey: 0x41 });
    const macro = createTestMacro([firstDown, firstUp]);
    const editor = new TimelineEditor();
    editor.load(macro);

    const down = createKeyDownEvent({ timeMicroseconds: 70_000, virtualKey: 0x42 });
    const up = createKeyUpEvent({ timeMicroseconds: 120_000, virtualKey: 0x42 });
    const result = editor.addEvents([down, up], firstUp, 70_000, 50_000);

    const pauses = macro.events.filter((item) => item.type === MacroEventType.Delay);
    expect(pauses.length).toBe(1);
    expect(pauses[0]!.timeMicroseconds).toBe(70_000);
    expect(result.selectedEventIds).toContain(pauses[0]!.id);
  });

  it('copy and paste works across macros and shifts tail', () => {
    const sourceDown = createKeyDownEvent({ timeMicroseconds: 100_000, virtualKey: 0x45, scanCode: 18 });
    const sourceUp = createKeyUpEvent({ timeMicroseconds: 150_000, virtualKey: 0x45, scanCode: 18 });
    const source = createTestMacro([sourceDown, sourceUp], 'source-1');

    const targetAnchor = createKeyDownEvent({ timeMicroseconds: 0, virtualKey: 0x41 });
    const targetTail = createKeyUpEvent({ timeMicroseconds: 100_000, virtualKey: 0x41 });
    const target = createTestMacro([targetAnchor, targetTail], 'target-1');

    const editor = new TimelineEditor();
    editor.load(source);
    expect(editor.copyEvents([sourceDown, sourceUp])).toBe(2);

    editor.load(target);
    const pasted = editor.pasteAfter(targetAnchor, [targetAnchor.id]);

    expect(pasted.changed).toBe(true);
    expect(target.events.length).toBe(4);
    expect(target.events.map((item) => item.timeMicroseconds)).toEqual([
      0, 10_000, 60_000, 160_000,
    ]);
  });

  it('supports scaling timings and undo reverses scaling', () => {
    const first = createKeyDownEvent({ timeMicroseconds: 0, virtualKey: 0x41 });
    const second = createKeyDownEvent({ timeMicroseconds: 50_000, virtualKey: 0x42 });
    const macro = createTestMacro([first, second]);
    const editor = new TimelineEditor();
    editor.load(macro);

    expect(editor.scale(2).changed).toBe(true);
    expect(macro.events[1]!.timeMicroseconds).toBe(100_000);

    expect(editor.undo().changed).toBe(true);
    expect(macro.events[1]!.timeMicroseconds).toBe(50_000);

    expect(editor.redo().changed).toBe(true);
    expect(macro.events[1]!.timeMicroseconds).toBe(100_000);
  });

  it('inserts comment row without moving timeline', () => {
    const first = createKeyDownEvent({ timeMicroseconds: 0, virtualKey: 0x45 });
    const second = createKeyUpEvent({ timeMicroseconds: 40_000, virtualKey: 0x45 });
    const macro = createTestMacro([first, second]);
    const editor = new TimelineEditor();
    editor.load(macro);

    expect(editor.insertComment(first, 'checkpoint').changed).toBe(true);
    expect(editor.rows.length).toBe(3);
    expect(editor.rows[1]!.isComment).toBe(true);
    expect(editor.rows[1]!.comment).toBe('checkpoint');
    expect(editor.rows[1]!.timeMilliseconds).toBe(0);
    expect(second.timeMicroseconds).toBe(40_000);
    expect(editor.rows[2]!.intervalMilliseconds).toBe(40);
  });

  it('tracks dirty state and saving clears undo history', () => {
    const macro = createTestMacro([createKeyDownEvent({ virtualKey: 0x41, timeMicroseconds: 0 })]);
    const editor = new TimelineEditor();
    editor.load(macro);

    expect(editor.isDirty(macro)).toBe(false);
    expect(editor.canUndo).toBe(false);

    editor.insertDelay(macro.events[0]!, 50_000);
    expect(editor.isDirty(macro)).toBe(true);
    expect(editor.canUndo).toBe(true);
    expect(editor.macrosWithPendingEdits).toContain(macro.id);

    editor.markSaved(macro);
    expect(editor.isDirty(macro)).toBe(false);
    expect(editor.canUndo).toBe(false);
    expect(editor.canRedo).toBe(false);
    expect(editor.macrosWithPendingEdits).not.toContain(macro.id);
  });
});
