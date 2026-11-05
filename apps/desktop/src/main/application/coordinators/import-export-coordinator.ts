/**
 * Import and Export Coordinator.
 * Delegates parsing, package verification, DPI handling, exporting, and library backups
 * to the production import-export and storage packages while preserving the IPC surface.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type {
  LibraryBackupMode as ProductionLibraryBackupMode,
  MacroDefinition as ProductionMacroDefinition,
} from '../../../../../../packages/contracts/src/index.js';
import {
  ImportProbe,
  MacroImporterRegistry,
  importMacro as importMacroFromSource,
} from '../../../../../../packages/import-export/src/import/index.js';
import {
  exportAutoHotkeyV2ToFile,
  exportNativeJsonToFile,
} from '../../../../../../packages/import-export/src/export/index.js';
import { MacroLibraryStore } from '../../../../../../packages/storage/src/library/library-store.js';
import {
  exportPortablePackage,
  importPortablePackage,
} from '../../../../../../packages/storage/src/portable/index.js';
import {
  exportLibraryBackup,
  importLibraryBackup,
} from '../../../../../../packages/storage/src/backup/index.js';
import type { ProgressCallback } from '../types.js';
import type {
  LibraryBackupMode,
  LibraryBackupResult,
  MacroDefinition,
  MacroExportFormat,
  MacroImportResult,
} from '../../ipc/types.js';

interface LibraryImportCoordinator {
  importMacro(
    macro: MacroDefinition,
    targetFolderRelativePath?: string,
  ): Promise<{ macro: MacroDefinition; warning?: string | undefined }>;
}

export interface ImportExportCoordinatorOptions {
  readonly libraryRootPath?: string | undefined;
  readonly currentDisplayDpi?: number | undefined;
  readonly libraryCoordinator?: LibraryImportCoordinator | undefined;
  readonly settingsCoordinator?: unknown | undefined;
  readonly diagnosticsCoordinator?: unknown | undefined;
}

export class ImportExportCoordinator {
  private readonly libraryRootPath: string;
  private readonly currentDisplayDpi: number;
  private readonly libraryCoordinator: LibraryImportCoordinator | undefined;

  constructor(options: ImportExportCoordinatorOptions = {}) {
    this.libraryRootPath = options.libraryRootPath ?? '';
    this.currentDisplayDpi = options.currentDisplayDpi ?? 96;
    this.libraryCoordinator = options.libraryCoordinator;
  }

  public get rootPath(): string {
    return this.libraryRootPath;
  }

  public get displayDpi(): number {
    return this.currentDisplayDpi;
  }

  /**
   * Detects a format through the production importer registry and parser.
   * Extension-first dispatch remains authoritative for third-party formats.
   */
  public detectFormat(filePath: string): string {
    const extension = path.extname(filePath).toLowerCase();
    if (extension === '.mrbackup') {
      return 'LibraryBackup';
    }

    const probe = ImportProbe.fromFileSync(filePath);
    const extensionImporter = MacroImporterRegistry.findByExtension(probe.extension);
    if (extensionImporter) {
      return extensionImporter.format;
    }

    return importMacroFromSource(probe, this.sourceName(filePath), {
      targetDpi: this.currentDisplayDpi,
    }).format;
  }

  /**
   * Imports one macro through the production importers. Library backups must use
   * restoreBackup so merge/replace semantics are explicit.
   */
  public async importMacro(
    sourcePath: string,
    signal?: AbortSignal,
    progress?: ProgressCallback,
  ): Promise<MacroImportResult> {
    this.throwIfAborted(signal, 'Import');
    progress?.({ current: 1, total: 3, percentage: 33, message: 'Detecting format...' });

    if (path.extname(sourcePath).toLowerCase() === '.mrbackup') {
      throw new Error('Library backups must be restored with an explicit Merge or Replace mode.');
    }

    this.throwIfAborted(signal, 'Import');
    progress?.({ current: 2, total: 3, percentage: 66, message: 'Parsing macro...' });

    const imported = path.extname(sourcePath).toLowerCase() === '.mrmacro'
      ? await importPortablePackage(sourcePath, {
          currentDisplayDpi: this.currentDisplayDpi,
          signal,
        })
      : importMacroFromSource(sourcePath, this.sourceName(sourcePath), {
          targetDpi: this.currentDisplayDpi,
        });

    this.throwIfAborted(signal, 'Import');
    if (imported.macros.length !== 1 || !imported.macros[0]) {
      throw new Error(`Expected one macro, but the importer produced ${imported.macros.length}.`);
    }

    progress?.({ current: 3, total: 3, percentage: 100, message: 'Import completed.' });
    return {
      macro: imported.macros[0] as unknown as MacroDefinition,
      sourceFormat: imported.format,
      warnings: imported.warnings.map((warning) => warning.message),
    };
  }

  /**
   * Production entry-point alias used for OS file activation. Unlike the IPC parse
   * path, this also persists the imported macro when a library coordinator is wired.
   */
  public async importFile(
    sourcePath: string,
    signal?: AbortSignal,
    progress?: ProgressCallback,
  ): Promise<MacroImportResult> {
    const result = await this.importMacro(sourcePath, signal, progress);
    if (this.libraryCoordinator) {
      await this.libraryCoordinator.importMacro(result.macro);
    }
    return result;
  }

  /**
   * Exports a single macro using the production exporters. The IPC `zip` format maps
   * to the integrity-protected portable .mrmacro container.
   */
  public async exportMacro(
    macro: MacroDefinition,
    format: MacroExportFormat,
    destinationPath: string,
    signal?: AbortSignal,
    progress?: ProgressCallback,
  ): Promise<string> {
    this.throwIfAborted(signal, 'Export');
    progress?.({ current: 1, total: 2, percentage: 50, message: `Exporting to ${format}...` });

    const productionMacro = macro as unknown as ProductionMacroDefinition;
    switch (format) {
      case 'json':
        await exportNativeJsonToFile(productionMacro, destinationPath);
        break;
      case 'ahk':
        await exportAutoHotkeyV2ToFile(productionMacro, destinationPath);
        break;
      case 'zip':
        await exportPortablePackage(productionMacro, destinationPath, {
          currentDisplayDpi: this.currentDisplayDpi,
          signal,
        });
        break;
      case 'csv':
        throw new Error('CSV is a diagnostics export format and cannot export a macro definition.');
      default: {
        const unsupported: never = format;
        throw new Error(`Unsupported macro export format: ${String(unsupported)}`);
      }
    }

    this.throwIfAborted(signal, 'Export');
    progress?.({ current: 2, total: 2, percentage: 100, message: 'Export complete.' });
    return destinationPath;
  }

  /**
   * Restores a validated whole-library backup using production Merge/Replace behavior.
   */
  public async restoreBackup(
    sourcePath: string,
    mode: LibraryBackupMode,
    signal?: AbortSignal,
    progress?: ProgressCallback,
  ): Promise<LibraryBackupResult> {
    this.throwIfAborted(signal, 'Restore backup');
    const store = this.createLibraryStore();
    progress?.({ current: 1, total: 4, percentage: 25, message: 'Validating backup package...' });

    const foldersBefore = new Set(await store.loadFolders());
    const trashTokensBefore = await this.readTrashTokens(store.trashPath);

    this.throwIfAborted(signal, 'Restore backup');
    progress?.({ current: 2, total: 4, percentage: 50, message: 'Restoring library...' });
    const restored = await importLibraryBackup(
      store,
      sourcePath,
      mode as ProductionLibraryBackupMode,
      { signal },
    );

    this.throwIfAborted(signal, 'Restore backup');
    progress?.({ current: 3, total: 4, percentage: 75, message: 'Refreshing library state...' });
    const foldersAfter = await store.loadFolders();
    const trashTokensAfter = await this.readTrashTokens(store.trashPath);
    const newTrashToken = Array.from(trashTokensAfter).find((token) => !trashTokensBefore.has(token));
    const foldersRestored = mode === 'Replace'
      ? foldersAfter.length
      : foldersAfter.filter((folder) => !foldersBefore.has(folder)).length;

    progress?.({ current: 4, total: 4, percentage: 100, message: 'Restore completed.' });
    return {
      macrosRestored: restored.imported,
      foldersRestored,
      replacedLibraryTrashToken: newTrashToken,
    };
  }

  /**
   * Exports the whole library as a manifest-bearing, checksummed .mrbackup archive.
   */
  public async exportBackup(
    destinationPath: string,
    includesSettings: boolean,
    signal?: AbortSignal,
    progress?: ProgressCallback,
  ): Promise<string> {
    this.throwIfAborted(signal, 'Export backup');
    const store = this.createLibraryStore();
    progress?.({ current: 1, total: 2, percentage: 50, message: 'Archiving library...' });

    await exportLibraryBackup(store, destinationPath, {
      includeSettings: includesSettings,
      settingsPath: path.join(this.libraryRootPath, 'settings.json'),
      signal,
    });

    this.throwIfAborted(signal, 'Export backup');
    progress?.({ current: 2, total: 2, percentage: 100, message: 'Archive complete.' });
    return destinationPath;
  }

  /**
   * Scalar DPI rescaling retained for callers that use the coordinator utility.
   */
  public static rescaleDpi(value: number, sourceDpi: number, targetDpi: number): number {
    if (sourceDpi === targetDpi || sourceDpi <= 0 || targetDpi <= 0) {
      return value;
    }
    return Math.round((value * targetDpi) / sourceDpi);
  }

  private createLibraryStore(): MacroLibraryStore {
    if (this.libraryRootPath.trim().length === 0) {
      throw new Error('A library root path is required for backup operations.');
    }
    return new MacroLibraryStore({
      rootPath: this.libraryRootPath,
      currentDisplayDpi: this.currentDisplayDpi,
    });
  }

  private sourceName(sourcePath: string): string {
    const baseName = path.basename(sourcePath);
    return baseName.toLowerCase().endsWith('.macro.json')
      ? baseName.slice(0, -'.macro.json'.length)
      : path.basename(sourcePath, path.extname(sourcePath));
  }

  private async readTrashTokens(trashPath: string): Promise<Set<string>> {
    try {
      const entries = await fs.promises.readdir(trashPath, { withFileTypes: true });
      return new Set(entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return new Set();
      }
      throw error;
    }
  }

  private throwIfAborted(signal: AbortSignal | undefined, operation: string): void {
    if (signal?.aborted) {
      throw new Error(`${operation} was cancelled`);
    }
  }
}
