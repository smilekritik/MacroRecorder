/**
 * Unit tests for playback engine, absolute deadline scheduling, activation policies,
 * wait conditions, nested macros, and cancellation.
 */

import { describe, expect, it } from 'vitest';
import {
  ActivationMode,
  createDefaultRecordingOptions,
  DispatchReceiptModel,
  EngineState,
  FocusLossBehavior,
  HotkeyBinding,
  MacroDefinition,
  MacroEvent,
  MacroEventType,
  MouseButton,
  PlaybackOptions,
  TargetMode,
} from '../../model/index.js';
import {
  ActivationPolicy,
  MacroActivationCommand,
} from '../activation-policy.js';
import {
  CancellationToken,
  CancellationTokenSource,
  sleep,
} from '../cancellation.js';
import { InvalidOperationException, PlaybackEngine } from '../engine.js';
import {
  type IInputInjector,
  type IPixelColorProvider,
  Stopwatch,
} from '../ports.js';
import { RecordingSession } from '../recording-session.js';
import { WindowsPrecisionWaiter } from '../waiter.js';

class FakeInjector implements IInputInjector {
  public readonly actual: number[] = [];
  public readonly scanCodePreferences: boolean[] = [];
  public readonly targets: number[] = [];
  public releaseAllCount = 0;
  public afterSend?: (() => void) | undefined;
  public shouldThrowOnSend = false;

  public get Actual(): number[] {
    return this.actual;
  }
  public get ScanCodePreferences(): boolean[] {
    return this.scanCodePreferences;
  }
  public get Targets(): number[] {
    return this.targets;
  }

  public async sendAsync(
    item: { id: string },
    scheduledMicroseconds: number,
    start: number,
    preferScanCodes: boolean,
    targetWindow: number,
    _token?: CancellationToken | AbortSignal,
  ) {
    if (this.shouldThrowOnSend) {
      throw new Error('Simulated input delivery failure');
    }
    const actual = Math.round(
      ((Stopwatch.getTimestamp() - start) * 1_000_000) / Stopwatch.frequency,
    );
    this.actual.push(actual);
    this.scanCodePreferences.push(preferScanCodes);
    this.targets.push(targetWindow);
    this.afterSend?.();
    return new DispatchReceiptModel(
      item.id,
      scheduledMicroseconds,
      actual,
      actual,
      actual,
      true,
      null,
    );
  }

  public releaseAll(): void {
    this.releaseAllCount++;
  }
}

class FakePixelColorProvider implements IPixelColorProvider {
  public color = 0;
  public readonly requests: Array<[number, number]> = [];

  public get Color(): number {
    return this.color;
  }
  public set Color(val: number) {
    this.color = val;
  }
  public get Requests(): Array<[number, number]> {
    return this.requests;
  }

  public getPixelColorRgb(x: number, y: number): number {
    this.requests.push([x, y]);
    return this.color;
  }
}

async function waitWithTimeout<T>(promise: Promise<T>, timeoutMs = 3000): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`Test timed out after ${timeoutMs}ms`)),
      timeoutMs,
    );
  });
  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    clearTimeout(timer!);
  }
}

describe('PlaybackTests', () => {
  /**
   * [Fact]
   * Playback_UsesAbsoluteTimelineWithoutAccumulatingDispatchWork
   */
  it('Playback_UsesAbsoluteTimelineWithoutAccumulatingDispatchWork', async () => {
    const fake = new FakeInjector();
    const engine = new PlaybackEngine(fake);
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
    expect(errors[errors.length - 1]!).toBeLessThanOrEqual(
      errors[0]! + 15_000,
    );
    expect(engine.state).toBe(EngineState.Idle);
  });

  /**
   * [Fact]
   * Recording_FirstEnabledInputStartsAtZeroAndDisabledSourcesDoNotStartClock
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
   * Playback_ZeroRepeatCountRunsUntilCancelled
   */
  it('Playback_ZeroRepeatCountRunsUntilCancelled', async () => {
    const cancellation = new CancellationTokenSource();
    const fake = new FakeInjector();
    fake.afterSend = () => {
      if (fake.actual.length === 3) {
        cancellation.cancel();
      }
    };
    const macro = new MacroDefinition({
      playback: new PlaybackOptions({ repeatCount: 0 }),
      events: [new MacroEvent({ type: MacroEventType.KeyDown, virtualKey: 0x45 })],
    });

    const engine = new PlaybackEngine(fake);
    await engine.playAsync(macro, cancellation.token);

    expect(fake.actual.length).toBe(3);
    expect(engine.state).toBe(EngineState.Idle);
  });

  /**
   * [Theory]
   * Playback_UsesScanCodesOnlyForSelectedWindowMode
   */
  it.each([
    [TargetMode.ForegroundAtStart, true, false],
    [TargetMode.SpecificWindow, true, true],
    [TargetMode.SpecificWindow, false, false],
  ])(
    'Playback_UsesScanCodesOnlyForSelectedWindowMode (%s, %s -> %s)',
    async (mode, requested, expected) => {
      const fake = new FakeInjector();
      const macro = new MacroDefinition({
        playback: new PlaybackOptions({ targetMode: mode, preferScanCodes: requested }),
        events: [new MacroEvent({ type: MacroEventType.KeyDown, virtualKey: 0x45 })],
      });

      await new PlaybackEngine(fake).playAsync(macro);

      expect(fake.scanCodePreferences).toEqual([expected]);
    },
  );

  /**
   * [Fact]
   * OverlayText_IsDisplayOnlyAndExtendsMacroDuration
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
    const fake = new FakeInjector();
    const engine = new PlaybackEngine(fake);
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
   * ActivationPolicy_HandlesAllRepressModesAndFiftyMillisecondGuard
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
   * WindowsPrecisionWaiter_ReachesAbsoluteDeadline
   * NATIVE-TIME-001
   */
  it('NATIVE-TIME-001: WindowsPrecisionWaiter_ReachesAbsoluteDeadline', async () => {
    const waiter = new WindowsPrecisionWaiter();
    const start = Stopwatch.getTimestamp();
    await waiter.untilAsync(start, 20_000, 0, CancellationToken.None);
    const elapsedMs = ((Stopwatch.getTimestamp() - start) * 1000) / Stopwatch.frequency;
    expect(elapsedMs).toBeGreaterThanOrEqual(18);
    expect(elapsedMs).toBeLessThanOrEqual(100);
  });

  /**
   * [Fact]
   * Playback_SkipsCommentRowsEntirely
   */
  it('Playback_SkipsCommentRowsEntirely', async () => {
    const injector = new FakeInjector();
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

    const engine = new PlaybackEngine(injector);
    await engine.playAsync(macro);

    expect(injector.actual.length).toBe(1);
    expect(engine.receipts.length).toBe(1);
  });

  /**
   * [Fact]
   * Randomize_Off_LeavesPlannedNullAndScheduledExact
   */
  it('Randomize_Off_LeavesPlannedNullAndScheduledExact', async () => {
    const fake = new FakeInjector();
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
    const engine = new PlaybackEngine(fake);
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
   * Randomize_On_KeepsPlannedWithinSpreadAndMonotonic
   */
  it('Randomize_On_KeepsPlannedWithinSpreadAndMonotonic', async () => {
    const fake = new FakeInjector();
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
    const engine = new PlaybackEngine(fake);
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
   * TargetWindowHandle_IsForwardedToInjector
   */
  it('TargetWindowHandle_IsForwardedToInjector', async () => {
    const fake = new FakeInjector();
    const macro = new MacroDefinition({
      events: [
        new MacroEvent({ type: MacroEventType.KeyDown, virtualKey: 0x41 }),
      ],
    });
    const engine = new PlaybackEngine(fake);
    engine.targetWindow = 0x1234;
    await engine.playAsync(macro);

    expect(fake.targets).toEqual([0x1234]);
  });

  /**
   * [Fact]
   * RunMacro_PlaysSubMacroInlineByItsOwnEvents
   */
  it('RunMacro_PlaysSubMacroInlineByItsOwnEvents', async () => {
    const fake = new FakeInjector();
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
    const engine = new PlaybackEngine(fake);
    engine.resolveMacro = (name) => (name === 'sub' ? sub : null);
    await engine.playAsync(parent);

    expect(fake.actual.length).toBe(3);
  });

  /**
   * [Fact]
   * RunMacro_CyclicCallIsRejected
   */
  it('RunMacro_CyclicCallIsRejected', async () => {
    const fake = new FakeInjector();
    const parent = new MacroDefinition({
      name: 'p',
      events: [
        new MacroEvent({ type: MacroEventType.RunMacro, subMacroName: 'p' }),
      ],
    });
    const engine = new PlaybackEngine(fake);
    engine.resolveMacro = () => parent;
    await engine.playAsync(parent);

    expect(fake.actual.length).toBe(0);
    const receipt = engine.receipts.find((r) => r.eventId === parent.events[0]!.id);
    expect(receipt?.success).toBe(false);
    expect(receipt?.error).toContain('Cyclic call of macro');
  });

  /**
   * [Fact]
   * RunMacro_MissingMacroFailsButMacroContinues
   */
  it('RunMacro_MissingMacroFailsButMacroContinues', async () => {
    const fake = new FakeInjector();
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
    const engine = new PlaybackEngine(fake);
    engine.resolveMacro = () => null;
    await engine.playAsync(parent);

    expect(fake.actual.length).toBe(1);
    const receipt = engine.receipts.find((r) => r.eventId === parent.events[0]!.id);
    expect(receipt?.success).toBe(false);
    expect(receipt?.error).toContain('ghost');
  });
});

describe('WaitConditionTests', () => {
  /**
   * [Fact]
   * PixelColorTrigger_WaitsForMatchBeforeDispatchingNextAction
   */
  it('PixelColorTrigger_WaitsForMatchBeforeDispatchingNextAction', async () => {
    const injector = new FakeInjector();
    const pixels = new FakePixelColorProvider();
    pixels.color = 0x112233;
    const macro = new MacroDefinition({
      events: [
        new MacroEvent({
          type: MacroEventType.PixelColorTrigger,
          pixelX: 120,
          pixelY: -40,
          pixelColor: 0x57e06a,
        }),
        new MacroEvent({
          timeMicroseconds: 10_000,
          type: MacroEventType.KeyDown,
          virtualKey: 0x45,
        }),
      ],
    });

    const run = new PlaybackEngine(injector, null, pixels).playAsync(macro);
    await sleep(30);
    expect(injector.actual.length).toBe(0);
    pixels.color = 0x57e06a;
    await waitWithTimeout(run);

    expect(injector.actual.length).toBe(1);
    expect(pixels.requests).toContainEqual([120, -40]);
  });

  /**
   * [Fact]
   * AutomaticPixelTrigger_RearmsAfterItsOwnCooldown
   */
  it('AutomaticPixelTrigger_RearmsAfterItsOwnCooldown', async () => {
    const cancellation = new CancellationTokenSource(3000);
    const injector = new FakeInjector();
    const pixels = new FakePixelColorProvider();
    pixels.color = 0x57e06a;
    const trigger = new MacroEvent({
      type: MacroEventType.PixelColorTrigger,
      pixelColor: 0x57e06a,
      triggerCooldownMilliseconds: 25,
    });
    const macro = new MacroDefinition({
      events: [trigger, new MacroEvent({ type: MacroEventType.KeyDown, virtualKey: 0x45 })],
    });

    injector.afterSend = () => {
      if (injector.actual.length >= 2) {
        cancellation.cancel();
      }
    };

    const stopwatch = Stopwatch.startNew();
    await new PlaybackEngine(injector, null, pixels).playAutomaticTriggerAsync(
      macro,
      cancellation.token,
    );

    expect(macro.isAutomaticTrigger).toBe(true);
    expect(injector.actual.length).toBeGreaterThanOrEqual(2);
    expect(stopwatch.elapsedMilliseconds).toBeGreaterThanOrEqual(20);
  });

  /**
   * [Fact]
   * WaitForPixelGone_WaitsUntilColorNoLongerMatches
   */
  it('WaitForPixelGone_WaitsUntilColorNoLongerMatches', async () => {
    const injector = new FakeInjector();
    const pixels = new FakePixelColorProvider();
    pixels.color = 0x57e06a;
    const macro = new MacroDefinition({
      events: [
        new MacroEvent({ type: MacroEventType.WaitForPixelGone, pixelColor: 0x57e06a }),
        new MacroEvent({
          timeMicroseconds: 10_000,
          type: MacroEventType.KeyDown,
          virtualKey: 0x45,
        }),
      ],
    });

    const run = new PlaybackEngine(injector, null, pixels).playAsync(macro);
    await sleep(30);
    expect(injector.actual.length).toBe(0);
    pixels.color = 0x000000;
    await waitWithTimeout(run);

    expect(injector.actual.length).toBe(1);
  });

  /**
   * [Fact]
   * WaitForWindow_BlocksUntilForegroundMatches
   */
  it('WaitForWindow_BlocksUntilForegroundMatches', async () => {
    const fake = new FakeInjector();
    let checks = 0;
    const macro = new MacroDefinition({
      events: [
        new MacroEvent({ type: MacroEventType.WaitForWindow, waitProcessName: 'game' }),
        new MacroEvent({
          timeMicroseconds: 10_000,
          type: MacroEventType.KeyDown,
          virtualKey: 0x45,
        }),
      ],
    });
    const engine = new PlaybackEngine(fake);
    engine.foregroundMatches = () => {
      checks++;
      return checks >= 3;
    };

    await waitWithTimeout(engine.playAsync(macro));

    expect(fake.actual.length).toBe(1);
    expect(checks).toBeGreaterThanOrEqual(3);
  });

  /**
   * [Fact]
   * WaitForKey_TimesOutThenContinues
   */
  it('WaitForKey_TimesOutThenContinues', async () => {
    const fake = new FakeInjector();
    const wait = new MacroEvent({
      type: MacroEventType.WaitForKey,
      waitKeyVirtualKey: 0x41,
      waitTimeoutMilliseconds: 30,
    });
    const macro = new MacroDefinition({
      events: [
        wait,
        new MacroEvent({
          timeMicroseconds: 10_000,
          type: MacroEventType.KeyDown,
          virtualKey: 0x45,
        }),
      ],
    });
    const engine = new PlaybackEngine(fake);
    engine.keyIsDown = () => false;

    await waitWithTimeout(engine.playAsync(macro));

    expect(fake.actual.length).toBe(1);
    const receipt = engine.receipts.find((r) => r.eventId === wait.id);
    expect(receipt?.success).toBe(false);
    expect(receipt?.error).toBe('Wait timed out');
  });
});

describe('Playback Safety Guarantees & Edge Cases', () => {
  it('Universal Input Release Guarantee: ReleaseAll called on cancellation and errors', async () => {
    const fake = new FakeInjector();
    const engine = new PlaybackEngine(fake);
    const cts = new CancellationTokenSource();
    const macro = new MacroDefinition({
      events: [
        new MacroEvent({ timeMicroseconds: 0, type: MacroEventType.KeyDown, virtualKey: 0x41 }),
        new MacroEvent({
          timeMicroseconds: 50_000,
          type: MacroEventType.KeyDown,
          virtualKey: 0x42,
        }),
      ],
    });

    fake.afterSend = () => {
      cts.cancel();
    };

    await engine.playAsync(macro, cts.token);

    expect(fake.releaseAllCount).toBeGreaterThanOrEqual(1);
    expect(engine.state).toBe(EngineState.Idle);
  });

  it('Universal Input Release Guarantee: ReleaseAll called on injector exception', async () => {
    const fake = new FakeInjector();
    fake.shouldThrowOnSend = true;
    const engine = new PlaybackEngine(fake);
    const macro = new MacroDefinition({
      events: [
        new MacroEvent({ timeMicroseconds: 0, type: MacroEventType.KeyDown, virtualKey: 0x41 }),
      ],
    });

    await expect(engine.playAsync(macro)).rejects.toThrow('Simulated input delivery failure');
    expect(fake.releaseAllCount).toBeGreaterThanOrEqual(1);
    expect(engine.state).toBe(EngineState.Idle);
  });

  it('Pause and Resume: pausing sets state to Paused and resumes back to Playing', async () => {
    const fake = new FakeInjector();
    const engine = new PlaybackEngine(fake);
    const macro = new MacroDefinition({
      events: [
        new MacroEvent({ timeMicroseconds: 0, type: MacroEventType.KeyDown, virtualKey: 0x41 }),
        new MacroEvent({
          timeMicroseconds: 60_000,
          type: MacroEventType.KeyDown,
          virtualKey: 0x42,
        }),
      ],
    });

    const states: EngineState[] = [];
    engine.onStateChanged((s) => states.push(s));

    const playPromise = engine.playAsync(macro);
    await sleep(20);
    expect(engine.state).toBe(EngineState.Playing);

    engine.pause();
    expect(engine.state).toBe(EngineState.Paused);

    await sleep(40);
    expect(engine.state).toBe(EngineState.Paused);

    engine.resume();
    expect(engine.state).toBe(EngineState.Playing);

    await waitWithTimeout(playPromise);
    expect(engine.state).toBe(EngineState.Idle);
    expect(fake.actual.length).toBe(2);
  });

  it('Stop: calling stop releases inputs and stops run', async () => {
    const fake = new FakeInjector();
    const engine = new PlaybackEngine(fake);
    const macro = new MacroDefinition({
      events: [
        new MacroEvent({ timeMicroseconds: 0, type: MacroEventType.KeyDown, virtualKey: 0x41 }),
        new MacroEvent({
          timeMicroseconds: 100_000,
          type: MacroEventType.KeyDown,
          virtualKey: 0x42,
        }),
      ],
    });

    const runPromise = engine.playAsync(macro);
    await sleep(10);
    expect(engine.state).toBe(EngineState.Playing);

    engine.stop();
    await waitWithTimeout(runPromise);

    expect(fake.releaseAllCount).toBeGreaterThanOrEqual(1);
    expect(engine.state).toBe(EngineState.Idle);
    expect(fake.actual.length).toBe(1);
  });

  it('Focus loss: FocusLossBehavior.Stop aborts playback with OperationCanceledException', async () => {
    const fake = new FakeInjector();
    const engine = new PlaybackEngine(fake);
    engine.targetIsActive = () => false;

    const macro = new MacroDefinition({
      playback: new PlaybackOptions({
        targetMode: TargetMode.SpecificWindow,
        focusLossBehavior: FocusLossBehavior.Stop,
      }),
      events: [
        new MacroEvent({ timeMicroseconds: 0, type: MacroEventType.KeyDown, virtualKey: 0x41 }),
      ],
    });

    await engine.playAsync(macro);
    expect(fake.actual.length).toBe(0);
    expect(fake.releaseAllCount).toBeGreaterThanOrEqual(1);
    expect(engine.state).toBe(EngineState.Idle);
  });

  it('Sub-macro recursion depth limit: rejects call beyond depth 16', async () => {
    const fake = new FakeInjector();
    const engine = new PlaybackEngine(fake);

    // Create a chain of 18 sub-macros: macro0 -> macro1 -> ... -> macro17
    const macros = new Map<string, MacroDefinition>();
    for (let i = 0; i <= 17; i++) {
      const nextName = `sub${i + 1}`;
      macros.set(
        `sub${i}`,
        new MacroDefinition({
          name: `sub${i}`,
          events: [
            new MacroEvent({
              type: MacroEventType.RunMacro,
              subMacroName: nextName,
            }),
          ],
        }),
      );
    }
    engine.resolveMacro = (name) => macros.get(name) ?? null;

    const top = macros.get('sub0')!;
    await engine.playAsync(top);

    // The 16th invocation is allowed, but the 17th exceeds depth > 16
    const receipts = engine.receipts;
    const failure = receipts.find((r) => !r.success);
    expect(failure).toBeDefined();
    expect(failure?.error).toBe('Macro call nesting is too deep.');
  });

  it('Prevents starting another macro while active', async () => {
    const fake = new FakeInjector();
    const engine = new PlaybackEngine(fake);
    const macro = new MacroDefinition({
      events: [
        new MacroEvent({
          timeMicroseconds: 50_000,
          type: MacroEventType.KeyDown,
          virtualKey: 0x41,
        }),
      ],
    });

    const run = engine.playAsync(macro);
    await expect(engine.playAsync(macro)).rejects.toThrow(InvalidOperationException);
    await waitWithTimeout(run);
  });

  it('Automatic trigger validation: rejects macro without PixelColorTrigger first', async () => {
    const fake = new FakeInjector();
    const engine = new PlaybackEngine(fake);
    const macro = new MacroDefinition({
      events: [
        new MacroEvent({ type: MacroEventType.KeyDown, virtualKey: 0x41 }),
      ],
    });

    await expect(engine.playAutomaticTriggerAsync(macro)).rejects.toThrow(
      'Automatic mode requires a pixel color trigger as the first action.',
    );
  });
});
