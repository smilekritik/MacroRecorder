/**
 * @macro-recorder/desktop - Application Keyboard Shortcuts Hook
 * Centralized keyboard shortcuts dispatcher preserving native text editing behavior.
 */

import { useEffect, useCallback } from 'react';
import { useApi } from '../hooks/useApi.js';
import { IpcChannels } from '../../../../../packages/contracts/src/index.js';

export interface AppKeyboardShortcutsHandlers {
  readonly onRun?: (() => void) | undefined;
  readonly onRecord?: (() => void) | undefined;
  readonly onPause?: (() => void) | undefined;
  readonly onStop?: (() => void) | undefined;
  readonly onEmergencyStop?: (() => void) | undefined;
  readonly onToggleBindMap?: (() => void) | undefined;
  readonly onSave?: (() => void) | undefined;
  readonly onUndo?: (() => void) | undefined;
  readonly onCopy?: (() => void) | undefined;
  readonly onPaste?: (() => void) | undefined;
  readonly onDelete?: (() => void) | undefined;
  readonly onRename?: (() => void) | undefined;
  readonly onEscape?: (() => void) | undefined;
  readonly onMoveUp?: (() => void) | undefined;
  readonly onMoveDown?: (() => void) | undefined;
}

export function useAppKeyboardShortcuts(handlers: AppKeyboardShortcutsHandlers = {}) {
  const api = useApi();

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isTextInput =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable);

      // F10: Emergency Stop is ALWAYS intercepted, even inside text fields
      if (e.key === 'F10') {
        e.preventDefault();
        e.stopPropagation();
        if (handlers.onEmergencyStop) {
          handlers.onEmergencyStop();
        } else {
          void api.invoke(IpcChannels.EMERGENCY_STOP, { requestId: `f10-${Date.now()}` });
        }
        return;
      }

      // If user is editing text in an input or textarea, let standard text editing shortcuts pass through
      if (isTextInput) {
        if (e.key === 'Escape' && handlers.onEscape) {
          handlers.onEscape();
        }
        return;
      }

      // Function keys
      if (e.key === 'F5') {
        e.preventDefault();
        handlers.onRun?.();
        return;
      }

      if (e.key === 'F7') {
        e.preventDefault();
        handlers.onRecord?.();
        return;
      }

      if (e.key === 'F8') {
        e.preventDefault();
        handlers.onStop?.();
        return;
      }

      if (e.key === 'F9') {
        e.preventDefault();
        handlers.onPause?.();
        return;
      }

      if (e.key === 'F11') {
        e.preventDefault();
        if (handlers.onToggleBindMap) {
          handlers.onToggleBindMap();
        } else {
          void api.invoke(IpcChannels.WINDOWS_OPEN, {
            requestId: `f11-${Date.now()}`,
            windowId: 'bind-map',
          });
        }
        return;
      }

      if (e.key === 'F2') {
        e.preventDefault();
        handlers.onRename?.();
        return;
      }

      if (e.key === 'Escape') {
        e.preventDefault();
        handlers.onEscape?.();
        return;
      }

      // Alt + Arrow keys for timeline movement
      if (e.altKey && !e.ctrlKey && !e.shiftKey) {
        if (e.key === 'ArrowUp') {
          e.preventDefault();
          handlers.onMoveUp?.();
          return;
        }
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          handlers.onMoveDown?.();
          return;
        }
      }

      // Delete key
      if (e.key === 'Delete') {
        e.preventDefault();
        handlers.onDelete?.();
        return;
      }

      // Ctrl + shortcuts
      if (e.ctrlKey && !e.altKey) {
        const keyUpper = e.key.toUpperCase();
        if (keyUpper === 'S') {
          e.preventDefault();
          handlers.onSave?.();
          return;
        }
        if (keyUpper === 'Z') {
          e.preventDefault();
          handlers.onUndo?.();
          return;
        }
        if (keyUpper === 'C') {
          e.preventDefault();
          handlers.onCopy?.();
          return;
        }
        if (keyUpper === 'V') {
          e.preventDefault();
          handlers.onPaste?.();
          return;
        }
      }
    },
    [api, handlers],
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown, true);
    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [handleKeyDown]);
}
