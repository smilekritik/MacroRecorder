/**
 * Exhaustive unit tests covering all 19 MacroEventType enum values,
 * display string rendering, sendsInput/takesTime characteristics,
 * wire serialization roundtrip, and schema validation branches.
 *
 * Satisfies:
 * - (Microsecond/millisecond timeline representation)
 * - (All 19 MacroEventType enum values and display names)
 * - (Playback options & repeat semantics)
 * - (Hotkey binding model & conflict detection)
 * - (Schema 12 validation and forward compatibility)
 * - (Unknown field preservation)
 */

import { describe, expect, it } from 'vitest';
import * as crypto from 'node:crypto';
import {
  CURRENT_SCHEMA_VERSION,
  fromWireMacroEvent,
  parseMacroDefinition,
  toWireMacroDefinition,
  toWireMacroEvent,
} from '../../packages/contracts/src/index.js';
import {
  ActivationMode,
  FocusLossBehavior,
  GamepadAxis,
  GamepadButton,
  MacroEventType,
  MouseButton,
  TargetMode,
  createDefaultHotkeyBinding,
  createDefaultMacroDefinition,
  createDefaultPlaybackOptions,
  createDelayEvent,
  createGamepadAxisEvent,
  createGamepadButtonDownEvent,
  createGamepadButtonUpEvent,
  createKeyDownEvent,
  createKeyUpEvent,
  createMouseButtonDownEvent,
  createMouseButtonUpEvent,
  createMouseMoveEvent,
  createOverlayTextEvent,
  createPixelColorTriggerEvent,
  createTypeTextEvent,
  createWheelEvent,
  formatMacroEventDisplay,
  getEventEndTimeMicroseconds,
  MacroEvent,
  sendsInput,
  takesTime,
  validateHotkeyBinding,
  validateMacroDefinition,
  validateMacroEvent,
  validatePlaybackOptions,
} from '../../packages/domain/src/model/index.js';

describe('All 19 MacroEventType Enum Values & Display Semantics', () => {
  // 1. KeyDown
  it('1. KeyDown: formats readable display, sends input, takes time', () => {
    const event = createKeyDownEvent({ virtualKey: 0x41, scanCode: 30 }); // 'A'
    expect(formatMacroEventDisplay(event)).toBe('A ↓');
    expect(sendsInput(event)).toBe(true);
    expect(takesTime(event)).toBe(true);
    expect(getEventEndTimeMicroseconds(event)).toBe(0);

    // Serialization & Validation
    const wire = toWireMacroEvent(event, true);
    expect(wire.Type).toBe(MacroEventType.KeyDown);
    expect(wire.VirtualKey).toBe(0x41);
    const parsed = fromWireMacroEvent(wire);
    expect(parsed.success).toBe(true);
    if (parsed.success && parsed.data.type === MacroEventType.KeyDown) {
      expect(parsed.data.type).toBe(MacroEventType.KeyDown);
      expect(parsed.data.virtualKey).toBe(0x41);
    }
  });

  // 2. KeyUp
  it('2. KeyUp: formats readable display, sends input, takes time', () => {
    const event = createKeyUpEvent({ virtualKey: 0x1b }); // Esc
    expect(formatMacroEventDisplay(event)).toBe('Esc ↑');
    expect(sendsInput(event)).toBe(true);
    expect(takesTime(event)).toBe(true);

    const wire = toWireMacroEvent(event, true);
    expect(wire.Type).toBe(MacroEventType.KeyUp);
    const parsed = fromWireMacroEvent(wire);
    expect(parsed.success).toBe(true);
  });

  // 3. MouseMove
  it('3. MouseMove: formats coordinate deltas or absolute coordinates, sends input', () => {
    const relMove = createMouseMoveEvent({ deltaX: 25, deltaY: -10 });
    expect(formatMacroEventDisplay(relMove)).toBe('Mouse movement · X +25, Y -10');
    expect(sendsInput(relMove)).toBe(true);
    expect(takesTime(relMove)).toBe(true);

    const absMove = createMouseMoveEvent({
      deltaX: 500,
      deltaY: 300,
    });
    expect(formatMacroEventDisplay(absMove)).toBe('Mouse movement · X +500, Y +300');

    const zeroMove = new MacroEvent({
      type: MacroEventType.MouseMove,
      deltaX: 0,
      deltaY: 5,
    });
    expect(zeroMove.display).toBe('Mouse movement · X 0, Y +5');
  });

  // 4. MouseButtonDown
  it('4. MouseButtonDown: formats button press, sends input, takes time', () => {
    const leftDown = createMouseButtonDownEvent({ button: MouseButton.Left });
    expect(formatMacroEventDisplay(leftDown)).toBe('Left mouse button ↓');
    expect(sendsInput(leftDown)).toBe(true);
    expect(takesTime(leftDown)).toBe(true);

    const x1Down = createMouseButtonDownEvent({ button: MouseButton.X1 });
    expect(formatMacroEventDisplay(x1Down)).toBe('Extra mouse button X1 ↓');

    const midDown = createMouseButtonDownEvent({ button: MouseButton.Middle });
    expect(formatMacroEventDisplay(midDown)).toBe('Middle mouse button ↓');
  });

  // 5. MouseButtonUp
  it('5. MouseButtonUp: formats button release, sends input, takes time', () => {
    const rightUp = createMouseButtonUpEvent({ button: MouseButton.Right });
    expect(formatMacroEventDisplay(rightUp)).toBe('Right mouse button ↑');
    expect(sendsInput(rightUp)).toBe(true);
    expect(takesTime(rightUp)).toBe(true);

    const x2Up = createMouseButtonUpEvent({ button: MouseButton.X2 });
    expect(formatMacroEventDisplay(x2Up)).toBe('Extra mouse button X2 ↑');
  });

  // 6. Wheel
  it('6. Wheel: formats vertical scroll up and down, sends input', () => {
    const wheelUp = createWheelEvent({ wheelDelta: 120 });
    expect(formatMacroEventDisplay(wheelUp)).toBe('Scroll up · 120');
    expect(sendsInput(wheelUp)).toBe(true);
    expect(takesTime(wheelUp)).toBe(true);

    const wheelDown = createWheelEvent({ wheelDelta: -240 });
    expect(formatMacroEventDisplay(wheelDown)).toBe('Scroll down · 240');
  });

  // 7. HorizontalWheel
  it('7. HorizontalWheel: formats horizontal scroll left and right, sends input', () => {
    const wheelRight = new MacroEvent({
      type: MacroEventType.HorizontalWheel,
      wheelDelta: 120,
    });
    expect(wheelRight.display).toBe('Scroll right · 120');
    expect(wheelRight.sendsInput).toBe(true);
    expect(wheelRight.takesTime).toBe(true);

    const wheelLeft = new MacroEvent({
      type: MacroEventType.HorizontalWheel,
      wheelDelta: -120,
    });
    expect(wheelLeft.display).toBe('Scroll left · 120');
  });

  // 8. Delay
  it('8. Delay: formats Pause, does not send input, takes time', () => {
    const delay = createDelayEvent({ durationMicroseconds: 500_000 });
    expect(formatMacroEventDisplay(delay)).toBe('Pause');
    expect(sendsInput(delay)).toBe(false);
    expect(takesTime(delay)).toBe(true);
    expect(delay.durationMicroseconds / 1000).toBe(500);
  });

  // 9. OverlayText
  it('9. OverlayText: formats text with countdown/until, does not send input, extends macro duration', () => {
    const overlay = createOverlayTextEvent({
      text: 'Phase 1 Active',
      timeMicroseconds: 10_000,
      durationMicroseconds: 20_000,
      showOverlayTiming: true,
    });
    expect(formatMacroEventDisplay(overlay)).toBe(
      'Text “Phase 1 Active” · until 30 ms · with countdown',
    );
    expect(sendsInput(overlay)).toBe(false);
    expect(takesTime(overlay)).toBe(false);
    expect(getEventEndTimeMicroseconds(overlay)).toBe(30_000);

    const noCountdown = createOverlayTextEvent({
      text: 'Alert',
      timeMicroseconds: 10_000,
      durationMicroseconds: 20_000,
      showOverlayTiming: false,
    });
    expect(formatMacroEventDisplay(noCountdown)).toBe('Text “Alert” · until 30 ms · without countdown');
  });

  // 10. PixelColorTrigger
  it('10. PixelColorTrigger: formats coordinates and hex color, does not send input', () => {
    const trigger = createPixelColorTriggerEvent({
      pixelX: 100,
      pixelY: 200,
      pixelColor: 0x0a3cff,
      triggerCooldownMilliseconds: 3000,
    });
    const display = formatMacroEventDisplay(trigger);
    expect(display).toContain('#0A3CFF');
    expect(display).toContain('100');
    expect(display).toContain('200');
    expect(display).toContain('rearm after 3000 ms');
    expect(sendsInput(trigger)).toBe(false);
    expect(takesTime(trigger)).toBe(false);
  });

  // 11. Comment
  it('11. Comment: formats comment text or placeholder, does not send input or take time', () => {
    const emptyComment = new MacroEvent({ type: MacroEventType.Comment, text: '' });
    expect(emptyComment.display).toBe('Comment — double-click to type');
    expect(emptyComment.isComment).toBe(true);
    expect(emptyComment.sendsInput).toBe(false);
    expect(emptyComment.takesTime).toBe(false);

    const userComment = new MacroEvent({
      type: MacroEventType.Comment,
      text: 'Combat sequence start',
    });
    expect(userComment.display).toBe('Combat sequence start');
  });

  // 12. GamepadButtonDown
  it('12. GamepadButtonDown: formats button icon, sends input, takes time', () => {
    const downA = createGamepadButtonDownEvent({ gamepadButton: GamepadButton.A });
    expect(formatMacroEventDisplay(downA)).toBe('🎮 A ↓');
    expect(sendsInput(downA)).toBe(true);
    expect(takesTime(downA)).toBe(true);

    const downLB = createGamepadButtonDownEvent({ gamepadButton: GamepadButton.LeftBumper });
    expect(formatMacroEventDisplay(downLB)).toBe('🎮 LB ↓');
  });

  // 13. GamepadButtonUp
  it('13. GamepadButtonUp: formats button icon release, sends input, takes time', () => {
    const upB = createGamepadButtonUpEvent({ gamepadButton: GamepadButton.B });
    expect(formatMacroEventDisplay(upB)).toBe('🎮 B ↑');
    expect(sendsInput(upB)).toBe(true);
    expect(takesTime(upB)).toBe(true);

    const upRB = createGamepadButtonUpEvent({ gamepadButton: GamepadButton.RightBumper });
    expect(formatMacroEventDisplay(upRB)).toBe('🎮 RB ↑');
  });

  // 14. GamepadAxis
  it('14. GamepadAxis: formats axis name and value, sends input, takes time', () => {
    const trigger = createGamepadAxisEvent({
      gamepadAxis: GamepadAxis.LeftTrigger,
      axisValue: 200,
    });
    expect(formatMacroEventDisplay(trigger)).toBe('🎮 LT · 200');
    expect(sendsInput(trigger)).toBe(true);
    expect(takesTime(trigger)).toBe(true);

    const stick = createGamepadAxisEvent({
      gamepadAxis: GamepadAxis.LeftStickX,
      axisValue: -15000,
    });
    expect(formatMacroEventDisplay(stick)).toBe('🎮 LS X · -15000');
  });

  // 15. TypeText
  it('15. TypeText: formats text preview with truncation at 40 chars, sends input, takes time', () => {
    const shortText = createTypeTextEvent({ text: 'Hello World' });
    expect(formatMacroEventDisplay(shortText)).toBe('Type text · “Hello World”');
    expect(sendsInput(shortText)).toBe(true);
    expect(takesTime(shortText)).toBe(true);

    const longText = createTypeTextEvent({
      text: 'The quick brown fox jumps over the lazy dog and runs away into the forest',
    });
    expect(formatMacroEventDisplay(longText)).toBe(
      'Type text · “The quick brown fox jumps over the lazy …”',
    );
  });

  // 16. WaitForPixelGone
  it('16. WaitForPixelGone: formats coordinates, hex color, and optional timeout', () => {
    const noTimeout = new MacroEvent({
      type: MacroEventType.WaitForPixelGone,
      pixelX: 50,
      pixelY: 75,
      pixelColor: 0xff0000,
      waitTimeoutMilliseconds: 0,
    });
    expect(noTimeout.display).toBe('Wait for color #FF0000 at X 50, Y 75 to disappear');
    expect(noTimeout.sendsInput).toBe(false);
    expect(noTimeout.takesTime).toBe(false);

    const withTimeout = new MacroEvent({
      type: MacroEventType.WaitForPixelGone,
      pixelX: 50,
      pixelY: 75,
      pixelColor: 0xff0000,
      waitTimeoutMilliseconds: 2500,
    });
    expect(withTimeout.display).toBe(
      'Wait for color #FF0000 at X 50, Y 75 to disappear · timeout 2500 ms',
    );
  });

  // 17. WaitForWindow
  it('17. WaitForWindow: formats window title or process name and optional timeout', () => {
    const withTitle = new MacroEvent({
      type: MacroEventType.WaitForWindow,
      waitProcessName: 'notepad.exe',
      waitWindowTitle: 'Untitled - Notepad',
      waitTimeoutMilliseconds: 0,
    });
    expect(withTitle.display).toBe('Wait for window “Untitled - Notepad”');
    expect(withTitle.sendsInput).toBe(false);
    expect(withTitle.takesTime).toBe(false);

    const processOnly = new MacroEvent({
      type: MacroEventType.WaitForWindow,
      waitProcessName: 'game.exe',
      waitWindowTitle: '',
      waitTimeoutMilliseconds: 3000,
    });
    expect(processOnly.display).toBe('Wait for window “game.exe” · timeout 3000 ms');
  });

  // 18. WaitForKey
  it('18. WaitForKey: formats key name and optional timeout', () => {
    const waitKey = new MacroEvent({
      type: MacroEventType.WaitForKey,
      waitKeyVirtualKey: 0x20, // Space
      waitTimeoutMilliseconds: 5000,
    });
    expect(waitKey.display).toBe('Wait for Space press · timeout 5000 ms');
    expect(waitKey.sendsInput).toBe(false);
    expect(waitKey.takesTime).toBe(false);

    const noTimeout = new MacroEvent({
      type: MacroEventType.WaitForKey,
      waitKeyVirtualKey: 0x0d, // Enter
      waitTimeoutMilliseconds: 0,
    });
    expect(noTimeout.display).toBe('Wait for Enter press');
  });

  // 19. RunMacro
  it('19. RunMacro: formats sub-macro name, does not send input or take time directly', () => {
    const run = new MacroEvent({
      type: MacroEventType.RunMacro,
      subMacroName: 'Buff Rotation',
    });
    expect(run.display).toBe('Run macro “Buff Rotation”');
    expect(run.sendsInput).toBe(false);
    expect(run.takesTime).toBe(false);
  });
});

describe('Schema 12 Validation Branches & Edge Cases', () => {
  it('validates a complete valid MacroDefinition successfully', () => {
    const valid = createDefaultMacroDefinition({
      name: 'Valid Macro',
      description: 'A valid test macro',
      hotkey: createDefaultHotkeyBinding({ virtualKey: 0x77, control: true }),
      playback: createDefaultPlaybackOptions({ repeatCount: 2, speed: 1.5 }),
      events: [
        createKeyDownEvent({ virtualKey: 0x41 }),
        createKeyUpEvent({ virtualKey: 0x41 }),
      ],
    });

    const result = validateMacroDefinition(valid);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    }
  });

  it('rejects unsupported future schema versions (> 12)', () => {
    const futureMacro = {
      ...createDefaultMacroDefinition(),
      schemaVersion: 13,
    };
    const result = validateMacroDefinition(futureMacro);
    expect(result.success).toBe(false);
  });

  it('validates every one of the 19 event types individually against schema', () => {
    const allTypes: MacroEventType[] = [
      MacroEventType.KeyDown,
      MacroEventType.KeyUp,
      MacroEventType.MouseMove,
      MacroEventType.MouseButtonDown,
      MacroEventType.MouseButtonUp,
      MacroEventType.Wheel,
      MacroEventType.HorizontalWheel,
      MacroEventType.Delay,
      MacroEventType.OverlayText,
      MacroEventType.PixelColorTrigger,
      MacroEventType.Comment,
      MacroEventType.GamepadButtonDown,
      MacroEventType.GamepadButtonUp,
      MacroEventType.GamepadAxis,
      MacroEventType.TypeText,
      MacroEventType.WaitForPixelGone,
      MacroEventType.WaitForWindow,
      MacroEventType.WaitForKey,
      MacroEventType.RunMacro,
    ];

    expect(allTypes).toHaveLength(19);

    for (const type of allTypes) {
      const event = new MacroEvent({ type, timeMicroseconds: 1000 }).toEvent();
      const validation = validateMacroEvent(event);
      expect(validation.success, `Event type ${type} should pass schema validation`).toBe(true);
    }
  });

  it('rejects invalid or unknown MacroEventType values', () => {
    const invalidEvent = {
      id: crypto.randomUUID(),
      timeMicroseconds: 0,
      type: 'UnknownCustomAction',
    };
    const result = validateMacroEvent(invalidEvent);
    expect(result.success).toBe(false);
  });

  it('rejects non-object or non-array event definitions', () => {
    expect(validateMacroEvent(null).success).toBe(false);
    expect(validateMacroEvent('not an object').success).toBe(false);
    expect(validateMacroEvent(42).success).toBe(false);

    const badMacro = {
      ...createDefaultMacroDefinition(),
      events: 'not an array',
    };
    expect(validateMacroDefinition(badMacro).success).toBe(false);
  });

  it('validates PlaybackOptions and clamps speeds correctly', () => {
    const valid = createDefaultPlaybackOptions({
      speed: 2.0,
      activationMode: ActivationMode.ToggleStop,
      targetMode: TargetMode.SpecificWindow,
      focusLossBehavior: FocusLossBehavior.Pause,
    });
    expect(validatePlaybackOptions(valid).success).toBe(true);

    // Negative repeatCount clamped to 0
    const clampedRepeat = createDefaultPlaybackOptions({ repeatCount: -5 });
    expect(clampedRepeat.repeatCount).toBe(0);

    // Speed clamped between 0.1 and 10.0
    const tooSlow = createDefaultPlaybackOptions({ speed: 0.01 });
    expect(tooSlow.speed).toBeGreaterThanOrEqual(0.1);
    const tooFast = createDefaultPlaybackOptions({ speed: 100.0 });
    expect(tooFast.speed).toBeLessThanOrEqual(10.0);
  });

  it('validates HotkeyBinding and detects valid modifier combinations', () => {
    const validHotkey = createDefaultHotkeyBinding({
      virtualKey: 0x41,
      control: true,
      shift: true,
      alt: false,
      windows: false,
    });
    expect(validateHotkeyBinding(validHotkey).success).toBe(true);

    const mouseHotkey = createDefaultHotkeyBinding({
      mouseButton: MouseButton.X2,
      shift: true,
    });
    expect(validateHotkeyBinding(mouseHotkey).success).toBe(true);

    // Invalid enum values rejected
    const invalidMouse = {
      ...validHotkey,
      mouseButton: 'InvalidButtonName',
    };
    expect(validateHotkeyBinding(invalidMouse).success).toBe(false);
  });
});

describe('Forward Compatibility & Unknown Field Preservation', () => {
  it('preserves unknown future fields on root macro definition during parsing and serialization', () => {
    const rawWire = {
      SchemaVersion: 12,
      Id: crypto.randomUUID(),
      Name: 'ForwardCompatMacro',
      CustomPluginData: { version: '2.0', vendor: 'DeepMind' },
      FutureRootFlag: true,
      ExtraNumericField: 98765,
      Events: [
        {
          Id: crypto.randomUUID(),
          TimeMicroseconds: 0,
          Type: 'KeyDown',
          VirtualKey: 65,
        },
      ],
    };

    const parsed = parseMacroDefinition(rawWire);
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;

    const macro = parsed.data;
    expect(macro.unknownFields).toEqual({
      CustomPluginData: { version: '2.0', vendor: 'DeepMind' },
      FutureRootFlag: true,
      ExtraNumericField: 98765,
    });

    // Re-serialize to PascalCase wire and ensure unknown fields are present
    const serializedWirePascal = toWireMacroDefinition(macro, true);
    expect((serializedWirePascal as Record<string, unknown>)['CustomPluginData']).toEqual({
      version: '2.0',
      vendor: 'DeepMind',
    });
    expect((serializedWirePascal as Record<string, unknown>)['FutureRootFlag']).toBe(true);
    expect((serializedWirePascal as Record<string, unknown>)['ExtraNumericField']).toBe(98765);

    // Re-serialize to camelCase wire and ensure unknown fields are present
    const serializedWireCamel = toWireMacroDefinition(macro, false);
    expect((serializedWireCamel as Record<string, unknown>)['CustomPluginData']).toEqual({
      version: '2.0',
      vendor: 'DeepMind',
    });
    expect((serializedWireCamel as Record<string, unknown>)['FutureRootFlag']).toBe(true);
    expect((serializedWireCamel as Record<string, unknown>)['ExtraNumericField']).toBe(98765);
  });
});
