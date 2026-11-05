import { describe, it, expect } from 'vitest';
import type { ResolvedTheme, ThemeMode } from '../../design-system/types.js';

function resolveTheme(mode: ThemeMode, systemIsDark: boolean): ResolvedTheme {
  if (mode === 'system') {
    return systemIsDark ? 'dark' : 'light';
  }
  return mode;
}

describe('Theme hook logic', () => {
  it('resolves dark theme when mode is dark', () => {
    expect(resolveTheme('dark', false)).toBe('dark');
  });

  it('resolves light theme when mode is light', () => {
    expect(resolveTheme('light', true)).toBe('light');
  });

  it('resolves system mode based on system preference', () => {
    expect(resolveTheme('system', true)).toBe('dark');
    expect(resolveTheme('system', false)).toBe('light');
  });
});
