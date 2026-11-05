/**
 * Human-readable display formatting for macro events, hotkeys, and diagnostics.
 */

import { format, t } from '../../../localization/src/index.js';
import {
  getGamepadAxisName,
  getGamepadButtonName,
  getMouseButtonName,
  getVirtualKeyName,
} from './key-names.js';
import {
  type HotkeyBinding,
  type MacroEvent,
  MacroEventType,
  MouseButton,
  WheelDirection,
} from './types.js';

/**
 * Returns the end timestamp in integer microseconds for an event.
 * For OverlayText with duration, returns time + duration; for all other events, returns time.
 */
export function getEventEndTimeMicroseconds(event: MacroEvent): number {
  if (event.type === MacroEventType.OverlayText && event.durationMicroseconds > 0) {
    const sum = event.timeMicroseconds + event.durationMicroseconds;
    return Number.isSafeInteger(sum) ? sum : Number.MAX_SAFE_INTEGER;
  }
  return event.timeMicroseconds;
}

/**
 * Formats a number with up to 3 decimal places without trailing zeroes, matching "0.###".
 */
export function formatMilliseconds(ms: number): string {
  const rounded = Math.round(ms * 1000) / 1000;
  return rounded.toString();
}

/**
 * Returns human-readable display string for any of the 19 macro event types.
 */
export function formatMacroEventDisplay(event: MacroEvent): string {
  switch (event.type) {
    case MacroEventType.KeyDown:
      return `${getVirtualKeyName(event.virtualKey)} ↓`;

    case MacroEventType.KeyUp:
      return `${getVirtualKeyName(event.virtualKey)} ↑`;

    case MacroEventType.MouseMove: {
      const deltaXStr = event.deltaX > 0 ? `+${event.deltaX}` : `${event.deltaX}`;
      const deltaYStr = event.deltaY > 0 ? `+${event.deltaY}` : `${event.deltaY}`;
      return format('Mouse movement · X {0}, Y {1}', deltaXStr, deltaYStr);
    }

    case MacroEventType.MouseButtonDown:
      return `${getMouseButtonName(event.button)} ↓`;

    case MacroEventType.MouseButtonUp:
      return `${getMouseButtonName(event.button)} ↑`;

    case MacroEventType.Wheel:
      return event.wheelDelta >= 0
        ? format('Scroll up · {0}', Math.abs(event.wheelDelta))
        : format('Scroll down · {0}', Math.abs(event.wheelDelta));

    case MacroEventType.HorizontalWheel:
      return event.wheelDelta >= 0
        ? format('Scroll right · {0}', Math.abs(event.wheelDelta))
        : format('Scroll left · {0}', Math.abs(event.wheelDelta));

    case MacroEventType.Delay:
      return t('Pause');

    case MacroEventType.OverlayText: {
      const endTimeMs = Math.round(getEventEndTimeMicroseconds(event) / 1000).toString();
      return event.showOverlayTiming
        ? format('Text “{0}” · until {1} ms · with countdown', event.text, endTimeMs)
        : format('Text “{0}” · until {1} ms · without countdown', event.text, endTimeMs);
    }

    case MacroEventType.PixelColorTrigger: {
      const hexColor = (event.pixelColor & 0xffffff).toString(16).toUpperCase().padStart(6, '0');
      return format(
        'Wait for color #{0:X6} at X {1}, Y {2} · rearm after {3} ms',
        hexColor,
        event.pixelX,
        event.pixelY,
        event.triggerCooldownMilliseconds,
      );
    }

    case MacroEventType.Comment:
      return !event.text || !event.text.trim() ? t('Comment — double-click to type') : event.text;

    case MacroEventType.GamepadButtonDown:
      return `🎮 ${getGamepadButtonName(event.gamepadButton)} ↓`;

    case MacroEventType.GamepadButtonUp:
      return `🎮 ${getGamepadButtonName(event.gamepadButton)} ↑`;

    case MacroEventType.GamepadAxis:
      return `🎮 ${getGamepadAxisName(event.gamepadAxis)} · ${event.axisValue}`;

    case MacroEventType.TypeText: {
      const truncated = event.text.length > 40 ? `${event.text.slice(0, 40)}…` : event.text;
      return format('Type text · “{0}”', truncated);
    }

    case MacroEventType.WaitForPixelGone: {
      const hexColor = (event.pixelColor & 0xffffff).toString(16).toUpperCase().padStart(6, '0');
      const suffix =
        event.waitTimeoutMilliseconds > 0
          ? format(' · timeout {0} ms', event.waitTimeoutMilliseconds)
          : '';
      return format(
        'Wait for color #{0:X6} at X {1}, Y {2} to disappear{3}',
        hexColor,
        event.pixelX,
        event.pixelY,
        suffix,
      );
    }

    case MacroEventType.WaitForWindow: {
      const target =
        !event.waitWindowTitle || !event.waitWindowTitle.trim()
          ? event.waitProcessName
          : event.waitWindowTitle;
      const suffix =
        event.waitTimeoutMilliseconds > 0
          ? format(' · timeout {0} ms', event.waitTimeoutMilliseconds)
          : '';
      return format('Wait for window “{0}”{1}', target, suffix);
    }

    case MacroEventType.WaitForKey: {
      const keyName = getVirtualKeyName(event.waitKeyVirtualKey);
      const suffix =
        event.waitTimeoutMilliseconds > 0
          ? format(' · timeout {0} ms', event.waitTimeoutMilliseconds)
          : '';
      return format('Wait for {0} press{1}', keyName, suffix);
    }

    case MacroEventType.RunMacro:
      return format('Run macro “{0}”', event.subMacroName);

    default:
      return t('Pause');
  }
}

/**
 * Returns human-readable display string for a hotkey binding.
 */
export function formatHotkeyDisplay(binding: HotkeyBinding): string {
  const isEmpty =
    binding.virtualKey === 0 &&
    binding.mouseButton === MouseButton.None &&
    binding.wheel === WheelDirection.None;

  if (isEmpty) {
    return t('Not assigned');
  }

  const parts: string[] = [];
  if (binding.control) parts.push('Ctrl');
  if (binding.alt) parts.push('Alt');
  if (binding.shift) parts.push('Shift');
  if (binding.windows) parts.push('Win');

  if (binding.wheel === WheelDirection.Up) {
    parts.push(t('Wheel up'));
  } else if (binding.wheel === WheelDirection.Down) {
    parts.push(t('Wheel down'));
  } else if (binding.mouseButton !== MouseButton.None) {
    parts.push(`Mouse ${binding.mouseButton}`);
  } else {
    parts.push(getVirtualKeyName(binding.virtualKey));
  }

  return parts.join(' + ');
}
