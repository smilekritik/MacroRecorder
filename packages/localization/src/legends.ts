import type { KnownLocalizationKey } from './keys.js';
import type { LanguageCode } from './types.js';
import { localizationManager } from './manager.js';

export type GamepadButton =
  | 'None'
  | 'A'
  | 'B'
  | 'X'
  | 'Y'
  | 'LeftBumper'
  | 'RightBumper'
  | 'Back'
  | 'Start'
  | 'Guide'
  | 'LeftStick'
  | 'RightStick'
  | 'DPadUp'
  | 'DPadDown'
  | 'DPadLeft'
  | 'DPadRight';

export type GamepadAxis =
  | 'None'
  | 'LeftStickX'
  | 'LeftStickY'
  | 'RightStickX'
  | 'RightStickY'
  | 'LeftTrigger'
  | 'RightTrigger';

export type MouseButton = 'Left' | 'Right' | 'Middle' | 'X1' | 'X2' | 'Unknown';

/**
 * Returns the non-linguistic gamepad button legend.
 * Matches controller button labels (A, B, X, Y, LB, RB, etc.), intentionally not translated.
 */
export function getGamepadButtonLegend(button: GamepadButton | string): string {
  switch (button) {
    case 'A':
      return 'A';
    case 'B':
      return 'B';
    case 'X':
      return 'X';
    case 'Y':
      return 'Y';
    case 'LeftBumper':
      return 'LB';
    case 'RightBumper':
      return 'RB';
    case 'Back':
      return 'Back';
    case 'Start':
      return 'Start';
    case 'Guide':
      return 'Guide';
    case 'LeftStick':
      return 'LS';
    case 'RightStick':
      return 'RS';
    case 'DPadUp':
      return 'D-Pad ↑';
    case 'DPadDown':
      return 'D-Pad ↓';
    case 'DPadLeft':
      return 'D-Pad ←';
    case 'DPadRight':
      return 'D-Pad →';
    default:
      return '—';
  }
}

/**
 * Returns the non-linguistic gamepad axis legend.
 * Matches controller axis labels (LS X, LS Y, RS X, RS Y, LT, RT), intentionally not translated.
 */
export function getGamepadAxisLegend(axis: GamepadAxis | string): string {
  switch (axis) {
    case 'LeftStickX':
      return 'LS X';
    case 'LeftStickY':
      return 'LS Y';
    case 'RightStickX':
      return 'RS X';
    case 'RightStickY':
      return 'RS Y';
    case 'LeftTrigger':
      return 'LT';
    case 'RightTrigger':
      return 'RT';
    default:
      return '—';
  }
}

/**
 * Maps mouse button to its localized English source key.
 * Unlike gamepad and keyboard physical keycaps, mouse button names ARE localized.
 */
export function getMouseButtonKey(button: MouseButton | string): KnownLocalizationKey {
  switch (button) {
    case 'Left':
      return 'Left mouse button';
    case 'Right':
      return 'Right mouse button';
    case 'Middle':
      return 'Middle mouse button';
    case 'X1':
      return 'Extra mouse button X1';
    case 'X2':
      return 'Extra mouse button X2';
    default:
      return 'Mouse button';
  }
}

/**
 * Returns the localized mouse button name.
 */
export function getMouseButtonName(button: MouseButton | string, lang?: LanguageCode): string {
  const key = getMouseButtonKey(button);
  return localizationManager.translate(key, lang);
}

/**
 * Human-readable virtual-key names matching the physical legend on standard keyboards.
 * These are non-linguistic legends and are not translated.
 */
export function getVirtualKeyLegend(vk: number): string {
  if (vk >= 0x30 && vk <= 0x39) {
    return String.fromCharCode(vk);
  }
  if (vk >= 0x41 && vk <= 0x5a) {
    return String.fromCharCode(vk);
  }
  if (vk >= 0x70 && vk <= 0x87) {
    return `F${vk - 0x6f}`;
  }
  if (vk >= 0x60 && vk <= 0x69) {
    return `Num ${vk - 0x60}`;
  }

  switch (vk) {
    case 0x08:
      return 'Backspace';
    case 0x09:
      return 'Tab';
    case 0x0d:
      return 'Enter';
    case 0x1b:
      return 'Esc';
    case 0x20:
      return 'Space';
    case 0x10:
      return 'Shift';
    case 0x11:
      return 'Ctrl';
    case 0x12:
      return 'Alt';
    case 0x2d:
      return 'Insert';
    case 0x2e:
      return 'Delete';
    case 0x24:
      return 'Home';
    case 0x23:
      return 'End';
    case 0x21:
      return 'Page Up';
    case 0x22:
      return 'Page Down';
    case 0x25:
      return 'Left';
    case 0x26:
      return 'Up';
    case 0x27:
      return 'Right';
    case 0x28:
      return 'Down';
    case 0x5b:
      return 'Left Win';
    case 0x5c:
      return 'Right Win';
    case 0x5d:
      return 'Menu';
    case 0xa0:
      return 'Left Shift';
    case 0xa1:
      return 'Right Shift';
    case 0xa2:
      return 'Left Ctrl';
    case 0xa3:
      return 'Right Ctrl';
    case 0xa4:
      return 'Left Alt';
    case 0xa5:
      return 'Right Alt';
    case 0x14:
      return 'Caps Lock';
    case 0x90:
      return 'Num Lock';
    case 0x91:
      return 'Scroll Lock';
    case 0x13:
      return 'Pause';
    case 0x03:
      return 'Break';
    case 0x2c:
      return 'Print Screen';
    case 0x2f:
      return 'Help';
    case 0x0c:
      return 'Clear';
    case 0x1c:
      return 'Convert';
    case 0x1d:
      return 'Non Convert';
    case 0x6a:
      return 'Num *';
    case 0x6b:
      return 'Num +';
    case 0x6c:
      return 'Num Enter';
    case 0x6d:
      return 'Num −';
    case 0x6e:
      return 'Num .';
    case 0x6f:
      return 'Num /';
    case 0xc0:
      return '`';
    case 0xbd:
      return '-';
    case 0xbb:
      return '=';
    case 0xdb:
      return '[';
    case 0xdd:
      return ']';
    case 0xdc:
      return '\\';
    case 0xba:
      return ';';
    case 0xde:
      return "'";
    case 0xbc:
      return ',';
    case 0xbe:
      return '.';
    case 0xbf:
      return '/';
    case 0xe2:
      return '\\ (102)';
    case 0xad:
      return 'Mute';
    case 0xae:
      return 'Volume Down';
    case 0xaf:
      return 'Volume Up';
    case 0xb0:
      return 'Next Track';
    case 0xb1:
      return 'Previous Track';
    case 0xb2:
      return 'Stop Media';
    case 0xb3:
      return 'Play / Pause';
    case 0xb4:
      return 'Mail';
    case 0xb5:
      return 'Media Select';
    case 0xb6:
      return 'Launch App 1';
    case 0xb7:
      return 'Launch App 2';
    case 0xa6:
      return 'Browser Back';
    case 0xa7:
      return 'Browser Forward';
    case 0xa8:
      return 'Browser Refresh';
    case 0xa9:
      return 'Browser Stop';
    case 0xaa:
      return 'Browser Search';
    case 0xab:
      return 'Browser Favorites';
    case 0xac:
      return 'Browser Home';
    case 0x5f:
      return 'Sleep';
    case 0x2a:
      return 'Print';
    case 0x2b:
      return 'Execute';
    case 0x29:
      return 'Select';
    default:
      return `VK_${vk.toString(16).toUpperCase().padStart(2, '0')}`;
  }
}

/**
 * Set of documented non-linguistic hardware legends that are intentionally exempted from localization.
 */
const KNOWN_NON_LINGUISTIC_LEGENDS = new Set<string>([
  '—',
  'A',
  'B',
  'X',
  'Y',
  'LB',
  'RB',
  'Back',
  'Start',
  'Guide',
  'LS',
  'RS',
  'D-Pad ↑',
  'D-Pad ↓',
  'D-Pad ←',
  'D-Pad →',
  'LS X',
  'LS Y',
  'RS X',
  'RS Y',
  'LT',
  'RT',
  'Backspace',
  'Tab',
  'Enter',
  'Esc',
  'Space',
  'Shift',
  'Ctrl',
  'Alt',
  'Insert',
  'Delete',
  'Home',
  'End',
  'Page Up',
  'Page Down',
  'Left',
  'Up',
  'Right',
  'Down',
  'Left Win',
  'Right Win',
  'Menu',
  'Left Shift',
  'Right Shift',
  'Left Ctrl',
  'Right Ctrl',
  'Left Alt',
  'Right Alt',
  'Caps Lock',
  'Num Lock',
  'Scroll Lock',
  'Pause',
  'Break',
  'Print Screen',
  'Help',
  'Clear',
  'Convert',
  'Non Convert',
  'Num *',
  'Num +',
  'Num Enter',
  'Num −',
  'Num .',
  'Num /',
  '`',
  '-',
  '=',
  '[',
  ']',
  '\\',
  ';',
  "'",
  ',',
  '.',
  '/',
  '\\ (102)',
  'Mute',
  'Volume Down',
  'Volume Up',
  'Next Track',
  'Previous Track',
  'Stop Media',
  'Play / Pause',
  'Mail',
  'Media Select',
  'Launch App 1',
  'Launch App 2',
  'Browser Back',
  'Browser Forward',
  'Browser Refresh',
  'Browser Stop',
  'Browser Search',
  'Browser Favorites',
  'Browser Home',
  'Sleep',
  'Print',
  'Execute',
  'Select',
]);

/**
 * Checks if a string is a documented non-linguistic hardware legend (key name, gamepad legend, or pure punctuation).
 */
export function isNonLinguisticLegend(legend: string): boolean {
  if (!legend || !legend.trim()) {
    return true;
  }
  if (KNOWN_NON_LINGUISTIC_LEGENDS.has(legend)) {
    return true;
  }
  // Pure punctuation or symbols with no alphabet letters
  if (!/[a-zA-Zа-яА-Я]/.test(legend)) {
    return true;
  }
  // Function keys F1-F24
  if (/^F([1-9]|1\d|2[0-4])$/.test(legend)) {
    return true;
  }
  // Num 0 - Num 9
  if (/^Num \d$/.test(legend)) {
    return true;
  }
  // Single letters/digits
  if (/^[A-Z0-9]$/.test(legend)) {
    return true;
  }
  // VK_XX hex codes
  if (/^VK_[0-9A-F]{2}$/.test(legend)) {
    return true;
  }
  return false;
}
