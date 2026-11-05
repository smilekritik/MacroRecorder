import { useState, useEffect, useCallback, useMemo } from 'react';
import type { ResolvedTheme, ThemeMode } from '../design-system/types.js';

export interface UseThemeResult {
  readonly mode: ThemeMode;
  readonly resolvedTheme: ResolvedTheme;
  readonly setMode: (mode: ThemeMode) => void;
  readonly toggleTheme: () => void;
}

/**
 * Hook for managing theme state.
 * Syncs with system color scheme media query and cleans up listeners on unmount.
 * Injects `data-theme` onto document.documentElement.
 */
export function useTheme(initialMode: ThemeMode = 'dark'): UseThemeResult {
  const [mode, setMode] = useState<ThemeMode>(initialMode);
  const [systemIsDark, setSystemIsDark] = useState<boolean>(() => {
    if (typeof window !== 'undefined' && window.matchMedia) {
      return window.matchMedia('(prefers-color-scheme: dark)').matches;
    }
    return true;
  });

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = (e: MediaQueryListEvent) => {
      setSystemIsDark(e.matches);
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => {
      mediaQuery.removeEventListener('change', handleChange);
    };
  }, []);

  const resolvedTheme: ResolvedTheme = useMemo(() => {
    if (mode === 'system') {
      return systemIsDark ? 'dark' : 'light';
    }
    return mode;
  }, [mode, systemIsDark]);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.documentElement.setAttribute('data-theme', resolvedTheme);
  }, [resolvedTheme]);

  const toggleTheme = useCallback(() => {
    setMode((prev) => {
      if (prev === 'dark') return 'light';
      if (prev === 'light') return 'dark';
      return systemIsDark ? 'light' : 'dark';
    });
  }, [systemIsDark]);

  return {
    mode,
    resolvedTheme,
    setMode,
    toggleTheme,
  };
}
