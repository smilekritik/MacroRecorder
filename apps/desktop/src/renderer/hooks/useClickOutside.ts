import { useEffect, useRef } from 'react';

export function useClickOutside<T extends HTMLElement = HTMLElement>(
  handler: (e: PointerEvent) => void,
  enabled = true,
) {
  const ref = useRef<T | null>(null);
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    if (!enabled) return;

    const onPointerDown = (e: PointerEvent) => {
      const el = ref.current;
      if (!el || el.contains(e.target as Node | null)) return;
      handlerRef.current(e);
    };

    window.addEventListener('pointerdown', onPointerDown);

    return () => {
      window.removeEventListener('pointerdown', onPointerDown);
    };
  }, [enabled]);

  return ref;
}
