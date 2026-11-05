/**
 * Implementation of .mrbackup whole-library backup package container.
 * Handles backup ZIP layout, manifest verification, canonical bundle hashing,
 * integrity rejection, Merge and Replace restore modes, optional settings inclusion
 * without applying imported settings, and recovery of replaced library through trash.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';

import {
  CURRENT_SCHEMA_VERSION,
  LibraryBackupMode,
  parseMacroDefinition,
  type MacroDefinition,
  type LibraryBackupManifest,
  type LibraryBackupResult,
} from '../../../contracts/src/index.js';

import { format, t } from '../../../localization/src/index.js';
import { atomicWriteFile } from '../atomic/atomic-file.js';
import { MACRO_EXTENSION, MAXIMUM_FOLDER_DEPTH } from '../library/constants.js';
import { normalizeMacroEvents } from '../library/event-normalization.js';
import { MacroLibraryStore } from '../library/library-store.js';
import { displayNameFromPath, normalizeFolder, sanitizeName } from '../library/path-utils.js';

import {
  assertSafeZipEntryPath,
  createZipArchive,
  hasZipSignature,
  readZipArchive,
} from '../portable/zip.js';
import { MAXIMUM_MANIFEST_BYTES, MAXIMUM_PORTABLE_JSON_BYTES } from '../portable/types.js';

import { computeBundleHash } from './bundle-hash.js';
import {
  BACKUP_EXTENSION,
  BACKUP_FORMAT_ID,
  BACKUP_FORMAT_VERSION,
  MAXIMUM_BACKUP_MACROS,
  type BackupMacroEntry,
  type ExportBackupOptions,
  type ImportBackupOptions,
} from './types.js';

/**
 * Creates a standard timestamped backup filename:
 * MacroRecorder-yyyyMMdd-HHmmss.mrbackup
 */
export function createBackupFileName(date = new Date()): string {
  const pad = (n: number) => n.toString().padStart(2, '0');
  const ymd = `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}`;
  const hms = `${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
  return `MacroRecorder-${ymd}-${hms}${BACKUP_EXTENSION}`;
}

/**
 * Recursively enumerates all *.macro.json files under a directory up to 8 levels deep.
 */
async function enumerateMacroFiles(dirPath: string): Promise<string[]> {
  const result: string[] = [];
  if (!fs.existsSync(dirPath)) return result;

  const queue: { dir: string; depth: number }[] = [{ dir: dirPath, depth: 0 }];

  while (queue.length > 0) {
    const { dir, depth } = queue.shift()!;
    let dirents: fs.Dirent[];
    try {
      dirents = await fs.promises.readdir(dir, { withFileTypes: true });
    } catch {
      continue;
    }

    const files: string[] = [];
    const subdirs: string[] = [];

    for (const dirent of dirents) {
      if (dirent.isFile() && dirent.name.toLowerCase().endsWith(MACRO_EXTENSION)) {
        files.push(path.join(dir, dirent.name));
      } else if (dirent.isDirectory() && depth < MAXIMUM_FOLDER_DEPTH) {
        subdirs.push(path.join(dir, dirent.name));
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

/**
 * Creates a unique trash slot under trashPath and returns its path:
 * yyyyMMdd-HHmmss-<uuid8>
 */
async function createTrashSlot(trashPath: string): Promise<string> {
  const now = new Date();
  const pad = (n: number) => n.toString().padStart(2, '0');
  const ymd = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`;
  const hms = `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  const uuid = crypto.randomUUID().replace(/-/g, '').slice(0, 8);
  const slotName = `${ymd}-${hms}-${uuid}`;

  const slotPath = path.join(trashPath, slotName);
  await fs.promises.mkdir(slotPath, { recursive: true });
  return slotPath;
}

/**
 * Packs the whole library (all *.macro.json with folder structure) into a single
 * .mrbackup ZIP package with manifest.json and canonical bundle SHA-256 hash.
 * App settings are included if requested for manual restore.
 * Returns the number of macros saved.
 */
export async function exportLibraryBackup(
  storeOrRoot: MacroLibraryStore | string,
  targetPath: string,
  options?: ExportBackupOptions,
): Promise<number> {
  const macrosPath =
    typeof storeOrRoot === 'string' ? path.join(storeOrRoot, 'Macros') : storeOrRoot.macrosPath;

  await fs.promises.mkdir(macrosPath, { recursive: true });

  const files = await enumerateMacroFiles(macrosPath);
  const entries: BackupMacroEntry[] = [];

  for (const filePath of files) {
    const relative = path.relative(macrosPath, filePath).replace(/\\/g, '/');
    const bytes = await fs.promises.readFile(filePath);
    entries.push({
      name: `Macros/${relative}`,
      bytes,
    });
  }

  // Sort entries ordinally
  entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));

  let settingsBytes: Buffer | null = null;
  if (options?.includeSettings && options.settingsPath && fs.existsSync(options.settingsPath)) {
    settingsBytes = await fs.promises.readFile(options.settingsPath);
  }

  const manifest: LibraryBackupManifest = {
    format: BACKUP_FORMAT_ID,
    formatVersion: BACKUP_FORMAT_VERSION,
    createdAtUtc: options?.createdAtUtc ?? new Date().toISOString(),
    macroCount: entries.length,
    sha256: computeBundleHash(entries),
    includesSettings: settingsBytes !== null,
  };

  const manifestBytes = Buffer.from(JSON.stringify(manifest, null, 2) + '\n', 'utf-8');

  const zipEntries = [
    { name: 'manifest.json', data: manifestBytes },
    ...entries.map((e) => ({ name: e.name, data: e.bytes })),
  ];

  if (settingsBytes !== null) {
    zipEntries.push({ name: 'settings.json', data: settingsBytes });
  }

  const zipBuffer = createZipArchive(zipEntries, { date: options?.archiveDate });
  await atomicWriteFile(targetPath, zipBuffer, { backup: false });

  return entries.length;
}

/**
 * Restores the library from a .mrbackup ZIP archive.
 * - Merge mode: adds macros on top of existing ones (conflicts get numeric suffix).
 * - Replace mode: moves current library to Trash for safe recovery, then restores.
 * - Settings from package are never applied.
 */
export async function importLibraryBackup(
  storeOrRoot: MacroLibraryStore | string,
  backupPath: string,
  mode: LibraryBackupMode,
  _options?: ImportBackupOptions,
): Promise<LibraryBackupResult> {
  const store = typeof storeOrRoot === 'string' ? new MacroLibraryStore(storeOrRoot) : storeOrRoot;
  const macrosPath = store.macrosPath;
  const trashPath = store.trashPath;

  const isZip = await hasZipSignature(backupPath);
  if (!isZip) {
    throw new Error(t('The file is not a Macro Recorder library backup.'));
  }

  const buffer = await fs.promises.readFile(backupPath);
  const archiveEntries = readZipArchive(buffer);

  // 1. Validate manifest existence
  const manifestBytes = archiveEntries.get('manifest.json');
  if (!manifestBytes) {
    throw new Error(t('The .mrbackup package is missing manifest.json.'));
  }
  if (manifestBytes.length > MAXIMUM_MANIFEST_BYTES) {
    throw new Error(t('A file inside the .mrmacro package is too large.'));
  }

  let manifest: LibraryBackupManifest;
  try {
    manifest = JSON.parse(manifestBytes.toString('utf-8')) as LibraryBackupManifest;
  } catch {
    throw new Error(t('Could not read the .mrbackup manifest.'));
  }

  // 2. Validate manifest signature and version
  if (manifest.format !== BACKUP_FORMAT_ID) {
    throw new Error(t('The file is not a Macro Recorder library backup.'));
  }
  if (
    typeof manifest.formatVersion !== 'number' ||
    manifest.formatVersion < 1 ||
    manifest.formatVersion > BACKUP_FORMAT_VERSION
  ) {
    throw new Error(
      format(
        t('Backup version {0} is not supported by this version of the app.'),
        manifest.formatVersion,
      ),
    );
  }

  // 3. Collect and validate macro entries
  const macroEntries: BackupMacroEntry[] = [];
  for (const [name, bytes] of archiveEntries.entries()) {
    if (name.startsWith('Macros/') && name.toLowerCase().endsWith(MACRO_EXTENSION)) {
      assertSafeZipEntryPath(name);
      if (macroEntries.length >= MAXIMUM_BACKUP_MACROS) {
        throw new Error(t('Too many macros in the backup.'));
      }
      if (bytes.length > MAXIMUM_PORTABLE_JSON_BYTES) {
        throw new Error(t('A file inside the .mrmacro package is too large.'));
      }
      macroEntries.push({ name, bytes });
    }
  }

  // 4. Verify bundle hash integrity
  macroEntries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  const actualHash = computeBundleHash(macroEntries);
  const expectedHash = (manifest.sha256 ?? '').toLowerCase();

  if (actualHash !== expectedHash) {
    throw new Error(t('The .mrbackup checksum does not match: the file is damaged or modified.'));
  }

  // 5. Replace mode: recover replaced library through trash
  if (mode === LibraryBackupMode.Replace && fs.existsSync(macrosPath)) {
    const existingFiles = await enumerateMacroFiles(macrosPath);
    if (existingFiles.length > 0) {
      const slot = await createTrashSlot(trashPath);
      const dest = path.join(slot, 'Macros');
      await fs.promises.rename(macrosPath, dest);
    }
  }

  await fs.promises.mkdir(macrosPath, { recursive: true });

  // 6. Restore macros
  let imported = 0;
  for (const { name, bytes } of macroEntries) {
    let rawJson: unknown;
    try {
      rawJson = JSON.parse(bytes.toString('utf-8'));
    } catch {
      continue;
    }

    const parsed = parseMacroDefinition(rawJson);
    if (!parsed.success) {
      continue;
    }

    const macro = parsed.data;
    if (macro.schemaVersion > CURRENT_SCHEMA_VERSION) {
      continue;
    }

    const relative = name.slice('Macros/'.length);
    const directory = path.dirname(relative);
    const normalizedFolder =
      directory === '.' || directory === '' ? '' : normalizeFolder(directory);

    const fallbackName = displayNameFromPath(relative);
    const safeName = sanitizeName(macro.name, sanitizeName(fallbackName, t('New macro')));
    const normalizedEvents = normalizeMacroEvents(macro.events);

    const toRestore: MacroDefinition = {
      ...macro,
      id: crypto.randomUUID(),
      name: safeName,
      folder: normalizedFolder,
      events: normalizedEvents,
      storagePath: undefined,
    };

    await store.save(toRestore, { touchModified: false });
    imported++;
  }

  return {
    imported,
    total: macroEntries.length,
  };
}
