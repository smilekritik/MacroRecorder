/**
 * Unit tests for playback engine, absolute timeline scheduling, recording origin,
 * activation policies, precision waiter, and sub-macro execution.
 * Mapped to legacy MacroRecorder.Tests.PlaybackTests.cs.
 * Covers LEGACY-TEST-059 through LEGACY-TEST-072 ( .., NATIVE-TIME-001).
 */

import { describe, expect, it } from 'vitest';
import {
  ActivationMode,
  createDefaultRecordingOptions,
  DispatchReceiptModel,
  EngineState,
  HotkeyBinding,
  MacroDefinition,
  MacroEvent,
  MacroEventType,
  MouseButton,
  PlaybackOptions,
  TargetMode,
} from '../../packages/domain/src/model/index.js';
import {
  ActivationPolicy,
  CancellationToken,
  CancellationTokenSource,
  MacroActivationCommand,
  PlaybackEngine,
  RecordingSession,
  WindowsPrecisionWaiter,
  type IPlaybackClock,
} from '../../packages/domain/src/playback/index.js';
import {
  FakeInjector,
  FakePlaybackClock,
  FakePrecisionWaiter,
} from './test-helpers.js';

describe('PlaybackTests', () => {
  /**
   * [Fact]
   * public async Task Playback_UsesAbsoluteTimelineWithoutAccumulatingDispatchWork
   * Mapped to LEGACY-TEST-059 /
   */
  it('Playback_UsesAbsoluteTimelineWithoutAccumulatingDispatchWork', async () => {
    const clock = new FakePlaybackClock(0);
    const waiter = new FakePrecisionWaiter(clock);
    const fake = new FakeInjector(clock);
    const engine = new PlaybackEngine(fake, waiter, null, clock);
    const macro = new MacroDefinition({
      playback: new PlaybackOptions({ speed: 1 }),
      events: [
        new MacroEvent({ timeMicroseconds: 10_000, type: MacroEventType.KeyDown }),
        new MacroEvent({ timeMicroseconds: 20_000, type: MacroEventType.KeyDown }),
        new MacroEvent({ timeMicroseconds: 30_000, type: MacroEventType.KeyDown }),
      ],
    });

    await engine.playAsync(macro);

    expect(fake.actual.length).toBe(3);
    const planned = [10_000, 20_000, 30_000];
    const errors = fake.actual.map((actual, i) => actual - planned[i]!);
    for (const error of errors) {
      expect(error).toBeGreaterThanOrEqual(-2_000);
      expect(error).toBeLessThanOrEqual(100_000);
    }
    expect(errors[errors.length - 1]!).toBeLessThanOrEqual(errors[0]! + 15_000);
    expect(engine.state).toBe(EngineState.Idle);
  });

  /**
   * [Fact]
   * public void Recording_FirstEnabledInputStartsAtZeroAndDisabledSourcesDoNotStartClock
   * Mapped to LEGACY-TEST-060 /
   */
  it('Recording_FirstEnabledInputStartsAtZeroAndDisabledSourcesDoNotStartClock', () => {
    const recording = new RecordingSession();
    recording.start(
      createDefaultRecordingOptions({
        keyboard: true,
        mouseButtons: true,
        mouseMovement: false,
        mouseWheel: false,
      }),
      [
        new HotkeyBinding({ virtualKey: 0x77 }),
        new HotkeyBinding({ mouseButton: MouseButton.X1 }),
      ],
    );

    recording.add(new MacroEvent({ type: MacroEventType.MouseMove, deltaX: 5 }));
    recording.add(new MacroEvent({ type: MacroEventType.KeyDown, virtualKey: 0x77 }));
    recording.add(
      new MacroEvent({ type: MacroEventType.MouseButtonDown, button: MouseButton.X1 }),
    );
    recording.add(new MacroEvent({ type: MacroEventType.KeyDown, virtualKey: 0x45 }));

    const events = recording.stop();
    expect(events.length).toBe(1);
    const first = events[0]!;
    expect(first.type).toBe(MacroEventType.KeyDown);
    expect(first.timeMicroseconds).toBe(0);
  });

  /**
   * [Fact]
   * public async Task Playback_ZeroRepeatCountRunsUntilCancelled
   * Mapped to LEGACY-TEST-061 /
   */
  it('Playback_ZeroRepeatCountRunsUntilCancelled', async () => {
    const cancellation = new CancellationTokenSource();
    const clock = new FakePlaybackClock(0);
    const waiter = new FakePrecisionWaiter(clock);
    const fake = new FakeInjector(clock);
    fake.afterSend = () => {
      if (fake.actual.length === 3) {
        cancellation.cancel();
      }
    };
    const macro = new MacroDefinition({
      playback: new PlaybackOptions({ repeatCount: 0 }),
      events: [new MacroEvent({ type: MacroEventType.KeyDown, virtualKey: 0x45 })],
    });

    const engine = new PlaybackEngine(fake, waiter, null, clock);
    await engine.playAsync(macro, cancellation.token);

    expect(fake.actual.length).toBe(3);
    expect(engine.state).toBe(EngineState.Idle);
  });

  /**
   * [Theory]
   * [InlineData(TargetMode.ForegroundAtStart, true, false)]
   * [InlineData(TargetMode.SpecificWindow, true, true)]
   * [InlineData(TargetMode.SpecificWindow, false, false)]
   * public async Task Playback_UsesScanCodesOnlyForSelectedWindowMode
   * Mapped to LEGACY-TEST-062 /
   */
  it.each([
    [TargetMode.ForegroundAtStart, true, false],
    [TargetMode.SpecificWindow, true, true],
    [TargetMode.SpecificWindow, false, false],
  ])(
    'Playback_UsesScanCodesOnlyForSelectedWindowMode (%s, %s -> %s)',
    async (mode, requested, expected) => {
      const clock = new FakePlaybackClock(0);
      const waiter = new FakePrecisionWaiter(clock);
      const fake = new FakeInjector(clock);
      const macro = new MacroDefinition({
        playback: new PlaybackOptions({ targetMode: mode, preferScanCodes: requested }),
        events: [new MacroEvent({ type: MacroEventType.KeyDown, virtualKey: 0x45 })],
      });

      await new PlaybackEngine(fake, waiter, null, clock).playAsync(macro);

      expect(fake.scanCodePreferences).toEqual([expected]);
    },
  );

  /**
   * [Fact]
   * public async Task OverlayText_IsDisplayOnlyAndExtendsMacroDuration
   * Mapped to LEGACY-TEST-063 /
   */
  it('OverlayText_IsDisplayOnlyAndExtendsMacroDuration', async () => {
    const overlay = new MacroEvent({
      timeMicroseconds: 5_000,
      type: MacroEventType.OverlayText,
      text: 'Text 1',
      durationMicroseconds: 20_000,
    });
    const key = new MacroEvent({
      timeMicroseconds: 10_000,
      type: MacroEventType.KeyDown,
      virtualKey: 0x45,
    });
    const macro = new MacroDefinition({ events: [overlay, key] });
    const clock = new FakePlaybackClock(0);
    const waiter = new FakePrecisionWaiter(clock);
    const fake = new FakeInjector(clock);
    const engine = new PlaybackEngine(fake, waiter, null, clock);
    const dispatched: string[] = [];
    engine.onEventDispatched((receipt) => dispatched.push(receipt.eventId));

    await engine.playAsync(macro);

    expect(macro.durationMicroseconds).toBe(25_000);
    expect(overlay.display).toBe('Text “Text 1” · until 25 ms · with countdown');
    const overlayWithoutCountdown = new MacroEvent({
      ...overlay.toEvent(),
      showOverlayTiming: false,
    });
    expect(overlayWithoutCountdown.display).toBe(
      'Text “Text 1” · until 25 ms · without countdown',
    );
    expect(fake.actual.length).toBe(1);
    expect(dispatched).toEqual([overlay.id, key.id]);
  });

  /**
   * [Fact]
   * public void ActivationPolicy_HandlesAllRepressModesAndFiftyMillisecondGuard
   * Mapped to LEGACY-TEST-064 /
   */
  it('ActivationPolicy_HandlesAllRepressModesAndFiftyMillisecondGuard', () => {
    expect(ActivationPolicy.resolve(ActivationMode.Once, false, 0)).toBe(
      MacroActivationCommand.Start,
    );
    expect(ActivationPolicy.resolve(ActivationMode.WhileHeld, true, 100)).toBe(
      MacroActivationCommand.Ignore,
    );
    expect(ActivationPolicy.resolve(ActivationMode.Once, true, 100)).toBe(
      MacroActivationCommand.Ignore,
    );
    expect(ActivationPolicy.resolve(ActivationMode.ToggleStop, true, 49.999)).toBe(
      MacroActivationCommand.Ignore,
    );
    expect(ActivationPolicy.resolve(ActivationMode.ToggleStop, true, 50)).toBe(
      MacroActivationCommand.Stop,
    );
    expect(ActivationPolicy.resolve(ActivationMode.Restart, true, 1)).toBe(
      MacroActivationCommand.Restart,
    );
  });

  /**
   * [Fact]
   * public async Task WindowsPrecisionWaiter_ReachesAbsoluteDeadline
   * Mapped to LEGACY-TEST-065 / NATIVE-TIME-001
   */
  it('NATIVE-TIME-001: WindowsPrecisionWaiter_ReachesAbsoluteDeadline', async () => {
    let currentTime = 1_000_000;
    const testClock: IPlaybackClock = {
      frequency: 1_000_000,
      getTimestamp: () => {
        currentTime += 25_000;
        return currentTime;
      },
    };

    const waiter = new WindowsPrecisionWaiter(testClock);
    const start = 1_000_000;
    await waiter.untilAsync(start, 20_000, 0, CancellationToken.None);

    const elapsedMs = ((currentTime - start) * 1000) / testClock.frequency;
    expect(elapsedMs).toBeGreaterThanOrEqual(20);
  });

  /**
   * [Fact]
   * public async Task Playback_SkipsCommentRowsEntirely
   * Mapped to LEGACY-TEST-066 /
   */
  it('Playback_SkipsCommentRowsEntirely', async () => {
    const clock = new FakePlaybackClock(0);
    const waiter = new FakePrecisionWaiter(clock);
    const injector = new FakeInjector(clock);
    const macro = new MacroDefinition({
      playback: new PlaybackOptions({ speed: 1 }),
      events: [
        new MacroEvent({ type: MacroEventType.Comment, text: 'header' }),
        new MacroEvent({
          timeMicroseconds: 5_000,
          type: MacroEventType.KeyDown,
          virtualKey: 0x45,
        }),
        new MacroEvent({ type: MacroEventType.Comment, text: 'end' }),
      ],
    });

    const engine = new PlaybackEngine(injector, waiter, null, clock);
    await engine.playAsync(macro);

    expect(injector.actual.length).toBe(1);
    expect(engine.receipts.length).toBe(1);
  });

  /**
   * [Fact]
   * public async Task Randomize_Off_LeavesPlannedNullAndScheduledExact
   * Mapped to LEGACY-TEST-067 /
   */
  it('Randomize_Off_LeavesPlannedNullAndScheduledExact', async () => {
    const clock = new FakePlaybackClock(0);
    const waiter = new FakePrecisionWaiter(clock);
    const fake = new FakeInjector(clock);
    const macro = new MacroDefinition({
      playback: new PlaybackOptions({ randomizeTiming: false }),
      events: [
        new MacroEvent({ timeMicroseconds: 0, type: MacroEventType.KeyDown, virtualKey: 0x41 }),
        new MacroEvent({
          timeMicroseconds: 40_000,
          type: MacroEventType.KeyDown,
          virtualKey: 0x42,
        }),
      ],
    });
    const engine = new PlaybackEngine(fake, waiter, null, clock);
    await engine.playAsync(macro);

    for (const r of engine.receipts) {
      expect(r.plannedMicroseconds).toBeNull();
    }
    expect(engine.receipts.map((r) => r.scheduledMicroseconds)).toEqual([0, 40_000]);
    const firstReceipt = new DispatchReceiptModel(engine.receipts[0]!);
    expect(firstReceipt.scheduledDisplayMilliseconds).not.toContain('(');
  });

  /**
   * [Fact]
   * public async Task Randomize_On_KeepsPlannedWithinSpreadAndMonotonic
   * Mapped to LEGACY-TEST-068 /
   */
  it('Randomize_On_KeepsPlannedWithinSpreadAndMonotonic', async () => {
    const clock = new FakePlaybackClock(0);
    const waiter = new FakePrecisionWaiter(clock);
    const fake = new FakeInjector(clock);
    const macro = new MacroDefinition({
      playback: new PlaybackOptions({ randomizeTiming: true, timingJitterMilliseconds: 5 }),
      events: [
        new MacroEvent({ timeMicroseconds: 0, type: MacroEventType.KeyDown, virtualKey: 0x41 }),
        new MacroEvent({
          timeMicroseconds: 40_000,
          type: MacroEventType.KeyDown,
          virtualKey: 0x42,
        }),
      ],
    });
    const engine = new PlaybackEngine(fake, waiter, null, clock);
    await engine.playAsync(macro);

    const authored = [0, 40_000];
    let previous = -1;
    const receipts = engine.receipts;
    expect(receipts.length).toBe(2);
    for (let index = 0; index < receipts.length; index++) {
      expect(receipts[index]!.scheduledMicroseconds).toBe(authored[index]);
      const planned =
        receipts[index]!.plannedMicroseconds ?? receipts[index]!.scheduledMicroseconds;
      expect(planned).toBeGreaterThanOrEqual(Math.max(0, authored[index]! - 5_000));
      expect(planned).toBeLessThanOrEqual(authored[index]! + 5_000);
      expect(planned).toBeGreaterThanOrEqual(previous);
      previous = planned;
    }
  });

  /**
   * [Fact]
   * public async Task TargetWindowHandle_IsForwardedToInjector
   * Mapped to LEGACY-TEST-069 /
   */
  it('TargetWindowHandle_IsForwardedToInjector', async () => {
    const clock = new FakePlaybackClock(0);
    const waiter = new FakePrecisionWaiter(clock);
    const fake = new FakeInjector(clock);
    const macro = new MacroDefinition({
      events: [
        new MacroEvent({ type: MacroEventType.KeyDown, virtualKey: 0x41 }),
      ],
    });
    const engine = new PlaybackEngine(fake, waiter, null, clock);
    engine.targetWindow = 0x1234;
    await engine.playAsync(macro);

    expect(fake.targets).toEqual([0x1234]);
  });

  /**
   * [Fact]
   * public async Task RunMacro_PlaysSubMacroInlineByItsOwnEvents
   * Mapped to LEGACY-TEST-070 /
   */
  it('RunMacro_PlaysSubMacroInlineByItsOwnEvents', async () => {
    const clock = new FakePlaybackClock(0);
    const waiter = new FakePrecisionWaiter(clock);
    const fake = new FakeInjector(clock);
    const sub = new MacroDefinition({
      name: 'sub',
      events: [
        new MacroEvent({ type: MacroEventType.KeyDown, virtualKey: 0x41 }),
        new MacroEvent({ type: MacroEventType.KeyUp, virtualKey: 0x41 }),
      ],
    });
    const parent = new MacroDefinition({
      events: [
        new MacroEvent({
          timeMicroseconds: 0,
          type: MacroEventType.RunMacro,
          subMacroName: 'sub',
        }),
        new MacroEvent({ timeMicroseconds: 0, type: MacroEventType.KeyDown, virtualKey: 0x42 }),
      ],
    });
    const engine = new PlaybackEngine(fake, waiter, null, clock);
    engine.resolveMacro = (name) => (name === 'sub' ? sub : null);
    await engine.playAsync(parent);

    expect(fake.actual.length).toBe(3); // two sub-macro actions + one parent
  });

  /**
   * [Fact]
   * public async Task RunMacro_CyclicCallIsRejected
   * Mapped to LEGACY-TEST-071 /
   */
  it('RunMacro_CyclicCallIsRejected', async () => {
    const clock = new FakePlaybackClock(0);
    const waiter = new FakePrecisionWaiter(clock);
    const fake = new FakeInjector(clock);
    const parent = new MacroDefinition({
      name: 'p',
      events: [
        new MacroEvent({ type: MacroEventType.RunMacro, subMacroName: 'p' }),
      ],
    });
    const engine = new PlaybackEngine(fake, waiter, null, clock);
    engine.resolveMacro = () => parent;
    await engine.playAsync(parent);

    expect(fake.actual.length).toBe(0);
    const receipt = engine.receipts.find((r) => r.eventId === parent.events[0]!.id);
    expect(receipt?.success).toBe(false);
    expect(receipt?.error).toContain('Cyclic call of macro');
  });

  /**
   * [Fact]
   * public async Task RunMacro_MissingMacroFailsButMacroContinues
   * Mapped to LEGACY-TEST-072 /
   */
  it('RunMacro_MissingMacroFailsButMacroContinues', async () => {
    const clock = new FakePlaybackClock(0);
    const waiter = new FakePrecisionWaiter(clock);
    const fake = new FakeInjector(clock);
    const parent = new MacroDefinition({
      events: [
        new MacroEvent({
          timeMicroseconds: 0,
          type: MacroEventType.RunMacro,
          subMacroName: 'ghost',
        }),
        new MacroEvent({ timeMicroseconds: 0, type: MacroEventType.KeyDown, virtualKey: 0x42 }),
      ],
    });
    const engine = new PlaybackEngine(fake, waiter, null, clock);
    engine.resolveMacro = () => null;
    await engine.playAsync(parent);

    expect(fake.actual.length).toBe(1); // the action after the call is sent anyway
    const receipt = engine.receipts.find((r) => r.eventId === parent.events[0]!.id);
    expect(receipt?.success).toBe(false);
    expect(receipt?.error).toContain('ghost');
  });
});
