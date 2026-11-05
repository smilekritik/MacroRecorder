/**
 * Library Coordinator.
 * Orchestrates macro library loading, nested folder hierarchy (up to 8 levels),
 * unique macro naming with numeric suffixes, atomic file persistence, recoverable trash,
 * whole-library backup and restore, and dirty editor integration.
 */

import type { ILibraryStore } from '../types.js';
import type { DirtyEditorManager } from '../state/dirty-editor-manager.js';
import type { MacroDefinition } from '../../ipc/types.js';

export interface LibraryCoordinatorOptions {
  readonly store: ILibraryStore;
  readonly editorManager: DirtyEditorManager;
}

export class LibraryCoordinator {
  private readonly store: ILibraryStore;
  private readonly editorManager: DirtyEditorManager;
  private cachedMacros: MacroDefinition[] = [];
  private cachedFolders: string[] = [];

  constructor(options: LibraryCoordinatorOptions) {
    this.store = options.store;
    this.editorManager = options.editorManager;
  }

  public get libraryStore(): ILibraryStore {
    return this.store;
  }

  /**
   * Loads the entire macro library and folder hierarchy.
   * Disambiguates duplicate names and sorts enabled macros first.
   */
  public async loadLibrary(): Promise<{
    macros: readonly MacroDefinition[];
    folders: readonly string[];
  }> {
    const macros = await this.store.loadAll();
    const folders = await this.store.loadFolders();

    // Sort: enabled macros first, then modifiedAt descending
    macros.sort((a, b) => {
      const aEnabled = Boolean(a.isEnabled);
      const bEnabled = Boolean(b.isEnabled);
      if (aEnabled !== bEnabled) {
        return aEnabled ? -1 : 1;
      }
      const timeA = new Date(String(a['modifiedAt'] ?? 0)).getTime();
      const timeB = new Date(String(b['modifiedAt'] ?? 0)).getTime();
      return timeB - timeA;
    });

    this.cachedMacros = macros;
    this.cachedFolders = folders;

    return {
      macros: this.cachedMacros,
      folders: this.cachedFolders,
    };
  }

  public getMacros(): readonly MacroDefinition[] {
    return this.cachedMacros;
  }

  public getAllMacros(): readonly MacroDefinition[] {
    return this.cachedMacros;
  }

  public getMacroById(id: string): MacroDefinition | undefined {
    return this.cachedMacros.find((m) => m.id === id);
  }

  public getMacroByName(name: string): MacroDefinition | undefined {
    return this.cachedMacros.find(
      (m) => m.name.toLowerCase() === name.toLowerCase(),
    );
  }

  public getFolders(): readonly string[] {
    return this.cachedFolders;
  }

  /**
   * Saves a macro to the library and marks editor clean.
   */
  public async saveMacro(
    macro: MacroDefinition,
    options?: { touchModified?: boolean | undefined },
  ): Promise<{ success: boolean; storagePath: string }> {
    await this.store.save(macro, options);
    this.editorManager.markSaved(macro);

    const existingIdx = this.cachedMacros.findIndex((m) => m.id === macro.id);
    if (existingIdx >= 0) {
      this.cachedMacros[existingIdx] = macro;
    } else {
      this.cachedMacros.unshift(macro);
    }

    const storagePath = String(macro['storagePath'] ?? '');
    return { success: true, storagePath };
  }

  /**
   * Deletes a macro, moves it to the trash, and returns a restore token.
   */
  public async deleteMacro(macroId: string): Promise<string> {
    const macro = this.getMacroById(macroId);
    if (!macro) {
      return '';
    }

    const token = await this.store.delete(macro);
    this.editorManager.closeDraft(macroId);

    this.cachedMacros = this.cachedMacros.filter((m) => m.id !== macroId);
    return token;
  }

  /**
   * Restores a deleted macro from the trash.
   */
  public async restoreMacro(
    token: string,
    folderRelativePath: string,
    macroName: string,
  ): Promise<boolean> {
    const restored = await this.store.restoreMacro(token, folderRelativePath, macroName);
    if (restored) {
      await this.loadLibrary();
    }
    return restored;
  }

  /**
   * Moves a macro to a new folder relative path.
   */
  public async moveMacro(macroId: string, folderRelativePath: string): Promise<boolean> {
    const macro = this.getMacroById(macroId);
    if (!macro) return false;

    await this.store.moveToFolder(macro, folderRelativePath);
    (macro as { folderRelativePath?: string }).folderRelativePath = folderRelativePath;
    return true;
  }

  /**
   * Creates a new nested folder inside parentRelativePath.
   */
  public async createFolder(folderRelativePath: string): Promise<boolean> {
    const parts = folderRelativePath.replace(/\\/g, '/').split('/');
    const name = parts.pop() ?? 'New folder';
    const parent = parts.join('/');

    await this.store.createFolder(parent, name);
    this.cachedFolders = await this.store.loadFolders();
    return true;
  }

  /**
   * Deletes a folder and moves it to the trash.
   */
  public async deleteFolder(folderRelativePath: string): Promise<string> {
    const token = await this.store.deleteFolder(folderRelativePath);
    await this.loadLibrary();
    return token;
  }

  /**
   * Restores a deleted folder from the trash.
   */
  public async restoreFolder(token: string, folderRelativePath: string): Promise<boolean> {
    const restored = await this.store.restoreFolder(token, folderRelativePath);
    if (restored) {
      await this.loadLibrary();
    }
    return restored;
  }

  /**
   * Moves a folder to a new parent location.
   */
  public async moveFolder(sourceRelativePath: string, targetRelativePath: string): Promise<boolean> {
    await this.store.moveFolder(sourceRelativePath, targetRelativePath);
    this.cachedFolders = await this.store.loadFolders();
    return true;
  }

  /**
   * Imports a macro into the library at the target folder.
   */
  public async importMacro(
    macro: MacroDefinition,
    targetFolderRelativePath = '',
  ): Promise<{ macro: MacroDefinition; warning?: string }> {
    const result = await this.store.importMacro(macro, targetFolderRelativePath);
    await this.loadLibrary();
    return result;
  }

  /**
   * Cleans up trash older than keepMaxAgeMs.
   */
  public async cleanupTrash(keepMaxAgeMs = 30 * 86400 * 1000): Promise<number> {
    return this.store.cleanupTrash(keepMaxAgeMs);
  }

  public async getFolderTreeInfo(): Promise<{ folders: string[]; macroCounts: Record<string, number> }> {
    return this.store.getFolderTreeInfo();
  }
}

/**
 * In-Memory Deterministic Fake Library Store for Unit and Integration Testing.
 */
export class FakeLibraryStore implements ILibraryStore {
  public readonly rootPath: string;
  private readonly macros = new Map<string, MacroDefinition>();
  private readonly folders = new Set<string>();
  private readonly trash = new Map<string, { macro?: MacroDefinition; folder?: string }>();
  private trashCounter = 0;

  constructor(rootPath = 'C:\\FakeLibrary') {
    this.rootPath = rootPath;
  }

  public async loadAll(): Promise<MacroDefinition[]> {
    return Array.from(this.macros.values());
  }

  public async save(macro: MacroDefinition): Promise<void> {
    const uniqueName = this.resolveUniqueName(macro.name, {
      storagePath: String(macro['storagePath'] ?? ''),
    });
    const updated: MacroDefinition = {
      ...macro,
      name: uniqueName,
      storagePath: `${this.rootPath}\\Macros\\${uniqueName}.macro.json`,
      modifiedAt: new Date().toISOString(),
    };
    this.macros.set(macro.id, updated);
  }

  public async delete(macro: { id?: string; name: string }): Promise<string> {
    const id = macro.id ?? '';
    const existing = this.macros.get(id);
    if (!existing) return '';

    this.trashCounter++;
    const token = `trash-token-${this.trashCounter}`;
    this.trash.set(token, { macro: existing });
    this.macros.delete(id);
    return token;
  }

  public async restoreMacro(token: string, folderRelativePath: string, macroName: string): Promise<boolean> {
    const item = this.trash.get(token);
    if (!item?.macro) return false;

    const restored: MacroDefinition = {
      ...item.macro,
      name: this.resolveUniqueName(macroName),
      folderRelativePath,
    };
    this.macros.set(restored.id, restored);
    this.trash.delete(token);
    return true;
  }

  public async restoreFolder(token: string, relativePath: string): Promise<boolean> {
    const item = this.trash.get(token);
    if (!item?.folder) return false;

    this.folders.add(relativePath);
    this.trash.delete(token);
    return true;
  }

  public async moveToFolder(macro: MacroDefinition, folderRelativePath: string): Promise<void> {
    const existing = this.macros.get(macro.id);
    if (existing) {
      (existing as { folderRelativePath?: string }).folderRelativePath = folderRelativePath;
    }
  }

  public async loadFolders(): Promise<string[]> {
    return Array.from(this.folders).sort();
  }

  public async createFolder(parentRelativePath: string, name: string): Promise<string> {
    const combined = parentRelativePath ? `${parentRelativePath}/${name}` : name;
    this.folders.add(combined);
    return combined;
  }

  public async deleteFolder(relativePath: string): Promise<string> {
    this.folders.delete(relativePath);
    this.trashCounter++;
    const token = `trash-folder-${this.trashCounter}`;
    this.trash.set(token, { folder: relativePath });
    return token;
  }

  public async moveFolder(relativePath: string, newParentRelativePath: string): Promise<string> {
    const name = relativePath.split('/').pop() ?? relativePath;
    const combined = newParentRelativePath ? `${newParentRelativePath}/${name}` : name;
    this.folders.delete(relativePath);
    this.folders.add(combined);
    return combined;
  }

  public async cleanupTrash(_keepMaxAgeMs: number): Promise<number> {
    const count = this.trash.size;
    this.trash.clear();
    return count;
  }

  public async importMacro(
    macro: MacroDefinition,
    folderRelativePath = '',
  ): Promise<{ macro: MacroDefinition; warning?: string }> {
    const requestedName = macro.name;
    const uniqueName = this.resolveUniqueName(requestedName);
    const newId = `imported-${Date.now()}-${Math.random()}`;

    const imported: MacroDefinition = {
      ...macro,
      id: newId,
      name: uniqueName,
      isEnabled: false,
      folderRelativePath,
    };
    this.macros.set(newId, imported);

    let warning: string | undefined;
    if (requestedName !== uniqueName) {
      warning = `The name "${requestedName}" is already taken; the macro was saved as "${uniqueName}".`;
    }
    return { macro: imported, ...(warning ? { warning } : {}) };
  }

  public async getFolderTreeInfo(): Promise<{ folders: string[]; macroCounts: Record<string, number> }> {
    const folders = await this.loadFolders();
    const counts: Record<string, number> = { '': this.macros.size };
    for (const f of folders) {
      counts[f] = 0;
    }
    for (const m of this.macros.values()) {
      const folder = String(m['folderRelativePath'] ?? '');
      if (folder in counts) {
        counts[folder] = (counts[folder] ?? 0) + 1;
      }
    }
    return { folders, macroCounts: counts };
  }

  public resolveUniqueName(desiredName: string, owner?: { storagePath?: string }): string {
    const taken = new Set<string>();
    for (const m of this.macros.values()) {
      if (owner?.storagePath && String(m['storagePath'] ?? '') === owner.storagePath) {
        continue;
      }
      taken.add(m.name.toLowerCase());
    }

    let candidate = desiredName;
    let suffix = 2;
    while (taken.has(candidate.toLowerCase())) {
      candidate = `${desiredName} ${suffix}`;
      suffix++;
    }
    return candidate;
  }
}
