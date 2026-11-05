/**
 * @macro-recorder/desktop - Focus Restoration Hook
 * Remembers the active focus element before opening modal dialogs and restores it upon closure.
 */

import { useRef, useCallback } from 'react';

export function useFocusRestoration() {
  const previousFocusedElement = useRef<HTMLElement | null>(null);

  const captureFocus = useCallback(() => {
    if (typeof document !== 'undefined' && document.activeElement instanceof HTMLElement) {
      previousFocusedElement.current = document.activeElement;
    }
  }, []);

  const restoreFocus = useCallback(() => {
    if (previousFocusedElement.current && typeof previousFocusedElement.current.focus === 'function') {
      try {
        previousFocusedElement.current.focus();
      } catch {
        // Fallback
      }
      previousFocusedElement.current = null;
    }
  }, []);

  return {
    captureFocus,
    restoreFocus,
  };
}
