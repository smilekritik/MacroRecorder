/**
 * @macro-recorder/desktop - Bind Map Geometry and Layout Tests
 */

import { describe, it, expect } from 'vitest';
import {
  KEY_UNIT,
  KEY_GAP,
  KEY_PITCH,
  FUNCTION_ROW_GAP,
  BLOCK_GAP,
  MAIN_WIDTH_UNITS,
  NAVIGATION_WIDTH_UNITS,
  NUMPAD_WIDTH_UNITS,
  NAVIGATION_LEFT,
  NUMPAD_LEFT,
  KEYBOARD_WIDTH,
  KEYBOARD_HEIGHT,
  MOUSE_WIDTH,
  MOUSE_HEIGHT,
  MOUSE_TOP,
  MOUSE_LEFT_GAP,
  MOUSE_ORIGIN_X,
  TOTAL_CANVAS_WIDTH,
  TOTAL_CANVAS_HEIGHT,
  span,
  rowTop,
  getAllLayoutCaps,
  computeKeyboardLayout,
  computeMouseElements,
  MOUSE_BODY_GEOMETRY,
} from '../keyboard-layout.js';
import { BIND_MAP_WINDOW_SPEC } from '../types.js';

describe('Bind Map Geometry and Coordinate Math', () => {
  it('verifies exact layout', () => {
    expect(KEY_UNIT).toBe(44);
    expect(KEY_GAP).toBe(6);
    expect(KEY_PITCH).toBe(50);
    expect(FUNCTION_ROW_GAP).toBe(16);
    expect(BLOCK_GAP).toBe(30);

    expect(MAIN_WIDTH_UNITS).toBe(15);
    expect(NAVIGATION_WIDTH_UNITS).toBe(3);
    expect(NUMPAD_WIDTH_UNITS).toBe(4);
  });

  it('calculates exact block spans and row tops', () => {
    // span(units) = units * 50 - 6
    expect(span(1)).toBe(44);
    expect(span(2)).toBe(94);
    expect(span(15)).toBe(744);
    expect(span(3)).toBe(144);
    expect(span(4)).toBe(194);

    // rowTop(row) = row * 50 + (row >= 1 ? 16 : 0)
    expect(rowTop(0)).toBe(0); // F-keys row
    expect(rowTop(1)).toBe(66); // Number row with function row offset
    expect(rowTop(2)).toBe(116);
    expect(rowTop(3)).toBe(166);
    expect(rowTop(4)).toBe(216);
    expect(rowTop(5)).toBe(266); // Bottom modifier row
  });

  it('calculates exact block offsets and canvas dimensions', () => {
    expect(NAVIGATION_LEFT).toBe(774); // 744 + 30
    expect(NUMPAD_LEFT).toBe(948); // 774 + 144 + 30
    expect(KEYBOARD_WIDTH).toBe(1142); // 948 + 194
    expect(KEYBOARD_HEIGHT).toBe(310); // 266 + 44

    expect(MOUSE_WIDTH).toBe(172);
    expect(MOUSE_HEIGHT).toBe(292);
    expect(MOUSE_TOP).toBe(34);
    expect(MOUSE_LEFT_GAP).toBe(46);
    expect(MOUSE_ORIGIN_X).toBe(1188); // 1142 + 46

    expect(TOTAL_CANVAS_WIDTH).toBe(1360); // 1188 + 172
    expect(TOTAL_CANVAS_HEIGHT).toBe(310); // Math.max(310, 292)
  });

  it('verifies non-overlapping keyboard layout keys', () => {
    const keys = computeKeyboardLayout();
    expect(keys.length).toBeGreaterThan(80);

    // Verify all keys have positive dimensions
    for (const key of keys) {
      expect(key.width).toBeGreaterThanOrEqual(KEY_UNIT);
      expect(key.height).toBeGreaterThanOrEqual(KEY_UNIT);
      expect(key.x).toBeGreaterThanOrEqual(0);
      expect(key.y).toBeGreaterThanOrEqual(0);
      expect(key.x + key.width).toBeLessThanOrEqual(KEYBOARD_WIDTH);
      expect(key.y + key.height).toBeLessThanOrEqual(KEYBOARD_HEIGHT);
    }
  });

  it('verifies keyboard caps count and special keys presence', () => {
    const allCaps = getAllLayoutCaps();
    const labels = allCaps.map((c) => c.label);

    // Main row keys
    expect(labels).toContain('Esc');
    expect(labels).toContain('F1');
    expect(labels).toContain('F12');
    expect(labels).toContain('Backspace');
    expect(labels).toContain('Tab');
    expect(labels).toContain('Enter');
    expect(labels).toContain('Shift');
    expect(labels).toContain('Ctrl');
    expect(labels).toContain('Alt');
    expect(labels).toContain('Win');
    expect(labels).toContain('Space');

    // Navigation block
    expect(labels).toContain('PrtSc');
    expect(labels).toContain('ScrLk');
    expect(labels).toContain('Pause');
    expect(labels).toContain('Ins');
    expect(labels).toContain('Home');
    expect(labels).toContain('PgUp');
    expect(labels).toContain('Del');
    expect(labels).toContain('End');
    expect(labels).toContain('PgDn');
    expect(labels).toContain('↑');
    expect(labels).toContain('←');
    expect(labels).toContain('↓');
    expect(labels).toContain('→');

    // Numpad block
    expect(labels).toContain('Num');
    expect(labels).toContain('/');
    expect(labels).toContain('*');
    expect(labels).toContain('−');
    expect(labels).toContain('+');
    expect(labels).toContain('.');
  });

  it('verifies mouse vector geometry and zones', () => {
    const mouseElements = computeMouseElements();
    expect(mouseElements).toHaveLength(7);

    const ids = mouseElements.map((m) => m.id);
    expect(ids).toEqual([
      'mouse-left',
      'mouse-right',
      'mouse-middle',
      'mouse-wheel-up',
      'mouse-wheel-down',
      'mouse-x1',
      'mouse-x2',
    ]);

    // Check SVG paths for curved zones
    const leftZone = mouseElements.find((m) => m.id === 'mouse-left')!;
    expect(leftZone.geometry).toBeDefined();
    expect(leftZone.geometry).toContain('M 66,42');
    expect(leftZone.label).toBe('L');

    const rightZone = mouseElements.find((m) => m.id === 'mouse-right')!;
    expect(rightZone.geometry).toBeDefined();
    expect(rightZone.geometry).toContain('M 104,42');
    expect(rightZone.label).toBe('R');

    const middleZone = mouseElements.find((m) => m.id === 'mouse-middle')!;
    expect(middleZone.geometry).toBeDefined();
    expect(middleZone.geometry).toContain('M 85,78');
    expect(middleZone.label).toBe('M');

    // Check button caps coordinates
    const wheelUp = mouseElements.find((m) => m.id === 'mouse-wheel-up')!;
    expect(wheelUp.x).toBe(70);
    expect(wheelUp.y).toBe(48); // 34 + 14
    expect(wheelUp.width).toBe(30);
    expect(wheelUp.height).toBe(24);

    const wheelDown = mouseElements.find((m) => m.id === 'mouse-wheel-down')!;
    expect(wheelDown.x).toBe(70);
    expect(wheelDown.y).toBe(128); // 34 + 94
    expect(wheelDown.width).toBe(30);
    expect(wheelDown.height).toBe(24);

    const x1 = mouseElements.find((m) => m.id === 'mouse-x1')!;
    expect(x1.x).toBe(24);
    expect(x1.y).toBe(166); // 34 + 132
    expect(x1.width).toBe(26);
    expect(x1.height).toBe(36);

    const x2 = mouseElements.find((m) => m.id === 'mouse-x2')!;
    expect(x2.x).toBe(24);
    expect(x2.y).toBe(208); // 34 + 174
    expect(x2.width).toBe(26);
    expect(x2.height).toBe(36);

    expect(MOUSE_BODY_GEOMETRY).toContain('M 85,36');
  });

  it('matches window specification requirements', () => {
    expect(BIND_MAP_WINDOW_SPEC.id).toBe('BindMapWindow');
    expect(BIND_MAP_WINDOW_SPEC.title).toBe('Bind map — Macro Recorder');
    expect(BIND_MAP_WINDOW_SPEC.width).toBe(1480);
    expect(BIND_MAP_WINDOW_SPEC.height).toBe(900);
    expect(BIND_MAP_WINDOW_SPEC.minWidth).toBe(1000);
    expect(BIND_MAP_WINDOW_SPEC.minHeight).toBe(620);
    expect(BIND_MAP_WINDOW_SPEC.topmost).toBe(true);
    expect(BIND_MAP_WINDOW_SPEC.modal).toBe(false);
    expect(BIND_MAP_WINDOW_SPEC.showInTaskbar).toBe(false);
    expect(BIND_MAP_WINDOW_SPEC.owner).toBeNull();
  });
});
