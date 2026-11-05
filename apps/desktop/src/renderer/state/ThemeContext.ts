import React, { createContext, useContext, useMemo } from 'react';
import type { ResolvedTheme, ThemeMode } from '../design-system/types.js';
import { useTheme } from '../hooks/useTheme.js';

export interface ThemeContextValue {
  readonly mode: ThemeMode;
  readonly resolvedTheme: ResolvedTheme;
  readonly setMode: (mode: ThemeMode) => void;
  readonly toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export interface ThemeProviderProps {
  readonly initialMode?: ThemeMode | undefined;
  readonly children?: React.ReactNode | undefined;
}

export function ThemeProvider({
  initialMode = 'dark',
  children,
}: ThemeProviderProps): React.ReactElement {
  const theme = useTheme(initialMode);

  const value = useMemo<ThemeContextValue>(
    () => ({
      mode: theme.mode,
      resolvedTheme: theme.resolvedTheme,
      setMode: theme.setMode,
      toggleTheme: theme.toggleTheme,
    }),
    [theme.mode, theme.resolvedTheme, theme.setMode, theme.toggleTheme],
  );

  return React.createElement(ThemeContext.Provider, { value }, children);
}

export function useThemeContext(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error('useThemeContext must be used within a ThemeProvider');
  }
  return ctx;
}
