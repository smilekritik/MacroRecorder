import type { ResolvedTheme, ThemeBrushTokens } from './types.js';

/**
 * Dark theme tokens exact hex mapping.
 */
export const DARK_THEME_TOKENS: ThemeBrushTokens = {
  windowBackground: '#0D1117',
  surface: '#151B23',
  surfaceRaised: '#1B2330',
  surfaceHover: '#253142',
  inputBackground: '#202A38',
  border: '#687A91',
  borderSubtle: '#2B3544',
  textPrimary: '#F0F4F8',
  textSecondary: '#C0CAD6',
  textMuted: '#9AA8B7',
  textDisabled: '#768494',
  accent: '#66E06F',
  accentHover: '#7BEC83',
  accentPressed: '#4FCB59',
  accentForeground: '#071108',
  save: '#175C2C',
  saveHover: '#1D7136',
  savePressed: '#124A23',
  saveForeground: '#FFFFFF',
  focus: '#8AB4FF',
  danger: '#FF6978',
  dangerSurface: '#43242B',
  dangerHover: '#573039',
  dangerStrong: '#B92F44',
  dangerStrongHover: '#D13B53',
  dangerStrongForeground: '#FFFFFF',
  warning: '#FFD166',
  warningSurface: '#332A16',
  conflict: '#FF7AC8',
  conflictSurface: '#40203A',
  hookBind: '#B79CFF',
  selection: '#263D2C',
  tableSelection: '#263548',
  overlay: '#121720E6', // #E6121720 in ARGB -> #121720E6 in RGBA hex

  // Compatibility aliases
  background: '#0D1117',
  panel: '#151B23',
  panelRaised: '#1B2330',
  muted: '#9AA8B7',
};

/**
 * Light theme tokens exact hex mapping.
 */
export const LIGHT_THEME_TOKENS: ThemeBrushTokens = {
  windowBackground: '#F3F6F9',
  surface: '#FFFFFF',
  surfaceRaised: '#E8EEF4',
  surfaceHover: '#DCE5ED',
  inputBackground: '#FFFFFF',
  border: '#718096',
  borderSubtle: '#CBD5E1',
  textPrimary: '#15202B',
  textSecondary: '#354454',
  textMuted: '#526273',
  textDisabled: '#6B7785',
  accent: '#18752A',
  accentHover: '#126221',
  accentPressed: '#0D511A',
  accentForeground: '#FFFFFF',
  save: '#146C2E',
  saveHover: '#0F5925',
  savePressed: '#0B471D',
  saveForeground: '#FFFFFF',
  focus: '#075BC7',
  danger: '#A7192C',
  dangerSurface: '#FBE9EC',
  dangerHover: '#F5D2D8',
  dangerStrong: '#A7192C',
  dangerStrongHover: '#8F1425',
  dangerStrongForeground: '#FFFFFF',
  warning: '#6B4F00',
  warningSurface: '#FFF4CF',
  conflict: '#A81E7A',
  conflictSurface: '#FBE2F2',
  hookBind: '#7C3AED',
  selection: '#DDF4E1',
  tableSelection: '#DCE8F5',
  overlay: '#FFFFFFEB', // #F2FFFFFF in ARGB -> #FFFFFFEB in RGBA hex (approx 95% opacity)

  // Compatibility aliases
  background: '#F3F6F9',
  panel: '#FFFFFF',
  panelRaised: '#E8EEF4',
  muted: '#526273',
};

export const THEME_TOKENS: Record<ResolvedTheme, ThemeBrushTokens> = {
  dark: DARK_THEME_TOKENS,
  light: LIGHT_THEME_TOKENS,
};

/**
 * CSS custom property names corresponding to each theme brush.
 */
export const CSS_VARIABLE_NAMES: Record<keyof ThemeBrushTokens, string> = {
  windowBackground: '--color-window-bg',
  surface: '--color-surface',
  surfaceRaised: '--color-surface-raised',
  surfaceHover: '--color-surface-hover',
  inputBackground: '--color-input-bg',
  border: '--color-border',
  borderSubtle: '--color-border-subtle',
  textPrimary: '--color-text-primary',
  textSecondary: '--color-text-secondary',
  textMuted: '--color-text-muted',
  textDisabled: '--color-text-disabled',
  accent: '--color-accent',
  accentHover: '--color-accent-hover',
  accentPressed: '--color-accent-pressed',
  accentForeground: '--color-accent-foreground',
  save: '--color-save',
  saveHover: '--color-save-hover',
  savePressed: '--color-save-pressed',
  saveForeground: '--color-save-foreground',
  focus: '--color-focus',
  danger: '--color-danger',
  dangerSurface: '--color-danger-surface',
  dangerHover: '--color-danger-hover',
  dangerStrong: '--color-danger-strong',
  dangerStrongHover: '--color-danger-strong-hover',
  dangerStrongForeground: '--color-danger-strong-foreground',
  warning: '--color-warning',
  warningSurface: '--color-warning-surface',
  conflict: '--color-conflict',
  conflictSurface: '--color-conflict-surface',
  hookBind: '--color-hook-bind',
  selection: '--color-selection',
  tableSelection: '--color-table-selection',
  overlay: '--color-overlay',
  background: '--color-background',
  panel: '--color-panel',
  panelRaised: '--color-panel-raised',
  muted: '--color-muted',
};

/**
 * Generates an object of inline CSS style properties for a given theme.
 */
export function getThemeCssVariables(theme: ResolvedTheme): Record<string, string> {
  const tokens = THEME_TOKENS[theme];
  const styles: Record<string, string> = {};
  for (const key of Object.keys(tokens) as (keyof ThemeBrushTokens)[]) {
    styles[CSS_VARIABLE_NAMES[key]] = tokens[key];
  }
  return styles;
}

/**
 * Tailwind preset configuration mapping semantic tokens to CSS custom variables.
 */
export const tailwindThemePreset = {
  theme: {
    extend: {
      colors: {
        window: 'var(--color-window-bg)',
        surface: {
          DEFAULT: 'var(--color-surface)',
          raised: 'var(--color-surface-raised)',
          hover: 'var(--color-surface-hover)',
        },
        input: {
          bg: 'var(--color-input-bg)',
        },
        border: {
          DEFAULT: 'var(--color-border)',
          subtle: 'var(--color-border-subtle)',
        },
        text: {
          primary: 'var(--color-text-primary)',
          secondary: 'var(--color-text-secondary)',
          muted: 'var(--color-text-muted)',
          disabled: 'var(--color-text-disabled)',
        },
        accent: {
          DEFAULT: 'var(--color-accent)',
          hover: 'var(--color-accent-hover)',
          pressed: 'var(--color-accent-pressed)',
          foreground: 'var(--color-accent-foreground)',
        },
        save: {
          DEFAULT: 'var(--color-save)',
          hover: 'var(--color-save-hover)',
          pressed: 'var(--color-save-pressed)',
          foreground: 'var(--color-save-foreground)',
        },
        focus: {
          DEFAULT: 'var(--color-focus)',
        },
        danger: {
          DEFAULT: 'var(--color-danger)',
          surface: 'var(--color-danger-surface)',
          hover: 'var(--color-danger-hover)',
          strong: 'var(--color-danger-strong)',
          strongHover: 'var(--color-danger-strong-hover)',
          strongForeground: 'var(--color-danger-strong-foreground)',
        },
        warning: {
          DEFAULT: 'var(--color-warning)',
          surface: 'var(--color-warning-surface)',
        },
        conflict: {
          DEFAULT: 'var(--color-conflict)',
          surface: 'var(--color-conflict-surface)',
        },
        hook: {
          DEFAULT: 'var(--color-hook-bind)',
        },
        selection: {
          DEFAULT: 'var(--color-selection)',
          table: 'var(--color-table-selection)',
        },
        overlay: {
          DEFAULT: 'var(--color-overlay)',
        },
      },
      fontFamily: {
        sans: [
          '"Segoe UI Variable Text"',
          '"Segoe UI"',
          '-apple-system',
          'BlinkMacSystemFont',
          'sans-serif',
        ],
      },
      borderRadius: {
        card: '10px',
        panel: '7px',
        control: '6px',
        pill: '12px',
      },
    },
  },
};
