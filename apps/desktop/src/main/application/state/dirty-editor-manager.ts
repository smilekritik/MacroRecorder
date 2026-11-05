/**
 * State Machine for Tracking Macro Editor Dirty State and Unsaved Changes.
 * Preserves per-macro edit status, undo history isolation, and unsaved changes protection.
 */

import type { MacroDefinition } from '../../ipc/types.js';

export interface EditorDraft {
  readonly macroId: string;
  readonly originalSnapshotJson: string;
  currentMacro: MacroDefinition;
  isDirty: boolean;
  undoDepth: number;
  canUndo: boolean;
  canRedo: boolean;
}

export class DirtyEditorManager {
  private readonly drafts = new Map<string, EditorDraft>();
  private readonly dirtyListeners = new Set<(macroId: string, isDirty: boolean) => void>();

  /**
   * Initializes or opens a macro in the editor.
   */
  public openMacro(macro: MacroDefinition): EditorDraft {
    const macroId = macro.id;
    const snapshot = JSON.stringify(macro);

    const draft: EditorDraft = {
      macroId,
      originalSnapshotJson: snapshot,
      currentMacro: JSON.parse(snapshot) as MacroDefinition,
      isDirty: false,
      undoDepth: 0,
      canUndo: false,
      canRedo: false,
    };

    this.drafts.set(macroId, draft);
    return draft;
  }

  /**
   * Updates draft content and recalculates dirty marker.
   */
  public updateDraft(
    macroId: string,
    updated: MacroDefinition,
    undoDepth = 0,
    canUndo = false,
    canRedo = false,
  ): boolean {
    const draft = this.drafts.get(macroId);
    if (!draft) {
      this.openMacro(updated);
      return false;
    }

    draft.currentMacro = updated;
    draft.undoDepth = undoDepth;
    draft.canUndo = canUndo;
    draft.canRedo = canRedo;

    const currentJson = JSON.stringify(updated);
    const wasDirty = draft.isDirty;
    draft.isDirty = currentJson !== draft.originalSnapshotJson;

    if (wasDirty !== draft.isDirty) {
      this.notifyListeners(macroId, draft.isDirty);
    }

    return draft.isDirty;
  }

  /**
   * Marks a macro as saved, clearing the dirty marker and updating the clean snapshot baseline.
   */
  public markSaved(macro: MacroDefinition): void {
    const macroId = macro.id;
    const snapshot = JSON.stringify(macro);

    const draft = this.drafts.get(macroId);
    if (draft) {
      const wasDirty = draft.isDirty;
      (draft as { originalSnapshotJson: string }).originalSnapshotJson = snapshot;
      draft.currentMacro = JSON.parse(snapshot) as MacroDefinition;
      draft.isDirty = false;
      draft.canUndo = false;
      draft.undoDepth = 0;

      if (wasDirty) {
        this.notifyListeners(macroId, false);
      }
    }
  }

  /**
   * Discards uncommitted draft edits and reverts to the original clean snapshot.
   */
  public discardDraft(macroId: string): MacroDefinition | null {
    const draft = this.drafts.get(macroId);
    if (!draft) return null;

    const reverted = JSON.parse(draft.originalSnapshotJson) as MacroDefinition;
    draft.currentMacro = reverted;
    const wasDirty = draft.isDirty;
    draft.isDirty = false;
    draft.canUndo = false;
    draft.canRedo = false;
    draft.undoDepth = 0;

    if (wasDirty) {
      this.notifyListeners(macroId, false);
    }
    return reverted;
  }

  /**
   * Closes an editor draft tab.
   */
  public closeDraft(macroId: string): void {
    this.drafts.delete(macroId);
  }

  public markClean(macroId: string, macro?: MacroDefinition): void {
    if (macro) {
      this.markSaved(macro);
    } else {
      const draft = this.drafts.get(macroId);
      if (draft) {
        draft.isDirty = false;
        this.notifyListeners(macroId, false);
      }
    }
  }

  public clear(macroId?: string): void {
    if (macroId) {
      this.closeDraft(macroId);
    } else {
      this.drafts.clear();
    }
  }

  public isDirty(macroId: string): boolean {
    return Boolean(this.drafts.get(macroId)?.isDirty);
  }

  public hasAnyDirty(): boolean {
    for (const draft of this.drafts.values()) {
      if (draft.isDirty) return true;
    }
    return false;
  }

  public getDirtyMacroIds(): string[] {
    const ids: string[] = [];
    for (const draft of this.drafts.values()) {
      if (draft.isDirty) ids.push(draft.macroId);
    }
    return ids;
  }

  public getDraft(macroId: string): EditorDraft | undefined {
    return this.drafts.get(macroId);
  }

  public onDirtyChanged(listener: (macroId: string, isDirty: boolean) => void): () => void {
    this.dirtyListeners.add(listener);
    return () => {
      this.dirtyListeners.delete(listener);
    };
  }

  private notifyListeners(macroId: string, isDirty: boolean): void {
    for (const listener of this.dirtyListeners) {
      try {
        listener(macroId, isDirty);
      } catch (err) {
        console.warn('[DirtyEditorManager] Listener error:', err);
      }
    }
  }
}
