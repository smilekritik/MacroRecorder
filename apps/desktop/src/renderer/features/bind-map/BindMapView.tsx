/**
 * @macro-recorder/desktop - Full-Screen Binding Map View and Window Surface
 */

import React, { useEffect, useCallback } from 'react';
import { useTranslation } from '../../hooks/useLocalization.js';
import { useTheme } from '../../hooks/useTheme.js';
import type { BindMapWindowProps } from './types.js';
import { useBindMap } from './useBindMap.js';
import { BindMapCanvas } from './BindMapCanvas.js';
import { BindMapLegend } from './BindMapLegend.js';
import { MacroMenu } from './MacroMenu.js';
import { ChoiceMacroDialog } from './ChoiceMacroDialog.js';

export const BindMapView: React.FC<BindMapWindowProps> = ({
  isOpen = true,
  macros = [],
  preferences,
  closeHotkey = 'F11',
  onClose,
  onToggleMacro,
  onDeleteMacro,
  onOpenSettings,
  probeAvailability,
  theme: themeProp,
  className = '',
}) => {
  const { t, format } = useTranslation();
  const { resolvedTheme } = useTheme();
  const effectiveTheme = themeProp ?? resolvedTheme;

  const {
    keyboardTiles,
    mouseTiles,
    hoveredTileId,
    menuOpen,
    menuTile,
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
  } = useBindMap({
    macros,
    preferences,
    probeAvailability,
    theme: effectiveTheme,
    t,
    format,
    onToggleMacro,
    onDeleteMacro,
    onOpenSettings,
    onClose,
  });

  // Global shortcut listener to close the window via F11 or Esc
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      // If menu or choice dialog is open, let their local handlers intercept Escape first
      if (e.key === 'Escape') {
        if (menuOpen) {
          closeMenu();
          return;
        }
        if (choiceDialogOpen) {
          handleCancelChoiceDialog();
          return;
        }
        onClose?.();
        return;
      }

      // Check configured close hotkey (case-insensitive)
      if (closeHotkey && e.key.toUpperCase() === closeHotkey.toUpperCase()) {
        e.preventDefault();
        e.stopPropagation();
        onClose?.();
      }
    },
    [closeHotkey, menuOpen, choiceDialogOpen, closeMenu, handleCancelChoiceDialog, onClose],
  );

  useEffect(() => {
    if (!isOpen) return;
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, handleKeyDown]);

  if (!isOpen) return null;

  const hintText = format(
    'A green key holds an enabled macro, a red one a disabled macro, a blue one an application shortcut, and a pink one a gesture already held by another program. Hover a modifier to light up the second keys of its combinations in yellow. Left click toggles the macro, right click offers to delete it. The same shortcut closes this window: {0}.',
    closeHotkey,
  );

  return (
    <div
      data-testid="bind-map-window-root"
      className={`flex flex-col justify-between w-full h-full p-6 bg-[var(--color-window-bg)] text-[var(--color-text-primary)] select-none overflow-hidden ${className}`}
    >
      {/* Header Section */}
      <header className="flex flex-col gap-1 pb-2 flex-shrink-0">
        <h1
          className="text-[24px] font-semibold tracking-tight text-[var(--color-text-primary)]"
          data-testid="bind-map-title"
        >
          {t('Bind map')}
        </h1>
        <p
          className="text-[13.5px] leading-relaxed text-[var(--color-text-secondary)] max-w-5xl"
          data-testid="bind-map-hint"
        >
          {hintText}
        </p>
      </header>

      {/* Main Scalable Vector Canvas (Keyboard & Mouse) */}
      <main className="flex-1 flex items-center justify-center my-2 min-h-0 w-full overflow-hidden">
        <BindMapCanvas
          keyboardTiles={keyboardTiles}
          mouseTiles={mouseTiles}
          hoveredTileId={hoveredTileId ?? undefined}
          onClickTile={handleClickTile}
          onContextMenuTile={handleContextMenuTile}
          onMouseEnterTile={handleMouseEnterTile}
          onMouseLeaveTile={handleMouseLeaveTile}
        />
      </main>

      {/* Footer Legend Bar */}
      <footer className="flex-shrink-0 pt-2">
        <BindMapLegend onClose={onClose} t={t} />
      </footer>

      {/* Non-blocking hover dismissal popup menu */}
      <MacroMenu
        isOpen={menuOpen}
        tile={menuTile}
        anchorRect={menuAnchorRect}
        anchorElement={menuAnchorElement}
        onClose={closeMenu}
        onToggleMacro={handleToggleSingleMacro}
        onToggleAll={handleToggleAllMacros}
        onOpenSettings={handleOpenSettings}
        t={t}
        format={format}
      />

      {/* Right-click delete choice modal for keys holding several macros */}
      <ChoiceMacroDialog
        isOpen={choiceDialogOpen}
        macros={choiceMacros}
        onSelect={handleSelectDeleteMacro}
        onCancel={handleCancelChoiceDialog}
        t={t}
        format={format}
      />
    </div>
  );
};

export const BindMapWindow = BindMapView;
