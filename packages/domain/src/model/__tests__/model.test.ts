/**
 * Unit tests for domain macro model, and display semantics.
 * Mapped to legacy MacroRecorder.Tests.ModelTests.cs through.
 */

import { describe, expect, it } from 'vitest';
import {
  ActivationMode,
  applyRepeatCount,
  applyRepeatForever,
  calculateTimingStatistics,
  clampPlaybackSpeed,
  cloneHotkeyBinding,
  cloneMacroDefinition,
  cloneMacroEvent,
  clonePlaybackOptions,
  compressMouseMoves,
  createDefaultHotkeyBinding,
  createDefaultMacroDefinition,
  createDefaultPlaybackOptions,
  createDefaultRecordingOptions,
  createDelayEvent,
  createDispatchReceipt,
  createGamepadAxisEvent,
  createGamepadButtonDownEvent,
  createKeyDownEvent,
  createKeyUpEvent,
  createMouseButtonDownEvent,
  createOverlayTextEvent,
  createPixelColorTriggerEvent,
  createTypeTextEvent,
  DispatchReceipt,
  DispatchReceiptModel,
  formatHotkeyDisplay,
  formatMacroEventDisplay,
  formatMilliseconds,
  GamepadAxis,
  GamepadButton,
  getEventEndTimeMicroseconds,
  getMacroDurationMilliseconds,
  getMacroDurationMicroseconds,
  getMacroHotkeyDisplay,
  getReceiptScheduledDisplayMilliseconds,
  getVirtualKeyName,
  HotkeyBinding,
  HotkeyBindingModel,
  InputDevice,
  isAutomaticTriggerMacro,
  isEmptyHotkey,
  isMouseHotkey,
  isRepeatForever,
  MacroDefinition,
  MacroEvent,
  MacroEventModel,
  MacroEventType,
  MacroModel,
  MouseButton,
  type MouseMoveEvent,
  normalizeEvents,
  orderLibraryMacros,
  OverlayCardOverride,
  type OverlayTextEvent,
  PlaybackOptions,
  PlaybackOptionsModel,
  rebaseEventsToZero,
  RecordingOptionsModel,
  resolveMacroOverlayVisibility,
  resolveOverlayCardOverride,
  sameGesture,
  scaleTime,
  sendsInput,
  suggestInsertionTime,
  takesTime,
  usesManualHotkey,
  validateHotkeyBinding,
  validateMacroDefinition,
  validateMacroEvent,
  validatePlaybackOptions,
  WheelDirection,
  withEventTimeMilliseconds,
} from '../index.js';

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

describe('All 19 Macro Event Types Display and Characteristics', () => {
  it('formats KeyDown and KeyUp events', () => {
    const down = createKeyDownEvent({ virtualKey: 0x1b }); // Esc
    const up = createKeyUpEvent({ virtualKey: 0x0d }); // Enter
    expect(formatMacroEventDisplay(down)).toBe('Esc ↓');
    expect(formatMacroEventDisplay(up)).toBe('Enter ↑');
    expect(sendsInput(down)).toBe(true);
    expect(takesTime(down)).toBe(true);
  });

  it('formats MouseMove with sign formatting', () => {
    const movePos = new MacroEvent({
      type: MacroEventType.MouseMove,
      deltaX: 15,
      deltaY: 20,
    });
    expect(movePos.display).toBe('Mouse movement · X +15, Y +20');

    const moveZero = new MacroEvent({
      type: MacroEventType.MouseMove,
      deltaX: 0,
      deltaY: -5,
    });
    expect(moveZero.display).toBe('Mouse movement · X 0, Y -5');
  });

  it('formats MouseButtonDown and MouseButtonUp', () => {
    const rightDown = new MacroEvent({
      type: MacroEventType.MouseButtonDown,
      button: MouseButton.Right,
    });
    const midUp = new MacroEvent({
      type: MacroEventType.MouseButtonUp,
      button: MouseButton.Middle,
    });
    expect(rightDown.display).toBe('Right mouse button ↓');
    expect(midUp.display).toBe('Middle mouse button ↑');
  });

  it('formats Wheel and HorizontalWheel in both directions', () => {
    const wheelUp = new MacroEvent({ type: MacroEventType.Wheel, wheelDelta: 120 });
    const wheelDown = new MacroEvent({ type: MacroEventType.Wheel, wheelDelta: -120 });
    const hWheelRight = new MacroEvent({ type: MacroEventType.HorizontalWheel, wheelDelta: 120 });
    const hWheelLeft = new MacroEvent({ type: MacroEventType.HorizontalWheel, wheelDelta: -120 });

    expect(wheelUp.display).toBe('Scroll up · 120');
    expect(wheelDown.display).toBe('Scroll down · 120');
    expect(hWheelRight.display).toBe('Scroll right · 120');
    expect(hWheelLeft.display).toBe('Scroll left · 120');
  });

  it('formats Delay as Pause and consumes time without sending input', () => {
    const delay = createDelayEvent({ durationMicroseconds: 500_000 });
    expect(formatMacroEventDisplay(delay)).toBe('Pause');
    expect(sendsInput(delay)).toBe(false);
    expect(takesTime(delay)).toBe(true);
  });

  it('formats OverlayText with and without countdown', () => {
    const withCd = createOverlayTextEvent({
      text: 'Phase 1',
      timeMicroseconds: 2000_000,
      durationMicroseconds: 3000_000,
      showOverlayTiming: true,
    });
    const withoutCd = createOverlayTextEvent({
      text: 'Phase 2',
      timeMicroseconds: 2000_000,
      durationMicroseconds: 3000_000,
      showOverlayTiming: false,
    });

    expect(formatMacroEventDisplay(withCd)).toBe('Text “Phase 1” · until 5000 ms · with countdown');
    expect(formatMacroEventDisplay(withoutCd)).toBe(
      'Text “Phase 2” · until 5000 ms · without countdown',
    );
    expect(sendsInput(withCd)).toBe(false);
    expect(takesTime(withCd)).toBe(false);
    expect(getEventEndTimeMicroseconds(withCd)).toBe(5000_000);
  });

  it('formats Comment rows with fallback and user text', () => {
    const emptyComment = new MacroEvent({ type: MacroEventType.Comment, text: '' });
    const userComment = new MacroEvent({
      type: MacroEventType.Comment,
      text: 'Boss encounter start',
    });

    expect(emptyComment.display).toBe('Comment — double-click to type');
    expect(userComment.display).toBe('Boss encounter start');
    expect(emptyComment.isComment).toBe(true);
    expect(emptyComment.sendsInput).toBe(false);
    expect(emptyComment.takesTime).toBe(false);
  });

  it('formats Gamepad buttons and axes', () => {
    const btnDown = new MacroEvent({
      type: MacroEventType.GamepadButtonDown,
      gamepadButton: GamepadButton.LeftBumper,
    });
    const btnUp = new MacroEvent({
      type: MacroEventType.GamepadButtonUp,
      gamepadButton: GamepadButton.RightBumper,
    });
    const stickAxis = new MacroEvent({
      type: MacroEventType.GamepadAxis,
      gamepadAxis: GamepadAxis.LeftStickX,
      axisValue: -15000,
    });

    expect(btnDown.display).toBe('🎮 LB ↓');
    expect(btnUp.display).toBe('🎮 RB ↑');
    expect(stickAxis.display).toBe('🎮 LS X · -15000');
  });

  it('formats TypeText and truncates long strings at 40 chars', () => {
    const shortText = createTypeTextEvent({ text: 'Hello World' });
    const longText = createTypeTextEvent({
      text: 'The quick brown fox jumps over the lazy dog and runs away into the forest',
    });

    expect(formatMacroEventDisplay(shortText)).toBe('Type text · “Hello World”');
    expect(formatMacroEventDisplay(longText)).toBe(
      'Type text · “The quick brown fox jumps over the lazy …”',
    );
    expect(sendsInput(shortText)).toBe(true);
    expect(takesTime(shortText)).toBe(true);
  });

  it('formats WaitForPixelGone with and without timeout', () => {
    const noTimeout = new MacroEvent({
      type: MacroEventType.WaitForPixelGone,
      pixelX: 100,
      pixelY: 200,
      pixelColor: 0xff0000,
      waitTimeoutMilliseconds: 0,
    });
    const withTimeout = new MacroEvent({
      type: MacroEventType.WaitForPixelGone,
      pixelX: 100,
      pixelY: 200,
      pixelColor: 0xff0000,
      waitTimeoutMilliseconds: 1500,
    });

    expect(noTimeout.display).toBe('Wait for color #FF0000 at X 100, Y 200 to disappear');
    expect(withTimeout.display).toBe(
      'Wait for color #FF0000 at X 100, Y 200 to disappear · timeout 1500 ms',
    );
  });

  it('formats WaitForWindow with window title or process name', () => {
    const withTitle = new MacroEvent({
      type: MacroEventType.WaitForWindow,
      waitProcessName: 'notepad.exe',
      waitWindowTitle: 'Untitled - Notepad',
      waitTimeoutMilliseconds: 0,
    });
    const processOnly = new MacroEvent({
      type: MacroEventType.WaitForWindow,
      waitProcessName: 'game.exe',
      waitWindowTitle: '',
      waitTimeoutMilliseconds: 2000,
    });

    expect(withTitle.display).toBe('Wait for window “Untitled - Notepad”');
    expect(processOnly.display).toBe('Wait for window “game.exe” · timeout 2000 ms');
  });

  it('formats WaitForKey', () => {
    const waitKey = new MacroEvent({
      type: MacroEventType.WaitForKey,
      waitKeyVirtualKey: 0x20, // Space
      waitTimeoutMilliseconds: 5000,
    });
    expect(waitKey.display).toBe('Wait for Space press · timeout 5000 ms');
  });

  it('formats RunMacro', () => {
    const run = new MacroEvent({
      type: MacroEventType.RunMacro,
      subMacroName: 'Combat Combo',
    });
    expect(run.display).toBe('Run macro “Combat Combo”');
    expect(run.sendsInput).toBe(false);
    expect(run.takesTime).toBe(false);
  });
});

describe('Automatic Trigger Detection and Timing', () => {
  it('detects automatic trigger when first action is PixelColorTrigger', () => {
    const macro = createDefaultMacroDefinition({
      events: [
        createPixelColorTriggerEvent({
          pixelX: 10,
          pixelY: 20,
          pixelColor: 0xffffff,
          triggerCooldownMilliseconds: 3000,
        }),
        createKeyDownEvent({ virtualKey: 0x41, timeMicroseconds: 5000 }),
      ],
    });

    expect(isAutomaticTriggerMacro(macro)).toBe(true);
    expect(usesManualHotkey(macro)).toBe(false);
    expect(getMacroHotkeyDisplay(macro)).toBe('Automatic trigger');

    const model = new MacroModel(macro);
    expect(model.isAutomaticTrigger).toBe(true);
    expect(model.usesManualHotkey).toBe(false);
    expect(model.hotkeyDisplay).toBe('Automatic trigger');
  });

  it('ignores leading comment row when detecting automatic trigger (MacroProcessingTests:126)', () => {
    const macro = createDefaultMacroDefinition({
      events: [
        new MacroEvent({
          type: MacroEventType.Comment,
          text: 'Header separator',
          timeMicroseconds: 0,
        }).toEvent(),
        createPixelColorTriggerEvent({
          pixelX: 50,
          pixelY: 100,
          pixelColor: 0x00ff00,
          timeMicroseconds: 0,
        }),
      ],
    });

    expect(isAutomaticTriggerMacro(macro)).toBe(true);
  });

  it('prioritizes wait condition at same timestamp over standard input', () => {
    const macro = createDefaultMacroDefinition({
      events: [
        createKeyDownEvent({ virtualKey: 0x41, timeMicroseconds: 0 }),
        createPixelColorTriggerEvent({
          pixelX: 100,
          pixelY: 200,
          pixelColor: 0x123456,
          timeMicroseconds: 0,
        }),
      ],
    });

    // Wait event order (0) precedes KeyDown (1), so PixelColorTrigger is ordered first
    expect(isAutomaticTriggerMacro(macro)).toBe(true);
  });

  it('evaluates false when first action is keyboard or mouse', () => {
    const macro = createDefaultMacroDefinition({
      events: [
        createKeyDownEvent({ virtualKey: 0x41, timeMicroseconds: 0 }),
        createPixelColorTriggerEvent({
          pixelX: 10,
          pixelY: 20,
          pixelColor: 0xffffff,
          timeMicroseconds: 1000,
        }),
      ],
    });

    expect(isAutomaticTriggerMacro(macro)).toBe(false);
    expect(usesManualHotkey(macro)).toBe(true);
  });

  it('default trigger cooldown is 3000 ms', () => {
    const trigger = createPixelColorTriggerEvent({
      pixelX: 10,
      pixelY: 20,
      pixelColor: 0xff0000,
    });
    expect(trigger.triggerCooldownMilliseconds).toBe(3000);
  });
});

describe('Microsecond Precision & Derived Duration', () => {
  it('calculates duration from maximum end time across actions', () => {
    const macro = createDefaultMacroDefinition({
      events: [
        createKeyDownEvent({ virtualKey: 0x41, timeMicroseconds: 10_000 }),
        createOverlayTextEvent({
          text: 'Overlay banner',
          timeMicroseconds: 20_000,
          durationMicroseconds: 50_000,
        }),
      ],
    });

    // Max end time is 20_000 + 50_000 = 70_000 us
    expect(getMacroDurationMicroseconds(macro)).toBe(70_000);
    expect(getMacroDurationMilliseconds(macro)).toBe(70);

    const model = new MacroModel(macro);
    expect(model.durationMicroseconds).toBe(70_000);
    expect(model.durationMilliseconds).toBe(70);
  });

  it('returns 0 duration for macro with no events', () => {
    const empty = createDefaultMacroDefinition();
    expect(getMacroDurationMicroseconds(empty)).toBe(0);
    expect(getMacroDurationMilliseconds(empty)).toBe(0);
  });

  it('withEventTimeMilliseconds performs exact integer conversion without drift', () => {
    const event = createKeyDownEvent({ virtualKey: 0x41, timeMicroseconds: 0 });
    const updated = withEventTimeMilliseconds(event, 123.456);
    expect(updated.timeMicroseconds).toBe(123456);
  });
});

describe('Hotkey Identity, Modifiers, and Mouse Gestures', () => {
  it('formats all modifier keys in canonical order Ctrl + Alt + Shift + Win', () => {
    const full = createDefaultHotkeyBinding({
      virtualKey: 0x46, // F
      control: true,
      alt: true,
      shift: true,
      windows: true,
    });
    expect(formatHotkeyDisplay(full)).toBe('Ctrl + Alt + Shift + Win + F');
  });

  it('formats wheel up and wheel down bindings', () => {
    const wheelUp = createDefaultHotkeyBinding({
      wheel: WheelDirection.Up,
      control: true,
    });
    const wheelDown = createDefaultHotkeyBinding({
      wheel: WheelDirection.Down,
      shift: true,
    });
    expect(formatHotkeyDisplay(wheelUp)).toBe('Ctrl + Wheel up');
    expect(formatHotkeyDisplay(wheelDown)).toBe('Shift + Wheel down');
  });

  it('formats unassigned hotkey as Not assigned', () => {
    const empty = createDefaultHotkeyBinding();
    expect(formatHotkeyDisplay(empty)).toBe('Not assigned');
  });
});

describe('Playback Speed Clamping Policy', () => {
  it('clamps values below 0.1x to 0.1x and above 10.0x to 10.0x', () => {
    expect(clampPlaybackSpeed(0.05)).toBe(0.1);
    expect(clampPlaybackSpeed(0.1)).toBe(0.1);
    expect(clampPlaybackSpeed(2.5)).toBe(2.5);
    expect(clampPlaybackSpeed(10.0)).toBe(10.0);
    expect(clampPlaybackSpeed(15.0)).toBe(10.0);

    const model = new PlaybackOptionsModel();
    model.speed = 0.01;
    expect(model.speed).toBe(0.1);
    model.speed = 99.9;
    expect(model.speed).toBe(10.0);
  });
});

describe('Timeline Processing, Normalization, Compression, Scaling', () => {
  it('normalizeEvents rounds timestamps to milliseconds and keeps comments anchored', () => {
    const raw = [
      createKeyDownEvent({ virtualKey: 0x41, timeMicroseconds: 10_400 }),
      new MacroEvent({
        type: MacroEventType.Comment,
        text: 'Follows A',
        timeMicroseconds: 10_400,
      }).toEvent(),
      createKeyUpEvent({ virtualKey: 0x41, timeMicroseconds: 20_800 }),
    ];

    const normalized = normalizeEvents(raw);
    expect(normalized[0]!.timeMicroseconds).toBe(10_000);
    expect(normalized[1]!.type).toBe(MacroEventType.Comment);
    expect(normalized[1]!.timeMicroseconds).toBe(10_000);
    expect(normalized[2]!.timeMicroseconds).toBe(21_000);
  });

  it('rebaseEventsToZero rebases first non-comment event to 0 us', () => {
    const events = [
      new MacroEvent({ type: MacroEventType.Comment, text: 'Lead', timeMicroseconds: 0 }).toEvent(),
      createKeyDownEvent({ virtualKey: 0x41, timeMicroseconds: 50_000 }),
      createKeyUpEvent({ virtualKey: 0x41, timeMicroseconds: 75_000 }),
    ];

    const rebased = rebaseEventsToZero(events);
    expect(rebased[0]!.timeMicroseconds).toBe(0); // comment
    expect(rebased[1]!.timeMicroseconds).toBe(0); // first action rebased
    expect(rebased[2]!.timeMicroseconds).toBe(25_000); // interval preserved
  });

  it('compressMouseMoves combines deltas within bucket and preserves clicks', () => {
    const events = [
      new MacroEvent({
        type: MacroEventType.MouseMove,
        deltaX: 5,
        deltaY: 2,
        timeMicroseconds: 1000,
      }).toEvent(),
      new MacroEvent({
        type: MacroEventType.MouseMove,
        deltaX: 3,
        deltaY: 4,
        timeMicroseconds: 3000,
      }).toEvent(),
      createMouseButtonDownEvent({ button: MouseButton.Left, timeMicroseconds: 5000 }),
      new MacroEvent({
        type: MacroEventType.MouseMove,
        deltaX: 10,
        deltaY: 10,
        timeMicroseconds: 6000,
      }).toEvent(),
    ];

    // With 10ms bucket (10,000 us), the first two moves combine into 8, 6
    const compressed = compressMouseMoves(events, 10);
    expect(compressed).toHaveLength(3);
    expect(compressed[0]!.type).toBe(MacroEventType.MouseMove);
    expect((compressed[0] as MouseMoveEvent).deltaX).toBe(8);
    expect((compressed[0] as MouseMoveEvent).deltaY).toBe(6);
    expect(compressed[1]!.type).toBe(MacroEventType.MouseButtonDown);
    expect((compressed[2] as MouseMoveEvent).deltaX).toBe(10);
  });

  it('scaleTime scales timeline by factor and updates modifiedAt', () => {
    const macro = createDefaultMacroDefinition({
      events: [
        createKeyDownEvent({ virtualKey: 0x41, timeMicroseconds: 10_000 }),
        createOverlayTextEvent({
          text: 'Banner',
          timeMicroseconds: 20_000,
          durationMicroseconds: 10_000,
        }),
      ],
    });

    const scaled = scaleTime(macro, 2.0);
    expect(scaled.events[0]!.timeMicroseconds).toBe(20_000);
    expect(scaled.events[1]!.timeMicroseconds).toBe(40_000);
    expect((scaled.events[1] as OverlayTextEvent).durationMicroseconds).toBe(20_000);

    expect(() => scaleTime(macro, 0.05)).toThrow(RangeError);
    expect(() => scaleTime(macro, 15.0)).toThrow(RangeError);
  });

  it('suggestInsertionTime returns anchor time without auto gap', () => {
    const events = [
      createKeyDownEvent({ virtualKey: 0x41, timeMicroseconds: 10_000 }),
      createKeyUpEvent({ virtualKey: 0x41, timeMicroseconds: 20_000 }),
    ];
    expect(suggestInsertionTime(events)).toBe(20_000);
    expect(suggestInsertionTime(events, events[0])).toBe(10_000);
    expect(suggestInsertionTime([])).toBe(0);
  });

  it('orderLibraryMacros puts enabled macros before disabled ones', () => {
    const m1 = createDefaultMacroDefinition({
      isEnabled: false,
      modifiedAt: '2026-09-01T00:00:00Z',
    });
    const m2 = createDefaultMacroDefinition({
      isEnabled: true,
      modifiedAt: '2026-08-01T00:00:00Z',
    });
    const m3 = createDefaultMacroDefinition({
      isEnabled: true,
      modifiedAt: '2026-09-10T00:00:00Z',
    });

    const ordered = orderLibraryMacros([m1, m2, m3]);
    expect(ordered[0]!.id).toBe(m3.id); // enabled, newer
    expect(ordered[1]!.id).toBe(m2.id); // enabled, older
    expect(ordered[2]!.id).toBe(m1.id); // disabled
  });
});

describe('Diagnostics & Timing Statistics', () => {
  it('calculates jitter, confirmation, and timing summary accurately', () => {
    const receipts = [
      createDispatchReceipt({
        eventId: crypto.randomUUID(),
        scheduledMicroseconds: 100_000,
        dispatchStartedMicroseconds: 102_000,
        dispatchCompletedMicroseconds: 103_000,
        hookConfirmedMicroseconds: 104_500,
        success: true,
      }),
      createDispatchReceipt({
        eventId: crypto.randomUUID(),
        scheduledMicroseconds: 200_000,
        dispatchStartedMicroseconds: 205_000,
        dispatchCompletedMicroseconds: 206_000,
        hookConfirmedMicroseconds: null,
        success: true,
      }),
      createDispatchReceipt({
        eventId: crypto.randomUUID(),
        scheduledMicroseconds: 300_000,
        dispatchStartedMicroseconds: 310_000,
        dispatchCompletedMicroseconds: 311_000,
        hookConfirmedMicroseconds: 315_000,
        success: false,
        error: 'Target window closed',
      }),
    ];

    expect(receipts[0]!.dispatchJitterMilliseconds).toBe(2);
    expect(receipts[0]!.confirmationMilliseconds).toBe(2.5);

    const summary = calculateTimingStatistics(receipts);
    expect(summary.count).toBe(3);
    expect(summary.failed).toBe(1);
    expect(summary.unconfirmed).toBe(1);
    expect(summary.meanMs).toBeCloseTo((2 + 5 + 10) / 3, 2);
    expect(summary.maxMs).toBe(10);
  });

  it('formats scheduledDisplayMilliseconds with planned jitter', () => {
    const plain = createDispatchReceipt({
      eventId: crypto.randomUUID(),
      scheduledMicroseconds: 300_000,
      dispatchStartedMicroseconds: 301_000,
      dispatchCompletedMicroseconds: 302_000,
      success: true,
    });
    expect(getReceiptScheduledDisplayMilliseconds(plain)).toBe('300');

    const jittered = createDispatchReceipt({
      eventId: crypto.randomUUID(),
      scheduledMicroseconds: 300_000,
      plannedMicroseconds: 304_000,
      dispatchStartedMicroseconds: 304_500,
      dispatchCompletedMicroseconds: 305_000,
      success: true,
    });
    expect(getReceiptScheduledDisplayMilliseconds(jittered)).toBe('300 (304)');
  });
});

describe('Cloning, Validation, and Forward Compatibility', () => {
  it('preserves unknown future fields through clone and serialization', () => {
    const macroWithUnknown = createDefaultMacroDefinition({
      unknownFields: {
        FutureFeatureFlag: true,
        ExperimentalTimeoutSeconds: 42,
      },
    });

    const cloned = cloneMacroDefinition(macroWithUnknown);
    expect(cloned.unknownFields).toEqual({
      FutureFeatureFlag: true,
      ExperimentalTimeoutSeconds: 42,
    });

    const model = new MacroModel(cloned);
    expect(model.unknownFields).toEqual({
      FutureFeatureFlag: true,
      ExperimentalTimeoutSeconds: 42,
    });
    expect(model.toDefinition().unknownFields).toEqual({
      FutureFeatureFlag: true,
      ExperimentalTimeoutSeconds: 42,
    });
  });

  it('validates macro definitions and rejects future schema versions (>12)', () => {
    const valid = createDefaultMacroDefinition();
    expect(validateMacroDefinition(valid).success).toBe(true);

    const future = {
      ...valid,
      schemaVersion: 13,
    };
    const invalidRes = validateMacroDefinition(future);
    expect(invalidRes.success).toBe(false);
  });

  it('clones macro events, hotkeys, and options deeply and immutably', () => {
    const event = createKeyDownEvent({ virtualKey: 0x41, timeMicroseconds: 1000 });
    const clonedEvent = cloneMacroEvent(event);
    expect(clonedEvent).toEqual(event);
    expect(clonedEvent).not.toBe(event);

    const hotkey = createDefaultHotkeyBinding({ shift: true, virtualKey: 0x42 });
    const clonedHotkey = cloneHotkeyBinding(hotkey);
    expect(clonedHotkey).toEqual(hotkey);
    expect(clonedHotkey).not.toBe(hotkey);

    const options = createDefaultPlaybackOptions({ repeatCount: 5, speed: 2.0 });
    const clonedOptions = clonePlaybackOptions(options);
    expect(clonedOptions).toEqual(options);
    expect(clonedOptions).not.toBe(options);
  });

  it('validates events, hotkeys, and options', () => {
    const event = createKeyDownEvent({ virtualKey: 0x41 });
    expect(validateMacroEvent(event).success).toBe(true);

    const hotkey = createDefaultHotkeyBinding({ shift: true, virtualKey: 0x42 });
    expect(validateHotkeyBinding(hotkey).success).toBe(true);

    const options = createDefaultPlaybackOptions({ repeatCount: 3 });
    expect(validatePlaybackOptions(options).success).toBe(true);
  });

  it('validates models and helper functions', () => {
    const recDefaults = createDefaultRecordingOptions();
    expect(recDefaults.keyboard).toBe(true);
    const recModel = new RecordingOptionsModel(recDefaults);
    expect(recModel.keyboard).toBe(true);
    expect(recModel.Keyboard).toBe(true);

    const hotkeyModel = new HotkeyBindingModel({ virtualKey: 0x41, control: true });
    expect(hotkeyModel.virtualKey).toBe(0x41);

    const eventModel = new MacroEventModel(createKeyDownEvent({ virtualKey: 0x41 }));
    expect(eventModel.virtualKey).toBe(0x41);

    const receiptModel = new DispatchReceiptModel(
      crypto.randomUUID(),
      1000,
      1005,
      1010,
      null,
      true,
      null,
    );
    expect(receiptModel.scheduledMilliseconds).toBe(1);

    const opt = createDefaultPlaybackOptions({ repeatCount: 4 });
    expect(isRepeatForever(opt)).toBe(false);
    const updatedCount = applyRepeatCount(opt, 10);
    expect(updatedCount.options.repeatCount).toBe(10);
    expect(updatedCount.lastFiniteRepeatCount).toBe(10);

    expect(formatMilliseconds(12.3456)).toBe('12.346');
    expect(getVirtualKeyName(0x41)).toBe('A');

    const visibility = resolveMacroOverlayVisibility(
      { playback: opt },
      { showInfoCard: true, showCustomText: false },
    );
    expect(visibility.showInfoCard).toBe(true);
    expect(visibility.showCustomText).toBe(false);
  });
});
