/**
 * @macro-recorder/desktop - Non-Blocking Macro Action / Info Popup Menu
 */

import React, { useEffect, useRef, useState } from 'react';
import type { BindMapTile } from './types.js';
import type { MacroDefinition } from '../../../../../../packages/contracts/src/index.js';
import { formatHotkeyDisplay } from '../../../../../../packages/contracts/src/index.js';
import { bindModeSuffix } from './bind-roles.js';
import { clampToWindowBounds, WindowSafePortal } from '../../design-system/Portal.js';

export interface MacroMenuProps {
  readonly isOpen: boolean;
  readonly tile: BindMapTile | null;
  readonly anchorRect: DOMRect | null;
  readonly anchorElement: SVGGraphicsElement | null;
  readonly onClose: () => void;
  readonly onToggleMacro?: ((macro: MacroDefinition) => Promise<void> | void) | undefined;
  readonly onToggleAll?: ((macros: readonly MacroDefinition[]) => Promise<void> | void) | undefined;
  readonly onOpenSettings?: ((tag: string) => void) | undefined;
  readonly t?: ((key: string) => string) | undefined;
  readonly format?: ((key: string, ...args: unknown[]) => string) | undefined;
}

export const MacroMenu: React.FC<MacroMenuProps> = ({
  isOpen,
  tile,
  anchorRect,
  anchorElement,
  onClose,
  onToggleMacro,
  onToggleAll,
  onOpenSettings,
  t = (k) => k,
  format = (k, ...args) => k.replace(/{(\d+)}/g, (_, i) => String(args[Number(i)] ?? '')),
}) => {
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [position, setPosition] = useState<{ top: number; left: number }>({ top: 0, left: 0 });

  // Calculate clamped floating position below anchor
  useEffect(() => {
    if (!isOpen || !anchorRect) return;

    const menuWidth = 300;
    const estimatedHeight = 260;

    const desiredX = anchorRect.left + anchorRect.width / 2 - menuWidth / 2;
    const desiredY = anchorRect.bottom + 8;

    const clamped = clampToWindowBounds(
      {
        x: desiredX,
        y: desiredY,
        width: menuWidth,
        height: estimatedHeight,
      },
      12,
    );

    setPosition(clamped);
  }, [isOpen, anchorRect]);

  // Hover dismissal tracking:
  // Pointer leaving both anchor and menu closes the menu smoothly without stealing focus
  useEffect(() => {
    if (!isOpen) return;

    let isOverMenu = false;
    let isOverAnchor = false;

    const handlePointerMove = (e: MouseEvent) => {
      const target = e.target as Node | null;
      if (!target) return;

      const overMenu = Boolean(menuRef.current?.contains(target));
      const overAnchor = Boolean(anchorElement?.contains(target));

      isOverMenu = overMenu;
      isOverAnchor = overAnchor;

      if (!isOverMenu && !isOverAnchor) {
        onClose();
      }
    };

    const handleWindowMouseLeave = (e: MouseEvent) => {
      if (!e.relatedTarget && !isOverMenu) {
        onClose();
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };

    window.addEventListener('mousemove', handlePointerMove, { passive: true });
    window.addEventListener('mouseleave', handleWindowMouseLeave, { passive: true });
    window.addEventListener('keydown', handleKeyDown, { capture: true });

    return () => {
      window.removeEventListener('mousemove', handlePointerMove);
      window.removeEventListener('mouseleave', handleWindowMouseLeave);
      window.removeEventListener('keydown', handleKeyDown, { capture: true });
    };
  }, [isOpen, anchorElement, onClose]);

  if (!isOpen || !tile) return null;

  const owned = tile.primary;
  const disabled = owned.filter((m) => !m.isEnabled);
  const enabled = owned.filter((m) => m.isEnabled);

  const handleToggleSingle = async (macro: MacroDefinition) => {
    onClose();
    await onToggleMacro?.(macro);
  };

  const handleToggleMultiple = async (macrosToToggle: readonly MacroDefinition[]) => {
    onClose();
    if (onToggleAll) {
      await onToggleAll(macrosToToggle);
    } else {
      for (const m of macrosToToggle) {
        await onToggleMacro?.(m);
      }
    }
  };

  const handleSettingsClick = (tag: string) => {
    onClose();
    onOpenSettings?.(tag);
  };

  return (
    <WindowSafePortal>
      <div
        ref={menuRef}
        role="menu"
        aria-label={tile.label}
        data-testid="bind-map-macro-menu"
        style={{
          top: `${position.top}px`,
          left: `${position.left}px`,
          position: 'fixed',
          zIndex: 800,
        }}
        className="min-w-[280px] max-w-[360px] p-2 bg-[var(--color-surface)] border border-[var(--color-border-subtle)] rounded-[10px] shadow-[0_4px_14px_rgba(0,0,0,0.45)] select-none animate-fadeIn transition-all"
        onMouseEnter={() => {}}
        onMouseLeave={() => {}}
      >
        {/* Header: Key Label */}
        <div className="px-2.5 pt-1 pb-2 text-[12px] font-medium text-[var(--color-text-muted)] border-b border-[var(--color-border-subtle)]/40 mb-1">
          {tile.label}
        </div>

        {/* Foreign Conflicts */}
        {tile.conflicts.map((conflict, i) => (
          <InfoRow
            key={`conflict-${i}`}
            title={t('Held by another application')}
            subtitle={conflict}
            titleColor="var(--color-conflict)"
          />
        ))}

        {/* System Commands Primary */}
        {tile.systemPrimary.map((cmd) => (
          <MenuItemRow
            key={`sys-primary-${cmd.tag}`}
            title={cmd.name}
            subtitle={formatHotkeyDisplay(cmd.binding)}
            actionText={t('Configure')}
            actionColor="var(--color-focus)"
            onClick={() => handleSettingsClick(cmd.tag)}
            enabled={Boolean(onOpenSettings)}
          />
        ))}

        {/* Owned Macros Primary */}
        {owned.map((macro) => {
          const actionText = macro.isEnabled ? t('Disable') : t('Enable');
          const actionColor = macro.isEnabled ? 'var(--color-danger)' : 'var(--color-accent)';
          const hotkeyDisplay = formatHotkeyDisplay(macro.hotkey) + bindModeSuffix(macro, t);

          return (
            <MenuItemRow
              key={`macro-primary-${macro.id}`}
              title={macro.name}
              subtitle={hotkeyDisplay}
              actionText={actionText}
              actionColor={actionColor}
              onClick={() => handleToggleSingle(macro)}
            />
          );
        })}

        {/* Secondary Macros Informational */}
        {tile.secondary.map((macro) => (
          <InfoRow
            key={`macro-secondary-${macro.id}`}
            title={macro.name}
            subtitle={formatHotkeyDisplay(macro.hotkey)}
            noteText={t('second key')}
            noteColor="var(--color-warning)"
          />
        ))}

        {/* Secondary System Commands Informational */}
        {tile.systemSecondary.map((cmd) => (
          <InfoRow
            key={`sys-secondary-${cmd.tag}`}
            title={cmd.name}
            subtitle={formatHotkeyDisplay(cmd.binding)}
            noteText={t('second key')}
            noteColor="var(--color-warning)"
          />
        ))}

        {/* Free Key / Nothing Bound */}
        {!tile.hasBinds && (
          <InfoRow
            title={t('Nothing of ours is bound to this key.')}
            subtitle=""
            titleColor="var(--color-text-muted)"
          />
        )}

        {/* Multiple Owned Macros Actions (Enable all / Disable all) */}
        {owned.length > 1 && (
          <>
            <div className="h-px bg-[var(--color-border-subtle)] my-1.5 mx-2" />
            <MenuItemRow
              title={t('Enable all')}
              subtitle={format('disabled: {0}', disabled.length)}
              actionText=""
              actionColor="var(--color-accent)"
              onClick={() => handleToggleMultiple(disabled)}
              enabled={disabled.length > 0}
              testId="bind-map-menu-enable-all"
            />
            <MenuItemRow
              title={t('Disable all')}
              subtitle={format('enabled: {0}', enabled.length)}
              actionText=""
              actionColor="var(--color-danger)"
              onClick={() => handleToggleMultiple(enabled)}
              enabled={enabled.length > 0}
              testId="bind-map-menu-disable-all"
            />
          </>
        )}
      </div>
    </WindowSafePortal>
  );
};

interface MenuItemRowProps {
  readonly title: string;
  readonly subtitle?: string | undefined;
  readonly actionText: string;
  readonly actionColor: string;
  readonly onClick: () => void;
  readonly enabled?: boolean | undefined;
  readonly testId?: string | undefined;
}

const MenuItemRow: React.FC<MenuItemRowProps> = ({
  title,
  subtitle,
  actionText,
  actionColor,
  onClick,
  enabled = true,
  testId,
}) => {
  return (
    <button
      type="button"
      role="menuitem"
      disabled={!enabled}
      onClick={onClick}
      data-testid={testId}
      className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-[6px] text-left transition-colors ${
        enabled
          ? 'hover:bg-[var(--color-surface-hover)]'
          : 'opacity-50'
      }`}
    >
      <div className="flex flex-col min-w-0 pr-2">
        <span className="text-[13px] font-medium text-[var(--color-text-primary)] truncate">
          {title}
        </span>
        {subtitle && (
          <span className="text-[11px] text-[var(--color-text-muted)] truncate">{subtitle}</span>
        )}
      </div>
      {actionText && (
        <span
          className="text-[12px] font-semibold flex-shrink-0 ml-2"
          style={{ color: actionColor }}
        >
          {actionText}
        </span>
      )}
    </button>
  );
};

interface InfoRowProps {
  readonly title: string;
  readonly subtitle?: string | undefined;
  readonly noteText?: string | undefined;
  readonly noteColor?: string | undefined;
  readonly titleColor?: string | undefined;
}

const InfoRow: React.FC<InfoRowProps> = ({
  title,
  subtitle,
  noteText,
  noteColor,
  titleColor,
}) => {
  return (
    <div className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-[6px]">
      <div className="flex flex-col min-w-0 pr-2">
        <span
          className="text-[13px] font-medium truncate"
          style={{ color: titleColor ?? 'var(--color-text-primary)' }}
        >
          {title}
        </span>
        {subtitle && (
          <span className="text-[11px] text-[var(--color-text-muted)] truncate">{subtitle}</span>
        )}
      </div>
      {noteText && (
        <span
          className="text-[11px] font-medium flex-shrink-0 ml-2"
          style={{ color: noteColor ?? 'var(--color-text-muted)' }}
        >
          {noteText}
        </span>
      )}
    </div>
  );
};
