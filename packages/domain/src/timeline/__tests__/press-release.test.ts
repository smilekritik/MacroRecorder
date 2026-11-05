/**
 * Unit tests for press-release pair generation and manual action factories.
 */

import { describe, expect, it } from 'vitest';
import { GamepadButton, MacroEventType, MouseButton } from '../../model/index.js';
import {
  createGamepadPressPair,
  createKeyPressPair,
  createManualActionEvents,
  createMouseClickPair,
  DEFAULT_HOLD_DURATION_MICROSECONDS,
} from '../press-release.js';
import { ManualActionType } from '../types.js';

describe('Press-Release Pairs & Manual Actions', () => {
  it('creates key press pair with default 50ms hold duration', () => {
    const [down, up] = createKeyPressPair({
      startTimeMicroseconds: 10_000,
      virtualKey: 0x41,
      scanCode: 30,
      comment: 'key A',
    });

    expect(down.type).toBe(MacroEventType.KeyDown);
    expect(down.timeMicroseconds).toBe(10_000);
    expect(down.comment).toBe('key A');
    expect((down as { virtualKey?: number }).virtualKey).toBe(0x41);
    expect((down as { scanCode?: number }).scanCode).toBe(30);

    expect(up.type).toBe(MacroEventType.KeyUp);
    expect(up.timeMicroseconds).toBe(10_000 + DEFAULT_HOLD_DURATION_MICROSECONDS);
    expect((up as { virtualKey?: number }).virtualKey).toBe(0x41);
  });

  it('creates key press pair with custom hold duration', () => {
    const [down, up] = createKeyPressPair({
      startTimeMicroseconds: 20_000,
      holdDurationMicroseconds: 80_000,
      virtualKey: 0x20,
    });

    expect(down.timeMicroseconds).toBe(20_000);
    expect(up.timeMicroseconds).toBe(100_000);
  });

  it('creates extra mouse button pair via createKeyPressPair', () => {
    const [down, up] = createKeyPressPair({
      startTimeMicroseconds: 0,
      mouseButton: MouseButton.X1,
      holdDurationMicroseconds: 60_000,
    });

    expect(down.type).toBe(MacroEventType.MouseButtonDown);
    expect(up.type).toBe(MacroEventType.MouseButtonUp);
    expect((down as { button?: MouseButton }).button).toBe(MouseButton.X1);
    expect((up as { button?: MouseButton }).button).toBe(MouseButton.X1);
    expect(up.timeMicroseconds).toBe(60_000);
  });

  it('creates mouse click pair for left, right, middle buttons', () => {
    const [down, up] = createMouseClickPair({
      startTimeMicroseconds: 5_000,
      button: MouseButton.Right,
      holdDurationMicroseconds: 40_000,
      comment: 'right click',
    });

    expect(down.type).toBe(MacroEventType.MouseButtonDown);
    expect(down.timeMicroseconds).toBe(5_000);
    expect(down.comment).toBe('right click');
    expect((down as { button?: MouseButton }).button).toBe(MouseButton.Right);

    expect(up.type).toBe(MacroEventType.MouseButtonUp);
    expect(up.timeMicroseconds).toBe(45_000);
    expect((up as { button?: MouseButton }).button).toBe(MouseButton.Right);
  });

  it('creates gamepad press pair for controller buttons', () => {
    const [down, up] = createGamepadPressPair({
      startTimeMicroseconds: 15_000,
      gamepadIndex: 1,
      button: GamepadButton.A,
      holdDurationMicroseconds: 50_000,
    });

    expect(down.type).toBe(MacroEventType.GamepadButtonDown);
    expect(down.timeMicroseconds).toBe(15_000);
    expect((down as { padIndex?: number }).padIndex).toBe(1);
    expect((down as { gamepadButton?: GamepadButton }).gamepadButton).toBe(GamepadButton.A);

    expect(up.type).toBe(MacroEventType.GamepadButtonUp);
    expect(up.timeMicroseconds).toBe(65_000);
    expect((up as { padIndex?: number }).padIndex).toBe(1);
    expect((up as { gamepadButton?: GamepadButton }).gamepadButton).toBe(GamepadButton.A);
  });

  describe('createManualActionEvents factory', () => {
    it('synthesizes KeyPress pair and reports hold duration occupied', () => {
      const result = createManualActionEvents({
        type: ManualActionType.KeyPress,
        startTimeMicroseconds: 100_000,
        virtualKey: 0x11,
        durationMicroseconds: 75_000,
      });

      expect(result.events.length).toBe(2);
      expect(result.events[0]!.type).toBe(MacroEventType.KeyDown);
      expect(result.events[1]!.type).toBe(MacroEventType.KeyUp);
      expect(result.occupiedMicroseconds).toBe(75_000);
    });

    it('synthesizes MouseClick pair and reports hold duration occupied', () => {
      const result = createManualActionEvents({
        type: ManualActionType.MouseClick,
        startTimeMicroseconds: 50_000,
        mouseButton: MouseButton.Left,
      });

      expect(result.events.length).toBe(2);
      expect(result.events[0]!.type).toBe(MacroEventType.MouseButtonDown);
      expect(result.events[1]!.type).toBe(MacroEventType.MouseButtonUp);
      expect(result.occupiedMicroseconds).toBe(DEFAULT_HOLD_DURATION_MICROSECONDS);
    });

    it('synthesizes GamepadPress pair and reports hold duration occupied', () => {
      const result = createManualActionEvents({
        type: ManualActionType.GamepadPress,
        startTimeMicroseconds: 0,
        gamepadButton: GamepadButton.X,
        durationMicroseconds: 30_000,
      });

      expect(result.events.length).toBe(2);
      expect(result.events[0]!.type).toBe(MacroEventType.GamepadButtonDown);
      expect(result.events[1]!.type).toBe(MacroEventType.GamepadButtonUp);
      expect(result.occupiedMicroseconds).toBe(30_000);
    });

    it('creates Delay event and reports duration occupied', () => {
      const result = createManualActionEvents({
        type: ManualActionType.Delay,
        startTimeMicroseconds: 10_000,
        durationMicroseconds: 200_000,
      });

      expect(result.events.length).toBe(1);
      expect(result.events[0]!.type).toBe(MacroEventType.Delay);
      expect(result.occupiedMicroseconds).toBe(200_000);
    });

    it('creates Comment row with zero occupied duration', () => {
      const result = createManualActionEvents({
        type: ManualActionType.Comment,
        startTimeMicroseconds: 10_000,
        text: 'checkpoint reached',
      });

      expect(result.events.length).toBe(1);
      expect(result.events[0]!.type).toBe(MacroEventType.Comment);
      expect((result.events[0] as { text?: string }).text).toBe('checkpoint reached');
      expect(result.occupiedMicroseconds).toBe(0);
    });

    it('creates OverlayText with duration occupied', () => {
      const result = createManualActionEvents({
        type: ManualActionType.OverlayText,
        startTimeMicroseconds: 0,
        text: 'Heads Up',
        durationMicroseconds: 500_000,
      });

      expect(result.events.length).toBe(1);
      expect(result.events[0]!.type).toBe(MacroEventType.OverlayText);
      expect(result.occupiedMicroseconds).toBe(500_000);
    });

    it('creates MouseMove with zero occupied duration', () => {
      const result = createManualActionEvents({
        type: ManualActionType.MouseMove,
        startTimeMicroseconds: 10_000,
        deltaX: 100,
        deltaY: -50,
      });

      expect(result.events.length).toBe(1);
      expect(result.events[0]!.type).toBe(MacroEventType.MouseMove);
      expect((result.events[0] as { deltaX?: number }).deltaX).toBe(100);
      expect((result.events[0] as { deltaY?: number }).deltaY).toBe(-50);
      expect(result.occupiedMicroseconds).toBe(0);
    });

    it('creates PixelColorTrigger with default 3-second cooldown', () => {
      const result = createManualActionEvents({
        type: ManualActionType.PixelColorTrigger,
        startTimeMicroseconds: 0,
        pixelX: 500,
        pixelY: 300,
        pixelColor: 0x00ff00,
      });

      expect(result.events.length).toBe(1);
      expect(result.events[0]!.type).toBe(MacroEventType.PixelColorTrigger);
      const ev = result.events[0] as { triggerCooldownMilliseconds?: number };
      expect(ev.triggerCooldownMilliseconds).toBe(3000);
      expect(result.occupiedMicroseconds).toBe(0);
    });

    it('creates raw key and mouse events', () => {
      const down = createManualActionEvents({
        type: ManualActionType.KeyDown,
        startTimeMicroseconds: 0,
        virtualKey: 0x42,
      });
      expect(down.events[0]!.type).toBe(MacroEventType.KeyDown);
      expect(down.occupiedMicroseconds).toBe(0);

      const up = createManualActionEvents({
        type: ManualActionType.KeyUp,
        startTimeMicroseconds: 10_000,
        virtualKey: 0x42,
      });
      expect(up.events[0]!.type).toBe(MacroEventType.KeyUp);
      expect(up.occupiedMicroseconds).toBe(0);

      const mouseDown = createManualActionEvents({
        type: ManualActionType.MouseDown,
        startTimeMicroseconds: 20_000,
        mouseButton: MouseButton.Middle,
      });
      expect(mouseDown.events[0]!.type).toBe(MacroEventType.MouseButtonDown);

      const mouseUp = createManualActionEvents({
        type: ManualActionType.MouseUp,
        startTimeMicroseconds: 30_000,
        mouseButton: MouseButton.Middle,
      });
      expect(mouseUp.events[0]!.type).toBe(MacroEventType.MouseButtonUp);
    });
  });
});
