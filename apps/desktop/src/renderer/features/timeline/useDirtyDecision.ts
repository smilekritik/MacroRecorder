/**
 * Hook for guarding unsaved timeline changes during navigation, selection switch, or window closing.
 * Conforms to the requirement: Unsaved changes cannot be lost through selection, minimize, close, import, or quit flows.
 */

import { useState, useCallback, useEffect, useRef } from 'react';

export interface UseDirtyDecisionOptions {
  readonly isDirty: boolean;
  readonly macroName?: string | undefined;
  readonly onSave: () => Promise<void> | void;
  readonly onDiscard: () => void;
}

export function useDirtyDecision({
  isDirty,
  macroName = 'Untitled',
  onSave,
  onDiscard,
}: UseDirtyDecisionOptions) {
  const [isPromptOpen, setIsPromptOpen] = useState(false);
  const pendingActionRef = useRef<(() => void) | null>(null);

  // Prevent browser window/tab close when dirty
  useEffect(() => {
    if (!isDirty) return;

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

  /**
   * Executes the action immediately if clean, or opens the save/discard prompt if dirty.
   */
  const executeWithDirtyGuard = useCallback(
    (action: () => void) => {
      if (!isDirty) {
        action();
        return;
      }
      pendingActionRef.current = action;
      setIsPromptOpen(true);
    },
    [isDirty],
  );

  const handleSaveDecision = useCallback(async () => {
    setIsPromptOpen(false);
    await onSave();
    if (pendingActionRef.current) {
      const action = pendingActionRef.current;
      pendingActionRef.current = null;
      action();
    }
  }, [onSave]);

  const handleDiscardDecision = useCallback(() => {
    setIsPromptOpen(false);
    onDiscard();
    if (pendingActionRef.current) {
      const action = pendingActionRef.current;
      pendingActionRef.current = null;
      action();
    }
  }, [onDiscard]);

  const handleCancelDecision = useCallback(() => {
    setIsPromptOpen(false);
    pendingActionRef.current = null;
  }, []);

  return {
    isPromptOpen,
    macroName,
    executeWithDirtyGuard,
    handleSaveDecision,
    handleDiscardDecision,
    handleCancelDecision,
  };
}
