import { useEffect, useRef } from 'react';

export interface ShortcutOptions {
  readonly ctrl?: boolean | undefined;
  readonly alt?: boolean | undefined;
  readonly shift?: boolean | undefined;
  readonly meta?: boolean | undefined;
  readonly target?: HTMLElement | null | undefined;
  readonly enabled?: boolean | undefined;
  readonly preventDefault?: boolean | undefined;
}

/**
 * Registers a keyboard shortcut handler.
 * Strictly removes the event listener on unmount.
 */
export function useKeyboardShortcut(
  key: string,
  handler: (e: KeyboardEvent) => void,
  options: ShortcutOptions = {},
): void {
  const {
    ctrl = false,
    alt = false,
    shift = false,
    meta = false,
    target = null,
    enabled = true,
    preventDefault = true,
  } = options;

  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const matchKey = e.key.toLowerCase() === key.toLowerCase();
      const matchCtrl = e.ctrlKey === ctrl;
      const matchAlt = e.altKey === alt;
      const matchShift = e.shiftKey === shift;
      const matchMeta = e.metaKey === meta;

      if (matchKey && matchCtrl && matchAlt && matchShift && matchMeta) {
        if (preventDefault) {
          e.preventDefault();
        }
        handlerRef.current(e);
      }
    };

    const element = target ?? (typeof window !== 'undefined' ? window : null);
    if (!element) return;

    element.addEventListener('keydown', handleKeyDown as EventListener);

    return () => {
      element.removeEventListener('keydown', handleKeyDown as EventListener);
    };
  }, [key, ctrl, alt, shift, meta, target, enabled, preventDefault]);
}
