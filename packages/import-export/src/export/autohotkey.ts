/**
 * Exports a macro to an AutoHotkey v2 (.ahk) script.
 *
 * Timing is reproduced with `Sleep` between events, keys via `Send "{name down/up}"`,
 * mouse motion via relative `MouseMove`, buttons via `Click`, and text via `SendText`.
 *
 * Actions with no AutoHotkey equivalent (gamepad, overlay, pixel triggers, sub-macros)
 * are written as `; [not exported]` comments so nothing is silently dropped.
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import {
  type MacroDefinition,
  type HotkeyBinding,
  MacroEventType,
  MouseButton,
  WheelDirection,
  formatHotkeyDisplay,
  isEmptyHotkey,
} from '../../../contracts/src/index.js';

import { type AutoHotkeyExportOptions } from './types.js';

/**
 * Escapes a string for an AutoHotkey v2 double-quoted literal.
 * Converts `"` -> `""`, `\n` -> `` `n ``, `\t` -> `` `t ``, strips `\r`.
 */
export function escapeAutoHotkeyString(text: string | null | undefined): string {
  if (!text) return '';
  return text
    .replaceAll('"', '""')
    .replace(/\r/g, '')
    .replaceAll('\n', '`n')
    .replaceAll('\t', '`t');
}

/**
 * Converts a virtual-key code to an AutoHotkey key name
 * (letters, digits, F-keys, named keys, else vkNN hex).
 */
export function getAutoHotkeyKeyName(vk: number): string {
  if (vk >= 0x41 && vk <= 0x5a) {
    return String.fromCharCode(vk + 32); // A–Z → lower-case letter
  }
  if (vk >= 0x30 && vk <= 0x39) {
    return String.fromCharCode(vk); // 0–9
  }
  if (vk >= 0x70 && vk <= 0x87) {
    return `F${vk - 0x6f}`; // F1–F24
  }

  switch (vk) {
    case 0x08:
      return 'Backspace';
    case 0x09:
      return 'Tab';
    case 0x0d:
      return 'Enter';
    case 0x10:
      return 'Shift';
    case 0x11:
      return 'Ctrl';
    case 0x12:
      return 'Alt';
    case 0x13:
      return 'Pause';
    case 0x14:
      return 'CapsLock';
    case 0x1b:
      return 'Escape';
    case 0x20:
      return 'Space';
    case 0x21:
      return 'PgUp';
    case 0x22:
      return 'PgDn';
    case 0x23:
      return 'End';
    case 0x24:
      return 'Home';
    case 0x25:
      return 'Left';
    case 0x26:
      return 'Up';
    case 0x27:
      return 'Right';
    case 0x28:
      return 'Down';
    case 0x2d:
      return 'Insert';
    case 0x2e:
      return 'Delete';
    case 0x5b:
      return 'LWin';
    case 0x5c:
      return 'RWin';
    case 0x60:
      return 'Numpad0';
    case 0x61:
      return 'Numpad1';
    case 0x62:
      return 'Numpad2';
    case 0x63:
      return 'Numpad3';
    case 0x64:
      return 'Numpad4';
    case 0x65:
      return 'Numpad5';
    case 0x66:
      return 'Numpad6';
    case 0x67:
      return 'Numpad7';
    case 0x68:
      return 'Numpad8';
    case 0x69:
      return 'Numpad9';
    case 0x6a:
      return 'NumpadMult';
    case 0x6b:
      return 'NumpadAdd';
    case 0x6d:
      return 'NumpadSub';
    case 0x6e:
      return 'NumpadDot';
    case 0x6f:
      return 'NumpadDiv';
    case 0xa0:
      return 'LShift';
    case 0xa1:
      return 'RShift';
    case 0xa2:
      return 'LCtrl';
    case 0xa3:
      return 'RCtrl';
    case 0xa4:
      return 'LAlt';
    case 0xa5:
      return 'RAlt';
    case 0xba:
      return ';';
    case 0xbb:
      return '=';
    case 0xbc:
      return ',';
    case 0xbd:
      return '-';
    case 0xbe:
      return '.';
    case 0xbf:
      return '/';
    case 0xc0:
      return '`';
    case 0xdb:
      return '[';
    case 0xdc:
      return '\\';
    case 0xdd:
      return ']';
    case 0xde:
      return "'";
    default:
      return 'vk' + vk.toString(16).toUpperCase().padStart(2, '0');
  }
}

/**
 * Maps mouse button enum to AutoHotkey Click button name.
 */
export function getAutoHotkeyClickButton(button: MouseButton | string | undefined): string {
  switch (button) {
    case MouseButton.Left:
    case 'Left':
      return 'Left';
    case MouseButton.Right:
    case 'Right':
      return 'Right';
    case MouseButton.Middle:
    case 'Middle':
      return 'Middle';
    case MouseButton.X1:
    case 'X1':
      return 'X1';
    case MouseButton.X2:
    case 'X2':
      return 'X2';
    default:
      return 'Left';
  }
}

function appendWheel(delta: number, positive: string, negative: string): string {
  if (delta === 0) return '';
  const count = Math.max(1, Math.floor(Math.abs(delta) / 120));
  const dir = delta > 0 ? positive : negative;
  return `Send "{${dir} ${count}}"\n`;
}

function normalizeHotkey(raw: unknown): HotkeyBinding {
  if (!raw || typeof raw !== 'object') {
    return {
      virtualKey: 0,
      mouseButton: MouseButton.None,
      wheel: WheelDirection.None,
      control: false,
      alt: false,
      shift: false,
      windows: false,
    };
  }
  const obj = raw as Record<string, unknown>;
  return {
    virtualKey: (obj['virtualKey'] ?? obj['VirtualKey'] ?? 0) as number,
    mouseButton: (obj['mouseButton'] ?? obj['MouseButton'] ?? MouseButton.None) as MouseButton,
    wheel: (obj['wheel'] ?? obj['Wheel'] ?? WheelDirection.None) as WheelDirection,
    control: Boolean(obj['control'] ?? obj['Control'] ?? false),
    alt: Boolean(obj['alt'] ?? obj['Alt'] ?? false),
    shift: Boolean(obj['shift'] ?? obj['Shift'] ?? false),
    windows: Boolean(obj['windows'] ?? obj['Windows'] ?? false),
  };
}

function appendEvent(e: Record<string, unknown>): string {
  const type = (e['type'] ?? e['Type']) as MacroEventType | string;
  const virtualKey = (e['virtualKey'] ?? e['VirtualKey'] ?? 0) as number;
  const text = (e['text'] ?? e['Text'] ?? null) as string | null;
  const deltaX = (e['deltaX'] ?? e['DeltaX'] ?? 0) as number;
  const deltaY = (e['deltaY'] ?? e['DeltaY'] ?? 0) as number;
  const button = (e['button'] ?? e['Button'] ?? MouseButton.None) as MouseButton;
  const wheelDelta = (e['wheelDelta'] ?? e['WheelDelta'] ?? 0) as number;
  const waitKeyVirtualKey = (e['waitKeyVirtualKey'] ??
    e['WaitKeyVirtualKey'] ??
    virtualKey) as number;
  const waitWindowTitle = (e['waitWindowTitle'] ?? e['WaitWindowTitle'] ?? null) as string | null;

  switch (type) {
    case MacroEventType.KeyDown:
      return `Send "{${getAutoHotkeyKeyName(virtualKey)} down}"\n`;

    case MacroEventType.KeyUp:
      return `Send "{${getAutoHotkeyKeyName(virtualKey)} up}"\n`;

    case MacroEventType.TypeText:
      return `SendText "${escapeAutoHotkeyString(text)}"\n`;

    case MacroEventType.MouseMove:
      return `MouseMove ${deltaX}, ${deltaY}, 0, "R"\n`;

    case MacroEventType.MouseButtonDown:
      if (button !== MouseButton.None) {
        return `Click "${getAutoHotkeyClickButton(button)} Down"\n`;
      }
      break;

    case MacroEventType.MouseButtonUp:
      if (button !== MouseButton.None) {
        return `Click "${getAutoHotkeyClickButton(button)} Up"\n`;
      }
      break;

    case MacroEventType.Wheel:
      return appendWheel(wheelDelta, 'WheelUp', 'WheelDown');

    case MacroEventType.HorizontalWheel:
      return appendWheel(wheelDelta, 'WheelRight', 'WheelLeft');

    case MacroEventType.WaitForKey:
      return `KeyWait "${getAutoHotkeyKeyName(waitKeyVirtualKey)}", "D"\n`;

    case MacroEventType.WaitForWindow:
      if (waitWindowTitle && waitWindowTitle.trim().length > 0) {
        return `WinWait "${escapeAutoHotkeyString(waitWindowTitle)}"\n`;
      }
      break;

    case MacroEventType.Comment: {
      const lines = (text ?? '').replace(/\r/g, '').split('\n');
      return lines.map((line) => `; ${line}\n`).join('');
    }
  }

  // Unsupported actions fallback comment
  const textSuffix =
    text && text.length > 0 ? ' ' + text.replace(/\r/g, '').replace(/\n/g, ' ') : '';
  return `; [not exported] ${type}${textSuffix}\n`;
}

/**
 * Exports a macro definition to an AutoHotkey v2 script string.
 */
export function exportAutoHotkeyV2(
  macro: MacroDefinition | Record<string, unknown>,
  options?: AutoHotkeyExportOptions,
): string {
  const m = macro as Record<string, unknown>;
  const name = String(m['name'] ?? m['Name'] ?? '');
  const rawHotkey = m['hotkey'] ?? m['Hotkey'];
  const hotkey = normalizeHotkey(rawHotkey);
  const rawEvents = (m['events'] ?? m['Events'] ?? []) as readonly Record<string, unknown>[];

  let script = '#Requires AutoHotkey v2.0\n#SingleInstance Force\n\n; Exported from Macro Recorder';

  if (name.trim().length > 0) {
    script += ` — ${name.replace(/\r/g, '').replace(/\n/g, ' ')}`;
  }
  script += '\n';

  if (!isEmptyHotkey(hotkey)) {
    const hotkeyDisplay = formatHotkeyDisplay(hotkey);
    script += `; Original bind: ${hotkeyDisplay} (run this script to replay the macro)\n`;
  }

  script +=
    '; Gamepad, overlay, pixel-trigger and sub-macro actions have no AutoHotkey equivalent and appear as comments.\n\n';

  let lastTime = 0;
  for (const e of rawEvents) {
    const type = e['type'] ?? e['Type'];
    const timeUs = Number(e['timeMicroseconds'] ?? e['TimeMicroseconds'] ?? 0);

    if (type !== MacroEventType.Comment) {
      const gapMs = Math.floor((timeUs - lastTime) / 1000);
      if (gapMs > 0) {
        script += `Sleep ${gapMs}\n`;
      }
      lastTime = timeUs;
    }

    script += appendEvent(e);
  }

  if (options?.lineEnding === '\r\n') {
    return script.replace(/\n/g, '\r\n');
  }

  return script;
}

/**
 * Writes an exported AutoHotkey v2 script to disk.
 */
export async function exportAutoHotkeyV2ToFile(
  macro: MacroDefinition | Record<string, unknown>,
  filePath: string,
  options?: AutoHotkeyExportOptions,
): Promise<void> {
  const content = exportAutoHotkeyV2(macro, options);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, content, 'utf8');
}

export class AutoHotkeyV2Exporter {
  public static export(
    macro: MacroDefinition | Record<string, unknown>,
    options?: AutoHotkeyExportOptions,
  ): string {
    return exportAutoHotkeyV2(macro, options);
  }

  public static Export(
    macro: MacroDefinition | Record<string, unknown>,
    options?: AutoHotkeyExportOptions,
  ): string {
    return exportAutoHotkeyV2(macro, options);
  }

  public static async exportToFile(
    macro: MacroDefinition | Record<string, unknown>,
    filePath: string,
    options?: AutoHotkeyExportOptions,
  ): Promise<void> {
    return exportAutoHotkeyV2ToFile(macro, filePath, options);
  }
}
