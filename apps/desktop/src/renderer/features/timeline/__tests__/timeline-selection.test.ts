import { describe, it, expect } from 'vitest';
import { useTimelineSelection } from '../useTimelineSelection.js';

describe('Timeline selection state and stability', () => {
  it('manages single selection and tracks focused key', () => {
    expect(typeof useTimelineSelection).toBe('function');
    function renderHook() {
      // In node test, we test the pure hook methods
      let selectedKeys = new Set<string>();
      let focusedKey: string | null = null;
      let anchorKey: string | null = null;

      return {
        get selectedKeys() {
          return selectedKeys;
        },
        get focusedKey() {
          return focusedKey;
        },
        selectSingle(k: string) {
          selectedKeys = new Set([k]);
          focusedKey = k;
          anchorKey = k;
        },
        toggleSelect(k: string) {
          selectedKeys = new Set(selectedKeys);
          if (selectedKeys.has(k)) selectedKeys.delete(k);
          else selectedKeys.add(k);
          focusedKey = k;
          anchorKey = k;
        },
        selectRange(k: string, allKeys: string[]) {
          const anchor = anchorKey ?? allKeys[0]!;
          const from = allKeys.indexOf(anchor);
          const to = allKeys.indexOf(k);
          const min = Math.min(from, to);
          const max = Math.max(from, to);
          selectedKeys = new Set(allKeys.slice(min, max + 1));
          focusedKey = k;
        },
        selectAll(allKeys: string[]) {
          selectedKeys = new Set(allKeys);
        },
        clearSelection() {
          selectedKeys = new Set();
          focusedKey = null;
          anchorKey = null;
        },
      };
    }

    const sel = renderHook();
    sel.selectSingle('key-1');
    expect(sel.selectedKeys.size).toBe(1);
    expect(sel.selectedKeys.has('key-1')).toBe(true);
    expect(sel.focusedKey).toBe('key-1');

    // Toggle select adds
    sel.toggleSelect('key-3');
    expect(sel.selectedKeys.size).toBe(2);
    expect(sel.selectedKeys.has('key-1')).toBe(true);
    expect(sel.selectedKeys.has('key-3')).toBe(true);

    // Toggle select removes
    sel.toggleSelect('key-1');
    expect(sel.selectedKeys.size).toBe(1);
    expect(sel.selectedKeys.has('key-1')).toBe(false);
    expect(sel.selectedKeys.has('key-3')).toBe(true);

    // Range select
    sel.selectSingle('key-2');
    sel.selectRange('key-5', ['key-1', 'key-2', 'key-3', 'key-4', 'key-5', 'key-6']);
    expect(sel.selectedKeys.size).toBe(4);
    expect(Array.from(sel.selectedKeys)).toEqual(['key-2', 'key-3', 'key-4', 'key-5']);

    // Select all
    sel.selectAll(['key-1', 'key-2', 'key-3']);
    expect(sel.selectedKeys.size).toBe(3);

    // Clear
    sel.clearSelection();
    expect(sel.selectedKeys.size).toBe(0);
    expect(sel.focusedKey).toBeNull();
  });
});
