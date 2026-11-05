/**
 * Unit tests for TimelineEditor and TimelineRow.
 * Covers LEGACY-TEST-090 through LEGACY-TEST-103 ( ..).
 */

import { describe, expect, it } from 'vitest';
import {
  createDefaultMacroDefinition,
  createDelayEvent,
  createKeyDownEvent,
  createKeyUpEvent,
  createPixelColorTriggerEvent,
  MacroEventType,
} from '../../packages/domain/src/model/index.js';
import type {
  MacroDefinition,
  MacroEvent,
} from '../../packages/contracts/src/index.js';
import { TimelineEditor } from '../../packages/domain/src/timeline/index.js';

function createTestMacro(events: MacroEvent[]): MacroDefinition {
  const macro = createDefaultMacroDefinition();
  (macro as unknown as { events: MacroEvent[] }).events = events;
  return macro;
}

describe('TimelineEditorTests', () => {
  /**
   * [Fact]
   * public void TimelineEditor_LinksAbsoluteTimeAndPreviousInterval
   * Mapped to LEGACY-TEST-090 /
   */
  it('TimelineEditor_LinksAbsoluteTimeAndPreviousInterval', () => {
    const macro = createTestMacro([
      createKeyDownEvent({ timeMicroseconds: 0, virtualKey: 0 }),
      createKeyDownEvent({ timeMicroseconds: 30_000, virtualKey: 0 }),
      createKeyDownEvent({ timeMicroseconds: 350_000, virtualKey: 0 }),
      createKeyDownEvent({ timeMicroseconds: 365_000, virtualKey: 0 }),
    ]);
    const editor = new TimelineEditor();
    editor.load(macro);

    expect(editor.rows.map((x) => x.intervalMilliseconds)).toEqual([0, 30, 320, 15]);

    editor.rows[2]!.intervalMilliseconds = 300;
    expect(macro.events.map((x) => x.timeMicroseconds)).toEqual([0, 30_000, 330_000, 345_000]);
    expect(editor.rows.map((x) => x.intervalMilliseconds)).toEqual([0, 30, 300, 15]);

    editor.rows[1]!.timeMilliseconds = 50;
    expect(macro.events.map((x) => x.timeMicroseconds)).toEqual([0, 50_000, 350_000, 365_000]);
    expect(editor.rows.map((x) => x.intervalMilliseconds)).toEqual([0, 50, 300, 15]);

    editor.rows[1]!.timeMilliseconds = -5;
    expect(macro.events.map((x) => x.timeMicroseconds)).toEqual([0, 0, 300_000, 315_000]);
    expect(editor.rows.map((x) => x.intervalMilliseconds)).toEqual([0, 0, 300, 15]);
  });

  /**
   * [Fact]
   * public void TimelineEditor_DragReorderPreservesIntervalsAndRebasesTriggerToZero
   * Mapped to LEGACY-TEST-091 /
   */
  it('TimelineEditor_DragReorderPreservesIntervalsAndRebasesTriggerToZero', () => {
    const firstDown = createKeyDownEvent({ timeMicroseconds: 0, virtualKey: 0 });
    const firstUp = createKeyUpEvent({ timeMicroseconds: 50_000, virtualKey: 0 });
    const trigger = createPixelColorTriggerEvent({
      pixelX: 0,
      pixelY: 0,
      pixelColor: 0,
      timeMicroseconds: 60_000,
    });
    const secondDown = createKeyDownEvent({ timeMicroseconds: 60_000, virtualKey: 0 });
    const secondUp = createKeyUpEvent({ timeMicroseconds: 110_000, virtualKey: 0 });

    const macro = createTestMacro([firstDown, firstUp, trigger, secondDown, secondUp]);
    const editor = new TimelineEditor();
    editor.load(macro);

    expect(editor.moveEvents([firstDown, firstUp], 3).changed).toBe(true);

    expect(macro.events).toEqual([trigger, firstDown, firstUp, secondDown, secondUp]);
    expect(macro.events.map((item) => item.timeMicroseconds)).toEqual([
      0, 0, 50_000, 50_000, 100_000,
    ]);
    expect(editor.rows.map((row) => row.intervalMilliseconds)).toEqual([0, 0, 50, 0, 50]);
  });

  /**
   * [Fact]
   * public void TimelineEditor_DeleteRemovesSelectedIntervalsAndUndoRestoresSelection
   * Mapped to LEGACY-TEST-092 /
   */
  it('TimelineEditor_DeleteRemovesSelectedIntervalsAndUndoRestoresSelection', () => {
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
    expect(macro.events.map((item) => (item as { virtualKey?: number }).virtualKey)).toEqual([
      0x41, 0x43, 0x45,
    ]);
    expect(macro.events.map((item) => item.timeMicroseconds)).toEqual([0, 320_000, 505_000]);

    const undone = editor.undo();
    expect(undone.changed).toBe(true);
    expect(undone.selectedEventIds).toEqual([events[1]!.id, events[3]!.id]);
    expect(macro.events.map((item) => item.timeMicroseconds)).toEqual([
      0, 30_000, 350_000, 365_000, 550_000,
    ]);
  });

  /**
   * [Fact]
   * public void AddEvents_InsertsAfterAnchorKeepingOrderWithoutAutoPause
   * Mapped to LEGACY-TEST-093 /
   */
  it('AddEvents_InsertsAfterAnchorKeepingOrderWithoutAutoPause', () => {
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
    expect(
      editor.rows.map((row) => [(row.event as { virtualKey?: number }).virtualKey, row.event.type]),
    ).toEqual([
      [0x41, MacroEventType.KeyDown],
      [0x41, MacroEventType.KeyUp],
      [0x42, MacroEventType.KeyDown],
      [0x42, MacroEventType.KeyUp],
    ]);
    expect(editor.rows.map((row) => row.event.timeMicroseconds)).toEqual([
      0, 50_000, 50_000, 100_000,
    ]);
    expect(result.selectedEventIds).toEqual([down.id, up.id]);
  });

  /**
   * [Fact]
   * public void AddEvents_LaterStartInsertsSingleGapPauseThatIsSelected
   * Mapped to LEGACY-TEST-094 /
   */
  it('AddEvents_LaterStartInsertsSingleGapPauseThatIsSelected', () => {
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
    const pause = pauses[0]!;
    expect(pause.timeMicroseconds).toBe(70_000);
    expect(editor.rows.map((row) => row.event.timeMicroseconds)).toEqual([
      0, 50_000, 70_000, 70_000, 120_000,
    ]);
    expect(result.selectedEventIds).toEqual([pause.id, down.id, up.id]);
  });

  /**
   * [Fact]
   * public void AddEvents_AfterExistingPauseDoesNotAddSecondPause
   * Mapped to LEGACY-TEST-095 /
   */
  it('AddEvents_AfterExistingPauseDoesNotAddSecondPause', () => {
    const firstDown = createKeyDownEvent({ timeMicroseconds: 0, virtualKey: 0x41 });
    const firstUp = createKeyUpEvent({ timeMicroseconds: 50_000, virtualKey: 0x41 });
    const pause = createDelayEvent({ timeMicroseconds: 150_000, durationMicroseconds: 0 });
    const macro = createTestMacro([firstDown, firstUp, pause]);
    const editor = new TimelineEditor();
    editor.load(macro);

    const down = createKeyDownEvent({ timeMicroseconds: 150_000, virtualKey: 0x42 });
    const up = createKeyUpEvent({ timeMicroseconds: 200_000, virtualKey: 0x42 });
    editor.addEvents([down, up], pause, 150_000, 50_000);

    expect(macro.events.filter((item) => item.type === MacroEventType.Delay).length).toBe(1);
    expect(editor.rows.map((row) => row.event.type)).toEqual([
      MacroEventType.KeyDown,
      MacroEventType.KeyUp,
      MacroEventType.Delay,
      MacroEventType.KeyDown,
      MacroEventType.KeyUp,
    ]);
    expect(editor.rows.map((row) => row.event.timeMicroseconds)).toEqual([
      0, 50_000, 150_000, 150_000, 200_000,
    ]);
  });

  /**
   * [Fact]
   * public void AddEvents_InMiddleShiftsTailPreservingIntervals
   * Mapped to LEGACY-TEST-096 /
   */
  it('AddEvents_InMiddleShiftsTailPreservingIntervals', () => {
    const firstDown = createKeyDownEvent({ timeMicroseconds: 0, virtualKey: 0x41 });
    const firstUp = createKeyUpEvent({ timeMicroseconds: 50_000, virtualKey: 0x41 });
    const tailDown = createKeyDownEvent({ timeMicroseconds: 100_000, virtualKey: 0x42 });
    const tailUp = createKeyUpEvent({ timeMicroseconds: 150_000, virtualKey: 0x42 });
    const macro = createTestMacro([firstDown, firstUp, tailDown, tailUp]);
    const editor = new TimelineEditor();
    editor.load(macro);

    const down = createKeyDownEvent({ timeMicroseconds: 50_000, virtualKey: 0x43 });
    const up = createKeyUpEvent({ timeMicroseconds: 100_000, virtualKey: 0x43 });
    editor.addEvents([down, up], firstUp, 50_000, 50_000);

    expect(editor.rows.map((row) => (row.event as { virtualKey?: number }).virtualKey)).toEqual([
      0x41, 0x41, 0x43, 0x43, 0x42, 0x42,
    ]);
    expect(editor.rows.map((row) => row.event.timeMicroseconds)).toEqual([
      0, 50_000, 50_000, 100_000, 150_000, 200_000,
    ]);
  });

  /**
   * [Fact]
   * public void TimelineEditor_CopyPasteWorksAcrossMacrosAndShiftsTail
   * Mapped to LEGACY-TEST-097 /
   */
  it('TimelineEditor_CopyPasteWorksAcrossMacrosAndShiftsTail', () => {
    const sourceDown = createKeyDownEvent({
      timeMicroseconds: 100_000,
      virtualKey: 0x45,
      scanCode: 18,
    });
    const sourceUp = createKeyUpEvent({
      timeMicroseconds: 150_000,
      virtualKey: 0x45,
      scanCode: 18,
    });
    const source = createTestMacro([sourceDown, sourceUp]);

    const targetAnchor = createKeyDownEvent({ timeMicroseconds: 0, virtualKey: 0x41 });
    const targetTail = createKeyUpEvent({ timeMicroseconds: 100_000, virtualKey: 0x41 });
    const target = createTestMacro([targetAnchor, targetTail]);

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
    expect(pasted.selectedEventIds.includes(sourceDown.id)).toBe(false);
    expect(pasted.selectedEventIds.includes(sourceUp.id)).toBe(false);
    expect(
      target.events.slice(1, 3).map((item) => (item as { scanCode?: number }).scanCode),
    ).toEqual([18, 18]);
  });

  /**
   * [Fact]
   * public void TimelineEditor_UsesIndependentUndoHistoriesAndSaveClearsCurrentHistory
   * Mapped to LEGACY-TEST-098 /
   */
  it('TimelineEditor_UsesIndependentUndoHistoriesAndSaveClearsCurrentHistory', () => {
    const firstEvent = createKeyDownEvent({ timeMicroseconds: 0, virtualKey: 0 });
    const secondEvent = createKeyDownEvent({ timeMicroseconds: 0, virtualKey: 0 });
    const first = createTestMacro([firstEvent]);
    const second = createTestMacro([secondEvent]);
    const editor = new TimelineEditor();

    editor.load(first);
    editor.insertDelay(firstEvent);
    editor.load(second);
    editor.insertDelay(secondEvent);
    expect(editor.undo().changed).toBe(true);
    expect(second.events.length).toBe(1);

    editor.load(first);
    expect(editor.canUndo).toBe(true);
    editor.markSaved(first);
    expect(editor.canUndo).toBe(false);
    expect(editor.undo().changed).toBe(false);
    expect(first.events.length).toBe(2);
  });

  /**
   * [Fact]
   * public void TimelineEditor_PasteAfterTriggerHasNoLeadingDelayButOccupiesTenMilliseconds
   * Mapped to LEGACY-TEST-099 /
   */
  it('TimelineEditor_PasteAfterTriggerHasNoLeadingDelayButOccupiesTenMilliseconds', () => {
    const copied = createKeyDownEvent({ timeMicroseconds: 0, virtualKey: 0x45 });
    const source = createTestMacro([copied]);
    const trigger = createPixelColorTriggerEvent({
      pixelX: 0,
      pixelY: 0,
      pixelColor: 0,
      timeMicroseconds: 0,
    });
    const tail = createKeyUpEvent({ timeMicroseconds: 50_000, virtualKey: 0x41 });
    const target = createTestMacro([trigger, tail]);

    const editor = new TimelineEditor();
    editor.load(source);
    editor.copyEvents([copied]);
    editor.load(target);

    const result = editor.pasteAfter(trigger);

    expect(result.changed).toBe(true);
    expect(target.events.map((item) => item.timeMicroseconds)).toEqual([0, 0, 60_000]);
    expect(target.events[0]!.type).toBe(MacroEventType.PixelColorTrigger);
  });

  /**
   * [Fact]
   * public void TimelineEditor_DeleteFirstEventRebasesRemainingTimelineToZero
   * Mapped to LEGACY-TEST-100 /
   */
  it('TimelineEditor_DeleteFirstEventRebasesRemainingTimelineToZero', () => {
    const first = createKeyDownEvent({ timeMicroseconds: 100_000, virtualKey: 0x41 });
    const second = createKeyDownEvent({ timeMicroseconds: 180_000, virtualKey: 0x42 });
    const third = createKeyDownEvent({ timeMicroseconds: 250_000, virtualKey: 0x43 });
    const macro = createTestMacro([first, second, third]);
    const editor = new TimelineEditor();
    editor.load(macro);

    editor.deleteEvents([first]);

    expect(macro.events.map((item) => item.timeMicroseconds)).toEqual([0, 70_000]);
  });

  /**
   * [Fact]
   * public void TimelineEditor_UndoCoversAddReplaceMoveAndScaleTransactions
   * Mapped to LEGACY-TEST-101 /
   */
  it('TimelineEditor_UndoCoversAddReplaceMoveAndScaleTransactions', () => {
    const first = createKeyDownEvent({ timeMicroseconds: 0, virtualKey: 0x41 });
    const second = createKeyDownEvent({ timeMicroseconds: 50_000, virtualKey: 0x42 });
    const macro = createTestMacro([first, second]);
    const editor = new TimelineEditor();
    editor.load(macro);

    const added = createKeyDownEvent({ timeMicroseconds: 100_000, virtualKey: 0x43 });
    expect(editor.addEvents([added], macro.events[1]!, 100_000, 0).changed).toBe(true);
    expect(editor.undo().changed).toBe(true);
    expect(macro.events.map((item) => (item as { virtualKey?: number }).virtualKey)).toEqual([
      0x41, 0x42,
    ]);

    const replacement = createKeyDownEvent({ timeMicroseconds: 0, virtualKey: 0x44 });
    expect(editor.replaceEvent(macro.events[0]!, [replacement]).changed).toBe(true);
    expect(editor.undo().changed).toBe(true);
    expect(macro.events.map((item) => (item as { virtualKey?: number }).virtualKey)).toEqual([
      0x41, 0x42,
    ]);

    expect(editor.moveEvents([macro.events[1]!], 0).changed).toBe(true);
    expect(editor.undo().changed).toBe(true);
    expect(macro.events.map((item) => (item as { virtualKey?: number }).virtualKey)).toEqual([
      0x41, 0x42,
    ]);

    expect(editor.scale(2).changed).toBe(true);
    expect(macro.events[1]!.timeMicroseconds).toBe(100_000);
    expect(editor.undo().changed).toBe(true);
    expect(macro.events[1]!.timeMicroseconds).toBe(50_000);
  });

  /**
   * [Fact]
   * public void InsertComment_AddsEmptyRowAfterAnchorWithoutMovingTimeline
   * Mapped to LEGACY-TEST-102 /
   */
  it('InsertComment_AddsEmptyRowAfterAnchorWithoutMovingTimeline', () => {
    const first = createKeyDownEvent({ timeMicroseconds: 0, virtualKey: 0x45 });
    const second = createKeyUpEvent({ timeMicroseconds: 40_000, virtualKey: 0x45 });
    const macro = createTestMacro([first, second]);
    const editor = new TimelineEditor();
    editor.load(macro);

    expect(editor.insertComment(first).changed).toBe(true);

    expect(editor.rows.length).toBe(3);
    expect(editor.rows[1]!.isComment).toBe(true);
    expect(editor.rows[1]!.timeMilliseconds).toBe(0);
    expect(second.timeMicroseconds).toBe(40_000);
    expect(editor.rows[2]!.intervalMilliseconds).toBe(40);

    editor.rows[1]!.comment = 'block N2D';
    expect((editor.rows[1]!.event as { text?: string }).text).toBe('block N2D');

    expect(editor.undo().changed).toBe(true);
    expect(editor.rows.length).toBe(3);
    expect(editor.rows[1]!.comment).toBe('');
    expect(editor.undo().changed).toBe(true);
    expect(editor.rows.length).toBe(2);
  });

  /**
   * [Fact]
   * public void TimelineRow_CommentOfRegularActionIsStoredSeparatelyFromText
   * Mapped to LEGACY-TEST-103 /
   */
  it('TimelineRow_CommentOfRegularActionIsStoredSeparatelyFromText', () => {
    const action = createKeyDownEvent({ virtualKey: 0x45 });
    const editor = new TimelineEditor();
    const macro = createTestMacro([action]);
    editor.load(macro);

    editor.rows[0]!.comment = 'needed for the dash';

    expect(editor.rows[0]!.isComment).toBe(false);
    expect(action.comment).toBe('needed for the dash');
    expect((action as { text?: string }).text).toBeUndefined();
  });
});
