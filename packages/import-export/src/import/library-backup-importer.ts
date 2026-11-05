/**
 * Library backup (.mrbackup) ZIP package importer.
 * Verifies whole-library manifest and multi-file bundle SHA-256 checksum.
 */

import { createHash } from 'node:crypto';
import { CURRENT_SCHEMA_VERSION } from '../../../../packages/contracts/src/index.js';
import {
  MacroModel,
  normalizeEvents,
} from '../../../../packages/domain/src/model/index.js';
import { format, t } from '../../../../packages/localization/src/index.js';
import type { ImportProbe } from './probe.js';
import {
  MacroImportFormat,
  type IMacroImporter,
  type ImportOptions,
  type MacroImportResult,
  type MacroImportWarning,
} from './types.js';
import { isZipSignature, readZipEntries, type ZipEntry } from './zip-parser.js';

const BACKUP_FORMAT_ID = 'macro-recorder/library-backup';
const BACKUP_FORMAT_VERSION = 1;
const MAXIMUM_BACKUP_MACROS = 100_000;
const MAXIMUM_PORTABLE_JSON_BYTES = 50 * 1024 * 1024;
const MACRO_EXTENSION = '.macro.json';

interface LibraryBackupManifest {
  readonly format?: string;
  readonly formatVersion?: number;
  readonly createdAtUtc?: string;
  readonly macroCount?: number;
  readonly sha256?: string;
  readonly includesSettings?: boolean;
}

export interface LibraryBackupImportResult extends MacroImportResult {
  readonly macroCount: number;
}

export class LibraryBackupImporter implements IMacroImporter {
  public readonly format = MacroImportFormat.MacroPackage;
  public readonly displayName = 'Macro Recorder Backup (.mrbackup)';
  public readonly extensions: readonly string[] = ['.mrbackup'];
  public readonly sniffPriority = 58;

  public canHandle(probe: ImportProbe): boolean {
    if (!probe.looksBinary || !isZipSignature(probe.bytes)) {
      return false;
    }
    try {
      const entries = readZipEntries(probe.bytes);
      const manifestBytes = entries.get('manifest.json');
      if (!manifestBytes) {
        return false;
      }
      const json = JSON.parse(
        new TextDecoder().decode(manifestBytes),
      ) as LibraryBackupManifest;
      return json.format === BACKUP_FORMAT_ID;
    } catch {
      return false;
    }
  }

  public import(
    probe: ImportProbe,
    sourceName: string,
    options?: ImportOptions,
  ): LibraryBackupImportResult {
    return LibraryBackupImporter.importBytes(probe.bytes, sourceName, options);
  }

  public static import(
    bytes: Uint8Array,
    sourceName: string,
    options?: ImportOptions,
  ): LibraryBackupImportResult {
    return LibraryBackupImporter.importBytes(bytes, sourceName, options);
  }

  private static importBytes(
    bytes: Uint8Array,
    _sourceName: string,
    options?: ImportOptions,
  ): LibraryBackupImportResult {
    if (!isZipSignature(bytes)) {
      throw new Error(t('The file is not a Macro Recorder library backup.'));
    }

    const archiveEntries = readZipEntries(bytes);
    const manifestBytes = archiveEntries.get('manifest.json');
    if (!manifestBytes) {
      throw new Error(
        t('The .mrbackup package is missing manifest.json.'),
      );
    }

    let manifest: LibraryBackupManifest;
    try {
      manifest = JSON.parse(
        new TextDecoder().decode(manifestBytes),
      ) as LibraryBackupManifest;
    } catch {
      throw new Error(t('Could not read the .mrbackup manifest.'));
    }

    if (manifest.format !== BACKUP_FORMAT_ID) {
      throw new Error(t('The file is not a Macro Recorder library backup.'));
    }

    const formatVersion = manifest.formatVersion ?? 1;
    if (formatVersion < 1 || formatVersion > BACKUP_FORMAT_VERSION) {
      throw new Error(
        format(
          t('Backup version {0} is not supported by this version of the app.'),
          formatVersion,
        ),
      );
    }

    const macroEntries: ZipEntry[] = [];
    for (const [name, data] of archiveEntries) {
      if (
        !name.startsWith('Macros/') ||
        !name.toLowerCase().endsWith(MACRO_EXTENSION)
      ) {
        continue;
      }
      if (macroEntries.length >= MAXIMUM_BACKUP_MACROS) {
        throw new Error(t('Too many macros in the backup.'));
      }
      if (data.length > MAXIMUM_PORTABLE_JSON_BYTES) {
        throw new Error(t('A file inside the .mrmacro package is too large.'));
      }
      macroEntries.push({ name, data });
    }

    macroEntries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));

    const actualBundleHash =
      LibraryBackupImporter.computeBundleHash(macroEntries);
    const expectedBundleHash = (manifest.sha256 ?? '').toLowerCase();
    if (actualBundleHash !== expectedBundleHash) {
      throw new Error(
        t(
          'The .mrbackup checksum does not match: the file is damaged or modified.',
        ),
      );
    }

    const macros: MacroModel[] = [];
    const warnings: MacroImportWarning[] = [];

    for (const entry of macroEntries) {
      let raw: unknown;
      try {
        raw = JSON.parse(new TextDecoder().decode(entry.data));
      } catch {
        continue;
      }
      if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
        continue;
      }

      const macroObj = raw as Record<string, unknown>;
      const schemaVersion =
        macroObj['schemaVersion'] ??
        macroObj['SchemaVersion'] ??
        CURRENT_SCHEMA_VERSION;
      if (
        typeof schemaVersion === 'number' &&
        schemaVersion > CURRENT_SCHEMA_VERSION
      ) {
        continue;
      }

      const relative = entry.name.slice('Macros/'.length);
      const lastSlash = relative.lastIndexOf('/');
      const directory = lastSlash >= 0 ? relative.slice(0, lastSlash) : '';

      const macro = new MacroModel(macroObj);
      macro.folder = directory;
      macro.isEnabled = options?.isEnabled ?? false;
      macro.events = normalizeEvents(macro.events);
      macros.push(macro);
    }

    // Sort macros to match EnumerateMacroFiles BFS traversal:
    // Root folder first (depth 0), then subfolders by depth, then folder name, then macro name
    macros.sort((a, b) => {
      const depthA = a.folder ? a.folder.split(/[\\/]/).filter(Boolean).length : 0;
      const depthB = b.folder ? b.folder.split(/[\\/]/).filter(Boolean).length : 0;
      if (depthA !== depthB) {
        return depthA - depthB;
      }
      if (a.folder !== b.folder) {
        return a.folder.localeCompare(b.folder);
      }
      return a.name.localeCompare(b.name);
    });

    return {
      format: MacroImportFormat.MacroPackage,
      macros,
      warnings,
      macroCount: macros.length,
    };
  }

  public static computeBundleHash(
    entries: readonly { name: string; data: Uint8Array }[],
  ): string {
    const sorted = [...entries].sort((a, b) =>
      a.name < b.name ? -1 : a.name > b.name ? 1 : 0,
    );
    const hash = createHash('sha256');
    for (const entry of sorted) {
      hash.update(Buffer.from(entry.name + '\n', 'utf8'));
      hash.update(entry.data);
    }
    return hash.digest('hex').toLowerCase();
  }
}
