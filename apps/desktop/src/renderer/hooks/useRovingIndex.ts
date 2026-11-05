import { useState, useCallback } from 'react';

export interface UseRovingIndexOptions {
  readonly itemCount: number;
  readonly initialIndex?: number | undefined;
  readonly orientation?: 'horizontal' | 'vertical' | 'both' | undefined;
  readonly loop?: boolean | undefined;
}

/**
 * Manages roving tabIndex for accessible composite widgets (lists, toolbars, menus, tabs).
 */
export function useRovingIndex({
  itemCount,
  initialIndex = 0,
  orientation = 'vertical',
  loop = true,
}: UseRovingIndexOptions) {
  const [focusedIndex, setFocusedIndex] = useState(initialIndex);

  const moveNext = useCallback(() => {
    setFocusedIndex((prev) => {
      if (prev + 1 < itemCount) return prev + 1;
      return loop ? 0 : prev;
    });
  }, [itemCount, loop]);

  const movePrev = useCallback(() => {
    setFocusedIndex((prev) => {
      if (prev - 1 >= 0) return prev - 1;
      return loop ? itemCount - 1 : prev;
    });
  }, [itemCount, loop]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const isVertical = orientation === 'vertical' || orientation === 'both';
      const isHorizontal = orientation === 'horizontal' || orientation === 'both';

      if ((isVertical && e.key === 'ArrowDown') || (isHorizontal && e.key === 'ArrowRight')) {
        e.preventDefault();
        moveNext();
      } else if (
        (isVertical && e.key === 'ArrowUp') ||
        (isHorizontal && e.key === 'ArrowLeft')
      ) {
        e.preventDefault();
        movePrev();
      } else if (e.key === 'Home') {
        e.preventDefault();
        setFocusedIndex(0);
      } else if (e.key === 'End') {
        e.preventDefault();
        setFocusedIndex(itemCount - 1);
      }
    },
    [orientation, moveNext, movePrev, itemCount],
  );

  const getTabIndex = useCallback(
    (index: number) => (index === focusedIndex ? 0 : -1),
    [focusedIndex],
  );

  return {
    focusedIndex,
    setFocusedIndex,
    moveNext,
    movePrev,
    handleKeyDown,
    getTabIndex,
  };
}
