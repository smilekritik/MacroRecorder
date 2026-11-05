/**
 * @macro-recorder/desktop - Bind Map Role Evaluation and Conflict Probing
 */

import {
  DEFAULT_APP_PREFERENCES,
  formatHotkeyDisplay,
  getVirtualKeyName,
  isEmptyHotkey,
  isMouseHotkey,
  MouseButton,
  WheelDirection,
  type AppPreferences,
  type HotkeyBinding,
  type MacroDefinition,
} from '../../../../../../packages/contracts/src/index.js';
import type { LayoutCap, SystemCommand, KeyRole } from './types.js';

export function isModifierVirtualKey(vk: number): boolean {
  return (
    vk === 0x10 || // VK_SHIFT
    vk === 0x11 || // VK_CONTROL
    vk === 0x12 || // VK_MENU (Alt)
    vk === 0x5b || // VK_LWIN
    vk === 0x5c || // VK_RWIN
    vk === 0xa0 || // VK_LSHIFT
    vk === 0xa1 || // VK_RSHIFT
    vk === 0xa2 || // VK_LCONTROL
    vk === 0xa3 || // VK_RCONTROL
    vk === 0xa4 || // VK_LMENU
    vk === 0xa5 // VK_RMENU
  );
}

export function isModifierKey(binding: HotkeyBinding, vk: number): boolean {
  switch (vk) {
    case 0x11:
    case 0xa2:
    case 0xa3:
      return binding.control;
    case 0x10:
    case 0xa0:
    case 0xa1:
      return binding.shift;
    case 0x12:
    case 0xa4:
    case 0xa5:
      return binding.alt;
    case 0x5b:
    case 0x5c:
      return binding.windows;
    default:
      return false;
  }
}

export function hasModifiers(binding: HotkeyBinding): boolean {
  return binding.control || binding.alt || binding.shift || binding.windows;
}

/**
 * Evaluates role for a keyboard key:
 * - modifier keys for combinations are primary (e.g. Ctrl in Ctrl+3)
 * - standalone keys are primary
 * - combination keys without modifiers are secondary (e.g. "3" in Ctrl+3)
 */
export function getKeyRole(binding: HotkeyBinding, virtualKey: number): KeyRole {
  if (isEmptyHotkey(binding) || virtualKey === 0) return 'none';
  if (isModifierKey(binding, virtualKey)) return 'primary';
  if (isMouseHotkey(binding) || binding.virtualKey !== virtualKey) return 'none';
  return hasModifiers(binding) ? 'secondary' : 'primary';
}

/**
 * Evaluates role for a mouse button or wheel direction:
 * - standalone mouse actions are primary
 * - modified mouse actions are secondary (e.g. Shift + Left Click)
 */
export function getMouseRole(
  binding: HotkeyBinding,
  button: MouseButton,
  wheel: WheelDirection,
): KeyRole {
  if (isEmptyHotkey(binding)) return 'none';
  const matches =
    wheel === WheelDirection.None
      ? binding.mouseButton === button && binding.wheel === WheelDirection.None
      : binding.wheel === wheel;
  if (!matches) return 'none';
  return hasModifiers(binding) ? 'secondary' : 'primary';
}

export function getGestureKey(binding: HotkeyBinding): string {
  const c = binding.control ? 1 : 0;
  const a = binding.alt ? 1 : 0;
  const s = binding.shift ? 1 : 0;
  const w = binding.windows ? 1 : 0;
  return `${binding.virtualKey}|${binding.mouseButton}|${binding.wheel}|${c}${a}${s}${w}`;
}

/**
 * Creates the standard list of system global commands.
 */
export function getSystemCommands(
  preferences?: AppPreferences,
  t: (key: string) => string = (k) => k,
): readonly SystemCommand[] {
  const prefs = preferences ?? DEFAULT_APP_PREFERENCES;
  const list: { tag: SystemCommand['tag']; name: string; binding: HotkeyBinding }[] = [
    {
      tag: 'start',
      name: t('Start recording'),
      binding: prefs.recordingStartHotkey,
    },
    {
      tag: 'stop',
      name: t('Stop recording'),
      binding: prefs.recordingStopHotkey,
    },
    {
      tag: 'pause',
      name: t('Pause / resume playback'),
      binding: prefs.playbackPauseHotkey,
    },
    {
      tag: 'emergency',
      name: t('Emergency stop'),
      binding: prefs.emergencyStopHotkey,
    },
    {
      tag: 'pixel',
      name: t('Capture pixel color'),
      binding: prefs.pixelCaptureHotkey,
    },
    {
      tag: 'bindmap',
      name: t('Bind map'),
      binding: prefs.bindMapHotkey,
    },
  ];

  return list.map((cmd) => ({
    ...cmd,
    display: `${cmd.name} · ${formatHotkeyDisplay(cmd.binding)}`,
  }));
}

/**
 * Suffix note for hints: " · window-scoped" and/or " · passed through".
 */
export function bindModeSuffix(
  macro: MacroDefinition,
  t: (k: string) => string = (k) => k,
): string {
  const parts: string[] = [];
  if (macro.playback?.hotkeyScopedToTarget) {
    parts.push(t('window-scoped'));
  }
  if (macro.playback?.passThroughHotkey) {
    parts.push(t('passed through'));
  }
  return parts.length === 0 ? '' : ' · ' + parts.join(', ');
}

/**
 * Probes Windows availability for all non-modifier single keys, macro hotkeys, and system commands.
 */
export function probeOccupiedGestures(
  allCaps: readonly LayoutCap[],
  macros: readonly MacroDefinition[],
  systemCommands: readonly SystemCommand[],
  probeAvailability?: ((bindings: readonly HotkeyBinding[]) => boolean[]) | undefined,
): Set<string> {
  const occupied = new Set<string>();
  if (!probeAvailability) return occupied;

  const gestures: HotkeyBinding[] = [];
  const seen = new Set<string>();

  const add = (binding: HotkeyBinding) => {
    if (isEmptyHotkey(binding) || isMouseHotkey(binding)) return;
    const key = getGestureKey(binding);
    if (!seen.has(key)) {
      seen.add(key);
      gestures.push(binding);
    }
  };

  // Single layout keys
  for (const cap of allCaps) {
    if (!isModifierVirtualKey(cap.vk) && cap.vk !== 0) {
      add({
        virtualKey: cap.vk,
        mouseButton: MouseButton.None,
        wheel: WheelDirection.None,
        control: false,
        alt: false,
        shift: false,
        windows: false,
      });
    }
  }

  // Active macros with hotkeys
  for (const macro of macros) {
    if (!isEmptyHotkey(macro.hotkey)) {
      add(macro.hotkey);
    }
  }

  // System commands
  for (const cmd of systemCommands) {
    add(cmd.binding);
  }

  try {
    const available = probeAvailability(gestures);
    for (let i = 0; i < gestures.length && i < available.length; i++) {
      if (!available[i]) {
        occupied.add(getGestureKey(gestures[i]!));
      }
    }
  } catch (err) {
    console.warn('[BindMap] Conflict probe failed:', err);
  }

  return occupied;
}

/**
 * Returns formatted conflict strings for a tile.
 */
export function conflictsFor(
  virtualKey: number,
  bindings: readonly HotkeyBinding[],
  occupied: ReadonlySet<string>,
  t: (k: string) => string = (k) => k,
  format: (k: string, ...args: unknown[]) => string = (k, ...args) =>
    k.replace(/{(\d+)}/g, (_, i) => String(args[Number(i)] ?? '')),
): string[] {
  const result: string[] = [];

  if (virtualKey !== 0 && !isModifierVirtualKey(virtualKey)) {
    const singleGestureKey = getGestureKey({
      virtualKey,
      mouseButton: MouseButton.None,
      wheel: WheelDirection.None,
      control: false,
      alt: false,
      shift: false,
      windows: false,
    });
    if (occupied.has(singleGestureKey)) {
      result.push(
        format(
          t('{0} — this key is held by another application'),
          getVirtualKeyName(virtualKey),
        ),
      );
    }
  }

  for (const b of bindings) {
    if (occupied.has(getGestureKey(b))) {
      result.push(
        format(
          t('{0} — this combination is held by another application'),
          formatHotkeyDisplay(b),
        ),
      );
    }
  }

  return Array.from(new Set(result));
}

/**
 * Builds tooltip text.
 */
export function buildTileTooltip(
  data: {
    readonly conflicts: readonly string[];
    readonly primary: readonly MacroDefinition[];
    readonly systemPrimary: readonly SystemCommand[];
    readonly secondary: readonly MacroDefinition[];
    readonly systemSecondary: readonly SystemCommand[];
    readonly hasBinds: boolean;
  },
  label: string,
  t: (k: string) => string = (k) => k,
  format: (k: string, ...args: unknown[]) => string = (k, ...args) =>
    k.replace(/{(\d+)}/g, (_, i) => String(args[Number(i)] ?? '')),
): string {
  const lines: string[] = [];

  for (const conflict of data.conflicts) {
    lines.push(conflict);
  }

  for (const macro of data.primary) {
    const suffix = bindModeSuffix(macro, t);
    const hotkeyStr = formatHotkeyDisplay(macro.hotkey) + suffix;
    const status = macro.isEnabled ? t('enabled') : t('disabled');
    lines.push(format('{0} · {1} · {2}', macro.name, hotkeyStr, status));
  }

  for (const cmd of data.systemPrimary) {
    lines.push(format('{0} — application command', cmd.display));
  }

  for (const macro of data.secondary) {
    lines.push(
      format('second key of a combination: {0} · {1}', macro.name, formatHotkeyDisplay(macro.hotkey)),
    );
  }

  for (const cmd of data.systemSecondary) {
    lines.push(format('second key of a combination: {0}', cmd.display));
  }

  if (!data.hasBinds) {
    if (data.conflicts.length > 0) {
      lines.push(t('Nothing of ours is bound to this key.'));
    } else {
      lines.push(format('{0} — free', label));
    }
  }

  return lines.join('\n');
}

/**
 * Checks whether two tiles share a macro or system command (combination partners).
 */
export function areTilesPartners(
  tileA: {
    readonly id: string;
    readonly hasBinds: boolean;
    readonly allMacros: readonly MacroDefinition[];
    readonly allSystem: readonly SystemCommand[];
  },
  tileB: {
    readonly id: string;
    readonly hasBinds: boolean;
    readonly allMacros: readonly MacroDefinition[];
    readonly allSystem: readonly SystemCommand[];
  },
): boolean {
  if (tileA.id === tileB.id || !tileA.hasBinds || !tileB.hasBinds) {
    return false;
  }

  const hasSharedMacro = tileA.allMacros.some((mA) =>
    tileB.allMacros.some((mB) => mB.id === mA.id),
  );
  if (hasSharedMacro) return true;

  const hasSharedSystem = tileA.allSystem.some((sA) =>
    tileB.allSystem.some((sB) => sB.tag === sA.tag),
  );
  return hasSharedSystem;
}
