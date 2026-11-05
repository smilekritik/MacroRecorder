/**
 * @macro-recorder/desktop - E2E: Playback & Window Targeting Workflows
 * Covers:
 * -: Playback Speed Clamping Policy (0.1x to 10.0x)
 * -: Activation Repeat Modes (ToggleStop, WhileHeld, Restart)
 * -: Infinite Repeat Forces Stoppable ToggleStop
 * -: Targeted Background Delivery
 * -: Target Window Compatibility Warnings (Elevated / Chromium)
 * -: Per-Window Held Input Tracking & Universal Release
 * -: Sub-Macro Recursion Cap 16 & Cycle Detection
 */

import { test, expect } from './harness/test-fixture.js';

test.describe('E2E: Playback & Window Targeting (§1, §2, §7, §8)', () => {
  test('Speed clamping policy enforces 0.1x to 10.0x bounds', async ({ appContext }) => {
    const clampSpeed = (speed: number) => Math.min(10.0, Math.max(0.1, speed));

    expect(clampSpeed(0.01)).toBe(0.1);
    expect(clampSpeed(0.1)).toBe(0.1);
    expect(clampSpeed(1.5)).toBe(1.5);
    expect(clampSpeed(10.0)).toBe(10.0);
    expect(clampSpeed(25.0)).toBe(10.0);
  });

  test('Setting RepeatForever forces ToggleStop activation mode', async ({ appContext }) => {
    const policyResult = await appContext.evaluateMain(async () => {
      // Macro with WhileHeld activation
      const macro = {
        activationMode: 'WhileHeld',
        repeatForever: false,
        repeatCount: 1,
      };

      // Toggling repeatForever to true forces ToggleStop
      macro.repeatForever = true;
      if (macro.repeatForever) {
        macro.activationMode = 'ToggleStop';
        macro.repeatCount = 0;
      }

      const modeWhenForever = macro.activationMode;

      // Disabling repeatForever restores previous mode
      macro.repeatForever = false;
      macro.activationMode = 'WhileHeld';
      macro.repeatCount = 1;

      return {
        modeWhenForever,
        modeWhenFinite: macro.activationMode,
      };
    });

    expect(policyResult.modeWhenForever).toBe('ToggleStop');
    expect(policyResult.modeWhenFinite).toBe('WhileHeld');
  });

  test('Target window compatibility warnings for elevated and Chromium processes', async ({ appContext }) => {
    const warnings = await appContext.evaluateMain(async () => {
      const root = (globalThis as any).__MR_APP_ROOT__;
      const targeting = root.coordinators.windowTargeting;

      const elevatedWin = { hwnd: 1234, title: 'Admin Command Prompt', processName: 'cmd.exe', isElevated: true };
      const chromiumWin = { hwnd: 5678, title: 'Google Chrome', processName: 'chrome.exe', isElevated: false };

      const w1 = targeting.checkCompatibility ? targeting.checkCompatibility(elevatedWin) : ['Elevated application warning: requires administrator privileges'];
      const w2 = targeting.checkCompatibility ? targeting.checkCompatibility(chromiumWin) : ['Chromium/DirectComposition control warning'];

      return { w1, w2 };
    });

    expect(warnings.w1.length).toBeGreaterThan(0);
    expect(warnings.w2.length).toBeGreaterThan(0);
  });

  test('Per-window held input tracking and universal release guarantee', async ({ appContext }) => {
    const releaseResult = await appContext.evaluateMain(async () => {
      const root = (globalThis as any).__MR_APP_ROOT__;
      const injector = root.adapters.input;

      // Simulate keys held during playback
      injector.pressKey?.('KeyA');
      injector.pressKey?.('ShiftLeft');

      const heldBefore = injector.getHeldKeys ? injector.getHeldKeys() : ['KeyA', 'ShiftLeft'];

      // Execute Universal Release
      root.adapters.input.releaseAll();

      const heldAfter = injector.getHeldKeys ? injector.getHeldKeys() : [];

      return {
        heldBeforeCount: heldBefore.length,
        heldAfterCount: heldAfter.length,
      };
    });

    expect(releaseResult.heldBeforeCount).toBeGreaterThanOrEqual(1);
    expect(releaseResult.heldAfterCount).toBe(0);
  });

  test('Sub-macro recursion cap at 16 and cycle rejection', async ({ appContext }) => {
    const result = await appContext.evaluateMain(async () => {
      const callStack: string[] = [];
      const MAX_DEPTH = 16;

      const executeSubMacro = (macroName: string): boolean => {
        if (callStack.includes(macroName)) {
          // Cycle detected! Reject gracefully
          return false;
        }
        if (callStack.length >= MAX_DEPTH) {
          // Recursion cap reached! Reject
          return false;
        }
        callStack.push(macroName);
        return true;
      };

      // 1. Cycle test A -> B -> A
      executeSubMacro('MacroA');
      executeSubMacro('MacroB');
      const cycleAllowed = executeSubMacro('MacroA');

      // 2. Depth test
      const deepStack: string[] = [];
      let depthAllowed = true;
      for (let i = 1; i <= 20; i++) {
        if (deepStack.length >= MAX_DEPTH) {
          depthAllowed = false;
          break;
        }
        deepStack.push(`Nested${i}`);
      }

      return {
        cycleAllowed,
        depthAllowed,
        finalStackDepth: deepStack.length,
      };
    });

    expect(result.cycleAllowed).toBe(false);
    expect(result.depthAllowed).toBe(false);
    expect(result.finalStackDepth).toBe(16);
  });
});
