/**
 * @macro-recorder/desktop - Library Hotkey Utilities
 * Formatting, automatic trigger detection, conflict validation, and keyboard event parsing.
 */

import {
  type HotkeyBinding,
  type MacroDefinition,
  formatHotkeyDisplay,
  isEmptyHotkey,
  sameGesture,
  DEFAULT_HOTKEY_BINDING,
} from '../../../../../../../packages/contracts/src/index.js';
import { isAutomaticTriggerMacro } from './tree-builder.js';

export { formatHotkeyDisplay, isEmptyHotkey, sameGesture, DEFAULT_HOTKEY_BINDING };

/**
 * Returns the human-readable display string for a macro's trigger.
 * Shows "Automatic trigger" for pixel triggers, otherwise the formatted key combination.
 */
export function getMacroHotkeyDisplay(macro: MacroDefinition, showEmptyAsNotAssigned = false): string {
  if (isAutomaticTriggerMacro(macro)) {
    return 'Automatic trigger';
  }
  if (!macro.hotkey || isEmptyHotkey(macro.hotkey)) {
    return showEmptyAsNotAssigned ? 'Not assigned' : '';
  }
  return formatHotkeyDisplay(macro.hotkey);
}

/**
 * Checks whether a given hotkey gesture is already assigned to another enabled macro.
 */
export function findHotkeyConflict(
  hotkey: HotkeyBinding,
  currentMacroId: string,
  allMacros: readonly MacroDefinition[],
): MacroDefinition | null {
  if (!hotkey || isEmptyHotkey(hotkey)) return null;

  return (
    allMacros.find((other) => {
      if (other.id === currentMacroId) return false;
      if (!other.isEnabled) return false;
      if (isAutomaticTriggerMacro(other)) return false;
      if (!other.hotkey || isEmptyHotkey(other.hotkey)) return false;
      return sameGesture(other.hotkey, hotkey);
    }) ?? null
  );
}

/**
 * Checks whether a given hotkey is an application-reserved global shortcut.
 */
export function isApplicationReservedHotkey(hotkey: HotkeyBinding): boolean {
  if (isEmptyHotkey(hotkey)) return false;

  // F11: Bind Map
  if (
    hotkey.virtualKey === 0x7a &&
    !hotkey.control &&
    !hotkey.alt &&
    !hotkey.shift &&
    !hotkey.windows
  ) {
    return true;
  }

  return false;
}

/**
 * Converts a browser KeyboardEvent into a Windows HotkeyBinding.
 * Returns null if the pressed key is a lone modifier key or Escape.
 */
export function parseKeyEventToHotkey(e: React.KeyboardEvent | KeyboardEvent): {
  readonly isClear: boolean;
  readonly isModifierOnly: boolean;
  readonly binding: HotkeyBinding | null;
} {
  const code = e.code;
  const key = e.key;

  if (key === 'Escape') {
    return { isClear: true, isModifierOnly: false, binding: null };
  }

  // Modifier-only keys
  if (
    key === 'Control' ||
    key === 'Alt' ||
    key === 'Shift' ||
    key === 'Meta' ||
    code.startsWith('Control') ||
    code.startsWith('Alt') ||
    code.startsWith('Shift') ||
    code.startsWith('Meta')
  ) {
    return { isClear: false, isModifierOnly: true, binding: null };
  }

  // Determine virtual key
  let vk = e.keyCode || 0;
  if (!vk || vk === 0) {
    vk = getVirtualKeyFromCode(code);
  }

  const binding: HotkeyBinding = {
    virtualKey: vk,
    mouseButton: 'None',
    wheel: 'None',
    control: e.ctrlKey,
    alt: e.altKey,
    shift: e.shiftKey,
    windows: e.metaKey,
  };

  return { isClear: false, isModifierOnly: false, binding };
}

/**
 * Fallback mapping from KeyboardEvent.code to Windows VK
 */
function getVirtualKeyFromCode(code: string): number {
  if (code.startsWith('Key')) {
    return code.charCodeAt(3);
  }
  if (code.startsWith('Digit')) {
    return code.charCodeAt(5);
  }
  if (code.startsWith('Numpad') && code.length === 7) {
    const digit = parseInt(code.charAt(6), 10);
    if (!isNaN(digit)) return 0x60 + digit;
  }
  if (code.startsWith('F')) {
    const fn = parseInt(code.slice(1), 10);
    if (!isNaN(fn) && fn >= 1 && fn <= 24) return 0x6f + fn;
  }

  switch (code) {
    case 'Space':
      return 0x20;
    case 'Tab':
      return 0x09;
    case 'Enter':
      return 0x0d;
    case 'Backspace':
      return 0x08;
    case 'Insert':
      return 0x2d;
    case 'Delete':
      return 0x2e;
    case 'Home':
      return 0x24;
    case 'End':
      return 0x23;
    case 'PageUp':
      return 0x21;
    case 'PageDown':
      return 0x22;
    case 'ArrowLeft':
      return 0x25;
    case 'ArrowUp':
      return 0x26;
    case 'ArrowRight':
      return 0x27;
    case 'ArrowDown':
      return 0x28;
    case 'Pause':
      return 0x13;
    default:
      return 0;
  }
}
