import { THEME_TOKENS } from './tokens.js';
import type {
  BindMapPriority,
  BindMapTileRoleInfo,
  BindMapTileStyle,
  ResolvedTheme,
} from './types.js';

/**
 * Resolves the visual styling for a bind-map key or mouse zone based on its role hierarchy.
 * 1. Partner highlight on active hover (2px warning border, warning surface)
 * 2. Foreign conflict: held by another application (1.6px conflict border, conflict surface)
 * 3. System command primary: application global shortcut (1.6px focus border, table selection surface)
 * 4. Macro primary:
 *    - Enabled: 1.6px accent border (or 2.2px purple for hook binds), selection surface
 *    - Disabled: 1.6px danger border (or 2.2px purple for hook binds), danger surface
 * 5. Secondary combination key: 1px warning border, raised surface
 * 6. Free key: 1px subtle border, raised surface
 */
export function resolveBindMapTileStyle(
  role: BindMapTileRoleInfo,
  theme: ResolvedTheme = 'dark',
): BindMapTileStyle {
  const tokens = THEME_TOKENS[theme];

  // Hovering a partner modifier/key takes visual precedence while active
  if (role.isPartnerHighlighted) {
    return {
      fill: tokens.warningSurface,
      stroke: tokens.warning,
      strokeThickness: 2.0,
      priority: 'partner-highlight',
    };
  }

  // 1. Conflict: foreign capture by another application
  if (role.hasConflict) {
    return {
      fill: tokens.conflictSurface,
      stroke: tokens.conflict,
      strokeThickness: 1.6,
      priority: 'conflict',
    };
  }

  // 2. System application shortcut
  if (role.isSystemPrimary) {
    return {
      fill: tokens.tableSelection,
      stroke: tokens.focus,
      strokeThickness: 1.6,
      priority: 'system-primary',
    };
  }

  // 3. Macro primary key
  if (role.isMacroPrimary) {
    const isEnabled = role.isEnabled ?? true;
    const isHookBind = role.isHookBind ?? false;
    const fill = isEnabled ? tokens.selection : tokens.dangerSurface;
    const stroke = isHookBind ? tokens.hookBind : isEnabled ? tokens.accent : tokens.danger;
    const strokeThickness = isHookBind ? 2.2 : 1.6;
    const priority: BindMapPriority = isHookBind
      ? 'macro-primary-hook'
      : isEnabled
        ? 'macro-primary-enabled'
        : 'macro-primary-disabled';

    return { fill, stroke, strokeThickness, priority };
  }

  // 4. Secondary combination key
  if (role.isMacroSecondary || role.isSystemSecondary) {
    return {
      fill: tokens.surfaceRaised,
      stroke: tokens.warning,
      strokeThickness: 1.0,
      priority: 'secondary',
    };
  }

  // 5. Default free key
  return {
    fill: tokens.surfaceRaised,
    stroke: tokens.borderSubtle,
    strokeThickness: 1.0,
    priority: 'free',
  };
}

/**
 * Checks whether two bind-map keys share a combination relationship (modifier + key).
 * Used for partner highlighting when hovering over either partner key.
 */
export function isPartnerKeyMatch(
  sourceKeyId: string,
  targetKeyId: string,
  combinations: ReadonlyArray<{ readonly modifierKeyId: string; readonly secondaryKeyId: string }>,
): boolean {
  for (const combo of combinations) {
    if (
      (combo.modifierKeyId === sourceKeyId && combo.secondaryKeyId === targetKeyId) ||
      (combo.secondaryKeyId === sourceKeyId && combo.modifierKeyId === targetKeyId)
    ) {
      return true;
    }
  }
  return false;
}
