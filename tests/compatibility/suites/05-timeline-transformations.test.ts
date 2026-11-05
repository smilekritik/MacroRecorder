import { describe, expect, it } from 'vitest';
import {
  createDefaultMacroDefinition,
  createKeyDownEvent,
  createKeyUpEvent,
  createPixelColorTriggerEvent,
  MacroEventType,
} from '../../../packages/domain/src/model/index.js';
import type { MacroDefinition, MacroEvent } from '../../../packages/contracts/src/index.js';
import { TimelineEditor } from '../../../packages/domain/src/timeline/editor.js';
import { LegacyTimelineEditorOracle } from '../oracle/legacy-oracle.js';

interface TestMacro extends MacroDefinition {
  events: MacroEvent[];
}

function createTestMacro(events: MacroEvent[]): TestMacro {
  const macro = createDefaultMacroDefinition();
  (macro as unknown as { events: MacroEvent[] }).events = events;
  return macro as TestMacro;
}

describe('Suite 05: Timeline Transformations', () => {
  // 1. Two-Way Sync Between Interval and Absolute Time
  it('1. Links absolute time and previous interval bidirectionally with tail shift', () => {
    const macro = createTestMacro([
      createKeyDownEvent({ timeMicroseconds: 0, virtualKey: 0x41 }),
      createKeyDownEvent({ timeMicroseconds: 30_000, virtualKey: 0x42 }),
      createKeyDownEvent({ timeMicroseconds: 350_000, virtualKey: 0x43 }),
      createKeyDownEvent({ timeMicroseconds: 365_000, virtualKey: 0x44 }),
    ]);
    const editor = new TimelineEditor();
    editor.load(macro);

    expect(editor.rows.map((x) => x.intervalMilliseconds)).toEqual([0, 30, 320, 15]);

    // Edit interval on row 2 from 320ms to 300ms (-20ms)
    editor.rows[2]!.intervalMilliseconds = 300;
    expect(macro.events.map((x) => x.timeMicroseconds)).toEqual([0, 30_000, 330_000, 345_000]);
    expect(editor.rows.map((x) => x.intervalMilliseconds)).toEqual([0, 30, 300, 15]);

    const legacyEvents = [
      { TimeMicroseconds: 0, Type: 'KeyDown', VirtualKey: 0x41, Id: '1', Device: 'Keyboard', ScanCode: 0, Extended: false, Button: '', DeltaX: 0, DeltaY: 0, WheelDelta: 0, AbsoluteMove: false, GamepadButton: '', GamepadAxis: '', AxisValue: 0, PadIndex: 0, Text: '', Comment: '', DurationMicroseconds: 0, ShowOverlayTiming: false, PixelX: 0, PixelY: 0, PixelColor: 0, TriggerCooldownMilliseconds: 0, WaitProcessName: '', WaitWindowTitle: '', WaitKeyVirtualKey: 0, WaitTimeoutMilliseconds: 0, SubMacroName: '' },
      { TimeMicroseconds: 30_000, Type: 'KeyDown', VirtualKey: 0x42, Id: '2', Device: 'Keyboard', ScanCode: 0, Extended: false, Button: '', DeltaX: 0, DeltaY: 0, WheelDelta: 0, AbsoluteMove: false, GamepadButton: '', GamepadAxis: '', AxisValue: 0, PadIndex: 0, Text: '', Comment: '', DurationMicroseconds: 0, ShowOverlayTiming: false, PixelX: 0, PixelY: 0, PixelColor: 0, TriggerCooldownMilliseconds: 0, WaitProcessName: '', WaitWindowTitle: '', WaitKeyVirtualKey: 0, WaitTimeoutMilliseconds: 0, SubMacroName: '' },
      { TimeMicroseconds: 350_000, Type: 'KeyDown', VirtualKey: 0x43, Id: '3', Device: 'Keyboard', ScanCode: 0, Extended: false, Button: '', DeltaX: 0, DeltaY: 0, WheelDelta: 0, AbsoluteMove: false, GamepadButton: '', GamepadAxis: '', AxisValue: 0, PadIndex: 0, Text: '', Comment: '', DurationMicroseconds: 0, ShowOverlayTiming: false, PixelX: 0, PixelY: 0, PixelColor: 0, TriggerCooldownMilliseconds: 0, WaitProcessName: '', WaitWindowTitle: '', WaitKeyVirtualKey: 0, WaitTimeoutMilliseconds: 0, SubMacroName: '' },
      { TimeMicroseconds: 365_000, Type: 'KeyDown', VirtualKey: 0x44, Id: '4', Device: 'Keyboard', ScanCode: 0, Extended: false, Button: '', DeltaX: 0, DeltaY: 0, WheelDelta: 0, AbsoluteMove: false, GamepadButton: '', GamepadAxis: '', AxisValue: 0, PadIndex: 0, Text: '', Comment: '', DurationMicroseconds: 0, ShowOverlayTiming: false, PixelX: 0, PixelY: 0, PixelColor: 0, TriggerCooldownMilliseconds: 0, WaitProcessName: '', WaitWindowTitle: '', WaitKeyVirtualKey: 0, WaitTimeoutMilliseconds: 0, SubMacroName: '' },
    ];
    const legacyUpdated = LegacyTimelineEditorOracle.updateInterval(legacyEvents, 2, 300_000);
    expect(legacyUpdated.map((e) => e.TimeMicroseconds)).toEqual(macro.events.map((e) => e.timeMicroseconds));

    // Edit time on row 1 from 30ms to 50ms (+20ms)
    editor.rows[1]!.timeMilliseconds = 50;
    expect(macro.events.map((x) => x.timeMicroseconds)).toEqual([0, 50_000, 350_000, 365_000]);
    expect(editor.rows.map((x) => x.intervalMilliseconds)).toEqual([0, 50, 300, 15]);

    // Negative clamp to zero
    editor.rows[1]!.timeMilliseconds = -5;
    expect(macro.events.map((x) => x.timeMicroseconds)).toEqual([0, 0, 300_000, 315_000]);
    expect(editor.rows.map((x) => x.intervalMilliseconds)).toEqual([0, 0, 300, 15]);
  });

  // 2. Deletion Compaction and Undo Restoration
  it('2. Deleting non-contiguous events compacts subsequent intervals and undo restores exact times', () => {
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

    // Surviving: 0x41, 0x43, 0x45
    expect(macro.events.map((item) => (item as { virtualKey?: number }).virtualKey)).toEqual([
      0x41, 0x43, 0x45,
    ]);
    expect(macro.events.map((item) => item.timeMicroseconds)).toEqual([0, 320_000, 505_000]);

    // Undo restores original selection and timestamps
    const undone = editor.undo();
    expect(undone.changed).toBe(true);
    expect(undone.selectedEventIds).toEqual([events[1]!.id, events[3]!.id]);
    expect(macro.events.map((item) => item.timeMicroseconds)).toEqual([
      0, 30_000, 350_000, 365_000, 550_000,
    ]);
  });

  // 3. Anchor Insertion
  it('3. Inserts after anchor preserving order without auto-pause when delta is zero', () => {
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
  });

  it('4. Inserts single gap pause when there is an explicit time gap after anchor', () => {
    const firstDown = createKeyDownEvent({ timeMicroseconds: 0, virtualKey: 0x41 });
    const firstUp = createKeyUpEvent({ timeMicroseconds: 50_000, virtualKey: 0x41 });
    const macro = createTestMacro([firstDown, firstUp]);
    const editor = new TimelineEditor();
    editor.load(macro);

    const down = createKeyDownEvent({ timeMicroseconds: 70_000, virtualKey: 0x42 });
    const up = createKeyUpEvent({ timeMicroseconds: 120_000, virtualKey: 0x42 });
    const result = editor.addEvents([down, up], firstUp, 70_000, 50_000);

    const pauses = macro.events.filter((item) => item.type === MacroEventType.Delay);
    expect(pauses).toHaveLength(1);
    expect(pauses[0]!.timeMicroseconds).toBe(70_000);
    expect(editor.rows.map((row) => row.event.timeMicroseconds)).toEqual([
      0, 50_000, 70_000, 70_000, 120_000,
    ]);
    expect(result.selectedEventIds).toEqual([pauses[0]!.id, down.id, up.id]);
  });

  it('5. Middle insertion shifts tail events forward preserving their intervals', () => {
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

  // 4. Drag-Reorder
  it('6. Drag-reorder preserves intervals and rebases automatic triggers to zero', () => {
    const firstDown = createKeyDownEvent({ timeMicroseconds: 0, virtualKey: 0x41 });
    const firstUp = createKeyUpEvent({ timeMicroseconds: 50_000, virtualKey: 0x41 });
    const trigger = createPixelColorTriggerEvent({
      pixelX: 10,
      pixelY: 20,
      pixelColor: 0xff0000,
      timeMicroseconds: 60_000,
    });
    const secondDown = createKeyDownEvent({ timeMicroseconds: 60_000, virtualKey: 0x42 });
    const secondUp = createKeyUpEvent({ timeMicroseconds: 110_000, virtualKey: 0x42 });

    const macro = createTestMacro([firstDown, firstUp, trigger, secondDown, secondUp]);
    const editor = new TimelineEditor();
    editor.load(macro);

    expect(editor.moveEvents([firstDown, firstUp], 3).changed).toBe(true);

    // Trigger is now first, so it is rebased to 0
    expect(macro.events).toEqual([trigger, firstDown, firstUp, secondDown, secondUp]);
    expect(macro.events.map((item) => item.timeMicroseconds)).toEqual([
      0, 0, 50_000, 50_000, 100_000,
    ]);
    expect(editor.rows.map((row) => row.intervalMilliseconds)).toEqual([0, 0, 50, 0, 50]);
  });

  // 5. Cross-Macro Copy / Paste
  it('7. Cross-macro copy and paste preserves chunk intervals and shifts target tail', () => {
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
    const pasteResult = editor.pasteAfter(targetAnchor, [targetAnchor.id]);
    expect(pasteResult.changed).toBe(true);
    expect(pasteResult.selectedEventIds).toHaveLength(2);

    // New IDs are generated for pasted events
    expect(pasteResult.selectedEventIds.includes(sourceDown.id)).toBe(false);
    expect(pasteResult.selectedEventIds.includes(sourceUp.id)).toBe(false);

    expect(target.events.map((e) => (e as { virtualKey?: number }).virtualKey)).toEqual([
      0x41, 0x45, 0x45, 0x41,
    ]);
    expect(target.events.map((e) => e.timeMicroseconds)).toEqual([
      0, 10_000, 60_000, 160_000,
    ]);
  });
});
