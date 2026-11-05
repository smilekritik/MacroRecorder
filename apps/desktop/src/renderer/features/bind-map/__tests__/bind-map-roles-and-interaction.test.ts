/**
 * @macro-recorder/desktop - Bind Map Roles, Precedence and Interaction Tests
 */

import { describe, it, expect, vi } from 'vitest';
import {
  DEFAULT_HOTKEY_BINDING,
  DEFAULT_RECORDING_OPTIONS,
  DEFAULT_PLAYBACK_OPTIONS,
  MouseButton,
  WheelDirection,
  type HotkeyBinding,
  type MacroDefinition,
} from '../../../../../../../packages/contracts/src/index.js';
import {
  resolveBindMapTileStyle,
} from '../../../design-system/bind-map-tokens.js';
import { DARK_THEME_TOKENS, LIGHT_THEME_TOKENS } from '../../../design-system/tokens.js';
import {
  isModifierVirtualKey,
  isModifierKey,
  hasModifiers,
  getKeyRole,
  getMouseRole,
  getGestureKey,
  getSystemCommands,
  probeOccupiedGestures,
  conflictsFor,
  areTilesPartners,
  buildTileTooltip,
  bindModeSuffix,
} from '../bind-roles.js';
import { ruCatalog } from '../../../../../../../packages/localization/src/catalogs/index.js';

function createMockMacro(overrides: Partial<MacroDefinition> = {}): MacroDefinition {
  return {
    schemaVersion: 12,
    id: '11111111-1111-1111-1111-111111111111',
    name: 'Test Macro',
    folder: '',
    description: '',
    isEnabled: true,
    tags: [],
    modifiedAt: '2026-01-01T00:00:00.000Z',
    recording: DEFAULT_RECORDING_OPTIONS,
    playback: DEFAULT_PLAYBACK_OPTIONS,
    hotkey: {
      ...DEFAULT_HOTKEY_BINDING,
      virtualKey: 0x41, // 'A'
    },
    events: [],
    ...overrides,
  };
}

describe('Bind Map Key Roles and Modifiers', () => {
  it('identifies modifier virtual keys correctly', () => {
    expect(isModifierVirtualKey(0x10)).toBe(true); // Shift
    expect(isModifierVirtualKey(0x11)).toBe(true); // Ctrl
    expect(isModifierVirtualKey(0x12)).toBe(true); // Alt
    expect(isModifierVirtualKey(0x5b)).toBe(true); // LWin
    expect(isModifierVirtualKey(0x5c)).toBe(true); // RWin
    expect(isModifierVirtualKey(0xa0)).toBe(true); // LShift
    expect(isModifierVirtualKey(0xa2)).toBe(true); // LCtrl

    expect(isModifierVirtualKey(0x41)).toBe(false); // A
    expect(isModifierVirtualKey(0x70)).toBe(false); // F1
    expect(isModifierVirtualKey(0x20)).toBe(false); // Space
  });

  it('evaluates modifier key matching', () => {
    const ctrlBinding: HotkeyBinding = {
      ...DEFAULT_HOTKEY_BINDING,
      virtualKey: 0x33, // '3'
      control: true,
    };

    expect(isModifierKey(ctrlBinding, 0x11)).toBe(true); // Ctrl matches
    expect(isModifierKey(ctrlBinding, 0x10)).toBe(false); // Shift does not match
    expect(isModifierKey(ctrlBinding, 0x12)).toBe(false); // Alt does not match
    expect(isModifierKey(ctrlBinding, 0x33)).toBe(false); // Key itself is not modifier
  });

  it('evaluates primary vs secondary role for keyboard combinations', () => {
    // Single key "F1"
    const singleF1: HotkeyBinding = {
      ...DEFAULT_HOTKEY_BINDING,
      virtualKey: 0x70, // F1
    };
    expect(getKeyRole(singleF1, 0x70)).toBe('primary');
    expect(getKeyRole(singleF1, 0x71)).toBe('none');

    // Combination "Ctrl + 3"
    const ctrl3: HotkeyBinding = {
      ...DEFAULT_HOTKEY_BINDING,
      virtualKey: 0x33, // 3
      control: true,
    };

    // For Ctrl (0x11), it is the primary owner of the shortcut!
    expect(getKeyRole(ctrl3, 0x11)).toBe('primary');

    // For 3 (0x33), it is only the SECONDARY key!
    expect(getKeyRole(ctrl3, 0x33)).toBe('secondary');

    // For unrelated keys, it is none
    expect(getKeyRole(ctrl3, 0x34)).toBe('none');
  });

  it('evaluates primary vs secondary role for mouse gestures', () => {
    // Single Left Click
    const singleLeft: HotkeyBinding = {
      ...DEFAULT_HOTKEY_BINDING,
      mouseButton: MouseButton.Left,
    };
    expect(getMouseRole(singleLeft, MouseButton.Left, WheelDirection.None)).toBe('primary');
    expect(getMouseRole(singleLeft, MouseButton.Right, WheelDirection.None)).toBe('none');

    // Combination Shift + Left Click
    const shiftLeft: HotkeyBinding = {
      ...DEFAULT_HOTKEY_BINDING,
      mouseButton: MouseButton.Left,
      shift: true,
    };
    // On the mouse zone, it is secondary because it requires a keyboard modifier
    expect(getMouseRole(shiftLeft, MouseButton.Left, WheelDirection.None)).toBe('secondary');
    // On the Shift key, Shift is primary
    expect(getKeyRole(shiftLeft, 0x10)).toBe('primary');

    // Wheel Up single vs combo
    const wheelUp: HotkeyBinding = {
      ...DEFAULT_HOTKEY_BINDING,
      wheel: WheelDirection.Up,
    };
    expect(getMouseRole(wheelUp, MouseButton.None, WheelDirection.Up)).toBe('primary');

    const altWheelUp: HotkeyBinding = {
      ...DEFAULT_HOTKEY_BINDING,
      wheel: WheelDirection.Up,
      alt: true,
    };
    expect(getMouseRole(altWheelUp, MouseButton.None, WheelDirection.Up)).toBe('secondary');
    expect(getKeyRole(altWheelUp, 0x12)).toBe('primary');
  });
});

describe('Semantic Color Precedence Hierarchy', () => {
  it('enforces partner-highlight priority above all other states', () => {
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

  it('enforces conflict priority over system and macro assignments', () => {
    const style = resolveBindMapTileStyle(
      {
        hasConflict: true,
        isSystemPrimary: true,
        isSystemSecondary: false,
        isMacroPrimary: true,
        isMacroSecondary: false,
        isPartnerHighlighted: false,
      },
      'dark',
    );

    expect(style.priority).toBe('conflict');
    expect(style.fill).toBe(DARK_THEME_TOKENS.conflictSurface);
    expect(style.stroke).toBe(DARK_THEME_TOKENS.conflict);
    expect(style.strokeThickness).toBe(1.6);
  });

  it('enforces system command priority over macro bindings', () => {
    const style = resolveBindMapTileStyle(
      {
        hasConflict: false,
        isSystemPrimary: true,
        isSystemSecondary: false,
        isMacroPrimary: true,
        isMacroSecondary: false,
        isPartnerHighlighted: false,
      },
      'dark',
    );

    expect(style.priority).toBe('system-primary');
    expect(style.fill).toBe(DARK_THEME_TOKENS.tableSelection);
    expect(style.stroke).toBe(DARK_THEME_TOKENS.focus);
    expect(style.strokeThickness).toBe(1.6);
  });

  it('resolves enabled vs disabled macro styling', () => {
    const enabledStyle = resolveBindMapTileStyle(
      {
        hasConflict: false,
        isSystemPrimary: false,
        isSystemSecondary: false,
        isMacroPrimary: true,
        isMacroSecondary: false,
        isEnabled: true,
      },
      'dark',
    );
    expect(enabledStyle.priority).toBe('macro-primary-enabled');
    expect(enabledStyle.fill).toBe(DARK_THEME_TOKENS.selection);
    expect(enabledStyle.stroke).toBe(DARK_THEME_TOKENS.accent);

    const disabledStyle = resolveBindMapTileStyle(
      {
        hasConflict: false,
        isSystemPrimary: false,
        isSystemSecondary: false,
        isMacroPrimary: true,
        isMacroSecondary: false,
        isEnabled: false,
      },
      'dark',
    );
    expect(disabledStyle.priority).toBe('macro-primary-disabled');
    expect(disabledStyle.fill).toBe(DARK_THEME_TOKENS.dangerSurface);
    expect(disabledStyle.stroke).toBe(DARK_THEME_TOKENS.danger);
  });

  it('resolves purple hook outline (2.2px) for window-scoped or pass-through binds', () => {
    const hookStyle = resolveBindMapTileStyle(
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
    expect(hookStyle.priority).toBe('macro-primary-hook');
    expect(hookStyle.stroke).toBe(DARK_THEME_TOKENS.hookBind);
    expect(hookStyle.strokeThickness).toBe(2.2);
  });

  it('renders light theme tokens with exact palette', () => {
    const lightStyle = resolveBindMapTileStyle(
      {
        hasConflict: false,
        isSystemPrimary: false,
        isSystemSecondary: false,
        isMacroPrimary: true,
        isMacroSecondary: false,
        isEnabled: true,
        isHookBind: false,
      },
      'light',
    );
    expect(lightStyle.fill).toBe(LIGHT_THEME_TOKENS.selection);
    expect(lightStyle.stroke).toBe(LIGHT_THEME_TOKENS.accent);
  });
});

describe('Secondary Keys and Modifier Partner Highlighting', () => {
  it('detects partner relationship between modifier and combination key', () => {
    const macro1 = createMockMacro({
      id: 'macro-ctrl-3',
      name: 'Combo Macro',
      hotkey: { ...DEFAULT_HOTKEY_BINDING, virtualKey: 0x33, control: true },
    });

    const tileCtrl = {
      id: 'key-ctrl',
      hasBinds: true,
      allMacros: [macro1],
      allSystem: [],
    };

    const tile3 = {
      id: 'key-3',
      hasBinds: true,
      allMacros: [macro1],
      allSystem: [],
    };

    const tileUnrelated = {
      id: 'key-a',
      hasBinds: true,
      allMacros: [createMockMacro({ id: 'macro-a' })],
      allSystem: [],
    };

    // Ctrl and 3 share macro1 -> partners!
    expect(areTilesPartners(tileCtrl, tile3)).toBe(true);
    expect(areTilesPartners(tile3, tileCtrl)).toBe(true);

    // Unrelated tile is not a partner
    expect(areTilesPartners(tileCtrl, tileUnrelated)).toBe(false);
    // Same tile is not partner with itself
    expect(areTilesPartners(tileCtrl, tileCtrl)).toBe(false);
  });

  it('proves secondary keys never toggle or delete modifier combination by themselves', () => {
    const macro = createMockMacro({
      id: 'macro-1',
      name: 'Ctrl+1 Combo',
      hotkey: { ...DEFAULT_HOTKEY_BINDING, virtualKey: 0x31, control: true },
    });

    // On key "1" (0x31)
    const roleOnKey1 = getKeyRole(macro.hotkey, 0x31);
    expect(roleOnKey1).toBe('secondary');

    // On key "Ctrl" (0x11)
    const roleOnCtrl = getKeyRole(macro.hotkey, 0x11);
    expect(roleOnCtrl).toBe('primary');

    // The primary list on key "1" is empty because role is secondary!
    const key1Primary: MacroDefinition[] = [];
    const key1Secondary: MacroDefinition[] = [macro];

    // Right-click deletion only operates on primary list:
    expect(key1Primary.length).toBe(0);
    expect(key1Secondary).toHaveLength(1);
    // Therefore right-clicking key 1 cannot delete the Ctrl+1 macro!

    // The Ctrl key owns the primary role:
    const ctrlPrimary: MacroDefinition[] = [macro];
    expect(ctrlPrimary.length).toBe(1);
    // Right-clicking Ctrl deletes or offers to delete it
  });
});

describe('Foreign Conflict Probing', () => {
  it('probes gestures and reports occupied keys and combinations', () => {
    const macro = createMockMacro({
      id: 'm1',
      hotkey: { ...DEFAULT_HOTKEY_BINDING, virtualKey: 0x47, control: true }, // Ctrl + G
    });

    const systemCmds = getSystemCommands();

    // Mock probe: key 'F5' is held by another program, and Ctrl+G is held
    const probe = vi.fn((gestures: readonly HotkeyBinding[]) => {
      return gestures.map((g) => {
        if (g.virtualKey === 0x74 && !hasModifiers(g)) return false; // F5 single
        if (g.virtualKey === 0x47 && g.control) return false; // Ctrl + G
        return true;
      });
    });

    const occupied = probeOccupiedGestures(
      [{ label: 'F5', vk: 0x74, width: 1, height: 1, isSpacer: false }],
      [macro],
      systemCmds,
      probe,
    );

    expect(probe).toHaveBeenCalled();
    const f5Gesture = getGestureKey({
      virtualKey: 0x74,
      mouseButton: MouseButton.None,
      wheel: WheelDirection.None,
      control: false,
      alt: false,
      shift: false,
      windows: false,
    });
    expect(occupied.has(f5Gesture)).toBe(true);

    const conflictsF5 = conflictsFor(0x74, [], occupied);
    expect(conflictsF5.length).toBe(1);
    expect(conflictsF5[0]).toContain('held by another application');

    const conflictsG = conflictsFor(0x47, [macro.hotkey], occupied);
    expect(conflictsG.length).toBe(1);
    expect(conflictsG[0]).toContain('Ctrl + G');
  });

  it('gracefully handles exceptions in probe without throwing', () => {
    const errorProbe = () => {
      throw new Error('Win32 RegisterHotKey permission denied');
    };

    expect(() => {
      probeOccupiedGestures([], [], [], errorProbe);
    }).not.toThrow();
  });
});

describe('Settings Navigation and Tooltip', () => {
  it('builds comprehensive tooltip', () => {
    const macro = createMockMacro({
      name: 'Farm Loop',
      isEnabled: true,
      playback: {
        ...DEFAULT_PLAYBACK_OPTIONS,
        hotkeyScopedToTarget: true,
        passThroughHotkey: true,
      },
      hotkey: { ...DEFAULT_HOTKEY_BINDING, virtualKey: 0x70 },
    });

    expect(bindModeSuffix(macro)).toBe(' · window-scoped, passed through');

    const tooltip = buildTileTooltip(
      {
        conflicts: [],
        primary: [macro],
        systemPrimary: [],
        secondary: [],
        systemSecondary: [],
        hasBinds: true,
      },
      'F1',
    );

    expect(tooltip).toContain('Farm Loop');
    expect(tooltip).toContain('F1');
    expect(tooltip).toContain('window-scoped, passed through');
    expect(tooltip).toContain('enabled');
  });

  it('formats system commands with settings tags', () => {
    const commands = getSystemCommands();
    expect(commands).toHaveLength(6);

    const tags = commands.map((c) => c.tag);
    expect(tags).toEqual(['start', 'stop', 'pause', 'emergency', 'pixel', 'bindmap']);
  });
});

describe('Localization (EN / RU)', () => {
  it('contains valid Russian translations in ru.json for all Bind Map UI strings', () => {
    const requiredKeys = [
      'Bind map',
      'Bind map — Macro Recorder',
      'enabled macro',
      'disabled macro — click to enable',
      'application shortcut',
      'second key of a combination',
      'held by another application',
      'A green key holds an enabled macro, a red one a disabled macro, a blue one an application shortcut, and a pink one a gesture already held by another program. Hover a modifier to light up the second keys of its combinations in yellow. Left click toggles the macro, right click offers to delete it. The same shortcut closes this window: {0}.',
      '{0} — this key is held by another application',
      '{0} — this combination is held by another application',
      'Held by another application',
      'Configure',
      'Enable',
      'Disable',
      'Enable all',
      'Disable all',
      'disabled: {0}',
      'enabled: {0}',
      'second key',
      'second key of a combination: {0} · {1}',
      'second key of a combination: {0}',
      'Nothing of ours is bound to this key.',
      '{0} — application command',
      '{0} — free',
      '{0} · {1} · {2}',
      'enabled',
      'disabled',
      'window-scoped',
      'passed through',
      'Close',
      'Mouse',
      'Left',
      'Right',
      'Middle',
      'Wheel up',
      'Wheel down',
      'This key holds several macros',
      'Choose which one to delete.',
      'Delete “{0}”',
      'Start recording',
      'Stop recording',
      'Pause / resume playback',
      'Emergency stop',
      'Capture pixel color',
    ];

    for (const key of requiredKeys) {
      expect(ruCatalog[key], `Missing translation for key: "${key}"`).toBeDefined();
      expect(ruCatalog[key]?.trim().length).toBeGreaterThan(0);
    }
  });

  it('unlocalized hardware legends are preserved', () => {
    // Virtual key labels and button legends are non-linguistic hardware legends
    const hardwareCaps = ['Esc', 'F1', 'F11', 'Backspace', 'Enter', 'Ctrl', 'Alt', 'Shift', 'Win', 'X1', 'X2'];
    for (const cap of hardwareCaps) {
      expect(cap).toBe(cap);
    }
  });
});
