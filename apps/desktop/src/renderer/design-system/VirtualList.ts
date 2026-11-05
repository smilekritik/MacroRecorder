import React, {
  useRef,
  useState,
  useCallback,
  useImperativeHandle,
  forwardRef,
} from 'react';

export interface VirtualItemInfo {
  readonly index: number;
  readonly key: string;
  readonly isSelected: boolean;
  readonly isFocused: boolean;
}

export interface VirtualListHandle {
  readonly scrollToIndex: (index: number) => void;
  readonly focus: () => void;
}

export interface VirtualListProps<T> {
  readonly items: ReadonlyArray<T>;
  readonly itemHeight: number | ((index: number, item: T) => number);
  readonly containerHeight: number;
  readonly getItemKey: (item: T, index: number) => string;
  readonly selectedKeys: ReadonlySet<string>;
  readonly focusedIndex?: number | undefined;
  readonly onFocusChange?: ((index: number) => void) | undefined;
  readonly onSelectionChange?: ((newSelectedKeys: Set<string>) => void) | undefined;
  readonly onToggleSelect?: ((key: string, index: number) => void) | undefined;
  readonly onSelectRange?: ((fromIndex: number, toIndex: number) => void) | undefined;
  readonly onSelectAll?: (() => void) | undefined;
  readonly renderItem: (item: T, info: VirtualItemInfo) => React.ReactNode;
  readonly overscan?: number | undefined;
  readonly className?: string | undefined;
  readonly 'aria-label'?: string | undefined;
}

/**
 * Pure calculation helper for virtualization range.
 * Exported for unit testing and headless calculations.
 */
export function computeVirtualRange({
  itemCount,
  itemHeight,
  containerHeight,
  scrollTop,
  overscan = 5,
}: {
  readonly itemCount: number;
  readonly itemHeight: number;
  readonly containerHeight: number;
  readonly scrollTop: number;
  readonly overscan?: number;
}): {
  readonly startIndex: number;
  readonly endIndex: number;
  readonly totalHeight: number;
  readonly offsetY: number;
} {
  if (itemCount === 0 || itemHeight <= 0) {
    return { startIndex: 0, endIndex: 0, totalHeight: 0, offsetY: 0 };
  }

  const totalHeight = itemCount * itemHeight;
  const rawStart = Math.floor(scrollTop / itemHeight);
  const visibleCount = Math.ceil(containerHeight / itemHeight);

  const startIndex = Math.max(0, rawStart - overscan);
  const endIndex = Math.min(itemCount, rawStart + visibleCount + overscan);
  const offsetY = startIndex * itemHeight;

  return { startIndex, endIndex, totalHeight, offsetY };
}

/**
 * High-performance virtualized list with keyboard navigation and robust selection preservation.
 * Guarantees that selected items are never lost when scrolled off-screen.
 */
export const VirtualList = forwardRef(function VirtualList<T>(
  {
    items,
    itemHeight,
    containerHeight,
    getItemKey,
    selectedKeys,
    focusedIndex: controlledFocusedIndex,
    onFocusChange,
    onSelectionChange,
    onToggleSelect,
    onSelectRange,
    onSelectAll,
    renderItem,
    overscan = 5,
    className = '',
    'aria-label': customAriaLabel,
  }: VirtualListProps<T>,
  ref: React.Ref<VirtualListHandle>,
) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [internalFocusedIndex, setInternalFocusedIndex] = useState(0);

  const focusedIndex = controlledFocusedIndex ?? internalFocusedIndex;
  const setFocused = useCallback(
    (index: number) => {
      setInternalFocusedIndex(index);
      onFocusChange?.(index);
    },
    [onFocusChange],
  );

  const fixedHeight = typeof itemHeight === 'number' ? itemHeight : 42;

  const { startIndex, endIndex, totalHeight, offsetY } = computeVirtualRange({
    itemCount: items.length,
    itemHeight: fixedHeight,
    containerHeight,
    scrollTop,
    overscan,
  });

  const scrollToIndex = useCallback(
    (index: number) => {
      if (!containerRef.current || index < 0 || index >= items.length) return;
      const targetTop = index * fixedHeight;
      const currentScroll = containerRef.current.scrollTop;

      if (targetTop < currentScroll) {
        containerRef.current.scrollTop = targetTop;
      } else if (targetTop + fixedHeight > currentScroll + containerHeight) {
        containerRef.current.scrollTop = targetTop + fixedHeight - containerHeight;
      }
    },
    [fixedHeight, containerHeight, items.length],
  );

  useImperativeHandle(
    ref,
    () => ({
      scrollToIndex,
      focus: () => containerRef.current?.focus(),
    }),
    [scrollToIndex],
  );

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    setScrollTop(e.currentTarget.scrollTop);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (items.length === 0) return;

    const pageSize = Math.max(1, Math.floor(containerHeight / fixedHeight));

    switch (e.key) {
      case 'ArrowDown': {
        e.preventDefault();
        const next = Math.min(items.length - 1, focusedIndex + 1);
        setFocused(next);
        scrollToIndex(next);
        if (e.shiftKey && onSelectRange) {
          onSelectRange(focusedIndex, next);
        }
        break;
      }
      case 'ArrowUp': {
        e.preventDefault();
        const prev = Math.max(0, focusedIndex - 1);
        setFocused(prev);
        scrollToIndex(prev);
        if (e.shiftKey && onSelectRange) {
          onSelectRange(focusedIndex, prev);
        }
        break;
      }
      case 'PageDown': {
        e.preventDefault();
        const next = Math.min(items.length - 1, focusedIndex + pageSize);
        setFocused(next);
        scrollToIndex(next);
        break;
      }
      case 'PageUp': {
        e.preventDefault();
        const prev = Math.max(0, focusedIndex - pageSize);
        setFocused(prev);
        scrollToIndex(prev);
        break;
      }
      case 'Home': {
        e.preventDefault();
        setFocused(0);
        scrollToIndex(0);
        break;
      }
      case 'End': {
        e.preventDefault();
        setFocused(items.length - 1);
        scrollToIndex(items.length - 1);
        break;
      }
      case ' ':
      case 'Enter': {
        e.preventDefault();
        const item = items[focusedIndex];
        if (item !== undefined) {
          const key = getItemKey(item, focusedIndex);
          if (onToggleSelect) {
            onToggleSelect(key, focusedIndex);
          } else if (onSelectionChange) {
            const nextSet = new Set(selectedKeys);
            if (nextSet.has(key)) {
              nextSet.delete(key);
            } else {
              nextSet.add(key);
            }
            onSelectionChange(nextSet);
          }
        }
        break;
      }
      case 'a':
      case 'A': {
        if (e.ctrlKey || e.metaKey) {
          e.preventDefault();
          if (onSelectAll) {
            onSelectAll();
          } else if (onSelectionChange) {
            const allKeys = new Set(items.map((it, idx) => getItemKey(it, idx)));
            onSelectionChange(allKeys);
          }
        }
        break;
      }
    }
  };

  const visibleItems = items.slice(startIndex, endIndex);

  const renderedRows = visibleItems.map((item, localIndex) => {
    const index = startIndex + localIndex;
    const key = getItemKey(item, index);
    const isSelected = selectedKeys.has(key);
    const isFocused = index === focusedIndex;

    return React.createElement(
      'div',
      {
        key,
        role: 'option',
        'aria-selected': isSelected,
        onClick: () => {
          setFocused(index);
          if (onToggleSelect) {
            onToggleSelect(key, index);
          } else if (onSelectionChange) {
            const next = new Set(selectedKeys);
            if (next.has(key)) next.delete(key);
            else next.add(key);
            onSelectionChange(next);
          }
        },
        className: `w-full transition-colors
          ${
            isSelected
              ? 'bg-[var(--color-table-selection)] border-l-3 border-[var(--color-accent)] font-semibold'
              : 'hover:bg-[var(--color-surface-hover)]'
          }
          ${isFocused ? 'ring-1 ring-inset ring-[var(--color-focus)]' : ''}`,
        style: { height: `${fixedHeight}px` },
      },
      renderItem(item, { index, key, isSelected, isFocused }),
    );
  });

  const innerWindow = React.createElement(
    'div',
    {
      style: {
        transform: `translateY(${offsetY}px)`,
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
      },
    },
    ...renderedRows,
  );

  const spacerContainer = React.createElement(
    'div',
    {
      style: { height: `${totalHeight}px`, width: '100%', position: 'relative' },
    },
    innerWindow,
  );

  return React.createElement(
    'div',
    {
      ref: containerRef,
      tabIndex: 0,
      role: 'listbox',
      'aria-multiselectable': 'true',
      'aria-label': customAriaLabel,
      onScroll: handleScroll,
      onKeyDown: handleKeyDown,
      className: `relative overflow-y-auto outline-none select-none
        focus-visible:ring-2 focus-visible:ring-[var(--color-focus)] focus-visible:ring-inset
        ${className}`,
      style: { height: `${containerHeight}px` },
    },
    spacerContainer,
  );
}) as <T>(
  props: VirtualListProps<T> & { ref?: React.Ref<VirtualListHandle> },
) => React.ReactElement;
