/**
 * Selection hook for the virtualized timeline table supporting
 * single select, range select (Shift), multi-toggle (Ctrl/Cmd), select all, and clear.
 */

import { useState, useCallback, useRef } from 'react';

export function useTimelineSelection(initialKeys: ReadonlyArray<string> = []) {
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(() => new Set(initialKeys));
  const [focusedKey, setFocusedKey] = useState<string | null>(null);
  const anchorKeyRef = useRef<string | null>(null);

  const isSelected = useCallback(
    (key: string) => selectedKeys.has(key),
    [selectedKeys],
  );

  const selectSingle = useCallback((key: string) => {
    setSelectedKeys(new Set([key]));
    setFocusedKey(key);
    anchorKeyRef.current = key;
  }, []);

  const toggleSelect = useCallback((key: string) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
    setFocusedKey(key);
    anchorKeyRef.current = key;
  }, []);

  const selectRange = useCallback(
    (targetKey: string, allOrderedKeys: ReadonlyArray<string>) => {
      const anchor = anchorKeyRef.current ?? allOrderedKeys[0];
      if (!anchor) {
        selectSingle(targetKey);
        return;
      }

      const fromIdx = allOrderedKeys.indexOf(anchor);
      const toIdx = allOrderedKeys.indexOf(targetKey);
      if (fromIdx < 0 || toIdx < 0) {
        selectSingle(targetKey);
        return;
      }

      const min = Math.min(fromIdx, toIdx);
      const max = Math.max(fromIdx, toIdx);
      const rangeSet = new Set<string>();
      for (let i = min; i <= max; i++) {
        const k = allOrderedKeys[i];
        if (k) rangeSet.add(k);
      }

      setSelectedKeys(rangeSet);
      setFocusedKey(targetKey);
    },
    [selectSingle],
  );

  const selectAll = useCallback((allOrderedKeys: ReadonlyArray<string>) => {
    setSelectedKeys(new Set(allOrderedKeys));
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedKeys(new Set());
    setFocusedKey(null);
    anchorKeyRef.current = null;
  }, []);

  const setSelectedKeyList = useCallback((keys: ReadonlyArray<string>) => {
    setSelectedKeys(new Set(keys));
    if (keys.length > 0) {
      setFocusedKey(keys[0]!);
      anchorKeyRef.current = keys[0]!;
    } else {
      setFocusedKey(null);
      anchorKeyRef.current = null;
    }
  }, []);

  const handleRowClick = useCallback(
    (key: string, e: React.MouseEvent, allOrderedKeys: ReadonlyArray<string>) => {
      if (e.ctrlKey || e.metaKey) {
        toggleSelect(key);
      } else if (e.shiftKey) {
        selectRange(key, allOrderedKeys);
      } else {
        selectSingle(key);
      }
    },
    [toggleSelect, selectRange, selectSingle],
  );

  return {
    selectedKeys,
    focusedKey,
    setFocusedKey,
    isSelected,
    selectSingle,
    toggleSelect,
    selectRange,
    selectAll,
    clearSelection,
    setSelectedKeyList,
    handleRowClick,
  };
}
