/**
 * Unit tests for wait conditions: PixelColorTrigger, AutomaticPixelTrigger,
 * WaitForPixelGone, WaitForWindow, and WaitForKey.
 * Mapped to legacy MacroRecorder.Tests.WaitConditionTests.cs.
 * Covers LEGACY-TEST-104 through LEGACY-TEST-108 ( ..).
 */

import { describe, expect, it } from 'vitest';
import {
  MacroDefinition,
  MacroEvent,
  MacroEventType,
} from '../../packages/domain/src/model/index.js';
import {
  CancellationTokenSource,
  PlaybackEngine,
  Stopwatch,
} from '../../packages/domain/src/playback/index.js';
import {
  FakeInjector,
  FakePixelColorProvider,
} from './test-helpers.js';

describe('WaitConditionTests', () => {
  /**
   * [Fact]
   * public async Task PixelColorTrigger_WaitsForMatchBeforeDispatchingNextAction
   * Mapped to LEGACY-TEST-104 /
   */
  it('PixelColorTrigger_WaitsForMatchBeforeDispatchingNextAction', async () => {
    const injector = new FakeInjector();
    const pixels = new FakePixelColorProvider();
    let checks = 0;
    pixels.getPixelColorRgb = (x: number, y: number) => {
      pixels.requests.push([x, y]);
      checks++;
      return checks >= 2 ? 0x57e06a : 0x112233;
    };

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

    const engine = new PlaybackEngine(injector, null, pixels);
    await engine.playAsync(macro);

    expect(injector.actual.length).toBe(1);
    expect(pixels.requests).toContainEqual([120, -40]);
  });

  /**
   * [Fact]
   * public async Task AutomaticPixelTrigger_RearmsAfterItsOwnCooldown
   * Mapped to LEGACY-TEST-105 /
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
   * public async Task WaitForPixelGone_WaitsUntilColorNoLongerMatches
   * Mapped to LEGACY-TEST-106 /
   */
  it('WaitForPixelGone_WaitsUntilColorNoLongerMatches', async () => {
    const injector = new FakeInjector();
    const pixels = new FakePixelColorProvider();
    let checks = 0;
    pixels.getPixelColorRgb = (x: number, y: number) => {
      pixels.requests.push([x, y]);
      checks++;
      return checks >= 2 ? 0x000000 : 0x57e06a;
    };

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

    const engine = new PlaybackEngine(injector, null, pixels);
    await engine.playAsync(macro);

    expect(injector.actual.length).toBe(1);
  });

  /**
   * [Fact]
   * public async Task WaitForWindow_BlocksUntilForegroundMatches
   * Mapped to LEGACY-TEST-107 /
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

    await engine.playAsync(macro);

    expect(fake.actual.length).toBe(1);
    expect(checks).toBeGreaterThanOrEqual(3);
  });

  /**
   * [Fact]
   * public async Task WaitForKey_TimesOutThenContinues
   * Mapped to LEGACY-TEST-108 /
   */
  it('WaitForKey_TimesOutThenContinues', async () => {
    const fake = new FakeInjector();
    const wait = new MacroEvent({
      type: MacroEventType.WaitForKey,
      waitKeyVirtualKey: 0x41,
      waitTimeoutMilliseconds: 25,
    });
    const macro = new MacroDefinition({
      events: [
        wait,
        new MacroEvent({ timeMicroseconds: 10_000, type: MacroEventType.KeyDown, virtualKey: 0x45 }),
      ],
    });
    const engine = new PlaybackEngine(fake);
    engine.keyIsDown = () => false;

    await engine.playAsync(macro);

    expect(fake.actual.length).toBe(1); // after timeout, action continues anyway
    const receipt = engine.receipts.find((r) => r.eventId === wait.id);
    expect(receipt?.success).toBe(false);
  });
});
