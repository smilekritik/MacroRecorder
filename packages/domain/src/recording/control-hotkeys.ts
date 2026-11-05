/**
 * Clean-up of management hotkeys and unbalanced modifier keystrokes.
 */

import {
  type MacroEvent,
  type MouseButton,
  type HotkeyBinding,
  MacroEventType,
} from '../model/types.js';
import { rebaseEventsToZero } from '../model/index.js';

/**
 * Standard Win32 modifier virtual keys:
 * Shift (0x10), Ctrl (0x11), Alt (0x12), LWin (0x5B), RWin (0x5C),
 * LShift (0xA0), RShift (0xA1), LCtrl (0xA2), RCtrl (0xA3), LAlt (0xA4), RAlt (0xA5).
 */
export const CONTROL_VIRTUAL_KEYS: ReadonlySet<number> = new Set([
  0x10, 0x11, 0x12, 0x5b, 0x5c, 0xa0, 0xa1, 0xa2, 0xa3, 0xa4, 0xa5,
]);

/**
 * Removes management hotkey triggers (e.g. stop hotkey, pause hotkey) and their trailing or orphaned
 * modifier keys from recorded output, then re-bases the recording origin cleanly to zero microseconds.
 *
 * When a user presses e.g. Ctrl+Shift+F10 to stop recording:
 * 1. Ctrl and Shift down events may have been captured just before F10.
 * 2. F10 was captured or filtered by the management hotkey hook.
 * 3. The recording stopped before the user released Ctrl and Shift.
 * This filter scrubs those hanging modifier presses so they do not pollute the macro timeline.
 */
export function removeUnbalancedControlHotkeys(
  source: readonly MacroEvent[],
  managementHotkeys: readonly (HotkeyBinding | null | undefined)[] = [],
): MacroEvent[] {
  const reservedKeys = new Set<number>();
  const reservedButtons = new Set<MouseButton>();

  for (const binding of managementHotkeys) {
    if (!binding) continue;
    if (binding.virtualKey !== 0) {
      reservedKeys.add(binding.virtualKey);
    }
    if (binding.mouseButton !== 'None') {
      reservedButtons.add(binding.mouseButton);
    }
  }

  const pressed = new Set<number>();
  const result: MacroEvent[] = [];

  for (const item of source) {
    if (
      (item.type === MacroEventType.KeyDown || item.type === MacroEventType.KeyUp) &&
      reservedKeys.has(item.virtualKey)
    ) {
      continue;
    }

    if (
      (item.type === MacroEventType.MouseButtonDown ||
        item.type === MacroEventType.MouseButtonUp) &&
      reservedButtons.has(item.button)
    ) {
      continue;
    }

    if (item.type === MacroEventType.KeyDown) {
      pressed.add(item.virtualKey);
    }

    if (item.type === MacroEventType.KeyUp) {
      const wasPressed = pressed.delete(item.virtualKey);
      if (!wasPressed && CONTROL_VIRTUAL_KEYS.has(item.virtualKey)) {
        continue;
      }
    }

    result.push(item);
  }

  // Remove any control modifier keys that were pressed down but never released
  const filtered = result.filter(
    (e) =>
      !(
        (e.type === MacroEventType.KeyDown || e.type === MacroEventType.KeyUp) &&
        CONTROL_VIRTUAL_KEYS.has(e.virtualKey) &&
        pressed.has(e.virtualKey)
      ),
  );

  return rebaseEventsToZero(filtered);
}
