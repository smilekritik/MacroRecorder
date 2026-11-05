/**
 * @macro-recorder/desktop - useBindMap Hook
 * Orchestrates layout partitioning, conflict probing, partner highlighting,
 * and menu/dialog state for the binding map.
 */

import { useState, useMemo, useCallback } from 'react';
import {
  MouseButton,
  WheelDirection,
  type AppPreferences,
  type HotkeyBinding,
  type MacroDefinition,
} from '../../../../../../packages/contracts/src/index.js';
import type { ResolvedTheme } from '../../design-system/types.js';
import { resolveBindMapTileStyle } from '../../design-system/bind-map-tokens.js';
import type { BindMapTile, KeyRole, SystemCommand } from './types.js';
import {
  computeKeyboardLayout,
  computeMouseElements,
  getAllLayoutCaps,
} from './keyboard-layout.js';
import {
  areTilesPartners,
  buildTileTooltip,
  conflictsFor,
  getKeyRole,
  getMouseRole,
  getSystemCommands,
  probeOccupiedGestures,
} from './bind-roles.js';

export interface UseBindMapOptions {
  readonly macros?: readonly MacroDefinition[] | undefined;
  readonly preferences?: AppPreferences | undefined;
  readonly probeAvailability?: ((bindings: readonly HotkeyBinding[]) => boolean[]) | undefined;
  readonly theme?: ResolvedTheme | undefined;
  readonly t?: ((k: string) => string) | undefined;
  readonly format?: ((k: string, ...args: unknown[]) => string) | undefined;
  readonly onToggleMacro?: ((macro: MacroDefinition) => Promise<void> | void) | undefined;
  readonly onDeleteMacro?: ((macro: MacroDefinition) => Promise<void> | void) | undefined;
  readonly onOpenSettings?: ((tag: string) => void) | undefined;
  readonly onClose?: (() => void) | undefined;
}

export function useBindMap({
  macros = [],
  preferences,
  probeAvailability,
  theme = 'dark',
  t = (k) => k,
  format = (k, ...args) => k.replace(/{(\d+)}/g, (_, i) => String(args[Number(i)] ?? '')),
  onToggleMacro,
  onDeleteMacro,
  onOpenSettings,
  onClose,
}: UseBindMapOptions = {}) {
  const [hoveredTileId, setHoveredTileId] = useState<string | null>(null);

  // Macro Menu state
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuTileId, setMenuTileId] = useState<string | null>(null);
  const [menuAnchorRect, setMenuAnchorRect] = useState<DOMRect | null>(null);
  const [menuAnchorElement, setMenuAnchorElement] = useState<SVGGraphicsElement | null>(null);

  // Choice Dialog state for multi-macro deletion
  const [choiceMacros, setChoiceMacros] = useState<readonly MacroDefinition[]>([]);
  const [choiceDialogOpen, setChoiceDialogOpen] = useState(false);

  const systemCommands = useMemo(
    () => getSystemCommands(preferences, t),
    [preferences, t],
  );

  const allCaps = useMemo(() => getAllLayoutCaps(), []);

  // Probing foreign conflicts held by other applications
  const occupiedGestures = useMemo(() => {
    return probeOccupiedGestures(allCaps, macros, systemCommands, probeAvailability);
  }, [allCaps, macros, systemCommands, probeAvailability]);

  // Helper to partition roles for a given role tester
  const partition = useCallback(
    (roleTester: (binding: HotkeyBinding) => KeyRole) => {
      const primary: MacroDefinition[] = [];
      const secondary: MacroDefinition[] = [];
      const systemPrimary: SystemCommand[] = [];
      const systemSecondary: SystemCommand[] = [];
      const bindings: HotkeyBinding[] = [];

      for (const m of macros) {
        if (!m.hotkey) continue;
        const role = roleTester(m.hotkey);
        if (role === 'none') continue;
        if (role === 'primary') {
          primary.push(m);
        } else {
          secondary.push(m);
        }
        bindings.push(m.hotkey);
      }

      for (const cmd of systemCommands) {
        const role = roleTester(cmd.binding);
        if (role === 'none') continue;
        if (role === 'primary') {
          systemPrimary.push(cmd);
        } else {
          systemSecondary.push(cmd);
        }
        bindings.push(cmd.binding);
      }

      return { primary, secondary, systemPrimary, systemSecondary, bindings };
    },
    [macros, systemCommands],
  );

  // Build raw tile models
  const rawKeyboardTiles = useMemo(() => {
    const layout = computeKeyboardLayout();
    return layout.map((k) => {
      const roles = partition((binding) => getKeyRole(binding, k.vk));
      const conflicts = conflictsFor(k.vk, roles.bindings, occupiedGestures, t, format);
      const hasBinds =
        roles.primary.length > 0 ||
        roles.secondary.length > 0 ||
        roles.systemPrimary.length > 0 ||
        roles.systemSecondary.length > 0;
      const isInteractive = hasBinds || conflicts.length > 0;
      const allMacros = [...roles.primary, ...roles.secondary];
      const allSystem = [...roles.systemPrimary, ...roles.systemSecondary];

      return {
        id: k.id,
        label: k.label,
        title: k.label,
        virtualKey: k.vk,
        mouseButton: MouseButton.None,
        wheel: WheelDirection.None,
        x: k.x,
        y: k.y,
        width: k.width,
        height: k.height,
        primary: roles.primary,
        secondary: roles.secondary,
        systemPrimary: roles.systemPrimary,
        systemSecondary: roles.systemSecondary,
        conflicts,
        hasBinds,
        isInteractive,
        allMacros,
        allSystem,
        tooltipText: buildTileTooltip(
          {
            conflicts,
            primary: roles.primary,
            systemPrimary: roles.systemPrimary,
            secondary: roles.secondary,
            systemSecondary: roles.systemSecondary,
            hasBinds,
          },
          k.label,
          t,
          format,
        ),
      };
    });
  }, [partition, occupiedGestures, t, format]);

  const rawMouseTiles = useMemo(() => {
    const layout = computeMouseElements();
    return layout.map((m) => {
      const roles = partition((binding) => getMouseRole(binding, m.button, m.wheel));
      const conflicts: string[] = []; // Mouse buttons are not probed for foreign window hooks
      const hasBinds =
        roles.primary.length > 0 ||
        roles.secondary.length > 0 ||
        roles.systemPrimary.length > 0 ||
        roles.systemSecondary.length > 0;
      const isInteractive = hasBinds;
      const allMacros = [...roles.primary, ...roles.secondary];
      const allSystem = [...roles.systemPrimary, ...roles.systemSecondary];

      return {
        id: m.id,
        label: m.label,
        title: m.title,
        virtualKey: 0,
        mouseButton: m.button,
        wheel: m.wheel,
        x: m.x,
        y: m.y,
        width: m.width,
        height: m.height,
        geometry: m.geometry,
        labelX: m.labelX,
        labelY: m.labelY,
        isMouseZone: m.isZone,
        primary: roles.primary,
        secondary: roles.secondary,
        systemPrimary: roles.systemPrimary,
        systemSecondary: roles.systemSecondary,
        conflicts,
        hasBinds,
        isInteractive,
        allMacros,
        allSystem,
        tooltipText: buildTileTooltip(
          {
            conflicts,
            primary: roles.primary,
            systemPrimary: roles.systemPrimary,
            secondary: roles.secondary,
            systemSecondary: roles.systemSecondary,
            hasBinds,
          },
          m.title,
          t,
          format,
        ),
      };
    });
  }, [partition, t, format]);

  // Find currently hovered tile to evaluate partner highlighting
  const activeHoveredTile = useMemo(() => {
    if (!hoveredTileId) return null;
    return (
      rawKeyboardTiles.find((t) => t.id === hoveredTileId) ??
      rawMouseTiles.find((t) => t.id === hoveredTileId) ??
      null
    );
  }, [hoveredTileId, rawKeyboardTiles, rawMouseTiles]);

  // Apply styles with partner highlighting precedence
  const keyboardTiles: readonly BindMapTile[] = useMemo(() => {
    return rawKeyboardTiles.map((tile) => {
      const isPartnerHighlighted =
        activeHoveredTile !== null && areTilesPartners(activeHoveredTile, tile);

      const isEnabled = tile.primary.length > 0 ? tile.primary.some((m) => m.isEnabled) : true;
      const isHookBind =
        tile.primary.length > 0
          ? tile.primary.some(
              (m) => m.playback?.hotkeyScopedToTarget || m.playback?.passThroughHotkey,
            )
          : false;

      const roleInfo = {
        hasConflict: tile.conflicts.length > 0,
        isSystemPrimary: tile.systemPrimary.length > 0,
        isSystemSecondary: tile.systemSecondary.length > 0,
        isMacroPrimary: tile.primary.length > 0,
        isMacroSecondary: tile.secondary.length > 0,
        isEnabled,
        isHookBind,
        isPartnerHighlighted,
      };

      const style = resolveBindMapTileStyle(roleInfo, theme);
      return { ...tile, roleInfo, style };
    });
  }, [rawKeyboardTiles, activeHoveredTile, theme]);

  const mouseTiles: readonly BindMapTile[] = useMemo(() => {
    return rawMouseTiles.map((tile) => {
      const isPartnerHighlighted =
        activeHoveredTile !== null && areTilesPartners(activeHoveredTile, tile);

      const isEnabled = tile.primary.length > 0 ? tile.primary.some((m) => m.isEnabled) : true;
      const isHookBind =
        tile.primary.length > 0
          ? tile.primary.some(
              (m) => m.playback?.hotkeyScopedToTarget || m.playback?.passThroughHotkey,
            )
          : false;

      const roleInfo = {
        hasConflict: tile.conflicts.length > 0,
        isSystemPrimary: tile.systemPrimary.length > 0,
        isSystemSecondary: tile.systemSecondary.length > 0,
        isMacroPrimary: tile.primary.length > 0,
        isMacroSecondary: tile.secondary.length > 0,
        isEnabled,
        isHookBind,
        isPartnerHighlighted,
      };

      const style = resolveBindMapTileStyle(roleInfo, theme);
      return { ...tile, roleInfo, style };
    });
  }, [rawMouseTiles, activeHoveredTile, theme]);

  const activeMenuTile = useMemo(() => {
    if (!menuTileId) return null;
    return (
      keyboardTiles.find((t) => t.id === menuTileId) ??
      mouseTiles.find((t) => t.id === menuTileId) ??
      null
    );
  }, [menuTileId, keyboardTiles, mouseTiles]);

  // Click handler: opens non-blocking MacroMenu popup
  const handleClickTile = useCallback(
    (tile: BindMapTile, anchorEl: SVGGraphicsElement) => {
      if (!tile.isInteractive) return;
      const rect = anchorEl.getBoundingClientRect();
      setMenuTileId(tile.id);
      setMenuAnchorRect(rect);
      setMenuAnchorElement(anchorEl);
      setMenuOpen(true);
    },
    [],
  );

  // Right-click handler: deletes primary macro (secondary keys alone never delete combos!)
  const handleContextMenuTile = useCallback(
    async (tile: BindMapTile, _event: React.MouseEvent) => {
      const owned = tile.primary;
      // Secondary keys or non-owned items never delete combinations
      if (owned.length === 0) return;

      if (owned.length === 1) {
        await onDeleteMacro?.(owned[0]!);
      } else {
        setChoiceMacros(owned);
        setChoiceDialogOpen(true);
      }
    },
    [onDeleteMacro],
  );

  const handleSelectDeleteMacro = useCallback(
    async (macro: MacroDefinition) => {
      setChoiceDialogOpen(false);
      setChoiceMacros([]);
      await onDeleteMacro?.(macro);
    },
    [onDeleteMacro],
  );

  const handleCancelChoiceDialog = useCallback(() => {
    setChoiceDialogOpen(false);
    setChoiceMacros([]);
  }, []);

  const handleMouseEnterTile = useCallback((tile: BindMapTile) => {
    if (tile.hasBinds) {
      setHoveredTileId(tile.id);
    }
  }, []);

  const handleMouseLeaveTile = useCallback((tile: BindMapTile) => {
    setHoveredTileId((prev) => (prev === tile.id ? null : prev));
  }, []);

  const closeMenu = useCallback(() => {
    setMenuOpen(false);
    setMenuTileId(null);
    setMenuAnchorRect(null);
    setMenuAnchorElement(null);
  }, []);

  const handleToggleSingleMacro = useCallback(
    async (macro: MacroDefinition) => {
      closeMenu();
      await onToggleMacro?.(macro);
    },
    [closeMenu, onToggleMacro],
  );

  const handleToggleAllMacros = useCallback(
    async (macrosToToggle: readonly MacroDefinition[]) => {
      closeMenu();
      for (const m of macrosToToggle) {
        await onToggleMacro?.(m);
      }
    },
    [closeMenu, onToggleMacro],
  );

  const handleOpenSettings = useCallback(
    (tag: string) => {
      closeMenu();
      onClose?.();
      onOpenSettings?.(tag);
    },
    [closeMenu, onClose, onOpenSettings],
  );

  return {
    keyboardTiles,
    mouseTiles,
    hoveredTileId,
    menuOpen,
    menuTile: activeMenuTile,
    menuAnchorRect,
    menuAnchorElement,
    choiceDialogOpen,
    choiceMacros,
    handleClickTile,
    handleContextMenuTile,
    handleMouseEnterTile,
    handleMouseLeaveTile,
    handleToggleSingleMacro,
    handleToggleAllMacros,
    handleSelectDeleteMacro,
    handleCancelChoiceDialog,
    closeMenu,
    handleOpenSettings,
  };
}
