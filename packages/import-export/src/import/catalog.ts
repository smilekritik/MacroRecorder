/**
 * Key name to Windows VirtualKey code catalog for script and third-party importers.
 */

const KEY_NAMES: Readonly<Record<string, number>> = {
  backspace: 0x08,
  bs: 0x08,
  tab: 0x09,
  enter: 0x0d,
  return: 0x0d,
  shift: 0x10,
  ctrl: 0x11,
  control: 0x11,
  alt: 0x12,
  pause: 0x13,
  capslock: 0x14,
  esc: 0x1b,
  escape: 0x1b,
  space: 0x20,
  pgup: 0x21,
  pgdn: 0x22,
  pageup: 0x21,
  pagedown: 0x22,
  end: 0x23,
  home: 0x24,
  left: 0x25,
  up: 0x26,
  right: 0x27,
  down: 0x28,
  insert: 0x2d,
  ins: 0x2d,
  delete: 0x2e,
  del: 0x2e,
  lwin: 0x5b,
  rwin: 0x5c,
  numpad0: 0x60,
  numpad1: 0x61,
  numpad2: 0x62,
  numpad3: 0x63,
  numpad4: 0x64,
  numpad5: 0x65,
  numpad6: 0x66,
  numpad7: 0x67,
  numpad8: 0x68,
  numpad9: 0x69,
  numpadmult: 0x6a,
  numpadadd: 0x6b,
  numpadsub: 0x6d,
  numpaddot: 0x6e,
  numpaddiv: 0x6f,
  lshift: 0xa0,
  rshift: 0xa1,
  lctrl: 0xa2,
  rcontrol: 0xa3,
  rctrl: 0xa3,
  lalt: 0xa4,
  ralt: 0xa5,
  // OEM punctuation: same as in VirtualKeyName, but .mrf and Razer send it too.
  ';': 0xba,
  '=': 0xbb,
  ',': 0xbc,
  '-': 0xbd,
  '.': 0xbe,
  '/': 0xbf,
  '`': 0xc0,
  '[': 0xdb,
  '\\': 0xdc,
  ']': 0xdd,
  "'": 0xde,
};

export class InputKeyCatalog {
  /**
   * Resolves a key name, letter, digit, or function key into a Windows VirtualKey code.
   * Returns undefined if key is unmapped.
   */
  public static tryGet(name: string): number | undefined {
    const value = name.trim();
    if (value.length === 1) {
      const code = value.toUpperCase().charCodeAt(0);
      // 'A'-'Z' (65-90) or '0'-'9' (48-57)
      if ((code >= 0x41 && code <= 0x5a) || (code >= 0x30 && code <= 0x39)) {
        return code;
      }
    }

    // Function keys F1 to F24
    if ((value.length === 2 || value.length === 3) && (value[0] === 'F' || value[0] === 'f')) {
      const fnNum = parseInt(value.slice(1), 10);
      if (!Number.isNaN(fnNum) && fnNum >= 1 && fnNum <= 24) {
        return 0x6f + fnNum;
      }
    }

    return KEY_NAMES[value.toLowerCase()];
  }
}
