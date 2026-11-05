/**
 * @macro-recorder/desktop - Unsaved Changes Policy Hook
 * Intercepts navigation and window close attempts when macro actions are modified.
 * Presents Save/Discard/Cancel decision prompt.
 */

import { useState, useCallback, useEffect } from 'react';
import type { MacroDefinition } from '../../../../../packages/contracts/src/index.js';

export interface UnsavedChangesPromptState {
  readonly isOpen: boolean;
  readonly macro: MacroDefinition;
  readonly onSaveAndProceed: () => Promise<void>;
  readonly onDiscardAndProceed: () => void;
  readonly onCancel: () => void;
}

export interface UseUnsavedChangesPolicyOptions {
  readonly isDirty: boolean;
  readonly currentMacro: MacroDefinition | null;
  readonly onSaveMacro: (macro: MacroDefinition) => Promise<boolean>;
  readonly onDiscardChanges?: (() => void) | undefined;
}

export function useUnsavedChangesPolicy({
  isDirty,
  currentMacro,
  onSaveMacro,
  onDiscardChanges,
}: UseUnsavedChangesPolicyOptions) {
  const [promptState, setPromptState] = useState<UnsavedChangesPromptState | null>(null);

  /**
   * Guards a pending navigation action with the dirty check.
   */
  const guardNavigation = useCallback(
    (proceed: () => void): void => {
      if (!isDirty || !currentMacro) {
        proceed();
        return;
      }

      setPromptState({
        isOpen: true,
        macro: currentMacro,
        onSaveAndProceed: async () => {
          const success = await onSaveMacro(currentMacro);
          if (success) {
            setPromptState(null);
            proceed();
          }
        },
        onDiscardAndProceed: () => {
          onDiscardChanges?.();
          setPromptState(null);
          proceed();
        },
        onCancel: () => {
          setPromptState(null);
        },
      });
    },
    [isDirty, currentMacro, onSaveMacro, onDiscardChanges],
  );

  // Beforeunload window listener
  useEffect(() => {
    if (!isDirty) return undefined;

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
      return '';
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [isDirty]);

  return {
    isDirty,
    promptState,
    guardNavigation,
    dismissPrompt: () => setPromptState(null),
  };
}
