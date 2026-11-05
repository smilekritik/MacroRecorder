/**
 * Form validation and MacroEvent synthesis for Add/Edit Action dialogs.
 */

import {
  GamepadAxis,
  type MacroEvent,
  MouseButton,
} from '../../../../../../packages/contracts/src/index.js';
import { createManualActionEvents } from '../../../../../../packages/domain/src/timeline/press-release.js';
import { ManualActionType } from '../../../../../../packages/domain/src/timeline/types.js';
import type {
  ActionFormData,
  ActionValidationResult,
  ActionDialogSubmitResult,
} from './types.js';

/**
 * Parses a hex color string (#RRGGBB or RRGGBB) to integer 0x00RRGGBB.
 */
export function parseRgbHex(hex: string): { success: boolean; color: number } {
  let text = (hex ?? '').trim();
  if (text.startsWith('#')) {
    text = text.slice(1);
  }
  if (!/^[0-9A-Fa-f]{6}$/.test(text)) {
    return { success: false, color: 0 };
  }
  const parsed = parseInt(text, 16);
  if (Number.isNaN(parsed) || parsed < 0 || parsed > 0xffffff) {
    return { success: false, color: 0 };
  }
  return { success: true, color: parsed };
}

/**
 * Formats an RGB integer to `#RRGGBB` hex string.
 */
export function formatRgbHex(color: number): string {
  const clamped = Math.max(0, Math.min(0xffffff, color & 0xffffff));
  return `#${clamped.toString(16).padStart(6, '0').toUpperCase()}`;
}

/**
 * Parses fractional milliseconds string to non-negative integer microseconds.
 */
export function parseMillisecondsToMicroseconds(
  text: string,
): { success: boolean; microseconds: number } {
  const trimmed = (text ?? '').trim();
  const num = Number(trimmed);
  if (!Number.isFinite(num) || num < 0 || num > Number.MAX_SAFE_INTEGER / 1000) {
    return { success: false, microseconds: 0 };
  }
  return { success: true, microseconds: Math.round(num * 1000) };
}

/**
 * Validates action form inputs against all legacy business rules.
 */
export function validateActionFormData(data: ActionFormData): ActionValidationResult {
  const startRes = parseMillisecondsToMicroseconds(data.startTimeMs);
  if (!startRes.success) {
    return {
      isValid: false,
      errorMessage: 'Enter a valid start time: zero or a positive number.',
      field: 'startTimeMs',
    };
  }

  const { type } = data;

  if (
    type === ManualActionType.KeyPress ||
    type === ManualActionType.KeyDown ||
    type === ManualActionType.KeyUp
  ) {
    if (data.virtualKey === 0 && data.capturedMouseButton === MouseButton.None) {
      return {
        isValid: false,
        errorMessage: 'Select a key or an extra mouse button first.',
        field: 'keyCapture',
      };
    }
    if (type === ManualActionType.KeyPress) {
      const dur = Number(data.durationMs);
      if (!Number.isFinite(dur) || dur <= 0) {
        return {
          isValid: false,
          errorMessage: 'Duration must be greater than zero.',
          field: 'durationMs',
        };
      }
    }
  } else if (
    type === ManualActionType.MouseClick ||
    type === ManualActionType.MouseDown ||
    type === ManualActionType.MouseUp
  ) {
    if (!data.mouseButton || data.mouseButton === MouseButton.None) {
      return {
        isValid: false,
        errorMessage: 'Select a mouse button.',
        field: 'mouseButton',
      };
    }
    if (type === ManualActionType.MouseClick) {
      const dur = Number(data.durationMs);
      if (!Number.isFinite(dur) || dur <= 0) {
        return {
          isValid: false,
          errorMessage: 'Duration must be greater than zero.',
          field: 'durationMs',
        };
      }
    }
  } else if (type === ManualActionType.MouseMove) {
    const x = Number(data.deltaX);
    const y = Number(data.deltaY);
    if (!Number.isInteger(x) || !Number.isInteger(y)) {
      return {
        isValid: false,
        errorMessage: 'X and Y offsets must be integers.',
        field: 'deltaX',
      };
    }
  } else if (type === ManualActionType.Wheel || type === ManualActionType.HorizontalWheel) {
    const delta = Number(data.wheelDelta);
    if (!Number.isInteger(delta) || delta === 0) {
      return {
        isValid: false,
        errorMessage: 'Wheel delta must be a non-zero integer.',
        field: 'wheelDelta',
      };
    }
  } else if (
    type === ManualActionType.GamepadPress ||
    type === ManualActionType.GamepadButtonDown ||
    type === ManualActionType.GamepadButtonUp
  ) {
    if (!data.gamepadButton) {
      return {
        isValid: false,
        errorMessage: 'Select a gamepad button.',
        field: 'gamepadButton',
      };
    }
    if (type === ManualActionType.GamepadPress) {
      const dur = Number(data.durationMs);
      if (!Number.isFinite(dur) || dur <= 0) {
        return {
          isValid: false,
          errorMessage: 'Duration must be greater than zero.',
          field: 'durationMs',
        };
      }
    }
  } else if (type === ManualActionType.GamepadAxis) {
    if (!data.gamepadAxis) {
      return {
        isValid: false,
        errorMessage: 'Select a gamepad axis.',
        field: 'gamepadAxis',
      };
    }
    const val = Number(data.axisValue);
    if (!Number.isInteger(val)) {
      return {
        isValid: false,
        errorMessage: 'The axis value must be an integer.',
        field: 'axisValue',
      };
    }
  } else if (type === ManualActionType.TypeText) {
    if (data.typeText.length === 0) {
      return {
        isValid: false,
        errorMessage: 'Enter the text to type.',
        field: 'typeText',
      };
    }
  } else if (type === ManualActionType.OverlayText) {
    if (data.overlayText.trim().length === 0) {
      return {
        isValid: false,
        errorMessage: 'Enter the text to display in the overlay.',
        field: 'overlayText',
      };
    }
    const endRes = parseMillisecondsToMicroseconds(data.overlayEndTimeMs);
    if (!endRes.success || endRes.microseconds <= startRes.microseconds) {
      return {
        isValid: false,
        errorMessage: 'End time must be later than start time.',
        field: 'overlayEndTimeMs',
      };
    }
  } else if (type === ManualActionType.PixelColorTrigger) {
    const x = Number(data.pixelX);
    const y = Number(data.pixelY);
    if (!Number.isInteger(x) || !Number.isInteger(y)) {
      return {
        isValid: false,
        errorMessage: 'Pixel X and Y coordinates must be integers.',
        field: 'pixelX',
      };
    }
    const rgbRes = parseRgbHex(data.pixelColorHex);
    if (!rgbRes.success) {
      return {
        isValid: false,
        errorMessage: 'Enter a color as #RRGGBB, for example #57E06A.',
        field: 'pixelColorHex',
      };
    }
    const cooldown = Number(data.triggerCooldownMs);
    if (!Number.isInteger(cooldown) || cooldown < 0) {
      return {
        isValid: false,
        errorMessage: 'The rearm delay must be zero or a positive whole number.',
        field: 'triggerCooldownMs',
      };
    }
  } else if (type === ManualActionType.WaitForPixelGone) {
    const x = Number(data.pixelX);
    const y = Number(data.pixelY);
    if (!Number.isInteger(x) || !Number.isInteger(y)) {
      return {
        isValid: false,
        errorMessage: 'Pixel X and Y coordinates must be integers.',
        field: 'pixelX',
      };
    }
    const rgbRes = parseRgbHex(data.pixelColorHex);
    if (!rgbRes.success) {
      return {
        isValid: false,
        errorMessage: 'Enter a color as #RRGGBB, for example #57E06A.',
        field: 'pixelColorHex',
      };
    }
    const timeout = Number(data.waitTimeoutMs);
    if (!Number.isInteger(timeout) || timeout < 0) {
      return {
        isValid: false,
        errorMessage: 'The wait timeout must be zero or a positive whole number.',
        field: 'waitTimeoutMs',
      };
    }
  } else if (type === ManualActionType.WaitForWindow) {
    if (data.waitProcessName.trim().length === 0 && data.waitWindowTitle.trim().length === 0) {
      return {
        isValid: false,
        errorMessage: 'Select the window to wait for.',
        field: 'waitProcessName',
      };
    }
    const timeout = Number(data.waitTimeoutMs);
    if (!Number.isInteger(timeout) || timeout < 0) {
      return {
        isValid: false,
        errorMessage: 'The wait timeout must be zero or a positive whole number.',
        field: 'waitTimeoutMs',
      };
    }
  } else if (type === ManualActionType.WaitForKey) {
    if (data.waitKeyVirtualKey === 0) {
      return {
        isValid: false,
        errorMessage: 'First select the key to wait for.',
        field: 'waitKeyVirtualKey',
      };
    }
    const timeout = Number(data.waitTimeoutMs);
    if (!Number.isInteger(timeout) || timeout < 0) {
      return {
        isValid: false,
        errorMessage: 'The wait timeout must be zero or a positive whole number.',
        field: 'waitTimeoutMs',
      };
    }
  } else if (type === ManualActionType.RunMacro) {
    if (data.subMacroName.trim().length === 0) {
      return {
        isValid: false,
        errorMessage: 'Select the macro to run.',
        field: 'subMacroName',
      };
    }
  } else if (type === ManualActionType.Delay) {
    const dur = Number(data.durationMs);
    if (!Number.isFinite(dur) || dur <= 0) {
      return {
        isValid: false,
        errorMessage: 'Duration must be greater than zero.',
        field: 'durationMs',
      };
    }
  }

  return { isValid: true };
}

/**
 * Builds synthesized MacroEvents and calculates shift bounds from validated form data.
 */
export function buildEventsFromFormData(
  data: ActionFormData,
  originalEvent?: MacroEvent,
): ActionDialogSubmitResult {
  const startUs = parseMillisecondsToMicroseconds(data.startTimeMs).microseconds;
  const comment =
    data.type === ManualActionType.Comment ? data.commentRowText.trim() : data.actionComment.trim();

  let axisVal = Number(data.axisValue);
  if (
    data.gamepadAxis === GamepadAxis.LeftTrigger ||
    data.gamepadAxis === GamepadAxis.RightTrigger
  ) {
    axisVal = Math.max(0, Math.min(255, Math.round(axisVal)));
  } else {
    axisVal = Math.max(-32768, Math.min(32767, Math.round(axisVal)));
  }

  let durUs: number | undefined;
  if (data.type === ManualActionType.OverlayText) {
    const endUs = parseMillisecondsToMicroseconds(data.overlayEndTimeMs).microseconds;
    durUs = Math.max(0, endUs - startUs);
  } else if (
    data.type === ManualActionType.KeyPress ||
    data.type === ManualActionType.MouseClick ||
    data.type === ManualActionType.GamepadPress ||
    data.type === ManualActionType.Delay
  ) {
    durUs = Math.max(0, Math.round(Number(data.durationMs) * 1000));
  }

  const rgb = parseRgbHex(data.pixelColorHex).color;

  const result = createManualActionEvents({
    type: data.type,
    startTimeMicroseconds: startUs,
    comment,
    virtualKey: data.virtualKey,
    scanCode: data.scanCode,
    extended: data.extended,
    mouseButton:
      data.type === ManualActionType.KeyPress ||
      data.type === ManualActionType.KeyDown ||
      data.type === ManualActionType.KeyUp
        ? (data.capturedMouseButton !== MouseButton.None ? data.capturedMouseButton : undefined)
        : data.mouseButton,
    deltaX: Math.round(Number(data.deltaX)),
    deltaY: Math.round(Number(data.deltaY)),
    wheelDelta: Math.round(Number(data.wheelDelta)),
    gamepadButton: data.gamepadButton,
    gamepadAxis: data.gamepadAxis,
    axisValue: axisVal,
    text: data.type === ManualActionType.Comment ? comment : data.type === ManualActionType.OverlayText ? data.overlayText.trim() : data.typeText,
    durationMicroseconds: durUs,
    showOverlayTiming: data.showOverlayTiming,
    pixelX: Math.round(Number(data.pixelX)),
    pixelY: Math.round(Number(data.pixelY)),
    pixelColor: rgb,
    triggerCooldownMilliseconds: Math.max(0, Math.round(Number(data.triggerCooldownMs))),
    waitTimeoutMilliseconds: Math.max(0, Math.round(Number(data.waitTimeoutMs))),
    waitProcessName: data.waitProcessName.trim(),
    waitWindowTitle: data.waitWindowTitle.trim(),
    waitKeyVirtualKey: data.waitKeyVirtualKey,
    subMacroName: data.subMacroName.trim(),
  });

  return {
    events: result.events,
    shiftAfterMicroseconds: result.shiftAfterMicroseconds,
    shiftDurationMicroseconds: result.shiftDurationMicroseconds,
    originalEvent,
  };
}
