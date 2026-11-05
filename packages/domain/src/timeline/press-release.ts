/**
 * Press-release pair synthesis, hold duration management, and manual action factories.
 */

import {
  createCommentEvent,
  createDelayEvent,
  createGamepadAxisEvent,
  createGamepadButtonDownEvent,
  createGamepadButtonUpEvent,
  createHorizontalWheelEvent,
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
  createWaitForKeyEvent,
  createWaitForWindowEvent,
  createWheelEvent,
} from '../model/event.js';
import {
  type GamepadPressPairOptions,
  type KeyPressPairOptions,
  ManualActionType,
  type ManualActionParams,
  type ManualActionResult,
  type MouseClickPairOptions,
} from './types.js';
import type { Guid, MacroEvent, Microseconds } from '../model/types.js';
import { GamepadAxis, GamepadButton, MouseButton } from '../model/types.js';

/** Default key and button press hold duration in microseconds (50 ms). */
export const DEFAULT_HOLD_DURATION_MICROSECONDS: Microseconds = 50_000;

/**
 * Creates an automatic press-release pair for a keyboard key or extra mouse button
 * separated by the configured hold duration.
 */
export function createKeyPressPair(options: KeyPressPairOptions): [MacroEvent, MacroEvent] {
  const start = Math.max(0, Math.round(options.startTimeMicroseconds ?? 0));
  const hold = Math.max(
    0,
    Math.round(options.holdDurationMicroseconds ?? DEFAULT_HOLD_DURATION_MICROSECONDS),
  );
  const idDown = options.idDown ?? (crypto.randomUUID() as Guid);
  const idUp = options.idUp ?? (crypto.randomUUID() as Guid);
  const comment = options.comment ?? '';

  if (options.mouseButton !== undefined && options.mouseButton !== MouseButton.None) {
    const down = createMouseButtonDownEvent({
      id: idDown,
      timeMicroseconds: start,
      button: options.mouseButton,
      comment,
    });
    const up = createMouseButtonUpEvent({
      id: idUp,
      timeMicroseconds: start + hold,
      button: options.mouseButton,
      comment: '',
    });
    return [down, up];
  }

  const virtualKey = options.virtualKey ?? 0;
  const scanCode = options.scanCode ?? 0;
  const extended = options.extended ?? false;

  const down = createKeyDownEvent({
    id: idDown,
    timeMicroseconds: start,
    virtualKey,
    scanCode,
    extended,
    comment,
  });
  const up = createKeyUpEvent({
    id: idUp,
    timeMicroseconds: start + hold,
    virtualKey,
    scanCode,
    extended,
    comment: '',
  });
  return [down, up];
}

/**
 * Creates an automatic press-release pair for a mouse button separated by hold duration.
 */
export function createMouseClickPair(options: MouseClickPairOptions): [MacroEvent, MacroEvent] {
  const start = Math.max(0, Math.round(options.startTimeMicroseconds ?? 0));
  const hold = Math.max(
    0,
    Math.round(options.holdDurationMicroseconds ?? DEFAULT_HOLD_DURATION_MICROSECONDS),
  );
  const idDown = options.idDown ?? (crypto.randomUUID() as Guid);
  const idUp = options.idUp ?? (crypto.randomUUID() as Guid);
  const comment = options.comment ?? '';

  const down = createMouseButtonDownEvent({
    id: idDown,
    timeMicroseconds: start,
    button: options.button,
    comment,
  });
  const up = createMouseButtonUpEvent({
    id: idUp,
    timeMicroseconds: start + hold,
    button: options.button,
    comment: '',
  });
  return [down, up];
}

/**
 * Creates an automatic press-release pair for a gamepad button separated by hold duration.
 */
export function createGamepadPressPair(options: GamepadPressPairOptions): [MacroEvent, MacroEvent] {
  const start = Math.max(0, Math.round(options.startTimeMicroseconds ?? 0));
  const hold = Math.max(
    0,
    Math.round(options.holdDurationMicroseconds ?? DEFAULT_HOLD_DURATION_MICROSECONDS),
  );
  const idDown = options.idDown ?? (crypto.randomUUID() as Guid);
  const idUp = options.idUp ?? (crypto.randomUUID() as Guid);
  const comment = options.comment ?? '';

  const padIndex = options.padIndex ?? options.gamepadIndex;
  const down = createGamepadButtonDownEvent({
    id: idDown,
    timeMicroseconds: start,
    gamepadButton: options.button,
    ...(padIndex !== undefined ? { padIndex } : {}),
    comment,
  });
  const up = createGamepadButtonUpEvent({
    id: idUp,
    timeMicroseconds: start + hold,
    gamepadButton: options.button,
    ...(padIndex !== undefined ? { padIndex } : {}),
    comment: '',
  });
  return [down, up];
}

/**
 * Synthesizes manual action events from user input parameters matching AddActionWindow options.
 * Calculates timeline shift bounds and handles single actions, pauses, comments, and press-release pairs.
 */
export function createManualActionEvents(params: ManualActionParams): ManualActionResult {
  const start = Math.max(0, Math.round(params.startTimeMicroseconds ?? 0));
  const comment = params.comment ?? '';

  let events: MacroEvent[] = [];

  switch (params.type) {
    case ManualActionType.KeyPress: {
      events = createKeyPressPair({
        virtualKey: params.virtualKey,
        scanCode: params.scanCode,
        extended: params.extended,
        mouseButton: params.mouseButton,
        startTimeMicroseconds: start,
        holdDurationMicroseconds: params.durationMicroseconds ?? DEFAULT_HOLD_DURATION_MICROSECONDS,
        comment,
      });
      break;
    }

    case ManualActionType.KeyDown: {
      if (params.mouseButton !== undefined && params.mouseButton !== MouseButton.None) {
        events = [
          createMouseButtonDownEvent({
            timeMicroseconds: start,
            button: params.mouseButton,
            comment,
          }),
        ];
      } else {
        events = [
          createKeyDownEvent({
            timeMicroseconds: start,
            virtualKey: params.virtualKey ?? 0,
            scanCode: params.scanCode ?? 0,
            extended: params.extended ?? false,
            comment,
          }),
        ];
      }
      break;
    }

    case ManualActionType.KeyUp: {
      if (params.mouseButton !== undefined && params.mouseButton !== MouseButton.None) {
        events = [
          createMouseButtonUpEvent({
            timeMicroseconds: start,
            button: params.mouseButton,
            comment,
          }),
        ];
      } else {
        events = [
          createKeyUpEvent({
            timeMicroseconds: start,
            virtualKey: params.virtualKey ?? 0,
            scanCode: params.scanCode ?? 0,
            extended: params.extended ?? false,
            comment,
          }),
        ];
      }
      break;
    }

    case ManualActionType.MouseClick: {
      events = createMouseClickPair({
        button: params.mouseButton ?? MouseButton.Left,
        startTimeMicroseconds: start,
        holdDurationMicroseconds: params.durationMicroseconds ?? DEFAULT_HOLD_DURATION_MICROSECONDS,
        comment,
      });
      break;
    }

    case ManualActionType.MouseDown: {
      events = [
        createMouseButtonDownEvent({
          timeMicroseconds: start,
          button: params.mouseButton ?? MouseButton.Left,
          comment,
        }),
      ];
      break;
    }

    case ManualActionType.MouseUp: {
      events = [
        createMouseButtonUpEvent({
          timeMicroseconds: start,
          button: params.mouseButton ?? MouseButton.Left,
          comment,
        }),
      ];
      break;
    }

    case ManualActionType.MouseMove: {
      events = [
        createMouseMoveEvent({
          timeMicroseconds: start,
          deltaX: params.deltaX ?? 0,
          deltaY: params.deltaY ?? 0,
          comment,
        }),
      ];
      break;
    }

    case ManualActionType.Wheel: {
      events = [
        createWheelEvent({
          timeMicroseconds: start,
          wheelDelta: params.wheelDelta ?? 120,
          comment,
        }),
      ];
      break;
    }

    case ManualActionType.HorizontalWheel: {
      events = [
        createHorizontalWheelEvent({
          timeMicroseconds: start,
          wheelDelta: params.wheelDelta ?? 120,
          comment,
        }),
      ];
      break;
    }

    case ManualActionType.TypeText: {
      events = [
        createTypeTextEvent({
          timeMicroseconds: start,
          text: params.text ?? '',
          comment,
        }),
      ];
      break;
    }

    case ManualActionType.OverlayText: {
      const duration = Math.max(0, Math.round(params.durationMicroseconds ?? 1_000_000));
      events = [
        createOverlayTextEvent({
          timeMicroseconds: start,
          text: params.text ?? '',
          durationMicroseconds: duration,
          showOverlayTiming: params.showOverlayTiming ?? false,
          comment,
        }),
      ];
      break;
    }

    case ManualActionType.PixelColorTrigger: {
      events = [
        createPixelColorTriggerEvent({
          timeMicroseconds: start,
          pixelX: params.pixelX ?? 0,
          pixelY: params.pixelY ?? 0,
          pixelColor: params.pixelColor ?? 0,
          triggerCooldownMilliseconds: params.triggerCooldownMilliseconds ?? 3000,
          comment,
        }),
      ];
      break;
    }

    case ManualActionType.WaitForPixelGone: {
      events = [
        createWaitForPixelGoneEvent({
          timeMicroseconds: start,
          pixelX: params.pixelX ?? 0,
          pixelY: params.pixelY ?? 0,
          pixelColor: params.pixelColor ?? 0,
          waitTimeoutMilliseconds: params.waitTimeoutMilliseconds ?? 0,
          comment,
        }),
      ];
      break;
    }

    case ManualActionType.WaitForWindow: {
      events = [
        createWaitForWindowEvent({
          timeMicroseconds: start,
          waitProcessName: params.waitProcessName ?? '',
          waitWindowTitle: params.waitWindowTitle ?? '',
          waitTimeoutMilliseconds: params.waitTimeoutMilliseconds ?? 0,
          comment,
        }),
      ];
      break;
    }

    case ManualActionType.WaitForKey: {
      events = [
        createWaitForKeyEvent({
          timeMicroseconds: start,
          waitKeyVirtualKey: params.waitKeyVirtualKey ?? 0,
          waitTimeoutMilliseconds: params.waitTimeoutMilliseconds ?? 0,
          comment,
        }),
      ];
      break;
    }

    case ManualActionType.RunMacro: {
      events = [
        createRunMacroEvent({
          timeMicroseconds: start,
          subMacroName: params.subMacroName ?? '',
          comment,
        }),
      ];
      break;
    }

    case ManualActionType.Comment: {
      events = [
        createCommentEvent({
          timeMicroseconds: start,
          text: params.text ?? '',
        }),
      ];
      break;
    }

    case ManualActionType.GamepadPress: {
      events = createGamepadPressPair({
        button: params.gamepadButton ?? GamepadButton.A,
        startTimeMicroseconds: start,
        holdDurationMicroseconds: params.durationMicroseconds ?? DEFAULT_HOLD_DURATION_MICROSECONDS,
        comment,
      });
      break;
    }

    case ManualActionType.GamepadButtonDown: {
      events = [
        createGamepadButtonDownEvent({
          timeMicroseconds: start,
          gamepadButton: params.gamepadButton ?? GamepadButton.A,
          comment,
        }),
      ];
      break;
    }

    case ManualActionType.GamepadButtonUp: {
      events = [
        createGamepadButtonUpEvent({
          timeMicroseconds: start,
          gamepadButton: params.gamepadButton ?? GamepadButton.A,
          comment,
        }),
      ];
      break;
    }

    case ManualActionType.GamepadAxis: {
      events = [
        createGamepadAxisEvent({
          timeMicroseconds: start,
          gamepadAxis: params.gamepadAxis ?? GamepadAxis.LeftStickX,
          axisValue: params.axisValue ?? 0,
          comment,
        }),
      ];
      break;
    }

    case ManualActionType.Delay:
    default: {
      const duration = Math.max(0, Math.round(params.durationMicroseconds ?? 100_000));
      events = [
        createDelayEvent({
          timeMicroseconds: start + duration,
          durationMicroseconds: duration,
          comment,
        }),
      ];
      break;
    }
  }

  // Assign comment to the first event if not a comment row
  if (params.type !== ManualActionType.Comment && events.length > 0) {
    (events[0] as unknown as Record<string, unknown>).comment = comment;
  }

  const shiftAfterMicroseconds = start;
  let shiftDurationMicroseconds = 0;
  if (params.type === ManualActionType.Delay || params.type === ManualActionType.OverlayText) {
    shiftDurationMicroseconds = Math.max(0, Math.round(params.durationMicroseconds ?? 0));
  } else if (params.type !== ManualActionType.Comment) {
    const maxTime =
      events.length === 0 ? start : Math.max(...events.map((e) => e.timeMicroseconds));
    shiftDurationMicroseconds = Math.max(0, maxTime - start);
  }

  return {
    events,
    shiftAfterMicroseconds,
    shiftDurationMicroseconds,
    occupiedMicroseconds: shiftDurationMicroseconds,
  };
}
