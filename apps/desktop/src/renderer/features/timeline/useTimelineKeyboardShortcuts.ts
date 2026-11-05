/**
 * Precise keyboard shortcut hook for the Timeline Editor.
 */

import { useEffect, useCallback } from 'react';

export interface UseTimelineKeyboardShortcutsOptions {
  readonly isEnabled?: boolean | undefined;
  readonly onDelete?: (() => void) | undefined;
  readonly onCopy?: (() => void) | undefined;
  readonly onPaste?: (() => void) | undefined;
  readonly onUndo?: (() => void) | undefined;
  readonly onRedo?: (() => void) | undefined;
  readonly onMoveUp?: (() => void) | undefined;
  readonly onMoveDown?: (() => void) | undefined;
  readonly onSelectAll?: (() => void) | undefined;
  readonly onEscape?: (() => void) | undefined;
}

export function useTimelineKeyboardShortcuts({
  isEnabled = true,
  onDelete,
  onCopy,
  onPaste,
  onUndo,
  onRedo,
  onMoveUp,
  onMoveDown,
  onSelectAll,
  onEscape,
}: UseTimelineKeyboardShortcutsOptions) {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!isEnabled) return;

      const target = e.target as HTMLElement | null;
      const isInput =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable);

      // In input editors, allow Escape and Tab, but don't intercept standard typing shortcuts
      if (isInput) {
        if (e.key === 'Escape') {
          onEscape?.();
        }
        return;
      }

      const isCtrlOrMeta = e.ctrlKey || e.metaKey;

      // Delete: Delete key without modifier
      if (e.key === 'Delete' && !isCtrlOrMeta && !e.altKey) {
        e.preventDefault();
        onDelete?.();
        return;
      }

      // Alt + ArrowUp: move selected actions earlier
      if (e.altKey && e.key === 'ArrowUp') {
        e.preventDefault();
        onMoveUp?.();
        return;
      }

      // Alt + ArrowDown: move selected actions later
      if (e.altKey && e.key === 'ArrowDown') {
        e.preventDefault();
        onMoveDown?.();
        return;
      }

      // Escape: cancel / clear
      if (e.key === 'Escape') {
        e.preventDefault();
        onEscape?.();
        return;
      }

      // Ctrl + A: select all
      if (isCtrlOrMeta && (e.key === 'a' || e.key === 'A')) {
        e.preventDefault();
        onSelectAll?.();
        return;
      }

      // Ctrl + C: copy
      if (isCtrlOrMeta && !e.shiftKey && (e.key === 'c' || e.key === 'C')) {
        e.preventDefault();
        onCopy?.();
        return;
      }

      // Ctrl + V: paste
      if (isCtrlOrMeta && !e.shiftKey && (e.key === 'v' || e.key === 'V')) {
        e.preventDefault();
        onPaste?.();
        return;
      }

      // Ctrl + Shift + Z or Ctrl + Y: redo
      if (
        (isCtrlOrMeta && e.shiftKey && (e.key === 'z' || e.key === 'Z')) ||
        (isCtrlOrMeta && (e.key === 'y' || e.key === 'Y'))
      ) {
        e.preventDefault();
        onRedo?.();
        return;
      }

      // Ctrl + Z: undo
      if (isCtrlOrMeta && !e.shiftKey && (e.key === 'z' || e.key === 'Z')) {
        e.preventDefault();
        onUndo?.();
        return;
      }
    },
    [
      isEnabled,
      onDelete,
      onCopy,
      onPaste,
      onUndo,
      onRedo,
      onMoveUp,
      onMoveDown,
      onSelectAll,
      onEscape,
    ],
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [handleKeyDown]);
}
