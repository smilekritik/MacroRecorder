import { describe, expect, it } from 'vitest';

import {
  ActivationMode,
  MacroEventType,
} from '../../../packages/contracts/src/index.js';
import {
  ActivationPolicy,
  MacroActivationCommand,
} from '../../../packages/domain/src/playback/activation-policy.js';
import {
  applyRepeatForever,
  clampPlaybackSpeed,
  createDefaultPlaybackOptions,
} from '../../../packages/domain/src/model/options.js';
import {
  MacroDefinition as DomainMacroDefinition,
  MacroEvent as DomainMacroEvent,
} from '../../../packages/domain/src/model/index.js';
import { PlaybackEngine } from '../../../packages/domain/src/playback/engine.js';
import {
  type IInputInjector,
  Stopwatch,
} from '../../../packages/domain/src/playback/ports.js';
import { DispatchReceiptModel } from '../../../packages/domain/src/model/diagnostics.js';

import { LegacyActivationPolicyOracle } from '../oracle/legacy-oracle.js';
import { loadFixtureJson, SCHEMA_FIXTURES } from '../../fixtures/index.js';
import { parseMacroDefinition } from '../../../packages/contracts/src/index.js';

class MockInjector implements IInputInjector {
  public actual: number[] = [];
  public async sendAsync(item: { id: string }, scheduledMicroseconds: number, start: number) {
    const actual = Math.round(((Stopwatch.getTimestamp() - start) * 1_000_000) / Stopwatch.frequency);
    this.actual.push(actual);
    return new DispatchReceiptModel(item.id, scheduledMicroseconds, actual, actual, actual, true, null);
  }
  public releaseAll(): void {}
}

describe('Suite 06: Schedules and Playback', () => {
  // 1. Activation Modes and Debounce Guard
  describe('Activation Modes and Debounce Guard', () => {
    it('Not running state always returns Start command for any mode', () => {
      expect(ActivationPolicy.resolve(ActivationMode.Once, false, 0)).toBe(MacroActivationCommand.Start);
      expect(ActivationPolicy.resolve(ActivationMode.WhileHeld, false, 0)).toBe(MacroActivationCommand.Start);
      expect(ActivationPolicy.resolve(ActivationMode.ToggleStop, false, 0)).toBe(MacroActivationCommand.Start);
      expect(ActivationPolicy.resolve(ActivationMode.Restart, false, 0)).toBe(MacroActivationCommand.Start);

      // Reference oracle
      expect(LegacyActivationPolicyOracle.resolveMode('Once', 1, 1000, 0).action).toBe('start');
      expect(LegacyActivationPolicyOracle.resolveMode('WhileHeld', 1, 1000, 0).action).toBe('start');
      expect(LegacyActivationPolicyOracle.resolveMode('ToggleStop', 1, 1000, 0).action).toBe('start');
      expect(LegacyActivationPolicyOracle.resolveMode('Restart', 1, 1000, 0).action).toBe('restart');
    });

    it('ToggleStop mode respects 50ms debounce guard', () => {
      // Rapid trigger under 50ms is ignored
      expect(ActivationPolicy.resolve(ActivationMode.ToggleStop, true, 20)).toBe(MacroActivationCommand.Ignore);
      expect(ActivationPolicy.resolve(ActivationMode.ToggleStop, true, 49)).toBe(MacroActivationCommand.Ignore);

      // Trigger at or above 50ms produces Stop
      expect(ActivationPolicy.resolve(ActivationMode.ToggleStop, true, 50)).toBe(MacroActivationCommand.Stop);
      expect(ActivationPolicy.resolve(ActivationMode.ToggleStop, true, 100)).toBe(MacroActivationCommand.Stop);

      // Reference oracle
      const ignored = LegacyActivationPolicyOracle.resolveMode('ToggleStop', 1, 1020, 1000);
      expect(ignored.action).toBe('ignore');
      expect(ignored.newLastToggleMs).toBe(1000);

      const stopped = LegacyActivationPolicyOracle.resolveMode('ToggleStop', 1, 1060, 1000);
      expect(stopped.action).toBe('start'); // Or toggled state in legacy
      expect(stopped.newLastToggleMs).toBe(1060);
    });

    it('Restart mode issues Restart command while running', () => {
      expect(ActivationPolicy.resolve(ActivationMode.Restart, true, 100)).toBe(MacroActivationCommand.Restart);
      expect(LegacyActivationPolicyOracle.resolveMode('Restart', 1, 1100, 1000).action).toBe('restart');
    });

    it('Once and WhileHeld ignore triggers while running', () => {
      expect(ActivationPolicy.resolve(ActivationMode.Once, true, 100)).toBe(MacroActivationCommand.Ignore);
      expect(ActivationPolicy.resolve(ActivationMode.WhileHeld, true, 100)).toBe(MacroActivationCommand.Ignore);
    });
  });

  // 2. RepeatForever Policy
  describe('RepeatForever Toggle Policy', () => {
    it('Enabling RepeatForever forces repeatCount=0 and activationMode=ToggleStop', () => {
      const initial = createDefaultPlaybackOptions({
        repeatCount: 5,
        activationMode: ActivationMode.Once,
      });

      const enabled = applyRepeatForever(initial, true, 5);
      expect(enabled.options.repeatCount).toBe(0);
      expect(enabled.options.activationMode).toBe(ActivationMode.ToggleStop);
      expect(enabled.lastFiniteRepeatCount).toBe(5);

      // Reference oracle
      const legacyPlayback = { RepeatCount: 5, ActivationMode: 'Once' };
      LegacyActivationPolicyOracle.applyRepeatForever(legacyPlayback, true, 5);
      expect(legacyPlayback.RepeatCount).toBe(0);
      expect(legacyPlayback.ActivationMode).toBe('ToggleStop');
    });

    it('Disabling RepeatForever restores previous finite repeat count', () => {
      const forever = createDefaultPlaybackOptions({
        repeatCount: 0,
        activationMode: ActivationMode.ToggleStop,
      });

      const restored = applyRepeatForever(forever, false, 5);
      expect(restored.options.repeatCount).toBe(5);

      // Reference oracle
      const legacyPlayback = { RepeatCount: 0, ActivationMode: 'ToggleStop' };
      LegacyActivationPolicyOracle.applyRepeatForever(legacyPlayback, false, 5);
      expect(legacyPlayback.RepeatCount).toBe(5);
    });

    it('Fixture: edge-repeat-forever-toggle.macro.json normalizes to ToggleStop in domain model', () => {
      const raw = loadFixtureJson<Record<string, unknown>>(SCHEMA_FIXTURES.EDGE_REPEAT_FOREVER);
      const expected = loadFixtureJson<Record<string, unknown>>(SCHEMA_FIXTURES.EDGE_REPEAT_FOREVER_EXPECTED);

      // Raw parse preserves wire content
      const parsed = parseMacroDefinition(raw);
      expect(parsed.success).toBe(true);
      if (parsed.success) {
        expect(parsed.data.playback.repeatCount).toBe(0);
      }

      // Domain policy applyRepeatForever forces ActivationMode to ToggleStop
      const normalized = applyRepeatForever(
        createDefaultPlaybackOptions({
          repeatCount: (raw as any).Playback.RepeatCount,
          activationMode: (raw as any).Playback.ActivationMode,
        }),
        true,
      );
      expect(normalized.options.repeatCount).toBe(0);
      expect(normalized.options.activationMode).toBe(ActivationMode.ToggleStop);

      const expPlayback = expected['Playback'] as Record<string, unknown>;
      expect(normalized.options.repeatCount).toBe(expPlayback['RepeatCount']);
      expect(normalized.options.activationMode).toBe(expPlayback['ActivationMode']);
    });
  });

  // 3. Playback Speed Clamping
  describe('Playback Speed Clamping', () => {
    it('Clamps values strictly into [0.1, 10.0] range', () => {
      expect(clampPlaybackSpeed(0.01)).toBe(0.1);
      expect(clampPlaybackSpeed(0.099)).toBe(0.1);
      expect(clampPlaybackSpeed(0.1)).toBe(0.1);
      expect(clampPlaybackSpeed(1.0)).toBe(1.0);
      expect(clampPlaybackSpeed(2.5)).toBe(2.5);
      expect(clampPlaybackSpeed(10.0)).toBe(10.0);
      expect(clampPlaybackSpeed(10.01)).toBe(10.0);
      expect(clampPlaybackSpeed(100.0)).toBe(10.0);
      expect(clampPlaybackSpeed(-5)).toBe(0.1);
    });
  });

  // 4. Sub-Macro Recursion Depth Limit (16)
  describe('Sub-Macro Recursion Limit (Depth 16)', () => {
    it('Rejects execution chains extending deeper than depth 16', async () => {
      const injector = new MockInjector();
      const engine = new PlaybackEngine(injector);

      // Construct a chain of 18 sub-macros (depth exceeds 16)
      const macros = new Map<string, DomainMacroDefinition>();
      for (let i = 0; i <= 17; i++) {
        const nextName = `macro_${i + 1}`;
        macros.set(
          `macro_${i}`,
          new DomainMacroDefinition({
            name: `macro_${i}`,
            events: [
              new DomainMacroEvent({
                type: MacroEventType.RunMacro,
                subMacroName: nextName,
              }),
            ],
          }),
        );
      }
      engine.resolveMacro = (name) => macros.get(name) ?? null;

      const top = macros.get('macro_0')!;
      await engine.playAsync(top);

      const receipts = engine.receipts;
      const failure = receipts.find((r) => !r.success);
      expect(failure).toBeDefined();
      expect(failure?.error).toContain('nesting is too deep');
    });
  });
});
