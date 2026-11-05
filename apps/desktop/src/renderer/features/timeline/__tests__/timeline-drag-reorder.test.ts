import { describe, it, expect } from 'vitest';

describe('Timeline drag-and-drop reordering logic', () => {
  it('calculates insertion index before or after target row', () => {
    function computeInsertionIndex(
      targetIndex: number | null,
      isAfter: boolean,
      totalCount: number,
    ): number {
      if (targetIndex === null) return totalCount;
      const calculated = targetIndex + (isAfter ? 1 : 0);
      return Math.max(0, Math.min(totalCount, calculated));
    }

    // Drop on upper half of row 2 -> inserts at index 2
    expect(computeInsertionIndex(2, false, 5)).toBe(2);

    // Drop on lower half of row 2 -> inserts at index 3
    expect(computeInsertionIndex(2, true, 5)).toBe(3);

    // Drop on upper half of first row -> index 0
    expect(computeInsertionIndex(0, false, 5)).toBe(0);

    // Drop on lower half of last row -> index 5 (appends)
    expect(computeInsertionIndex(4, true, 5)).toBe(5);

    // Drop on empty container -> appends
    expect(computeInsertionIndex(null, false, 5)).toBe(5);
  });

  it('clamps drag insertion index within valid array bounds', () => {
    function clampInsertion(index: number, total: number) {
      return Math.max(0, Math.min(total, index));
    }
    expect(clampInsertion(-2, 10)).toBe(0);
    expect(clampInsertion(15, 10)).toBe(10);
    expect(clampInsertion(5, 10)).toBe(5);
  });
});
