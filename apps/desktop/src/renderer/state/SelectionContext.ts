import React, { createContext, useContext, useState, useCallback, useMemo } from 'react';

export interface SelectionContextValue {
  readonly selectedKeys: ReadonlySet<string>;
  readonly toggleSelect: (key: string) => void;
  readonly selectSingle: (key: string) => void;
  readonly selectRange: (fromKey: string, toKey: string, allOrderedKeys: ReadonlyArray<string>) => void;
  readonly selectAll: (allKeys: ReadonlyArray<string>) => void;
  readonly clearSelection: () => void;
  readonly isSelected: (key: string) => boolean;
}

const SelectionContext = createContext<SelectionContextValue | null>(null);

export interface SelectionProviderProps {
  readonly initialSelectedKeys?: ReadonlySet<string> | undefined;
  readonly onSelectionChange?: ((newKeys: ReadonlySet<string>) => void) | undefined;
  readonly children?: React.ReactNode | undefined;
}

/**
 * Selection state boundary.
 * Keeps selected keys persistent across virtualized scrolling and sorting operations.
 */
export function SelectionProvider({
  initialSelectedKeys = new Set<string>(),
  onSelectionChange,
  children,
}: SelectionProviderProps) {
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(
    () => new Set(initialSelectedKeys),
  );

  const updateSelection = useCallback(
    (updater: (prev: Set<string>) => Set<string>) => {
      setSelectedKeys((prev) => {
        const next = updater(prev);
        onSelectionChange?.(next);
        return next;
      });
    },
    [onSelectionChange],
  );

  const toggleSelect = useCallback(
    (key: string) => {
      updateSelection((prev) => {
        const next = new Set(prev);
        if (next.has(key)) next.delete(key);
        else next.add(key);
        return next;
      });
    },
    [updateSelection],
  );

  const selectSingle = useCallback(
    (key: string) => {
      updateSelection(() => new Set([key]));
    },
    [updateSelection],
  );

  const selectRange = useCallback(
    (fromKey: string, toKey: string, allOrderedKeys: ReadonlyArray<string>) => {
      const fromIdx = allOrderedKeys.indexOf(fromKey);
      const toIdx = allOrderedKeys.indexOf(toKey);
      if (fromIdx < 0 || toIdx < 0) return;

      const min = Math.min(fromIdx, toIdx);
      const max = Math.max(fromIdx, toIdx);

      updateSelection((prev) => {
        const next = new Set(prev);
        for (let i = min; i <= max; i++) {
          const k = allOrderedKeys[i];
          if (k !== undefined) next.add(k);
        }
        return next;
      });
    },
    [updateSelection],
  );

  const selectAll = useCallback(
    (allKeys: ReadonlyArray<string>) => {
      updateSelection(() => new Set(allKeys));
    },
    [updateSelection],
  );

  const clearSelection = useCallback(() => {
    updateSelection(() => new Set());
  }, [updateSelection]);

  const isSelected = useCallback(
    (key: string) => selectedKeys.has(key),
    [selectedKeys],
  );

  const value = useMemo<SelectionContextValue>(
    () => ({
      selectedKeys,
      toggleSelect,
      selectSingle,
      selectRange,
      selectAll,
      clearSelection,
      isSelected,
    }),
    [selectedKeys, toggleSelect, selectSingle, selectRange, selectAll, clearSelection, isSelected],
  );

  return React.createElement(SelectionContext.Provider, { value }, children);
}

export function useSelectionContext(): SelectionContextValue {
  const ctx = useContext(SelectionContext);
  if (!ctx) {
    throw new Error('useSelectionContext must be used within a SelectionProvider');
  }
  return ctx;
}
