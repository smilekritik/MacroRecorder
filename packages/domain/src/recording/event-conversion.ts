/**
 * Conversion of native Windows keyboard, mouse, raw input, and gamepad hook events
 * into normalized platform-neutral MacroEvent domain structures.
 */

import {
  type NativeKeyboardHookEvent,
  type NativeMouseHookEvent,
  type NativeRawInputEvent,
  type NativeGamepadStateEvent,
} from '../../../contracts/src/index.js';
import { type MacroEvent, type GamepadButton, type GamepadAxis } from '../model/types.js';
import {
  createKeyDownEvent,
  createKeyUpEvent,
  createMouseMoveEvent,
  createMouseButtonDownEvent,
  createMouseButtonUpEvent,
  createWheelEvent,
  createHorizontalWheelEvent,
  createGamepadButtonDownEvent,
  createGamepadButtonUpEvent,
  createGamepadAxisEvent,
} from '../model/index.js';

/**
 * Win32 Raw Input mouse button flags from winuser.h (RI_MOUSE_*).
 */
export const RAW_INPUT_MOUSE_FLAGS = {
  LEFT_BUTTON_DOWN: 0x0001,
  LEFT_BUTTON_UP: 0x0002,
  RIGHT_BUTTON_DOWN: 0x0004,
  RIGHT_BUTTON_UP: 0x0008,
  MIDDLE_BUTTON_DOWN: 0x0010,
  MIDDLE_BUTTON_UP: 0x0020,
  BUTTON_4_DOWN: 0x0040,
  BUTTON_4_UP: 0x0080,
  BUTTON_5_DOWN: 0x0100,
  BUTTON_5_UP: 0x0200,
  WHEEL: 0x0400,
  HORIZONTAL_WHEEL: 0x0800,
} as const;

/**
 * Gamepad bitmask flags matching XInput and ViGEm XUSB mask format.
 */
export const GAMEPAD_BITS = {
  DPadUp: 0x0001,
  DPadDown: 0x0002,
  DPadLeft: 0x0004,
  DPadRight: 0x0008,
  Start: 0x0010,
  Back: 0x0020,
  LeftStick: 0x0040,
  RightStick: 0x0080,
  LeftBumper: 0x0100,
  RightBumper: 0x0200,
  Guide: 0x0400,
  A: 0x1000,
  B: 0x2000,
  X: 0x4000,
  Y: 0x8000,
} as const;

/**
 * Gamepad button list in canonical diffing order.
 */
export const ALL_GAMEPAD_BUTTONS: readonly (readonly [GamepadButton, number])[] = [
  ['A', GAMEPAD_BITS.A],
  ['B', GAMEPAD_BITS.B],
  ['X', GAMEPAD_BITS.X],
  ['Y', GAMEPAD_BITS.Y],
  ['LeftBumper', GAMEPAD_BITS.LeftBumper],
  ['RightBumper', GAMEPAD_BITS.RightBumper],
  ['Back', GAMEPAD_BITS.Back],
  ['Start', GAMEPAD_BITS.Start],
  ['Guide', GAMEPAD_BITS.Guide],
  ['LeftStick', GAMEPAD_BITS.LeftStick],
  ['RightStick', GAMEPAD_BITS.RightStick],
  ['DPadUp', GAMEPAD_BITS.DPadUp],
  ['DPadDown', GAMEPAD_BITS.DPadDown],
  ['DPadLeft', GAMEPAD_BITS.DPadLeft],
  ['DPadRight', GAMEPAD_BITS.DPadRight],
];

/**
 * Converts a low-level keyboard hook event into a domain MacroEvent.
 * Drops injected events to prevent synthetic playback loops.
 * Strictly preserves virtualKey, scanCode, and extended flags.
 */
export function convertKeyboardHookEvent(event: NativeKeyboardHookEvent): MacroEvent | null {
  if (event.isInjected) {
    return null;
  }

  if (event.eventType === 'KeyDown') {
    return createKeyDownEvent({
      virtualKey: event.virtualKey,
      scanCode: event.scanCode,
      extended: event.extended,
      timeMicroseconds: 0,
    });
  }

  return createKeyUpEvent({
    virtualKey: event.virtualKey,
    scanCode: event.scanCode,
    extended: event.extended,
    timeMicroseconds: 0,
  });
}

/**
 * Converts a low-level mouse hook event into a domain MacroEvent.
 * Drops injected events.
 */
export function convertMouseHookEvent(event: NativeMouseHookEvent): MacroEvent | null {
  if (event.isInjected) {
    return null;
  }

  switch (event.eventType) {
    case 'MouseMove':
      return createMouseMoveEvent({
        deltaX: event.x,
        deltaY: event.y,
        absoluteMove: false,
        timeMicroseconds: 0,
      });

    case 'MouseButtonDown':
      return createMouseButtonDownEvent({
        button: event.button,
        timeMicroseconds: 0,
      });

    case 'MouseButtonUp':
      return createMouseButtonUpEvent({
        button: event.button,
        timeMicroseconds: 0,
      });

    case 'Wheel':
      return createWheelEvent({
        wheelDelta: event.wheelDelta,
        timeMicroseconds: 0,
      });

    case 'HorizontalWheel':
      return createHorizontalWheelEvent({
        wheelDelta: event.wheelDelta,
        timeMicroseconds: 0,
      });

    default:
      return null;
  }
}

/**
 * Converts a Win32 Raw Input mouse event (WM_INPUT) into domain events.
 * Captures true physical relative deltas direct from hardware without screen clamping.
 */
export function convertRawInputEvent(
  event: NativeRawInputEvent,
  wheelDelta = 0,
  horizontalWheelDelta = 0,
): MacroEvent[] {
  const events: MacroEvent[] = [];

  // Physical mouse movement deltas
  if (event.deltaX !== 0 || event.deltaY !== 0) {
    events.push(
      createMouseMoveEvent({
        deltaX: event.deltaX,
        deltaY: event.deltaY,
        absoluteMove: false,
        timeMicroseconds: 0,
      }),
    );
  }

  const f = event.buttonFlags;

  // Left button
  if ((f & RAW_INPUT_MOUSE_FLAGS.LEFT_BUTTON_DOWN) !== 0) {
    events.push(createMouseButtonDownEvent({ button: 'Left', timeMicroseconds: 0 }));
  }
  if ((f & RAW_INPUT_MOUSE_FLAGS.LEFT_BUTTON_UP) !== 0) {
    events.push(createMouseButtonUpEvent({ button: 'Left', timeMicroseconds: 0 }));
  }

  // Right button
  if ((f & RAW_INPUT_MOUSE_FLAGS.RIGHT_BUTTON_DOWN) !== 0) {
    events.push(createMouseButtonDownEvent({ button: 'Right', timeMicroseconds: 0 }));
  }
  if ((f & RAW_INPUT_MOUSE_FLAGS.RIGHT_BUTTON_UP) !== 0) {
    events.push(createMouseButtonUpEvent({ button: 'Right', timeMicroseconds: 0 }));
  }

  // Middle button
  if ((f & RAW_INPUT_MOUSE_FLAGS.MIDDLE_BUTTON_DOWN) !== 0) {
    events.push(createMouseButtonDownEvent({ button: 'Middle', timeMicroseconds: 0 }));
  }
  if ((f & RAW_INPUT_MOUSE_FLAGS.MIDDLE_BUTTON_UP) !== 0) {
    events.push(createMouseButtonUpEvent({ button: 'Middle', timeMicroseconds: 0 }));
  }

  // X1 button (Button 4)
  if ((f & RAW_INPUT_MOUSE_FLAGS.BUTTON_4_DOWN) !== 0) {
    events.push(createMouseButtonDownEvent({ button: 'X1', timeMicroseconds: 0 }));
  }
  if ((f & RAW_INPUT_MOUSE_FLAGS.BUTTON_4_UP) !== 0) {
    events.push(createMouseButtonUpEvent({ button: 'X1', timeMicroseconds: 0 }));
  }

  // X2 button (Button 5)
  if ((f & RAW_INPUT_MOUSE_FLAGS.BUTTON_5_DOWN) !== 0) {
    events.push(createMouseButtonDownEvent({ button: 'X2', timeMicroseconds: 0 }));
  }
  if ((f & RAW_INPUT_MOUSE_FLAGS.BUTTON_5_UP) !== 0) {
    events.push(createMouseButtonUpEvent({ button: 'X2', timeMicroseconds: 0 }));
  }

  // Wheel
  if ((f & RAW_INPUT_MOUSE_FLAGS.WHEEL) !== 0 && wheelDelta !== 0) {
    events.push(createWheelEvent({ wheelDelta, timeMicroseconds: 0 }));
  }

  // Horizontal Wheel
  if ((f & RAW_INPUT_MOUSE_FLAGS.HORIZONTAL_WHEEL) !== 0 && horizontalWheelDelta !== 0) {
    events.push(
      createHorizontalWheelEvent({ wheelDelta: horizontalWheelDelta, timeMicroseconds: 0 }),
    );
  }

  return events;
}

/**
 * State container for diffing gamepad polled readings.
 */
interface GamepadSlotState {
  connected: boolean;
  prevButtons: number;
  lastAxes: Map<GamepadAxis, number>;
  pressedButtons: Set<GamepadButton>;
}

/**
 * Stateful tracker that diffs consecutive native gamepad state events into
 * discrete GamepadButtonDown, GamepadButtonUp, and GamepadAxis domain events.
 *
 * Enforces:
 * - Deadzone filtering: stick deadzone = 7000, trigger threshold = 30
 * - Step thresholds: stick change >= 1500, trigger change >= 8, or returning to 0 (release)
 * - Safe disconnect releases: dispatches ButtonUp for held inputs if controller disconnects
 */
export class GamepadStateDiffTracker {
  private static readonly STICK_DEADZONE = 7000;
  private static readonly TRIGGER_THRESHOLD = 30;
  private static readonly STICK_STEP = 1500;
  private static readonly TRIGGER_STEP = 8;

  private readonly slots = new Map<number, GamepadSlotState>();

  private getSlotState(slot: number): GamepadSlotState {
    let state = this.slots.get(slot);
    if (!state) {
      state = {
        connected: false,
        prevButtons: 0,
        lastAxes: new Map(),
        pressedButtons: new Set(),
      };
      this.slots.set(slot, state);
    }
    return state;
  }

  reset(): void {
    this.slots.clear();
  }

  diff(event: NativeGamepadStateEvent): MacroEvent[] {
    const state = this.getSlotState(event.slot);
    const events: MacroEvent[] = [];

    if (!event.connected) {
      if (state.connected) {
        // Disconnected: release any pressed buttons
        for (const button of state.pressedButtons) {
          events.push(
            createGamepadButtonUpEvent({
              gamepadButton: button,
              padIndex: event.slot,
              timeMicroseconds: 0,
            }),
          );
        }
        state.pressedButtons.clear();
        state.prevButtons = 0;
        state.lastAxes.clear();
        state.connected = false;
      }
      return events;
    }

    state.connected = true;

    // Diff buttons
    if (state.prevButtons !== event.buttons) {
      for (const [button, flag] of ALL_GAMEPAD_BUTTONS) {
        const wasPressed = (state.prevButtons & flag) !== 0;
        const isPressed = (event.buttons & flag) !== 0;

        if (!wasPressed && isPressed) {
          state.pressedButtons.add(button);
          events.push(
            createGamepadButtonDownEvent({
              gamepadButton: button,
              padIndex: event.slot,
              timeMicroseconds: 0,
            }),
          );
        } else if (wasPressed && !isPressed) {
          state.pressedButtons.delete(button);
          events.push(
            createGamepadButtonUpEvent({
              gamepadButton: button,
              padIndex: event.slot,
              timeMicroseconds: 0,
            }),
          );
        }
      }
      state.prevButtons = event.buttons;
    }

    // Diff axes
    this.diffAxis(
      events,
      state,
      event.slot,
      'LeftStickX',
      this.applyStickDeadzone(event.leftX),
      GamepadStateDiffTracker.STICK_STEP,
    );
    this.diffAxis(
      events,
      state,
      event.slot,
      'LeftStickY',
      this.applyStickDeadzone(event.leftY),
      GamepadStateDiffTracker.STICK_STEP,
    );
    this.diffAxis(
      events,
      state,
      event.slot,
      'RightStickX',
      this.applyStickDeadzone(event.rightX),
      GamepadStateDiffTracker.STICK_STEP,
    );
    this.diffAxis(
      events,
      state,
      event.slot,
      'RightStickY',
      this.applyStickDeadzone(event.rightY),
      GamepadStateDiffTracker.STICK_STEP,
    );
    this.diffAxis(
      events,
      state,
      event.slot,
      'LeftTrigger',
      this.applyTriggerThreshold(event.leftTrigger),
      GamepadStateDiffTracker.TRIGGER_STEP,
    );
    this.diffAxis(
      events,
      state,
      event.slot,
      'RightTrigger',
      this.applyTriggerThreshold(event.rightTrigger),
      GamepadStateDiffTracker.TRIGGER_STEP,
    );

    return events;
  }

  private diffAxis(
    events: MacroEvent[],
    state: GamepadSlotState,
    slot: number,
    axis: GamepadAxis,
    value: number,
    step: number,
  ): void {
    const last = state.lastAxes.get(axis) ?? 0;
    // Emit if noticeable step change, or if returning to rest (0) to register release
    if (Math.abs(value - last) < step && !(value === 0 && last !== 0)) {
      return;
    }
    state.lastAxes.set(axis, value);
    events.push(
      createGamepadAxisEvent({
        gamepadAxis: axis,
        axisValue: value,
        padIndex: slot,
        timeMicroseconds: 0,
      }),
    );
  }

  private applyStickDeadzone(value: number): number {
    return Math.abs(value) < GamepadStateDiffTracker.STICK_DEADZONE ? 0 : value;
  }

  private applyTriggerThreshold(value: number): number {
    return value < GamepadStateDiffTracker.TRIGGER_THRESHOLD ? 0 : value;
  }
}
