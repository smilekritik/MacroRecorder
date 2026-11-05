/**
 * Design system types and theme definitions.
 * including bind-map priority hierarchies and control variants.
 */

export type ThemeMode = 'dark' | 'light' | 'system';

export type ResolvedTheme = 'dark' | 'light';

export interface ThemeBrushTokens {
  readonly windowBackground: string;
  readonly surface: string;
  readonly surfaceRaised: string;
  readonly surfaceHover: string;
  readonly inputBackground: string;
  readonly border: string;
  readonly borderSubtle: string;
  readonly textPrimary: string;
  readonly textSecondary: string;
  readonly textMuted: string;
  readonly textDisabled: string;
  readonly accent: string;
  readonly accentHover: string;
  readonly accentPressed: string;
  readonly accentForeground: string;
  readonly save: string;
  readonly saveHover: string;
  readonly savePressed: string;
  readonly saveForeground: string;
  readonly focus: string;
  readonly danger: string;
  readonly dangerSurface: string;
  readonly dangerHover: string;
  readonly dangerStrong: string;
  readonly dangerStrongHover: string;
  readonly dangerStrongForeground: string;
  readonly warning: string;
  readonly warningSurface: string;
  readonly conflict: string;
  readonly conflictSurface: string;
  readonly hookBind: string;
  readonly selection: string;
  readonly tableSelection: string;
  readonly overlay: string;

  // Compatibility aliases
  readonly background: string;
  readonly panel: string;
  readonly panelRaised: string;
  readonly muted: string;
}

export type ButtonVariant =
  | 'base'
  | 'accent'
  | 'soft-accent'
  | 'danger'
  | 'soft-danger'
  | 'critical-danger'
  | 'save'
  | 'icon'
  | 'stepper'
  | 'bind-key'
  | 'bind-menu-item'
  | 'ghost';

export type ButtonSize = 'sm' | 'md' | 'lg';

export type BindMapPriority =
  | 'conflict'
  | 'system-primary'
  | 'macro-primary-enabled'
  | 'macro-primary-disabled'
  | 'macro-primary-hook'
  | 'secondary'
  | 'partner-highlight'
  | 'free';

export interface BindMapTileStyle {
  readonly fill: string;
  readonly stroke: string;
  readonly strokeThickness: number;
  readonly priority: BindMapPriority;
}

export interface BindMapTileRoleInfo {
  readonly hasConflict: boolean;
  readonly isSystemPrimary: boolean;
  readonly isSystemSecondary: boolean;
  readonly isMacroPrimary: boolean;
  readonly isMacroSecondary: boolean;
  readonly isEnabled?: boolean | undefined;
  readonly isHookBind?: boolean | undefined;
  readonly isPartnerHighlighted?: boolean | undefined;
}
