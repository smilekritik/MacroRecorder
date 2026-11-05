/**
 * Unit tests for MacroProcessing and TimingStatistics.
 * Covers to and HELPER-PROC-049.
 */

import { describe, expect, it } from 'vitest';
import {
  createCommentEvent,
  createDefaultMacroDefinition,
  createDelayEvent,
  createDispatchReceipt,
  createKeyDownEvent,
  createKeyUpEvent,
  createMouseButtonDownEvent,
  createMouseMoveEvent,
  createOverlayTextEvent,
  createPixelColorTriggerEvent,
  getMacroDurationMicroseconds,
  isAutomaticTriggerMacro,
  MacroEventType,
  MouseButton,
  MouseMoveEvent,
} from '../../model/index.js';
import type { MacroDefinition, MacroEvent } from '../../model/types.js';
import { MacroProcessing, TimingStatistics } from '../processing.js';

function moveHelper(time: number, x: number, y: number): MouseMoveEvent {
  return createMouseMoveEvent({
    timeMicroseconds: time,
    deltaX: x,
    deltaY: y,
  });
}

function createTestMacro(events: MacroEvent[]): MacroDefinition {
  const macro = createDefaultMacroDefinition();
  (macro as unknown as { events: MacroEvent[] }).events = events;
  return macro;
}

describe('MacroProcessingTests', () => {
  /**
   * [Fact]
   * public void Normalize_SortsAndClampsNegativeTimes
   */
  it('Normalize_SortsAndClampsNegativeTimes', () => {
    // The timeline is rounded to whole milliseconds; negative time is clamped to zero.
    const result = MacroProcessing.Normalize([
      createKeyUpEvent({ timeMicroseconds: 200_000, virtualKey: 0 }),
      createKeyDownEvent({ timeMicroseconds: -10, virtualKey: 0 }),
      createKeyDownEvent({ timeMicroseconds: 100_400, virtualKey: 0 }),
    ]);
    expect(result.map((x) => x.timeMicroseconds)).toEqual([0, 100_000, 200_000]);
  });

  /**
   * [Fact]
   * public void CompressMouseMoves_CombinesOnlySameBucketAndPreservesButtons
   */
  it('CompressMouseMoves_CombinesOnlySameBucketAndPreservesButtons', () => {
    const result = MacroProcessing.CompressMouseMoves(
      [
        moveHelper(1_000, 2, 3),
        moveHelper(5_000, 4, -1),
        createMouseButtonDownEvent({
          timeMicroseconds: 6_000,
          button: MouseButton.Left,
        }),
        moveHelper(7_000, 1, 1),
        moveHelper(15_000, 5, 5),
      ],
      10,
    );
    expect(result.length).toBe(4);
    const first = result[0] as MouseMoveEvent;
    expect([first.deltaX, first.deltaY]).toEqual([6, 2]);
    expect(result[1]!.type).toBe(MacroEventType.MouseButtonDown);
  });

  /**
   * [Fact]
   * public void ScaleTime_UpdatesEveryEvent
   */
  it('ScaleTime_UpdatesEveryEvent', () => {
    const macro = createTestMacro([
      createKeyDownEvent({ timeMicroseconds: 100, virtualKey: 0 }),
      createKeyDownEvent({ timeMicroseconds: 250, virtualKey: 0 }),
    ]);
    MacroProcessing.ScaleTime(macro, 2);
    expect(macro.events.map((e) => e.timeMicroseconds)).toEqual([200, 500]);
    expect(() => MacroProcessing.ScaleTime(macro, 0.01)).toThrow(RangeError);
  });

  /**
   * [Fact]
   * public void TimingStatistics_CalculatesPercentilesAndFailures
   */
  it('TimingStatistics_CalculatesPercentilesAndFailures', () => {
    const values = Array.from({ length: 100 }, (_, idx) => {
      const i = idx + 1;
      return createDispatchReceipt({
        eventId: crypto.randomUUID(),
        scheduledMicroseconds: 0,
        dispatchStartedMicroseconds: i * 1000,
        dispatchCompletedMicroseconds: i * 1000 + 2,
        hookConfirmedMicroseconds: i % 4 === 0 ? null : i * 1000 + 5,
        success: i !== 50,
        error: i === 50 ? 'fail' : null,
      });
    });
    const result = TimingStatistics.Calculate(values);
    expect(result.Count).toBe(100);
    expect(result.Failed).toBe(1);
    expect(result.Unconfirmed).toBe(25);
    expect(result.MeanMs).toBeCloseTo(50.5, 1);
    expect(result.P95Ms).toBeCloseTo(95.05, 1);
    expect(result.MaxMs).toBeCloseTo(100, 1);
  });

  /**
   * [Fact]
   * public void LibraryOrdering_PutsEnabledMacrosBeforeDisabledOnes
   */
  it('LibraryOrdering_PutsEnabledMacrosBeforeDisabledOnes', () => {
    const disabledNewer = createDefaultMacroDefinition({
      name: 'disabled',
      isEnabled: false,
      modifiedAt: new Date().toISOString(),
    });
    const enabledOlder = createDefaultMacroDefinition({
      name: 'enabled',
      isEnabled: true,
      modifiedAt: new Date(Date.now() - 86400000).toISOString(),
    });
    const ordered = MacroProcessing.OrderLibrary([disabledNewer, enabledOlder]);
    expect(ordered.map((x) => x.name)).toEqual(['enabled', 'disabled']);
  });

  /**
   * [Fact]
   * public void SuggestedInsertionTime_IsExactlyAnchorTimeWithoutAutoGap
   */
  it('SuggestedInsertionTime_IsExactlyAnchorTimeWithoutAutoGap', () => {
    const key = createKeyDownEvent({ timeMicroseconds: 20_000, virtualKey: 0 });
    const delayEnd = createDelayEvent({ timeMicroseconds: 100_000, durationMicroseconds: 0 });
    const trigger = createPixelColorTriggerEvent({
      pixelX: 0,
      pixelY: 0,
      pixelColor: 0,
      timeMicroseconds: 120_000,
    });
    // No auto-gap: the new action's time exactly matches the selected anchor.
    expect(MacroProcessing.SuggestInsertionTime([key, delayEnd, trigger], key)).toBe(20_000);
    expect(MacroProcessing.SuggestInsertionTime([key, delayEnd, trigger], delayEnd)).toBe(100_000);
    expect(MacroProcessing.SuggestInsertionTime([key, delayEnd, trigger], trigger)).toBe(120_000);
    expect(MacroProcessing.SuggestInsertionTime([key, delayEnd, trigger], null)).toBe(120_000);
    expect(MacroProcessing.SuggestInsertionTime([], null)).toBe(0);
  });

  /**
   * [Fact]
   * public void RebaseToZero_RemovesTimeConsumedByFilteredManagementInput
   */
  it('RebaseToZero_RemovesTimeConsumedByFilteredManagementInput', () => {
    const firstUserAction = createKeyDownEvent({ timeMicroseconds: 250_000, virtualKey: 0x45 });
    const release = createKeyUpEvent({ timeMicroseconds: 280_000, virtualKey: 0x45 });

    const result = MacroProcessing.RebaseToZero([firstUserAction, release]);

    expect(result[0]!.timeMicroseconds).toBe(0);
    expect(result[1]!.timeMicroseconds).toBe(30_000);
  });

  /**
   * [Fact]
   * public void ScaleTime_ScalesOverlayStartAndDuration
   */
  it('ScaleTime_ScalesOverlayStartAndDuration', () => {
    const overlay = createOverlayTextEvent({
      timeMicroseconds: 500_000,
      text: 'Text 1',
      durationMicroseconds: 400_000,
    });
    const macro = createTestMacro([overlay]);

    MacroProcessing.ScaleTime(macro, 2);

    expect(overlay.timeMicroseconds).toBe(1_000_000);
    expect(overlay.durationMicroseconds).toBe(800_000);
    expect(getMacroDurationMicroseconds(macro)).toBe(1_800_000);
  });

  /**
   * [Fact]
   * public void Normalize_KeepsCommentRowsAnchoredToPrecedingActionAndBorrowsItsTime
   */
  it('Normalize_KeepsCommentRowsAnchoredToPrecedingActionAndBorrowsItsTime', () => {
    const leading = createCommentEvent({ text: 'start', timeMicroseconds: 0 });
    const later = createKeyDownEvent({ timeMicroseconds: 20_000, virtualKey: 0x46 });
    const press = createKeyDownEvent({ timeMicroseconds: 10_000, virtualKey: 0x45 });
    const release = createKeyUpEvent({ timeMicroseconds: 10_000, virtualKey: 0x45 });
    const between = createCommentEvent({ timeMicroseconds: 999_999, text: '--- N2D ---' });

    const result = MacroProcessing.Normalize([leading, later, press, release, between]);

    // The actions are re-sorted by time, and the comment stayed with its neighbour.
    expect(result).toEqual([leading, press, release, between, later]);
    expect(leading.timeMicroseconds).toBe(0);
    // A comment row has no time of its own: it takes the timestamp of the preceding action.
    expect(between.timeMicroseconds).toBe(10_000);
    const macro = createTestMacro([leading, later, press, release, between]);
    expect(getMacroDurationMicroseconds(macro)).toBe(20_000);
  });

  /**
   * [Fact]
   * public void AutomaticTrigger_IgnoresLeadingCommentRow
   */
  it('AutomaticTrigger_IgnoresLeadingCommentRow', () => {
    const trigger = createPixelColorTriggerEvent({
      pixelX: 0,
      pixelY: 0,
      pixelColor: 0,
      timeMicroseconds: 0,
    });
    const macro = createTestMacro([
      createCommentEvent({ text: 'wait for colour', timeMicroseconds: 0 }),
      trigger,
      createKeyDownEvent({ timeMicroseconds: 5_000, virtualKey: 0 }),
    ]);
    expect(isAutomaticTriggerMacro(macro)).toBe(true);
    expect(MacroProcessing.IsAutomaticTriggerMacro(macro)).toBe(true);
  });

  /**
   * [Fact]
   * public void PixelColorTrigger_DefaultCooldownIsThreeSeconds
   */
  it('PixelColorTrigger_DefaultCooldownIsThreeSeconds', () => {
    const trigger = createPixelColorTriggerEvent({
      pixelX: 0,
      pixelY: 0,
      pixelColor: 0,
      timeMicroseconds: 0,
    });
    const macro = createTestMacro([
      createKeyDownEvent({ timeMicroseconds: 0, virtualKey: 0 }),
      trigger,
    ]);
    expect(trigger.triggerCooldownMilliseconds).toBe(3000);
    expect(isAutomaticTriggerMacro(macro)).toBe(true);
    expect(MacroProcessing.Normalize(macro.events)[0]).toBe(trigger);
  });

  /**
   * HELPER-PROC-049: Move helper
   */
  it('HELPER-PROC-049: Move helper creates mouse move event with deltas', () => {
    const move = moveHelper(1_000, 2, 3);
    expect(move.timeMicroseconds).toBe(1_000);
    expect(move.type).toBe(MacroEventType.MouseMove);
    expect(move.deltaX).toBe(2);
    expect(move.deltaY).toBe(3);
  });
});
