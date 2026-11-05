/**
 * @macro-recorder/desktop - Hotkey Assignment Box
 * Interactive hotkey capture input supporting keyboard, mouse buttons, and wheel gestures.
 * Directly bound to the active macro to prevent stale displays upon selection change.
 */

import { useLocalization } from '../../../hooks/useLocalization.js';
import React, { useState, useCallback, useMemo, useRef } from 'react';
import type {
  HotkeyBinding,
  MacroDefinition,
} from '../../../../../../../packages/contracts/src/index.js';
import { Button } from '../../../design-system/Button.js';
import {
  formatHotkeyDisplay,
  isEmptyHotkey,
  findHotkeyConflict,
  isApplicationReservedHotkey,
  parseKeyEventToHotkey,
  DEFAULT_HOTKEY_BINDING,
} from '../utils/hotkey.js';
import { isAutomaticTriggerMacro } from '../utils/tree-builder.js';

export interface HotkeyAssignmentBoxProps {
  readonly macro: MacroDefinition | null;
  readonly allMacros?: readonly MacroDefinition[] | undefined;
  readonly onAssignHotkey: (hotkey: HotkeyBinding) => void;
  readonly disabled?: boolean | undefined;
  readonly className?: string | undefined;
}

export function HotkeyAssignmentBox({
  macro,
  allMacros = [],
  onAssignHotkey,
  disabled = false,
  className = '',
}: HotkeyAssignmentBoxProps) {
  const { t, format } = useLocalization();
  const [isFocused, setIsFocused] = useState<boolean>(false);
  const boxRef = useRef<HTMLDivElement>(null);

  const isAutoTrigger = useMemo(() => {
    return macro ? isAutomaticTriggerMacro(macro) : false;
  }, [macro]);

  const canEdit = Boolean(macro) && !isAutoTrigger && !disabled;

  // Stale-free hotkey display: derived immediately from the current macro
  const currentBinding = useMemo<HotkeyBinding>(() => {
    return macro?.hotkey ?? DEFAULT_HOTKEY_BINDING;
  }, [macro]);

  const displayString = useMemo(() => {
    if (!macro) return '';
    if (isAutoTrigger) return t('Automatic trigger');
    if (isEmptyHotkey(currentBinding)) return t('Not assigned');
    return formatHotkeyDisplay(currentBinding);
  }, [macro, isAutoTrigger, currentBinding, t]);

  // Check conflicts synchronously whenever macro or binding changes
  const warningText = useMemo(() => {
    if (!macro || isAutoTrigger || isEmptyHotkey(currentBinding)) {
      return '';
    }

    if (isApplicationReservedHotkey(currentBinding)) {
      return t('Shortcut is already used by an application command.');
    }

    const conflict = findHotkeyConflict(currentBinding, macro.id, allMacros);
    if (conflict) {
      return format('Shortcut is already assigned to macro “{0}”.', conflict.name);
    }
    return '';
  }, [macro, currentBinding, allMacros, isAutoTrigger, t, format]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!canEdit) return;
      e.preventDefault();
      e.stopPropagation();

      const { isClear, isModifierOnly, binding } = parseKeyEventToHotkey(e);

      if (isClear) {
        onAssignHotkey(DEFAULT_HOTKEY_BINDING);
        return;
      }

      if (isModifierOnly || !binding) {
        return;
      }

      onAssignHotkey(binding);
    },
    [canEdit, onAssignHotkey],
  );

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (!canEdit || !isFocused) return;

      let mouseButton: 'Left' | 'Right' | 'Middle' | 'X1' | 'X2' | 'None' = 'None';
      if (e.button === 1) mouseButton = 'Middle';
      else if (e.button === 3) mouseButton = 'X1';
      else if (e.button === 4) mouseButton = 'X2';

      if (mouseButton !== 'None') {
        e.preventDefault();
        e.stopPropagation();

        const binding: HotkeyBinding = {
          virtualKey: 0,
          mouseButton,
          wheel: 'None',
          control: e.ctrlKey,
          alt: e.altKey,
          shift: e.shiftKey,
          windows: e.metaKey,
        };

        onAssignHotkey(binding);
      }
    },
    [canEdit, isFocused, onAssignHotkey],
  );

  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      if (!canEdit || !isFocused) return;
      e.preventDefault();
      e.stopPropagation();

      const wheelDirection = e.deltaY < 0 ? 'Up' : 'Down';

      const binding: HotkeyBinding = {
        virtualKey: 0,
        mouseButton: 'None',
        wheel: wheelDirection,
        control: e.ctrlKey,
        alt: e.altKey,
        shift: e.shiftKey,
        windows: e.metaKey,
      };

      onAssignHotkey(binding);
    },
    [canEdit, isFocused, onAssignHotkey],
  );

  const handleClear = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (!canEdit) return;
      onAssignHotkey(DEFAULT_HOTKEY_BINDING);
    },
    [canEdit, onAssignHotkey],
  );

  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      <div className="flex items-center gap-2">
        <label className="text-[13px] font-semibold text-[var(--color-text-primary)] whitespace-nowrap">
          {t('Macro shortcut')}
        </label>
        <div
          ref={boxRef}
          role="textbox"
          tabIndex={canEdit ? 0 : -1}
          aria-label={t('Selected macro shortcut')}
          title={
            isAutoTrigger
              ? t('Automatic trigger: executed by pixel color monitor')
              : t('Click field and press key combination, middle click, X1/X2, or scroll wheel. Esc clears.')
          }
          onKeyDown={handleKeyDown}
          onMouseDown={handleMouseDown}
          onWheel={handleWheel}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          className={`flex-1 min-w-[120px] px-3 py-1.5 text-[13px] rounded-[6px] border outline-none select-none transition-colors ${
            !canEdit
              ? 'opacity-60 bg-[var(--color-surface-sunken)] border-[var(--color-border-subtle)] text-[var(--color-text-muted)]'
              : isFocused
                ? 'border-[var(--color-accent)] ring-1 ring-[var(--color-accent)] bg-[var(--color-surface-raised)] text-[var(--color-text-primary)]'
                : 'border-[var(--color-border)] bg-[var(--color-surface-raised)] text-[var(--color-text-primary)] hover:border-[var(--color-border-strong)]'
          }`}
        >
          {displayString}
        </div>
        <Button
          variant="base"
          size="sm"
          onClick={handleClear}
          disabled={!canEdit || isEmptyHotkey(currentBinding)}
          aria-label={t('Clear shortcut')}
        >
          {t('Clear')}
        </Button>
      </div>

      {warningText && (
        <div className="text-[12px] text-[var(--color-warning)] font-medium pl-1">
          {warningText}
        </div>
      )}
    </div>
  );
}
