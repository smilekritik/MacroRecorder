import { describe, it, expect } from 'vitest';
import {
  ACTION_OPTIONS,
  createDefaultActionFormData,
  GAMEPAD_AXIS_OPTIONS,
  GAMEPAD_BUTTON_OPTIONS,
  getManualActionTypeFromEvent,
  MOUSE_BUTTON_OPTIONS,
} from '../action-categories.js';
import { ManualActionCategory } from '../types.js';
import {
  createCommentEvent,
  createDelayEvent,
  createKeyDownEvent,
  createKeyUpEvent,
  createMouseButtonDownEvent,
  createMouseButtonUpEvent,
  createMouseMoveEvent,
  createOverlayTextEvent,
  createPixelColorTriggerEvent,
  createRunMacroEvent,
  createTypeTextEvent,
  createWaitForPixelGoneEvent,
  createWheelEvent,
  createHorizontalWheelEvent,
  createGamepadButtonDownEvent,
  createGamepadButtonUpEvent,
  createGamepadAxisEvent,
  createWaitForWindowEvent,
  createWaitForKeyEvent,
} from '../../../../../../../packages/domain/src/model/index.js';
import { ManualActionType } from '../../../../../../../packages/domain/src/timeline/types.js';
import {
  GamepadAxis,
  GamepadButton,
  MouseButton,
} from '../../../../../../../packages/contracts/src/index.js';

describe('Action categories and definitions', () => {
  it('defines exactly 22 action types across 8 categories', () => {
    expect(ACTION_OPTIONS.length).toBe(22);

    const categories = new Set(ACTION_OPTIONS.map((opt) => opt.category));
    expect(categories.size).toBe(8);
    expect(categories.has(ManualActionCategory.Keyboard)).toBe(true);
    expect(categories.has(ManualActionCategory.Mouse)).toBe(true);
    expect(categories.has(ManualActionCategory.Gamepad)).toBe(true);
    expect(categories.has(ManualActionCategory.TriggersAndConditions)).toBe(true);
    expect(categories.has(ManualActionCategory.FlowControl)).toBe(true);
    expect(categories.has(ManualActionCategory.PauseAndTiming)).toBe(true);
    expect(categories.has(ManualActionCategory.TextAndOverlay)).toBe(true);
    expect(categories.has(ManualActionCategory.Notes)).toBe(true);
  });

  it('provides all 5 standard mouse buttons', () => {
    expect(MOUSE_BUTTON_OPTIONS.length).toBe(5);
    const buttons = MOUSE_BUTTON_OPTIONS.map((b) => b.button);
    expect(buttons).toEqual([
      MouseButton.Left,
      MouseButton.Right,
      MouseButton.Middle,
      MouseButton.X1,
      MouseButton.X2,
    ]);
  });

  it('provides all 15 gamepad buttons and 6 gamepad axes', () => {
    expect(GAMEPAD_BUTTON_OPTIONS.length).toBe(15);
    expect(GAMEPAD_AXIS_OPTIONS.length).toBe(6);
    expect(GAMEPAD_BUTTON_OPTIONS.some((b) => b.button === GamepadButton.A)).toBe(true);
    expect(GAMEPAD_AXIS_OPTIONS.some((a) => a.axis === GamepadAxis.LeftStickX)).toBe(true);
  });

  it('maps existing MacroEvent to corresponding ManualActionType', () => {
    expect(getManualActionTypeFromEvent(createKeyDownEvent({ virtualKey: 65 }))).toBe(
      ManualActionType.KeyDown,
    );
    expect(getManualActionTypeFromEvent(createKeyUpEvent({ virtualKey: 65 }))).toBe(
      ManualActionType.KeyUp,
    );
    expect(getManualActionTypeFromEvent(createMouseButtonDownEvent({ button: MouseButton.Left }))).toBe(
      ManualActionType.MouseDown,
    );
    expect(getManualActionTypeFromEvent(createMouseButtonUpEvent({ button: MouseButton.Left }))).toBe(
      ManualActionType.MouseUp,
    );
    expect(getManualActionTypeFromEvent(createMouseMoveEvent({ deltaX: 10, deltaY: 20 }))).toBe(
      ManualActionType.MouseMove,
    );
    expect(getManualActionTypeFromEvent(createWheelEvent({ wheelDelta: 120 }))).toBe(
      ManualActionType.Wheel,
    );
    expect(getManualActionTypeFromEvent(createHorizontalWheelEvent({ wheelDelta: 120 }))).toBe(
      ManualActionType.HorizontalWheel,
    );
    expect(getManualActionTypeFromEvent(createTypeTextEvent({ text: 'test' }))).toBe(
      ManualActionType.TypeText,
    );
    expect(getManualActionTypeFromEvent(createOverlayTextEvent({ text: 'overlay' }))).toBe(
      ManualActionType.OverlayText,
    );
    expect(getManualActionTypeFromEvent(createPixelColorTriggerEvent({ pixelX: 10, pixelY: 20, pixelColor: 0xff0000 }))).toBe(
      ManualActionType.PixelColorTrigger,
    );
    expect(getManualActionTypeFromEvent(createWaitForPixelGoneEvent({ pixelX: 10, pixelY: 20, pixelColor: 0xff0000 }))).toBe(
      ManualActionType.WaitForPixelGone,
    );
    expect(getManualActionTypeFromEvent(createWaitForWindowEvent({ waitProcessName: 'notepad.exe' }))).toBe(
      ManualActionType.WaitForWindow,
    );
    expect(getManualActionTypeFromEvent(createWaitForKeyEvent({ waitKeyVirtualKey: 13 }))).toBe(
      ManualActionType.WaitForKey,
    );
    expect(getManualActionTypeFromEvent(createRunMacroEvent({ subMacroName: 'sub' }))).toBe(
      ManualActionType.RunMacro,
    );
    expect(getManualActionTypeFromEvent(createCommentEvent({ text: 'note' }))).toBe(
      ManualActionType.Comment,
    );
    expect(getManualActionTypeFromEvent(createDelayEvent({ durationMicroseconds: 50000 }))).toBe(
      ManualActionType.Delay,
    );
    expect(getManualActionTypeFromEvent(createGamepadButtonDownEvent({ gamepadButton: GamepadButton.A }))).toBe(
      ManualActionType.GamepadButtonDown,
    );
    expect(getManualActionTypeFromEvent(createGamepadButtonUpEvent({ gamepadButton: GamepadButton.A }))).toBe(
      ManualActionType.GamepadButtonUp,
    );
    expect(getManualActionTypeFromEvent(createGamepadAxisEvent({ gamepadAxis: GamepadAxis.LeftStickX, axisValue: 1000 }))).toBe(
      ManualActionType.GamepadAxis,
    );
  });

  it('populates default action form data from existing event', () => {
    const original = createKeyDownEvent({
      timeMicroseconds: 120000,
      virtualKey: 0x41,
      comment: 'test comment',
    });
    const formData = createDefaultActionFormData(0, original);
    expect(formData.type).toBe(ManualActionType.KeyDown);
    expect(formData.startTimeMs).toBe('120');
    expect(formData.virtualKey).toBe(0x41);
    expect(formData.actionComment).toBe('test comment');
  });
});
