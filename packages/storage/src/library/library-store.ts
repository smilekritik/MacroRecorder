/**
 * Macro Library Persistence Store.
 * Implements library path conventions, per-macro files, unique naming,
 * nested folders, move/copy/delete/restore, recoverable trash, cleanup,
 * legacy filename migration, atomic temp-write and replacement, and safe custom roots.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import * as crypto from 'node:crypto';

import {
  CURRENT_SCHEMA_VERSION,
  createDefaultMacroDefinition,
  parseMacroDefinition,
  toWireMacroDefinition,
  type MacroDefinition,
} from '../../../contracts/src/index.js';

import { t, format } from '../../../localization/src/index.js';

import { atomicWriteFile } from '../atomic/atomic-file.js';

import { MAXIMUM_FOLDER_DEPTH, MAXIMUM_EVENT_COUNT, MACRO_EXTENSION } from './constants.js';

import type {
  FolderTreeInfo,
  LibraryStoreOptions,
  LoadMacroOptions,
  SaveMacroOptions,
} from './types.js';

import {
  combineFolder,
  displayNameFromPath,
  fileNameFor,
  folderDepth,
  folderName,
  isSameOrInside,
  isSameOrInsidePath,
  nextFreeName,
  normalizeFolder,
  parentFolder,
  pathEquals,
  sanitizeName,
  validatePathSafety,
} from './path-utils.js';

import { normalizeMacroEvents } from './event-normalization.js';

export class MacroLibraryStore {
  readonly rootPath: string;
  currentDisplayDpi: number;
  lastWriteAt: Date = new Date(0);

  constructor(rootPathOrOptions?: string | LibraryStoreOptions) {
    if (typeof rootPathOrOptions === 'string') {
      this.rootPath = rootPathOrOptions;
      this.currentDisplayDpi = 96;
    } else {
      const localAppData =
        process.env['LOCALAPPDATA'] || path.join(os.homedir(), 'AppData', 'Local');
      this.rootPath = rootPathOrOptions?.rootPath ?? path.join(localAppData, 'MacroRecorder');
      this.currentDisplayDpi = rootPathOrOptions?.currentDisplayDpi ?? 96;
    }
  }

  get macrosPath(): string {
    return path.join(this.rootPath, 'Macros');
  }

  get diagnosticsPath(): string {
    return path.join(this.rootPath, 'Diagnostics');
  }

  get trashPath(): string {
    return path.join(this.rootPath, 'Trash');
  }

  // --- Core Persistence ---

  /**
   * Reads the entire library, including nested folders up to 8 levels deep.
   * Disambiguates duplicate IDs and names, and migrates legacy GUID-named files to
   * clean macro names on first launch.
   */
  async loadAll(_options?: LoadMacroOptions): Promise<MacroDefinition[]> {
    await fs.promises.mkdir(this.macrosPath, { recursive: true });
    const macroFiles = await this.enumerateMacroFiles();
    const macros: MacroDefinition[] = [];

    for (const filePath of macroFiles) {
      try {
        const text = await fs.promises.readFile(filePath, 'utf-8');
        const json = JSON.parse(text);

        const parsed = parseMacroDefinition(json);
        if (!parsed.success) {
          // If schema version is newer than supported, skip
          const schemaVer =
            (json as { SchemaVersion?: number; schemaVersion?: number })?.SchemaVersion ??
            (json as { SchemaVersion?: number; schemaVersion?: number })?.schemaVersion;
          if (typeof schemaVer === 'number' && schemaVer > CURRENT_SCHEMA_VERSION) {
            continue;
          }
          // Damaged or invalid files stay in place for recovery
          continue;
        }

        const prepared = this.prepareImportedMacro(parsed.data, displayNameFromPath(filePath));
        const folder = this.folderOfFile(filePath);

        const macro: MacroDefinition = {
          ...prepared,
          folder,
          storagePath: filePath,
        };
        macros.push(macro);
      } catch {
        // Damaged files (syntax errors, IO errors) stay in place for recovery
      }
    }

    // Disambiguate duplicate IDs and names
    const taken = new Set<string>();
    const identifiers = new Set<string>();

    for (let i = 0; i < macros.length; i++) {
      const macro = macros[i]!;

      if (identifiers.has(macro.id.toLowerCase())) {
        // A manually copied file on disk carries the same ID — assign a new one
        const newId = crypto.randomUUID();
        (macro as { id: string }).id = newId;
        identifiers.add(newId.toLowerCase());
      } else {
        identifiers.add(macro.id.toLowerCase());
      }

      const originalName = macro.name;
      const uniqueName = nextFreeName(macro.name, taken);
      (macro as { name: string }).name = uniqueName;
      taken.add(uniqueName.toLowerCase());

      if (originalName === uniqueName) {
        // If file name on disk doesn't match clean name (e.g. legacy GUID filename), migrate it
        const expectedFile = path.join(path.dirname(macro.storagePath!), fileNameFor(macro.name));
        await this.tryRelocate(macro, expectedFile);
      } else {
        // Name was disambiguated with a suffix — persist to disk under new name
        try {
          await this.save(macro, { touchModified: false });
        } catch {
          // Ignore save error on readonly paths
        }
      }
    }

    // Return sorted by modifiedAt descending
    return macros.slice().sort((a, b) => {
      const timeA = new Date(a.modifiedAt).getTime();
      const timeB = new Date(b.modifiedAt).getTime();
      return timeB - timeA;
    });
  }

  /**
   * Saves a macro definition to disk using atomic temp-write and replacement.
   * Wire-compatible with Schema 12; preserves forward-compatible unknown fields.
   */
  async save(macro: MacroDefinition, options?: SaveMacroOptions): Promise<void> {
    await fs.promises.mkdir(this.macrosPath, { recursive: true });

    const schemaVersion = CURRENT_SCHEMA_VERSION;
    const folder = normalizeFolder(macro.folder);
    const uniqueName = this.resolveUniqueName(macro.name, macro);
    const touchModified = options?.touchModified !== false;
    const modifiedAt = touchModified ? new Date().toISOString() : macro.modifiedAt;

    // Update the caller's object as well
    (macro as { schemaVersion: number }).schemaVersion = schemaVersion;
    (macro as { folder: string }).folder = folder;
    (macro as { name: string }).name = uniqueName;
    (macro as { modifiedAt: string }).modifiedAt = modifiedAt;

    const directory = path.join(this.macrosPath, folder);
    await fs.promises.mkdir(directory, { recursive: true });

    const destination = path.join(directory, fileNameFor(uniqueName));

    // Serialize to wire-compatible Schema 12 format (PascalCase, indented)
    const wire = toWireMacroDefinition(macro, true);
    const jsonText = JSON.stringify(wire, null, 2) + '\n';

    await atomicWriteFile(destination, jsonText);

    // If macro was previously saved at a different path (renamed or moved), clean up old file
    if (macro.storagePath && !pathEquals(macro.storagePath, destination)) {
      this.deletePrevious(macro.storagePath, destination);
    }

    (macro as { storagePath?: string }).storagePath = destination;
    this.lastWriteAt = new Date();
  }

  /**
   * Moves a macro to the trash and returns a restore token.
   * An empty string means there was no file and nothing to restore.
   */
  async delete(
    macro: MacroDefinition | { id?: string; name: string; folder?: string; storagePath?: string },
  ): Promise<string> {
    const filePath =
      macro.storagePath ??
      path.join(this.macrosPath, normalizeFolder(macro.folder), fileNameFor(macro.name));

    let token = '';
    try {
      if (fs.existsSync(filePath)) {
        const slot = await this.createTrashSlot();
        token = path.join(slot, path.basename(filePath));
        await fs.promises.rename(filePath, token);
      }
    } catch {
      token = '';
    }

    delete (macro as Record<string, unknown>)['storagePath'];
    this.lastWriteAt = new Date();
    return token;
  }

  /**
   * Restores a macro from the trash into the given library folder.
   */
  async restoreMacro(
    token: string,
    folderRelativePath: string,
    macroName: string,
  ): Promise<boolean> {
    if (!token || !fs.existsSync(token)) return false;

    const folder = normalizeFolder(folderRelativePath);
    const directory = path.join(this.macrosPath, folder);
    await fs.promises.mkdir(directory, { recursive: true });

    const uniqueName = this.resolveUniqueName(macroName);
    const destination = path.join(directory, fileNameFor(uniqueName));

    try {
      await fs.promises.rename(token, destination);
      this.lastWriteAt = new Date();
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Restores a folder from the trash to its former location.
   */
  async restoreFolder(token: string, relativePath: string): Promise<boolean> {
    if (!token || !fs.existsSync(token)) return false;

    const folder = normalizeFolder(relativePath);
    const destination = path.join(this.macrosPath, folder);

    if (fs.existsSync(destination)) return false;

    await fs.promises.mkdir(path.dirname(destination), { recursive: true });
    try {
      await fs.promises.rename(token, destination);
      this.lastWriteAt = new Date();
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Purges trash slots older than keepMaxAgeMs.
   */
  async cleanupTrash(keepMaxAgeMs: number): Promise<number> {
    if (!fs.existsSync(this.trashPath)) return 0;

    const threshold = Date.now() - keepMaxAgeMs;
    let deletedCount = 0;

    let entries: string[];
    try {
      entries = await fs.promises.readdir(this.trashPath);
    } catch {
      return 0;
    }

    for (const slotName of entries) {
      const slotPath = path.join(this.trashPath, slotName);
      try {
        const stat = await fs.promises.stat(slotPath);
        const isOldByStat =
          stat.mtimeMs <= threshold || stat.birthtimeMs <= threshold || stat.ctimeMs <= threshold;

        // Also inspect slot timestamp in folder name: YYYYMMDD-HHmmss
        let isOldByName = false;
        const match = slotName.match(/^(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})/);
        if (match) {
          const slotDate = new Date(
            Number(match[1]),
            Number(match[2]) - 1,
            Number(match[3]),
            Number(match[4]),
            Number(match[5]),
            Number(match[6]),
          );
          isOldByName = slotDate.getTime() <= threshold;
        }

        if (isOldByStat || isOldByName) {
          await fs.promises.rm(slotPath, { recursive: true, force: true });
          deletedCount++;
        }
      } catch {
        // Ignore individual deletion errors
      }
    }

    return deletedCount;
  }

  /**
   * Moves a macro to another folder, preserving its last-modified date.
   */
  async moveToFolder(
    macro: MacroDefinition,
    folderRelativePath: string,
    options?: { signal?: AbortSignal },
  ): Promise<void> {
    (macro as { folder: string }).folder = normalizeFolder(folderRelativePath);
    await this.save(macro, { touchModified: false, signal: options?.signal });
  }

  /**
   * Picks a free macro name: "Macro", "Macro 2", "Macro 3"…
   */
  resolveUniqueName(
    desiredName: string,
    owner?: MacroDefinition | { storagePath?: string },
  ): string {
    const taken = new Set<string>();
    const files = this.enumerateMacroFilesSync();

    for (const filePath of files) {
      if (owner?.storagePath && pathEquals(filePath, owner.storagePath)) {
        continue;
      }
      taken.add(displayNameFromPath(filePath).toLowerCase());
    }

    return nextFreeName(desiredName, taken);
  }

  // --- Folder Management ---

  /**
   * Returns all library folder relative paths up to 8 levels deep, sorted alphabetically.
   */
  async loadFolders(): Promise<string[]> {
    await fs.promises.mkdir(this.macrosPath, { recursive: true });
    const result: string[] = [];
    const queue: { dir: string; depth: number }[] = [{ dir: this.macrosPath, depth: 0 }];

    while (queue.length > 0) {
      const current = queue.shift()!;
      if (current.depth >= MAXIMUM_FOLDER_DEPTH) continue;

      let children: fs.Dirent[];
      try {
        children = await fs.promises.readdir(current.dir, { withFileTypes: true });
      } catch {
        continue;
      }

      for (const child of children) {
        if (child.isDirectory()) {
          const childPath = path.join(current.dir, child.name);
          result.push(this.relativeFolder(childPath));
          queue.push({ dir: childPath, depth: current.depth + 1 });
        }
      }
    }

    result.sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
    return result;
  }

  /**
   * Synchronous version of loadFolders.
   */
  loadFoldersSync(): string[] {
    fs.mkdirSync(this.macrosPath, { recursive: true });
    const result: string[] = [];
    const queue: { dir: string; depth: number }[] = [{ dir: this.macrosPath, depth: 0 }];

    while (queue.length > 0) {
      const current = queue.shift()!;
      if (current.depth >= MAXIMUM_FOLDER_DEPTH) continue;

      let children: fs.Dirent[];
      try {
        children = fs.readdirSync(current.dir, { withFileTypes: true });
      } catch {
        continue;
      }

      for (const child of children) {
        if (child.isDirectory()) {
          const childPath = path.join(current.dir, child.name);
          result.push(this.relativeFolder(childPath));
          queue.push({ dir: childPath, depth: current.depth + 1 });
        }
      }
    }

    result.sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
    return result;
  }

  /**
   * Creates a new nested folder inside parentRelativePath.
   */
  async createFolder(parentRelativePath: string, name: string): Promise<string> {
    const parent = normalizeFolder(parentRelativePath);
    if (folderDepth(parent) + 1 > MAXIMUM_FOLDER_DEPTH) {
      throw new Error(
        format(t('Folders are nested too deeply: {0} levels maximum.'), MAXIMUM_FOLDER_DEPTH),
      );
    }

    const safe = sanitizeName(name, t('New folder'));
    const unique = this.uniqueFolderName(parent, safe);
    const fullPath = path.join(this.macrosPath, parent, unique);

    await fs.promises.mkdir(fullPath, { recursive: true });
    this.lastWriteAt = new Date();
    return combineFolder(parent, unique);
  }

  /**
   * Renames a folder. Case-only rename is allowed without suffix.
   */
  async renameFolder(relativePath: string, newName: string): Promise<string> {
    const current = normalizeFolder(relativePath);
    if (current.length === 0) {
      throw new Error(t('The library root cannot be renamed.'));
    }

    const parent = parentFolder(current);
    const safe = sanitizeName(newName, t('New folder'));
    const currentBase = folderName(current);

    if (safe === currentBase) {
      return current;
    }

    // A case-only rename is allowed: the folder itself does not count as taken
    const unique =
      safe.toLowerCase() === currentBase.toLowerCase() ? safe : this.uniqueFolderName(parent, safe);

    const oldPath = path.join(this.macrosPath, current);
    const newPath = path.join(this.macrosPath, parent, unique);

    await fs.promises.rename(oldPath, newPath);
    this.lastWriteAt = new Date();
    return combineFolder(parent, unique);
  }

  /**
   * Moves a folder and all its contents into another folder.
   * Rejects self-nesting and excessive depth.
   */
  async moveFolder(relativePath: string, newParentRelativePath: string): Promise<string> {
    const current = normalizeFolder(relativePath);
    const parent = normalizeFolder(newParentRelativePath);

    if (current.length === 0) {
      throw new Error(t('The library root cannot be moved.'));
    }

    if (parent.toLowerCase() === parentFolder(current).toLowerCase()) {
      return current;
    }

    if (isSameOrInside(parent, current)) {
      throw new Error(t('A folder cannot be moved inside itself.'));
    }

    if (folderDepth(parent) + 1 + this.maximumDepthInside(current) > MAXIMUM_FOLDER_DEPTH) {
      throw new Error(
        format(t('Folders are nested too deeply: {0} levels maximum.'), MAXIMUM_FOLDER_DEPTH),
      );
    }

    const unique = this.uniqueFolderName(parent, folderName(current));
    const oldPath = path.join(this.macrosPath, current);
    const newPath = path.join(this.macrosPath, parent, unique);

    await fs.promises.rename(oldPath, newPath);
    this.lastWriteAt = new Date();
    return combineFolder(parent, unique);
  }

  /**
   * Moves a folder and all its contents to the trash and returns a restore token.
   */
  async deleteFolder(relativePath: string): Promise<string> {
    const folder = normalizeFolder(relativePath);
    if (folder.length === 0) {
      throw new Error(t('The library root cannot be deleted.'));
    }

    const full = path.join(this.macrosPath, folder);
    let token = '';

    if (fs.existsSync(full)) {
      const slot = await this.createTrashSlot();
      token = path.join(slot, folderName(folder));
      await fs.promises.rename(full, token);
    }

    this.lastWriteAt = new Date();
    return token;
  }

  /**
   * Counts macros inside a folder and its subdirectories.
   */
  async countMacrosInside(relativePath: string): Promise<number> {
    const folder = normalizeFolder(relativePath);
    const files = await this.enumerateMacroFiles();
    let count = 0;

    for (const filePath of files) {
      if (isSameOrInside(this.folderOfFile(filePath), folder)) {
        count++;
      }
    }

    return count;
  }

  /**
   * Returns complete folder tree info matching folder-tree.expected.json.
   * Folders and macroCount keys use normalized '/' separators.
   */
  async getFolderTreeInfo(): Promise<FolderTreeInfo> {
    const rawFolders = await this.loadFolders();
    const files = await this.enumerateMacroFiles();
    const normalizedFolders = rawFolders.map((f) => f.replace(/\\/g, '/'));

    const macroCounts: Record<string, number> = { '': 0 };
    for (const f of normalizedFolders) {
      macroCounts[f] = 0;
    }

    for (const filePath of files) {
      const fileFolder = this.folderOfFile(filePath).replace(/\\/g, '/');
      macroCounts[''] = (macroCounts[''] ?? 0) + 1;

      for (const f of normalizedFolders) {
        if (isSameOrInside(fileFolder, f)) {
          macroCounts[f] = (macroCounts[f] ?? 0) + 1;
        }
      }
    }

    return {
      folders: normalizedFolders,
      macroCounts,
    };
  }

  /**
   * Ensures a folder exists at the relative path.
   */
  async ensureFolder(relativePath: string): Promise<string> {
    const folder = normalizeFolder(relativePath);
    await fs.promises.mkdir(path.join(this.macrosPath, folder), { recursive: true });
    return folder;
  }

  /**
   * Resolves absolute folder path safely, rejecting path escape attempts.
   */
  resolveFolderPath(relativePath: string): string {
    validatePathSafety(this.macrosPath, relativePath);
    const folder = normalizeFolder(relativePath);
    return path.join(this.macrosPath, folder);
  }

  // --- Copy Library ---

  /**
   * Moves/copies the library contents (Macros) to a new location.
   * Rejects if destination is inside source.
   */
  static async copyLibrary(sourceRoot: string, destinationRoot: string): Promise<void> {
    const source = path.join(sourceRoot, 'Macros');
    if (!fs.existsSync(source)) return;

    const destination = path.join(destinationRoot, 'Macros');
    if (pathEquals(source, destination)) return;

    if (isSameOrInsidePath(destination, source)) {
      throw new Error(t('The new folder is inside the current library.'));
    }

    await MacroLibraryStore.copyDirectoryRecursive(source, destination, 0);
  }

  async copyLibrary(destinationRoot: string): Promise<void> {
    await MacroLibraryStore.copyLibrary(this.rootPath, destinationRoot);
  }

  private static async copyDirectoryRecursive(
    source: string,
    destination: string,
    depth: number,
  ): Promise<void> {
    if (depth > MAXIMUM_FOLDER_DEPTH) return;
    await fs.promises.mkdir(destination, { recursive: true });

    let entries: fs.Dirent[];
    try {
      entries = await fs.promises.readdir(source, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const srcEntry = path.join(source, entry.name);
      const dstEntry = path.join(destination, entry.name);

      if (entry.isFile() && entry.name.endsWith(MACRO_EXTENSION)) {
        if (!fs.existsSync(dstEntry)) {
          await fs.promises.copyFile(srcEntry, dstEntry);
        }
      } else if (entry.isDirectory()) {
        await MacroLibraryStore.copyDirectoryRecursive(srcEntry, dstEntry, depth + 1);
      }
    }
  }

  // --- Import / Export Helpers ---

  /**
   * Imports a MacroDefinition into the library at the specified folder.
   * Assigns a new ID, disables by default, and disambiguates the name if taken.
   */
  async importMacro(
    macro: MacroDefinition,
    folderRelativePath = '',
  ): Promise<{ macro: MacroDefinition; warning?: string }> {
    const requestedName = macro.name;
    const imported: MacroDefinition = {
      ...macro,
      id: crypto.randomUUID(),
      isEnabled: false,
      folder: normalizeFolder(folderRelativePath),
      storagePath: undefined,
      modifiedAt: new Date().toISOString(),
    };

    await this.save(imported);

    let warning: string | undefined;
    if (requestedName !== imported.name) {
      warning = format(
        t('The name “{0}” is already taken; the macro was saved as “{1}”.'),
        requestedName,
        imported.name,
      );
    }

    return { macro: imported, ...(warning ? { warning } : {}) };
  }

  /**
   * Exports a macro to a file as Schema 12 wire JSON.
   */
  async exportNativeJson(macro: MacroDefinition, targetPath: string): Promise<void> {
    const wire = toWireMacroDefinition(macro, true);
    const jsonText = JSON.stringify(wire, null, 2) + '\n';
    await atomicWriteFile(targetPath, jsonText);
  }

  // --- Testing Helpers ---

  /**
   * Creates an isolated temporary directory for testing.
   */
  static createTemporaryRoot(): string {
    const root = path.join(
      os.tmpdir(),
      'MacroRecorderLibraryTests',
      crypto.randomUUID().replace(/-/g, ''),
    );
    fs.mkdirSync(root, { recursive: true });
    return root;
  }

  /**
   * Deletes a temporary test directory.
   */
  static deleteTemporaryRoot(root: string): void {
    try {
      if (fs.existsSync(root)) {
        fs.rmSync(root, { recursive: true, force: true });
      }
    } catch {
      // Ignore deletion errors during cleanup
    }
  }

  // --- Internal Helpers ---

  private async enumerateMacroFiles(): Promise<string[]> {
    const result: string[] = [];
    const queue: { dir: string; depth: number }[] = [{ dir: this.macrosPath, depth: 0 }];

    while (queue.length > 0) {
      const { dir, depth } = queue.shift()!;
      let entries: fs.Dirent[];
      try {
        entries = await fs.promises.readdir(dir, { withFileTypes: true });
      } catch {
        continue;
      }

      const files: string[] = [];
      const subdirs: string[] = [];

      for (const entry of entries) {
        if (entry.isFile() && entry.name.endsWith(MACRO_EXTENSION)) {
          files.push(path.join(dir, entry.name));
        } else if (entry.isDirectory() && depth < MAXIMUM_FOLDER_DEPTH) {
          subdirs.push(path.join(dir, entry.name));
        }
      }

      files.sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
      result.push(...files);

      for (const subdir of subdirs) {
        queue.push({ dir: subdir, depth: depth + 1 });
      }
    }

    return result;
  }

  private enumerateMacroFilesSync(): string[] {
    const result: string[] = [];
    if (!fs.existsSync(this.macrosPath)) return result;

    const queue: { dir: string; depth: number }[] = [{ dir: this.macrosPath, depth: 0 }];

    while (queue.length > 0) {
      const { dir, depth } = queue.shift()!;
      let entries: fs.Dirent[];
      try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
      } catch {
        continue;
      }

      const files: string[] = [];
      const subdirs: string[] = [];

      for (const entry of entries) {
        if (entry.isFile() && entry.name.endsWith(MACRO_EXTENSION)) {
          files.push(path.join(dir, entry.name));
        } else if (entry.isDirectory() && depth < MAXIMUM_FOLDER_DEPTH) {
          subdirs.push(path.join(dir, entry.name));
        }
      }

      files.sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
      result.push(...files);

      for (const subdir of subdirs) {
        queue.push({ dir: subdir, depth: depth + 1 });
      }
    }

    return result;
  }

  private relativeFolder(fullPath: string): string {
    const rel = path.relative(this.macrosPath, fullPath);
    return normalizeFolder(rel);
  }

  private folderOfFile(filePath: string): string {
    const dir = path.dirname(filePath);
    return this.relativeFolder(dir);
  }

  private async createTrashSlot(): Promise<string> {
    const now = new Date();
    const pad = (n: number) => n.toString().padStart(2, '0');
    const ymd = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`;
    const hms = `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
    const uuid = crypto.randomUUID().replace(/-/g, '').slice(0, 8);
    const slotName = `${ymd}-${hms}-${uuid}`;

    const slotPath = path.join(this.trashPath, slotName);
    await fs.promises.mkdir(slotPath, { recursive: true });
    return slotPath;
  }

  private uniqueFolderName(parent: string, name: string): string {
    const parentDir = path.join(this.macrosPath, parent);
    let candidate = name;

    for (let number = 2; fs.existsSync(path.join(parentDir, candidate)); number++) {
      candidate = `${name} ${number}`;
    }

    return candidate;
  }

  private maximumDepthInside(relativePath: string): number {
    const prefix = relativePath;
    const prefixDepth = folderDepth(prefix);
    let deepest = 0;

    for (const folder of this.loadFoldersSync()) {
      if (isSameOrInside(folder, prefix)) {
        deepest = Math.max(deepest, folderDepth(folder) - prefixDepth);
      }
    }

    return deepest;
  }

  private async tryRelocate(macro: MacroDefinition, destination: string): Promise<void> {
    const current = macro.storagePath;
    if (!current || pathEquals(current, destination)) return;

    try {
      if (fs.existsSync(destination)) return;
      await fs.promises.rename(current, destination);
      (macro as { storagePath: string }).storagePath = destination;
    } catch {
      // Ignore relocation errors
    }
  }

  private deletePrevious(previousPath?: string | null, destination?: string): void {
    if (!previousPath || (destination && pathEquals(previousPath, destination))) return;
    try {
      if (fs.existsSync(previousPath)) {
        fs.unlinkSync(previousPath);
      }
    } catch {
      // Ignore cleanup error
    }
  }

  private prepareImportedMacro(macro: MacroDefinition, fallbackName: string): MacroDefinition {
    const safeName = sanitizeName(macro.name, sanitizeName(fallbackName, t('New macro')));

    if (macro.events.length > MAXIMUM_EVENT_COUNT) {
      throw new Error(format(t('The macro contains too many actions: {0}.'), macro.events.length));
    }

    const normalizedEvents = normalizeMacroEvents(macro.events);

    return createDefaultMacroDefinition({
      ...macro,
      name: safeName,
      events: normalizedEvents,
    });
  }
}
