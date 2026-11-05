/**
 * @macro-recorder/desktop - Keyboard and Mouse Geometry
 */

import { MouseButton, WheelDirection } from '../../../../../../packages/contracts/src/index.js';
import type { LayoutCap } from './types.js';

export const KEY_UNIT = 44;
export const KEY_GAP = 6;
export const KEY_PITCH = KEY_UNIT + KEY_GAP; // 50
export const FUNCTION_ROW_GAP = 16;
export const BLOCK_GAP = 30;

export const MAIN_WIDTH_UNITS = 15;
export const NAVIGATION_WIDTH_UNITS = 3;
export const NUMPAD_WIDTH_UNITS = 4;

export const MOUSE_WIDTH = 172;
export const MOUSE_HEIGHT = 292;
export const MOUSE_TOP = 34;
export const MOUSE_LEFT_GAP = 46;

export function span(units: number): number {
  return units * KEY_PITCH - KEY_GAP;
}

export function rowTop(row: number): number {
  return row * KEY_PITCH + (row >= 1 ? FUNCTION_ROW_GAP : 0);
}

export const NAVIGATION_LEFT = span(MAIN_WIDTH_UNITS) + BLOCK_GAP; // 774
export const NUMPAD_LEFT = NAVIGATION_LEFT + span(NAVIGATION_WIDTH_UNITS) + BLOCK_GAP; // 948
export const KEYBOARD_WIDTH = NUMPAD_LEFT + span(NUMPAD_WIDTH_UNITS); // 1142
export const KEYBOARD_HEIGHT = rowTop(5) + KEY_UNIT; // 310

export const MOUSE_ORIGIN_X = KEYBOARD_WIDTH + MOUSE_LEFT_GAP; // 1188
export const TOTAL_CANVAS_WIDTH = MOUSE_ORIGIN_X + MOUSE_WIDTH; // 1360
export const TOTAL_CANVAS_HEIGHT = Math.max(KEYBOARD_HEIGHT, MOUSE_HEIGHT); // 310

export function cap(label: string, vk: number, width = 1, height = 1): LayoutCap {
  return { label, vk, width, height, isSpacer: false };
}

export function spacer(width: number): LayoutCap {
  return { label: '', vk: 0, width, height: 1, isSpacer: true };
}

export const MAIN_ROWS: readonly (readonly LayoutCap[])[] = [
  // Row 0: Esc, F1-F12
  [
    cap('Esc', 0x1b),
    spacer(1),
    cap('F1', 0x70),
    cap('F2', 0x71),
    cap('F3', 0x72),
    cap('F4', 0x73),
    spacer(0.5),
    cap('F5', 0x74),
    cap('F6', 0x75),
    cap('F7', 0x76),
    cap('F8', 0x77),
    spacer(0.5),
    cap('F9', 0x78),
    cap('F10', 0x79),
    cap('F11', 0x7a),
    cap('F12', 0x7b),
  ],
  // Row 1: Number row
  [
    cap('`', 0xc0),
    cap('1', 0x31),
    cap('2', 0x32),
    cap('3', 0x33),
    cap('4', 0x34),
    cap('5', 0x35),
    cap('6', 0x36),
    cap('7', 0x37),
    cap('8', 0x38),
    cap('9', 0x39),
    cap('0', 0x30),
    cap('-', 0xbd),
    cap('=', 0xbb),
    cap('Backspace', 0x08, 2),
  ],
  // Row 2: Tab + QWERTY
  [
    cap('Tab', 0x09, 1.5),
    cap('Q', 0x51),
    cap('W', 0x57),
    cap('E', 0x45),
    cap('R', 0x52),
    cap('T', 0x54),
    cap('Y', 0x59),
    cap('U', 0x55),
    cap('I', 0x49),
    cap('O', 0x4f),
    cap('P', 0x50),
    cap('[', 0xdb),
    cap(']', 0xdd),
    cap('\\', 0xdc, 1.5),
  ],
  // Row 3: Caps + ASDF
  [
    cap('Caps', 0x14, 1.75),
    cap('A', 0x41),
    cap('S', 0x53),
    cap('D', 0x44),
    cap('F', 0x46),
    cap('G', 0x47),
    cap('H', 0x48),
    cap('J', 0x4a),
    cap('K', 0x4b),
    cap('L', 0x4c),
    cap(';', 0xba),
    cap("'", 0xde),
    cap('Enter', 0x0d, 2.25),
  ],
  // Row 4: Shift + ZXCV
  [
    cap('Shift', 0x10, 2.25),
    cap('Z', 0x5a),
    cap('X', 0x58),
    cap('C', 0x43),
    cap('V', 0x56),
    cap('B', 0x42),
    cap('N', 0x4e),
    cap('M', 0x4d),
    cap(',', 0xbc),
    cap('.', 0xbe),
    cap('/', 0xbf),
    cap('Shift', 0x10, 2.75),
  ],
  // Row 5: Modifiers + Space
  [
    cap('Ctrl', 0x11, 1.25),
    cap('Win', 0x5b, 1.25),
    cap('Alt', 0x12, 1.25),
    cap('Space', 0x20, 6.25),
    cap('Alt', 0x12, 1.25),
    cap('Win', 0x5c, 1.25),
    cap('Menu', 0x5d, 1.25),
    cap('Ctrl', 0x11, 1.25),
  ],
];

export const NAVIGATION_ROWS: readonly { readonly row: number; readonly keys: readonly LayoutCap[] }[] = [
  { row: 0, keys: [cap('PrtSc', 0x2c), cap('ScrLk', 0x91), cap('Pause', 0x13)] },
  { row: 1, keys: [cap('Ins', 0x2d), cap('Home', 0x24), cap('PgUp', 0x21)] },
  { row: 2, keys: [cap('Del', 0x2e), cap('End', 0x23), cap('PgDn', 0x22)] },
  { row: 4, keys: [spacer(1), cap('↑', 0x26), spacer(1)] },
  { row: 5, keys: [cap('←', 0x25), cap('↓', 0x28), cap('→', 0x27)] },
];

export const NUMPAD_ROWS: readonly { readonly row: number; readonly keys: readonly LayoutCap[] }[] = [
  { row: 1, keys: [cap('Num', 0x90), cap('/', 0x6f), cap('*', 0x6a), cap('−', 0x6d)] },
  { row: 2, keys: [cap('7', 0x67), cap('8', 0x68), cap('9', 0x69), cap('+', 0x6b, 1, 2)] },
  { row: 3, keys: [cap('4', 0x64), cap('5', 0x65), cap('6', 0x66)] },
  { row: 4, keys: [cap('1', 0x61), cap('2', 0x62), cap('3', 0x63), cap('Enter', 0x0d, 1, 2)] },
  { row: 5, keys: [cap('0', 0x60, 2), cap('.', 0x6e)] },
];

/**
 * Returns all non-spacer caps across all keyboard blocks.
 */
export function getAllLayoutCaps(): readonly LayoutCap[] {
  const result: LayoutCap[] = [];
  for (const row of MAIN_ROWS) {
    for (const k of row) {
      if (!k.isSpacer) result.push(k);
    }
  }
  for (const block of NAVIGATION_ROWS) {
    for (const k of block.keys) {
      if (!k.isSpacer) result.push(k);
    }
  }
  for (const block of NUMPAD_ROWS) {
    for (const k of block.keys) {
      if (!k.isSpacer) result.push(k);
    }
  }
  return result;
}

export interface PlacedLayoutKey {
  readonly id: string;
  readonly label: string;
  readonly vk: number;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/**
 * Calculates absolute coordinates and sizes for every key in the keyboard layout.
 */
export function computeKeyboardLayout(): readonly PlacedLayoutKey[] {
  const keys: PlacedLayoutKey[] = [];
  let keyIndex = 0;

  const placeRow = (rowKeys: readonly LayoutCap[], left: number, row: number) => {
    let x = left;
    const y = rowTop(row);
    for (const k of rowKeys) {
      const width = span(k.width);
      if (!k.isSpacer) {
        const height = k.height * KEY_PITCH - KEY_GAP;
        keys.push({
          id: `key-${k.vk.toString(16)}-${keyIndex++}`,
          label: k.label,
          vk: k.vk,
          x,
          y,
          width,
          height,
        });
      }
      x += width + KEY_GAP;
    }
  };

  for (let r = 0; r < MAIN_ROWS.length; r++) {
    placeRow(MAIN_ROWS[r]!, 0, r);
  }
  for (const block of NAVIGATION_ROWS) {
    placeRow(block.keys, NAVIGATION_LEFT, block.row);
  }
  for (const block of NUMPAD_ROWS) {
    placeRow(block.keys, NUMPAD_LEFT, block.row);
  }

  return keys;
}

export interface PlacedMouseElement {
  readonly id: string;
  readonly title: string;
  readonly label: string;
  readonly button: MouseButton;
  readonly wheel: WheelDirection;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly geometry?: string | undefined;
  readonly labelX?: number | undefined;
  readonly labelY?: number | undefined;
  readonly isZone: boolean;
}

export const MOUSE_BODY_GEOMETRY =
  `M 85,${MOUSE_TOP + 2} C 44,${MOUSE_TOP + 2} 18,${MOUSE_TOP + 40} 18,${MOUSE_TOP + 94} L 18,${MOUSE_TOP + 194} ` +
  `C 18,${MOUSE_TOP + 238} 48,${MOUSE_TOP + 252} 85,${MOUSE_TOP + 252} C 122,${MOUSE_TOP + 252} 152,${MOUSE_TOP + 238} 152,${MOUSE_TOP + 194} ` +
  `L 152,${MOUSE_TOP + 94} C 152,${MOUSE_TOP + 40} 126,${MOUSE_TOP + 2} 85,${MOUSE_TOP + 2} Z`;

export function computeMouseElements(): readonly PlacedMouseElement[] {
  const top = MOUSE_TOP;
  return [
    // Left zone
    {
      id: 'mouse-left',
      title: 'Left',
      label: 'L',
      button: MouseButton.Left,
      wheel: WheelDirection.None,
      x: 0,
      y: 0,
      width: 0,
      height: 0,
      geometry: `M 66,${top + 8} L 50,${top + 8} C 32,${top + 26} 24,${top + 60} 24,${top + 98} L 24,${top + 110} L 66,${top + 110} Z`,
      labelX: 40,
      labelY: top + 68,
      isZone: true,
    },
    // Right zone
    {
      id: 'mouse-right',
      title: 'Right',
      label: 'R',
      button: MouseButton.Right,
      wheel: WheelDirection.None,
      x: 0,
      y: 0,
      width: 0,
      height: 0,
      geometry: `M 104,${top + 8} L 120,${top + 8} C 138,${top + 26} 146,${top + 60} 146,${top + 98} L 146,${top + 110} L 104,${top + 110} Z`,
      labelX: 120,
      labelY: top + 68,
      isZone: true,
    },
    // Middle zone
    {
      id: 'mouse-middle',
      title: 'Middle',
      label: 'M',
      button: MouseButton.Middle,
      wheel: WheelDirection.None,
      x: 0,
      y: 0,
      width: 0,
      height: 0,
      geometry:
        `M 85,${top + 44} C 93,${top + 44} 100,${top + 51} 100,${top + 59} L 100,${top + 73} ` +
        `C 100,${top + 81} 93,${top + 88} 85,${top + 88} C 77,${top + 88} 70,${top + 81} 70,${top + 73} ` +
        `L 70,${top + 59} C 70,${top + 51} 77,${top + 44} 85,${top + 44} Z`,
      labelX: 81,
      labelY: top + 58,
      isZone: true,
    },
    // Wheel Up cap
    {
      id: 'mouse-wheel-up',
      title: 'Wheel up',
      label: '▲',
      button: MouseButton.None,
      wheel: WheelDirection.Up,
      x: 70,
      y: top + 14,
      width: 30,
      height: 24,
      isZone: false,
    },
    // Wheel Down cap
    {
      id: 'mouse-wheel-down',
      title: 'Wheel down',
      label: '▼',
      button: MouseButton.None,
      wheel: WheelDirection.Down,
      x: 70,
      y: top + 94,
      width: 30,
      height: 24,
      isZone: false,
    },
    // X1 button
    {
      id: 'mouse-x1',
      title: 'X1',
      label: 'X1',
      button: MouseButton.X1,
      wheel: WheelDirection.None,
      x: 24,
      y: top + 132,
      width: 26,
      height: 36,
      isZone: false,
    },
    // X2 button
    {
      id: 'mouse-x2',
      title: 'X2',
      label: 'X2',
      button: MouseButton.X2,
      wheel: WheelDirection.None,
      x: 24,
      y: top + 174,
      width: 26,
      height: 36,
      isZone: false,
    },
  ];
}
