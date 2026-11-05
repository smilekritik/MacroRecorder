/**
 * Unit tests for domain macro model, and display semantics.
 * Mapped to legacy MacroRecorder.Tests.ModelTests.cs through.
 * Covers LEGACY-TEST-050 through LEGACY-TEST-058 ( ..).
 */

import { describe, expect, it } from 'vitest';
import * as crypto from 'node:crypto';
import {
  ActivationMode,
  applyRepeatForever,
  createDefaultHotkeyBinding,
  createDefaultMacroDefinition,
  createDefaultPlaybackOptions,
  createGamepadAxisEvent,
  createGamepadButtonDownEvent,
  DispatchReceipt,
  formatHotkeyDisplay,
  formatMacroEventDisplay,
  GamepadAxis,
  GamepadButton,
  HotkeyBinding,
  InputDevice,
  isEmptyHotkey,
  isMouseHotkey,
  MacroDefinition,
  MacroEvent,
  MacroEventType,
  MouseButton,
  OverlayCardOverride,
  PlaybackOptions,
  resolveOverlayCardOverride,
  sameGesture,
  sendsInput,
} from '../../packages/domain/src/model/index.js';

describe('ModelTests', () => {
  /**
   * [Theory]
   * [InlineData(OverlayCardOverride.Inherit, true, true)]
   * [InlineData(OverlayCardOverride.Inherit, false, false)]
   * [InlineData(OverlayCardOverride.ForceShow, false, true)]
   * [InlineData(OverlayCardOverride.ForceShow, true, true)]
   * [InlineData(OverlayCardOverride.ForceHide, true, false)]
   * [InlineData(OverlayCardOverride.ForceHide, false, false)]
   * public void OverlayCardOverride_ResolvesWithPriorityOverAppSetting
   * Mapped to LEGACY-TEST-050 /
   */
  it('OverlayCardOverride_ResolvesWithPriorityOverAppSetting', () => {
    const testCases: [OverlayCardOverride, boolean, boolean][] = [
      [OverlayCardOverride.Inherit, true, true],
      [OverlayCardOverride.Inherit, false, false],
      [OverlayCardOverride.ForceShow, false, true],
      [OverlayCardOverride.ForceShow, true, true],
      [OverlayCardOverride.ForceHide, true, false],
      [OverlayCardOverride.ForceHide, false, false],
    ];

    for (const [val, appDefault, expected] of testCases) {
      expect(resolveOverlayCardOverride(val, appDefault)).toBe(expected);
    }
  });

  /**
   * [Fact]
   * public void GamepadEvents_RenderReadableDisplayAndSendInput
   * Mapped to LEGACY-TEST-051 /
   */
  it('GamepadEvents_RenderReadableDisplayAndSendInput', () => {
    // Legacy class-style constructor
    const down = new MacroEvent({
      device: InputDevice.Gamepad,
      type: MacroEventType.GamepadButtonDown,
      gamepadButton: GamepadButton.A,
    });
    expect(down.display).toBe('🎮 A ↓');
    expect(down.sendsInput).toBe(true);
    expect(down.Display).toBe('🎮 A ↓');
    expect(down.SendsInput).toBe(true);

    const axis = new MacroEvent({
      device: InputDevice.Gamepad,
      type: MacroEventType.GamepadAxis,
      gamepadAxis: GamepadAxis.LeftTrigger,
      axisValue: 200,
    });
    expect(axis.display).toBe('🎮 LT · 200');
    expect(axis.Display).toBe('🎮 LT · 200');

    // Also verify functional helper
    const downFn = createGamepadButtonDownEvent({ gamepadButton: GamepadButton.A });
    expect(formatMacroEventDisplay(downFn)).toBe('🎮 A ↓');
    expect(sendsInput(downFn)).toBe(true);

    const axisFn = createGamepadAxisEvent({
      gamepadAxis: GamepadAxis.LeftTrigger,
      axisValue: 200,
    });
    expect(formatMacroEventDisplay(axisFn)).toBe('🎮 LT · 200');
  });

  /**
   * [Fact]
   * public void HotkeyBinding_SupportsExtraMouseButtonsAndConflicts
   * Mapped to LEGACY-TEST-052 /
   */
  it('HotkeyBinding_SupportsExtraMouseButtonsAndConflicts', () => {
    const first = new HotkeyBinding({ mouseButton: MouseButton.X1, shift: true });
    const same = new HotkeyBinding({ mouseButton: MouseButton.X1, shift: true });
    const different = new HotkeyBinding({ mouseButton: MouseButton.X2, shift: true });

    expect(first.isEmpty).toBe(false);
    expect(first.isMouse).toBe(true);
    expect(first.toString()).toBe('Shift + Mouse X1');
    expect(first.sameGesture(same)).toBe(true);
    expect(first.sameGesture(different)).toBe(false);

    // PascalCase compatibility
    expect(first.IsEmpty).toBe(false);
    expect(first.IsMouse).toBe(true);
    expect(first.ToString()).toBe('Shift + Mouse X1');
    expect(first.SameGesture(same)).toBe(true);
    expect(first.SameGesture(different)).toBe(false);

    // Functional helpers
    const firstObj = createDefaultHotkeyBinding({ mouseButton: MouseButton.X1, shift: true });
    const sameObj = createDefaultHotkeyBinding({ mouseButton: MouseButton.X1, shift: true });
    const diffObj = createDefaultHotkeyBinding({ mouseButton: MouseButton.X2, shift: true });
    expect(isEmptyHotkey(firstObj)).toBe(false);
    expect(isMouseHotkey(firstObj)).toBe(true);
    expect(formatHotkeyDisplay(firstObj)).toBe('Shift + Mouse X1');
    expect(sameGesture(firstObj, sameObj)).toBe(true);
    expect(sameGesture(firstObj, diffObj)).toBe(false);
  });

  /**
   * [Fact]
   * public void MacroEvent_UsesReadableNamesAndMilliseconds
   * Mapped to LEGACY-TEST-053 /
   */
  it('MacroEvent_UsesReadableNamesAndMilliseconds', () => {
    const key = new MacroEvent({
      timeMicroseconds: 10_000,
      type: MacroEventType.KeyDown,
      virtualKey: 0x41,
    });
    const click = new MacroEvent({
      type: MacroEventType.MouseButtonDown,
      button: MouseButton.Left,
    });

    expect(key.timeMilliseconds).toBe(10);
    expect(key.TimeMilliseconds).toBe(10);
    expect(key.display).toBe('A ↓');
    expect(key.Display).toBe('A ↓');

    expect(click.display).toBe('Left mouse button ↓');
    expect(click.Display).toBe('Left mouse button ↓');
    expect(click.display).not.toContain('X');
    expect(click.display).not.toContain('0');

    // Millisecond setter test
    key.timeMilliseconds = 25.5;
    expect(key.timeMicroseconds).toBe(25500);
    expect(key.timeMilliseconds).toBe(25.5);
  });

  /**
   * [Fact]
   * public void MacroAndDiagnostics_ExposeUserFacingStateInMilliseconds
   * Mapped to LEGACY-TEST-054 /
   */
  it('MacroAndDiagnostics_ExposeUserFacingStateInMilliseconds', () => {
    expect(new MacroDefinition().isEnabled).toBe(true);
    expect(new MacroDefinition().IsEnabled).toBe(true);
    expect(createDefaultMacroDefinition().isEnabled).toBe(true);

    const receipt = new DispatchReceipt(
      crypto.randomUUID(),
      12_500,
      13_250,
      13_300,
      null,
      true,
      null,
    );
    expect(receipt.scheduledMilliseconds).toBe(12.5);
    expect(receipt.ScheduledMilliseconds).toBe(12.5);
    expect(receipt.dispatchStartedMilliseconds).toBe(13.25);
    expect(receipt.DispatchStartedMilliseconds).toBe(13.25);
    expect(receipt.dispatchCompletedMilliseconds).toBe(13.3);
  });

  /**
   * [Fact]
   * public void RepeatForever_RestoresPreviousFiniteCountWhenDisabled
   * Mapped to LEGACY-TEST-055 /
   */
  it('RepeatForever_RestoresPreviousFiniteCountWhenDisabled', () => {
    const options = new PlaybackOptions({ repeatCount: 7 });

    options.repeatForever = true;
    expect(options.repeatCount).toBe(0);
    expect(options.RepeatCount).toBe(0);

    options.repeatForever = false;
    expect(options.repeatCount).toBe(7);
    expect(options.RepeatCount).toBe(7);

    // Functional immutable helper
    const initial = createDefaultPlaybackOptions({ repeatCount: 7 });
    const step1 = applyRepeatForever(initial, true, initial.repeatCount);
    expect(step1.options.repeatCount).toBe(0);
    expect(step1.lastFiniteRepeatCount).toBe(7);

    const step2 = applyRepeatForever(step1.options, false, step1.lastFiniteRepeatCount);
    expect(step2.options.repeatCount).toBe(7);
  });

  /**
   * [Fact]
   * public void PixelColorTrigger_DisplayIncludesCoordinatesAndHexColor
   * Mapped to LEGACY-TEST-056 /
   */
  it('PixelColorTrigger_DisplayIncludesCoordinatesAndHexColor', () => {
    const item = new MacroEvent({
      type: MacroEventType.PixelColorTrigger,
      pixelX: -25,
      pixelY: 700,
      pixelColor: 0x0a3cff,
    });
    expect(item.display).toContain('#0A3CFF');
    expect(item.display).toContain('-25');
    expect(item.display).toContain('700');
  });

  /**
   * [Fact]
   * public void RepeatForever_ForcesToggleStopActivation
   * Mapped to LEGACY-TEST-057 /
   */
  it('RepeatForever_ForcesToggleStopActivation', () => {
    const options = new PlaybackOptions({ activationMode: ActivationMode.Once });
    options.repeatForever = true;
    expect(options.activationMode).toBe(ActivationMode.ToggleStop);
    expect(options.ActivationMode).toBe(ActivationMode.ToggleStop);

    // Functional helper
    const initial = createDefaultPlaybackOptions({ activationMode: ActivationMode.Once });
    const result = applyRepeatForever(initial, true);
    expect(result.options.activationMode).toBe(ActivationMode.ToggleStop);
  });

  /**
   * [Fact]
   * public void HotkeyPassThroughAndScope_AreOffByDefault
   * Mapped to LEGACY-TEST-058 /
   */
  it('HotkeyPassThroughAndScope_AreOffByDefault', () => {
    const options = new PlaybackOptions();
    expect(options.passThroughHotkey).toBe(false);
    expect(options.hotkeyScopedToTarget).toBe(false);
    expect(options.PassThroughHotkey).toBe(false);
    expect(options.HotkeyScopedToTarget).toBe(false);

    const defaultFn = createDefaultPlaybackOptions();
    expect(defaultFn.passThroughHotkey).toBe(false);
    expect(defaultFn.hotkeyScopedToTarget).toBe(false);
  });
});
