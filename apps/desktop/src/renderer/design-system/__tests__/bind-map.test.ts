import { describe, it, expect } from 'vitest';
import {
  resolveBindMapTileStyle,
  isPartnerKeyMatch,
} from '../bind-map-tokens.js';
import { DARK_THEME_TOKENS, LIGHT_THEME_TOKENS } from '../tokens.js';

describe('Bind map semantic color hierarchy and partner highlighting', () => {
  it('prioritizes partner highlight over conflicts and commands', () => {
    const style = resolveBindMapTileStyle(
      {
        hasConflict: true,
        isSystemPrimary: true,
        isSystemSecondary: false,
        isMacroPrimary: true,
        isMacroSecondary: false,
        isPartnerHighlighted: true,
      },
      'dark',
    );

    expect(style.priority).toBe('partner-highlight');
    expect(style.fill).toBe(DARK_THEME_TOKENS.warningSurface);
    expect(style.stroke).toBe(DARK_THEME_TOKENS.warning);
    expect(style.strokeThickness).toBe(2.0);
  });

  it('prioritizes conflict over system commands and macros', () => {
    const style = resolveBindMapTileStyle(
      {
        hasConflict: true,
        isSystemPrimary: true,
        isSystemSecondary: false,
        isMacroPrimary: true,
        isMacroSecondary: false,
      },
      'dark',
    );

    expect(style.priority).toBe('conflict');
    expect(style.fill).toBe(DARK_THEME_TOKENS.conflictSurface);
    expect(style.stroke).toBe(DARK_THEME_TOKENS.conflict);
    expect(style.strokeThickness).toBe(1.6);
  });

  it('prioritizes system commands over macro bindings', () => {
    const style = resolveBindMapTileStyle(
      {
        hasConflict: false,
        isSystemPrimary: true,
        isSystemSecondary: false,
        isMacroPrimary: true,
        isMacroSecondary: false,
      },
      'dark',
    );

    expect(style.priority).toBe('system-primary');
    expect(style.fill).toBe(DARK_THEME_TOKENS.tableSelection);
    expect(style.stroke).toBe(DARK_THEME_TOKENS.focus);
    expect(style.strokeThickness).toBe(1.6);
  });

  it('resolves enabled macro primary style with accent border', () => {
    const style = resolveBindMapTileStyle(
      {
        hasConflict: false,
        isSystemPrimary: false,
        isSystemSecondary: false,
        isMacroPrimary: true,
        isMacroSecondary: false,
        isEnabled: true,
        isHookBind: false,
      },
      'dark',
    );

    expect(style.priority).toBe('macro-primary-enabled');
    expect(style.fill).toBe(DARK_THEME_TOKENS.selection);
    expect(style.stroke).toBe(DARK_THEME_TOKENS.accent);
    expect(style.strokeThickness).toBe(1.6);
  });

  it('resolves disabled macro primary style with danger border', () => {
    const style = resolveBindMapTileStyle(
      {
        hasConflict: false,
        isSystemPrimary: false,
        isSystemSecondary: false,
        isMacroPrimary: true,
        isMacroSecondary: false,
        isEnabled: false,
        isHookBind: false,
      },
      'dark',
    );

    expect(style.priority).toBe('macro-primary-disabled');
    expect(style.fill).toBe(DARK_THEME_TOKENS.dangerSurface);
    expect(style.stroke).toBe(DARK_THEME_TOKENS.danger);
    expect(style.strokeThickness).toBe(1.6);
  });

  it('resolves hook bind with 2.2px purple border regardless of enabled state', () => {
    const style = resolveBindMapTileStyle(
      {
        hasConflict: false,
        isSystemPrimary: false,
        isSystemSecondary: false,
        isMacroPrimary: true,
        isMacroSecondary: false,
        isEnabled: true,
        isHookBind: true,
      },
      'dark',
    );

    expect(style.priority).toBe('macro-primary-hook');
    expect(style.fill).toBe(DARK_THEME_TOKENS.selection);
    expect(style.stroke).toBe(DARK_THEME_TOKENS.hookBind);
    expect(style.strokeThickness).toBe(2.2);
  });

  it('resolves secondary combination key style', () => {
    const style = resolveBindMapTileStyle(
      {
        hasConflict: false,
        isSystemPrimary: false,
        isSystemSecondary: false,
        isMacroPrimary: false,
        isMacroSecondary: true,
      },
      'dark',
    );

    expect(style.priority).toBe('secondary');
    expect(style.fill).toBe(DARK_THEME_TOKENS.surfaceRaised);
    expect(style.stroke).toBe(DARK_THEME_TOKENS.warning);
    expect(style.strokeThickness).toBe(1.0);
  });

  it('resolves free key style', () => {
    const style = resolveBindMapTileStyle(
      {
        hasConflict: false,
        isSystemPrimary: false,
        isSystemSecondary: false,
        isMacroPrimary: false,
        isMacroSecondary: false,
      },
      'dark',
    );

    expect(style.priority).toBe('free');
    expect(style.fill).toBe(DARK_THEME_TOKENS.surfaceRaised);
    expect(style.stroke).toBe(DARK_THEME_TOKENS.borderSubtle);
    expect(style.strokeThickness).toBe(1.0);
  });

  it('resolves correctly in light theme', () => {
    const style = resolveBindMapTileStyle(
      {
        hasConflict: false,
        isSystemPrimary: false,
        isSystemSecondary: false,
        isMacroPrimary: true,
        isMacroSecondary: false,
        isEnabled: true,
      },
      'light',
    );

    expect(style.fill).toBe(LIGHT_THEME_TOKENS.selection);
    expect(style.stroke).toBe(LIGHT_THEME_TOKENS.accent);
  });

  it('matches partner combination pairs bidirectionally', () => {
    const combos = [{ modifierKeyId: 'ctrl', secondaryKeyId: 'key_1' }];
    expect(isPartnerKeyMatch('ctrl', 'key_1', combos)).toBe(true);
    expect(isPartnerKeyMatch('key_1', 'ctrl', combos)).toBe(true);
    expect(isPartnerKeyMatch('ctrl', 'key_2', combos)).toBe(false);
  });
});
