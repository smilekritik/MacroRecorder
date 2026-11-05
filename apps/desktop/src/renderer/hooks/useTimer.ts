import { useEffect, useRef, useCallback } from 'react';

/**
 * Executes a callback after a given delay in milliseconds.
 * Strictly disposes the timer on unmount.
 */
export function useTimeout(
  callback: () => void,
  delayMs: number | null,
): { readonly reset: () => void; readonly clear: () => void } {
  const callbackRef = useRef(callback);
  callbackRef.current = callback;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clear = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const reset = useCallback(() => {
    clear();
    if (delayMs !== null && delayMs >= 0) {
      timerRef.current = setTimeout(() => {
        callbackRef.current();
      }, delayMs);
    }
  }, [delayMs, clear]);

  useEffect(() => {
    if (delayMs !== null && delayMs >= 0) {
      timerRef.current = setTimeout(() => {
        callbackRef.current();
      }, delayMs);
    }

    return () => {
      clear();
    };
  }, [delayMs, clear]);

  return { reset, clear };
}

/**
 * Periodically executes a callback every intervalMs milliseconds.
 * Strictly disposes the timer on unmount.
 */
export function useInterval(
  callback: () => void,
  intervalMs: number | null,
): { readonly clear: () => void } {
  const callbackRef = useRef(callback);
  callbackRef.current = callback;
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const clear = useCallback(() => {
    if (timerRef.current !== null) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (intervalMs !== null && intervalMs > 0) {
      timerRef.current = setInterval(() => {
        callbackRef.current();
      }, intervalMs);
    }

    return () => {
      clear();
    };
  }, [intervalMs, clear]);

  return { clear };
}
