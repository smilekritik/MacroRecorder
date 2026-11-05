/**
 * One-time migration handling for legacy default shortcuts.
 * for users who did not manually reassign it.
 */

import {
  DEFAULT_HOTKEY_BINDING,
  type HotkeyBinding,
  sameGesture,
} from '../../../contracts/src/index.js';

export const LEGACY_BIND_MAP_VK = 0x7b; // 123 (F12)
export const DEFAULT_BIND_MAP_VK = 0x7a; // 122 (F11)

export const LEGACY_BIND_MAP_DEFAULT: HotkeyBinding = {
  ...DEFAULT_HOTKEY_BINDING,
  virtualKey: LEGACY_BIND_MAP_VK,
};

export const CURRENT_BIND_MAP_DEFAULT: HotkeyBinding = {
  ...DEFAULT_HOTKEY_BINDING,
  virtualKey: DEFAULT_BIND_MAP_VK,
};

/**
 * Checks whether the given binding matches the uncustomized legacy default shortcut (F12 with no modifiers).
 */
export function isLegacyBindMapDefault(binding: HotkeyBinding): boolean {
  return sameGesture(binding, LEGACY_BIND_MAP_DEFAULT);
}

/**
 * Migrates legacy F12 default bind map shortcut to F11 if the user had not customized it.
 * If already migrated or customized, leaves the binding untouched.
 */
export function migrateBindMapHotkey(
  binding: HotkeyBinding,
  alreadyMigrated = false,
): { binding: HotkeyBinding; migrated: boolean } {
  if (!alreadyMigrated && isLegacyBindMapDefault(binding)) {
    return {
      binding: { ...CURRENT_BIND_MAP_DEFAULT },
      migrated: true,
    };
  }
  return {
    binding,
    migrated: false,
  };
}
