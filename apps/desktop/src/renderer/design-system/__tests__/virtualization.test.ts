import { describe, it, expect } from 'vitest';
import { computeVirtualRange } from '../VirtualList.js';

describe('Virtualization calculations and selection preservation', () => {
  it('computes correct initial range for a long list', () => {
    // 1000 items, each 40px high. Container is 400px high (10 visible).
    // Overscan is 5.
    const range = computeVirtualRange({
      itemCount: 1000,
      itemHeight: 40,
      containerHeight: 400,
      scrollTop: 0,
      overscan: 5,
    });

    expect(range.totalHeight).toBe(40000);
    expect(range.startIndex).toBe(0);
    // 0 + 10 visible + 5 overscan = 15
    expect(range.endIndex).toBe(15);
    expect(range.offsetY).toBe(0);
  });

  it('computes correct range in the middle of a large list', () => {
    // Scroll to 2000px: 2000 / 40 = item index 50
    // Visible: 400 / 40 = 10 items
    // Start index with overscan 5: max(0, 50 - 5) = 45
    // End index with overscan 5: min(1000, 50 + 10 + 5) = 65
    const range = computeVirtualRange({
      itemCount: 1000,
      itemHeight: 40,
      containerHeight: 400,
      scrollTop: 2000,
      overscan: 5,
    });

    expect(range.startIndex).toBe(45);
    expect(range.endIndex).toBe(65);
    expect(range.offsetY).toBe(45 * 40); // 1800
  });

  it('clamps to bottom bounds when scrolled near or at the end', () => {
    // Scroll to near end (e.g. 39600px -> item 990)
    const range = computeVirtualRange({
      itemCount: 1000,
      itemHeight: 40,
      containerHeight: 400,
      scrollTop: 39600,
      overscan: 5,
    });

    expect(range.startIndex).toBe(985);
    expect(range.endIndex).toBe(1000);
    expect(range.offsetY).toBe(985 * 40);
  });

  it('handles empty list gracefully', () => {
    const range = computeVirtualRange({
      itemCount: 0,
      itemHeight: 40,
      containerHeight: 400,
      scrollTop: 0,
    });

    expect(range.startIndex).toBe(0);
    expect(range.endIndex).toBe(0);
    expect(range.totalHeight).toBe(0);
    expect(range.offsetY).toBe(0);
  });

  it('preserves selection state across scroll transitions', () => {
    // Simulate long macro list: 5,000 items
    const itemCount = 5000;
    const selectedKeys = new Set<string>(['macro-0', 'macro-150', 'macro-4999']);

    // At top: macro-0 is in visible range, macro-150 and macro-4999 are off-screen
    const topRange = computeVirtualRange({
      itemCount,
      itemHeight: 40,
      containerHeight: 400,
      scrollTop: 0,
      overscan: 5,
    });

    expect(topRange.startIndex).toBe(0);
    expect(topRange.endIndex).toBe(15);
    // macro-0 is visible
    expect(0 >= topRange.startIndex && 0 < topRange.endIndex).toBe(true);
    // macro-150 is off-screen
    expect(150 >= topRange.startIndex && 150 < topRange.endIndex).toBe(false);

    // Assert that the selection set remains intact regardless of view
    expect(selectedKeys.has('macro-0')).toBe(true);
    expect(selectedKeys.has('macro-150')).toBe(true);
    expect(selectedKeys.has('macro-4999')).toBe(true);

    // Scroll to middle (around item 150)
    const midRange = computeVirtualRange({
      itemCount,
      itemHeight: 40,
      containerHeight: 400,
      scrollTop: 150 * 40,
      overscan: 5,
    });

    // macro-150 is now visible, macro-0 is off-screen
    expect(150 >= midRange.startIndex && 150 < midRange.endIndex).toBe(true);
    expect(0 >= midRange.startIndex && 0 < midRange.endIndex).toBe(false);

    // Selection of all items (both visible and off-screen) is preserved!
    expect(selectedKeys.has('macro-0')).toBe(true);
    expect(selectedKeys.has('macro-150')).toBe(true);
    expect(selectedKeys.has('macro-4999')).toBe(true);
    expect(selectedKeys.size).toBe(3);
  });
});
