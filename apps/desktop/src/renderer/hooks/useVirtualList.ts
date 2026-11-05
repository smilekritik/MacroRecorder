import { useState, useCallback, useMemo } from 'react';
import { computeVirtualRange } from '../design-system/VirtualList.js';

export interface UseVirtualListOptions<T> {
  readonly items: ReadonlyArray<T>;
  readonly itemHeight: number;
  readonly containerHeight: number;
  readonly overscan?: number | undefined;
  readonly initialSelectedKeys?: ReadonlySet<string> | undefined;
  readonly getItemKey?: ((item: T, index: number) => string) | undefined;
}

/**
 * Hook for virtualized list state management.
 * Preserves selection state across scrolling transitions.
 */
export function useVirtualList<T>({
  items,
  itemHeight,
  containerHeight,
  overscan = 5,
  initialSelectedKeys = new Set<string>(),
  getItemKey = (_item: T, index: number) => String(index),
}: UseVirtualListOptions<T>) {
  const [scrollTop, setScrollTop] = useState(0);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(
    () => new Set(initialSelectedKeys),
  );
  const [focusedIndex, setFocusedIndex] = useState(0);

  const virtualRange = useMemo(() => {
    return computeVirtualRange({
      itemCount: items.length,
      itemHeight,
      containerHeight,
      scrollTop,
      overscan,
    });
  }, [items.length, itemHeight, containerHeight, scrollTop, overscan]);

  const toggleSelect = useCallback(
    (key: string) => {
      setSelectedKeys((prev) => {
        const next = new Set(prev);
        if (next.has(key)) {
          next.delete(key);
        } else {
          next.add(key);
        }
        return next;
      });
    },
    [],
  );

  const selectRange = useCallback(
    (fromIndex: number, toIndex: number) => {
      const min = Math.max(0, Math.min(fromIndex, toIndex));
      const max = Math.min(items.length - 1, Math.max(fromIndex, toIndex));
      setSelectedKeys((prev) => {
        const next = new Set(prev);
        for (let i = min; i <= max; i++) {
          const item = items[i];
          if (item !== undefined) {
            next.add(getItemKey(item, i));
          }
        }
        return next;
      });
    },
    [items, getItemKey],
  );

  const selectAll = useCallback(() => {
    const all = new Set<string>();
    items.forEach((item, index) => {
      all.add(getItemKey(item, index));
    });
    setSelectedKeys(all);
  }, [items, getItemKey]);

  const clearSelection = useCallback(() => {
    setSelectedKeys(new Set());
  }, []);

  const isSelected = useCallback(
    (key: string) => selectedKeys.has(key),
    [selectedKeys],
  );

  return {
    scrollTop,
    setScrollTop,
    selectedKeys,
    setSelectedKeys,
    focusedIndex,
    setFocusedIndex,
    virtualRange,
    toggleSelect,
    selectRange,
    selectAll,
    clearSelection,
    isSelected,
  };
}
