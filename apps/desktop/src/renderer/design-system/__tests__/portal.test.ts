import { describe, it, expect } from 'vitest';
import { clampToWindowBounds, Z_INDEX } from '../Portal.js';

describe('Portal layer and window boundary clamping', () => {
  it('enforces z-index hierarchy', () => {
    expect(Z_INDEX.dropdown).toBeLessThan(Z_INDEX.tooltip);
    expect(Z_INDEX.tooltip).toBeLessThan(Z_INDEX.modalBackdrop);
    expect(Z_INDEX.modalBackdrop).toBeLessThan(Z_INDEX.modal);
  });

  it('keeps floating elements inside viewport bounds on the right', () => {
    // Window is 1000x800, padding is 10
    // Element desired at x=900, width=200 -> would extend to 1100 (overflow)
    const clamped = clampToWindowBounds(
      { x: 900, y: 100, width: 200, height: 100 },
      10,
      1000,
      800,
    );

    expect(clamped.left).toBe(1000 - 10 - 200); // 790
    expect(clamped.top).toBe(100);
  });

  it('keeps floating elements inside viewport bounds on the bottom', () => {
    // Window is 1000x800, padding is 10
    // Element desired at y=750, height=100 -> would extend to 850 (overflow)
    const clamped = clampToWindowBounds(
      { x: 100, y: 750, width: 200, height: 100 },
      10,
      1000,
      800,
    );

    expect(clamped.left).toBe(100);
    expect(clamped.top).toBe(800 - 10 - 100); // 690
  });

  it('clamps to padding when coordinates are negative', () => {
    const clamped = clampToWindowBounds(
      { x: -50, y: -20, width: 150, height: 80 },
      8,
      1000,
      800,
    );

    expect(clamped.left).toBe(8);
    expect(clamped.top).toBe(8);
  });
});
