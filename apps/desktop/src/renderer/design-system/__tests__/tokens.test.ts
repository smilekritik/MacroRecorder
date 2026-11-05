import { describe, it, expect } from 'vitest';
import {
  DARK_THEME_TOKENS,
  LIGHT_THEME_TOKENS,
  THEME_TOKENS,
  CSS_VARIABLE_NAMES,
  getThemeCssVariables,
  tailwindThemePreset,
} from '../tokens.js';
import type { ThemeBrushTokens } from '../types.js';

describe('Theme tokens and brush mapping', () => {
  const REQUIRED_BRUSH_KEYS: (keyof ThemeBrushTokens)[] = [
    'windowBackground',
    'surface',
    'surfaceRaised',
    'surfaceHover',
    'inputBackground',
    'border',
    'borderSubtle',
    'textPrimary',
    'textSecondary',
    'textMuted',
    'textDisabled',
    'accent',
    'accentHover',
    'accentPressed',
    'accentForeground',
    'save',
    'saveHover',
    'savePressed',
    'saveForeground',
    'focus',
    'danger',
    'dangerSurface',
    'dangerHover',
    'dangerStrong',
    'dangerStrongHover',
    'dangerStrongForeground',
    'warning',
    'warningSurface',
    'conflict',
    'conflictSurface',
    'hookBind',
    'selection',
    'tableSelection',
    'overlay',
    'background',
    'panel',
    'panelRaised',
    'muted',
  ];

  it('maps every semantic brush role in dark theme', () => {
    for (const key of REQUIRED_BRUSH_KEYS) {
      expect(DARK_THEME_TOKENS[key], `Dark theme missing brush: ${key}`).toBeDefined();
      expect(typeof DARK_THEME_TOKENS[key]).toBe('string');
      expect(DARK_THEME_TOKENS[key].length).toBeGreaterThan(0);
    }
  });

  it('maps every semantic brush role in light theme', () => {
    for (const key of REQUIRED_BRUSH_KEYS) {
      expect(LIGHT_THEME_TOKENS[key], `Light theme missing brush: ${key}`).toBeDefined();
      expect(typeof LIGHT_THEME_TOKENS[key]).toBe('string');
      expect(LIGHT_THEME_TOKENS[key].length).toBeGreaterThan(0);
    }
  });

  it('matches exact hex colors of the dark theme', () => {
    expect(DARK_THEME_TOKENS.windowBackground).toBe('#0D1117');
    expect(DARK_THEME_TOKENS.surface).toBe('#151B23');
    expect(DARK_THEME_TOKENS.surfaceRaised).toBe('#1B2330');
    expect(DARK_THEME_TOKENS.accent).toBe('#66E06F');
    expect(DARK_THEME_TOKENS.focus).toBe('#8AB4FF');
    expect(DARK_THEME_TOKENS.danger).toBe('#FF6978');
    expect(DARK_THEME_TOKENS.conflict).toBe('#FF7AC8');
    expect(DARK_THEME_TOKENS.hookBind).toBe('#B79CFF');
  });

  it('matches exact hex colors of the light theme', () => {
    expect(LIGHT_THEME_TOKENS.windowBackground).toBe('#F3F6F9');
    expect(LIGHT_THEME_TOKENS.surface).toBe('#FFFFFF');
    expect(LIGHT_THEME_TOKENS.surfaceRaised).toBe('#E8EEF4');
    expect(LIGHT_THEME_TOKENS.accent).toBe('#18752A');
    expect(LIGHT_THEME_TOKENS.focus).toBe('#075BC7');
    expect(LIGHT_THEME_TOKENS.danger).toBe('#A7192C');
    expect(LIGHT_THEME_TOKENS.conflict).toBe('#A81E7A');
    expect(LIGHT_THEME_TOKENS.hookBind).toBe('#7C3AED');
  });

  it('maps resolved themes to DARK_THEME_TOKENS and LIGHT_THEME_TOKENS', () => {
    expect(THEME_TOKENS.dark).toBe(DARK_THEME_TOKENS);
    expect(THEME_TOKENS.light).toBe(LIGHT_THEME_TOKENS);
  });

  it('provides CSS variable names for every brush role', () => {
    for (const key of REQUIRED_BRUSH_KEYS) {
      const varName = CSS_VARIABLE_NAMES[key];
      expect(varName).toBeDefined();
      expect(varName.startsWith('--color-')).toBe(true);
    }
  });

  it('generates inline CSS variables object for dark and light', () => {
    const darkStyles = getThemeCssVariables('dark');
    expect(darkStyles['--color-window-bg']).toBe('#0D1117');
    expect(darkStyles['--color-accent']).toBe('#66E06F');

    const lightStyles = getThemeCssVariables('light');
    expect(lightStyles['--color-window-bg']).toBe('#F3F6F9');
    expect(lightStyles['--color-accent']).toBe('#18752A');
  });

  it('exposes tailwind theme preset with extended semantic colors', () => {
    expect(tailwindThemePreset.theme.extend.colors.window).toBe('var(--color-window-bg)');
    expect(tailwindThemePreset.theme.extend.colors.surface.DEFAULT).toBe('var(--color-surface)');
    expect(tailwindThemePreset.theme.extend.colors.accent.DEFAULT).toBe('var(--color-accent)');
    expect(tailwindThemePreset.theme.extend.colors.conflict.DEFAULT).toBe('var(--color-conflict)');
    expect(tailwindThemePreset.theme.extend.colors.hook.DEFAULT).toBe('var(--color-hook-bind)');
  });
});
