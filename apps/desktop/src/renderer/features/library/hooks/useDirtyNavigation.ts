/**
 * @macro-recorder/desktop - Dirty Navigation Hook
 * Intercepts selection and navigation changes when a macro has unsaved edits,
 * prompting the user to Save, Discard, or Cancel.
 */

import { useState, useCallback } from 'react';
import type { MacroDefinition } from '../../../../../../../packages/contracts/src/index.js';

export interface DirtyNavigationPromptState {
  readonly isOpen: boolean;
  readonly macro: MacroDefinition | null;
  readonly onSaveAndProceed: () => Promise<void>;
  readonly onDiscardAndProceed: () => void;
  readonly onCancel: () => void;
}

export interface UseDirtyNavigationOptions {
  readonly currentMacro: MacroDefinition | null;
  readonly onSaveMacro?: ((macro: MacroDefinition) => Promise<void>) | undefined;
  readonly onDiscardMacro?: ((macro: MacroDefinition) => void) | undefined;
}

export function useDirtyNavigation({
  currentMacro,
  onSaveMacro,
  onDiscardMacro,
}: UseDirtyNavigationOptions) {
  const [modifiedMacroIds, setModifiedMacroIds] = useState<Set<string>>(new Set());
  const [promptState, setPromptState] = useState<DirtyNavigationPromptState | null>(null);

  const markModified = useCallback((macroId: string) => {
    setModifiedMacroIds((prev) => {
      const next = new Set(prev);
      next.add(macroId);
      return next;
    });
  }, []);

  const markClean = useCallback((macroId: string) => {
    setModifiedMacroIds((prev) => {
      const next = new Set(prev);
      next.delete(macroId);
      return next;
    });
  }, []);

  const isModified = useCallback(
    (macroId: string) => modifiedMacroIds.has(macroId),
    [modifiedMacroIds],
  );

  const clearAllModified = useCallback(() => {
    setModifiedMacroIds(new Set());
  }, []);

  /**
   * Guards a navigation or macro selection change.
   * If the current macro is dirty and the target is different, opens the prompt.
   * Otherwise executes `proceed` immediately.
   */
  const guardNavigation = useCallback(
    (targetMacroId: string | null, proceed: () => void) => {
      if (!currentMacro || !modifiedMacroIds.has(currentMacro.id)) {
        proceed();
        return;
      }

      if (targetMacroId === currentMacro.id) {
        // Same macro selected, no need to prompt
        return;
      }

      const activeMacro = currentMacro;

      setPromptState({
        isOpen: true,
        macro: activeMacro,
        onSaveAndProceed: async () => {
          if (onSaveMacro) {
            await onSaveMacro(activeMacro);
          }
          markClean(activeMacro.id);
          setPromptState(null);
          proceed();
        },
        onDiscardAndProceed: () => {
          if (onDiscardMacro) {
            onDiscardMacro(activeMacro);
          }
          markClean(activeMacro.id);
          setPromptState(null);
          proceed();
        },
        onCancel: () => {
          setPromptState(null);
        },
      });
    },
    [currentMacro, modifiedMacroIds, onSaveMacro, onDiscardMacro, markClean],
  );

  return {
    modifiedMacroIds,
    markModified,
    markClean,
    isModified,
    clearAllModified,
    guardNavigation,
    promptState,
    isPromptOpen: promptState?.isOpen ?? false,
  };
}
