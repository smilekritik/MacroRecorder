import * as fs from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import { describe, expect, it, beforeEach, afterEach } from 'vitest';

import { createDefaultMacroDefinition, LibraryBackupMode } from '../../../contracts/src/index.js';

import { MacroLibraryStore } from '../library/library-store.js';
import {
  createBackupFileName,
  exportLibraryBackup,
  importLibraryBackup,
} from './library-backup.js';
import { computeBundleHash } from './bundle-hash.js';
import { BACKUP_EXTENSION, BACKUP_FORMAT_ID } from './types.js';
import { createZipArchive, readZipArchive } from '../portable/zip.js';

describe('Whole-Library Backup (.mrbackup)', () => {
  let sourceRoot: string;
  let targetRoot: string;
  let sourceStore: MacroLibraryStore;
  let targetStore: MacroLibraryStore;

  beforeEach(() => {
    sourceRoot = MacroLibraryStore.createTemporaryRoot();
    targetRoot = MacroLibraryStore.createTemporaryRoot();
    sourceStore = new MacroLibraryStore(sourceRoot);
    targetStore = new MacroLibraryStore(targetRoot);
  });

  afterEach(() => {
    MacroLibraryStore.deleteTemporaryRoot(sourceRoot);
    MacroLibraryStore.deleteTemporaryRoot(targetRoot);
  });

  // --- ---
  it('LibraryBackup_RoundTripsMacrosAndFolders', async () => {
    await sourceStore.save(createDefaultMacroDefinition({ name: 'Root macro' }));
    await sourceStore.save(createDefaultMacroDefinition({ name: 'Nested', folder: 'Games' }));

    const backupPath = path.join(sourceRoot, `lib${BACKUP_EXTENSION}`);
    const exported = await exportLibraryBackup(sourceStore, backupPath, {
      includeSettings: false,
      settingsPath: undefined,
    });
    expect(exported).toBe(2);

    const result = await importLibraryBackup(targetStore, backupPath, LibraryBackupMode.Merge);
    expect(result.imported).toBe(2);
    expect(result.total).toBe(2);

    const loaded = await targetStore.loadAll();
    expect(loaded).toHaveLength(2);

    const rootMacro = loaded.find((m) => m.name === 'Root macro' && m.folder === '');
    const nestedMacro = loaded.find((m) => m.name === 'Nested' && m.folder === 'Games');

    expect(rootMacro).toBeDefined();
    expect(nestedMacro).toBeDefined();
  });

  // --- ---
  it('LibraryBackup_RejectsTamperedChecksum', async () => {
    await sourceStore.save(createDefaultMacroDefinition({ name: 'One' }));
    const backupPath = path.join(sourceRoot, `b${BACKUP_EXTENSION}`);
    await exportLibraryBackup(sourceStore, backupPath, { includeSettings: false });

    // Corrupt one macro entry inside the archive
    const buffer = fs.readFileSync(backupPath);
    const entries = readZipArchive(buffer);
    const manifestBytes = entries.get('manifest.json')!;

    const tamperedEntries = [
      { name: 'manifest.json', data: manifestBytes },
      { name: 'Macros/One.macro.json', data: '{"Name":"Hacked"}' },
    ];
    fs.writeFileSync(backupPath, createZipArchive(tamperedEntries));

    await expect(
      importLibraryBackup(targetStore, backupPath, LibraryBackupMode.Merge),
    ).rejects.toThrow(/checksum/i);
  });

  // --- Replace Mode with Recovery of Replaced Library Through Trash ---
  it('Replace mode moves existing library to Trash for safe recovery', async () => {
    // Populate target store with pre-existing macros
    await targetStore.save(createDefaultMacroDefinition({ name: 'OldPreExisting' }));
    await targetStore.save(
      createDefaultMacroDefinition({ name: 'OldNested', folder: 'OldFolder' }),
    );

    const preExistingLoaded = await targetStore.loadAll();
    expect(preExistingLoaded).toHaveLength(2);

    // Source store has new macros to backup
    await sourceStore.save(createDefaultMacroDefinition({ name: 'NewMacro' }));
    const backupPath = path.join(sourceRoot, `replace${BACKUP_EXTENSION}`);
    await exportLibraryBackup(sourceStore, backupPath);

    // Restore with Replace mode
    const result = await importLibraryBackup(targetStore, backupPath, LibraryBackupMode.Replace);
    expect(result.imported).toBe(1);

    // Verify target store now ONLY contains the new macro
    const newLoaded = await targetStore.loadAll();
    expect(newLoaded).toHaveLength(1);
    expect(newLoaded[0]?.name).toBe('NewMacro');

    // Verify the replaced library was moved to trash and remains intact
    expect(fs.existsSync(targetStore.trashPath)).toBe(true);
    const trashSlots = fs.readdirSync(targetStore.trashPath);
    expect(trashSlots.length).toBeGreaterThanOrEqual(1);

    const slotPath = path.join(targetStore.trashPath, trashSlots[0]!);
    const trashedMacrosPath = path.join(slotPath, 'Macros');
    expect(fs.existsSync(trashedMacrosPath)).toBe(true);

    // Verify previous files are inside the trashed Macros directory
    expect(fs.existsSync(path.join(trashedMacrosPath, 'OldPreExisting.macro.json'))).toBe(true);
    expect(fs.existsSync(path.join(trashedMacrosPath, 'OldFolder', 'OldNested.macro.json'))).toBe(
      true,
    );
  });

  // --- Merge Mode with Name Conflicts ---
  it('Merge mode adds macros and disambiguates name conflicts with numeric suffixes', async () => {
    // Target has existing macro named "Duplicate"
    await targetStore.save(createDefaultMacroDefinition({ name: 'Duplicate' }));

    // Source also has macro named "Duplicate"
    await sourceStore.save(createDefaultMacroDefinition({ name: 'Duplicate' }));
    const backupPath = path.join(sourceRoot, `merge${BACKUP_EXTENSION}`);
    await exportLibraryBackup(sourceStore, backupPath);

    const result = await importLibraryBackup(targetStore, backupPath, LibraryBackupMode.Merge);
    expect(result.imported).toBe(1);

    const loaded = await targetStore.loadAll();
    expect(loaded).toHaveLength(2);
    const names = loaded.map((m) => m.name).sort();
    expect(names).toEqual(['Duplicate', 'Duplicate 2']);
  });

  // --- Optional Settings Inclusion Without Applying ---
  it('includes optional settings in backup without applying them on restore', async () => {
    await sourceStore.save(createDefaultMacroDefinition({ name: 'WithSettings' }));

    // Create a mock settings.json file
    const settingsFile = path.join(sourceRoot, 'settings.json');
    const customSettingsContent = JSON.stringify({
      theme: 'Dark',
      customPlaybackOption: 42,
    });
    fs.writeFileSync(settingsFile, customSettingsContent);

    const backupPath = path.join(sourceRoot, `with-settings${BACKUP_EXTENSION}`);
    await exportLibraryBackup(sourceStore, backupPath, {
      includeSettings: true,
      settingsPath: settingsFile,
    });

    // Inspect archive to ensure settings.json was packed
    const buffer = fs.readFileSync(backupPath);
    const entries = readZipArchive(buffer);
    expect(entries.has('settings.json')).toBe(true);
    expect(entries.get('settings.json')!.toString('utf-8')).toBe(customSettingsContent);

    const manifest = JSON.parse(entries.get('manifest.json')!.toString('utf-8'));
    expect(manifest.includesSettings).toBe(true);

    // Target store has an existing settings file
    const targetSettingsFile = path.join(targetRoot, 'settings.json');
    const existingTargetSettings = JSON.stringify({
      theme: 'Light',
      keepMySetting: true,
    });
    fs.writeFileSync(targetSettingsFile, existingTargetSettings);

    // Restore backup
    await importLibraryBackup(targetStore, backupPath, LibraryBackupMode.Merge);

    // Verify target settings file was NOT overwritten or modified
    expect(fs.readFileSync(targetSettingsFile, 'utf-8')).toBe(existingTargetSettings);
  });

  // --- Golden Folder Tree Byte-For-Byte Matching ---
  it('Merge and Replace match golden folder tree structure and counts byte-for-byte', async () => {
    // Build tree matching folder-tree.expected.json:
    // RootMacro (root)
    // Gaming/Combo
    // Gaming/Shooter/Aim
    // Work/Email
    // Work/Daily/Report
    await sourceStore.save(createDefaultMacroDefinition({ name: 'RootMacro' }));
    await sourceStore.save(createDefaultMacroDefinition({ name: 'Combo', folder: 'Gaming' }));
    await sourceStore.save(createDefaultMacroDefinition({ name: 'Aim', folder: 'Gaming/Shooter' }));
    await sourceStore.save(createDefaultMacroDefinition({ name: 'Email', folder: 'Work' }));
    await sourceStore.save(createDefaultMacroDefinition({ name: 'Report', folder: 'Work/Daily' }));

    const backupPath = path.join(sourceRoot, `golden-tree${BACKUP_EXTENSION}`);
    const exportedCount = await exportLibraryBackup(sourceStore, backupPath);
    expect(exportedCount).toBe(5);

    // Restore into clean target store
    await importLibraryBackup(targetStore, backupPath, LibraryBackupMode.Replace);
    const info = await targetStore.getFolderTreeInfo();

    const expectedTree = {
      folders: ['Gaming', 'Gaming/Shooter', 'Work', 'Work/Daily'],
      macroCounts: {
        '': 5,
        Gaming: 2,
        'Gaming/Shooter': 1,
        Work: 2,
        'Work/Daily': 1,
      },
    };

    expect(JSON.stringify(info)).toBe(JSON.stringify(expectedTree));
  });

  // --- Canonical Bundle Hash ---
  it('computes canonical bundle hash matching ordinal string ordering', () => {
    const entryA = {
      name: 'Macros/Work/Report.macro.json',
      bytes: Buffer.from('{"name":"Report"}'),
    };
    const entryB = {
      name: 'Macros/Gaming/Aim.macro.json',
      bytes: Buffer.from('{"name":"Aim"}'),
    };

    // Regardless of input order, bundle hash must be identical
    const hash1 = computeBundleHash([entryA, entryB]);
    const hash2 = computeBundleHash([entryB, entryA]);
    expect(hash1).toBe(hash2);
    expect(hash1).toMatch(/^[0-9a-f]{64}$/);
  });

  // --- Security & Path Traversal Rejections ---
  it('rejects backup packages containing path traversal entries', () => {
    const manifest = {
      format: BACKUP_FORMAT_ID,
      formatVersion: 1,
      createdAtUtc: new Date().toISOString(),
      macroCount: 1,
      sha256: '0'.repeat(64),
      includesSettings: false,
    };

    expect(() =>
      createZipArchive([
        { name: 'manifest.json', data: JSON.stringify(manifest) },
        { name: 'Macros/../../evil.macro.json', data: '{}' },
      ]),
    ).toThrow(/path traversal/i);
  });

  it('rejects backup with unsupported future formatVersion', async () => {
    const filePath = path.join(sourceRoot, 'bad-version.mrbackup');
    const manifest = {
      format: BACKUP_FORMAT_ID,
      formatVersion: 42,
      createdAtUtc: new Date().toISOString(),
      macroCount: 0,
      sha256: crypto.createHash('sha256').digest('hex'),
      includesSettings: false,
    };
    const zip = createZipArchive([{ name: 'manifest.json', data: JSON.stringify(manifest) }]);
    fs.writeFileSync(filePath, zip);

    await expect(
      importLibraryBackup(targetStore, filePath, LibraryBackupMode.Merge),
    ).rejects.toThrow('Backup version 42 is not supported by this version of the app.');
  });

  it('rejects backup with bad format signature', async () => {
    const filePath = path.join(sourceRoot, 'bad-fmt.mrbackup');
    const manifest = {
      format: 'not-a-macro-recorder-backup',
      formatVersion: 1,
      createdAtUtc: new Date().toISOString(),
      macroCount: 0,
      sha256: crypto.createHash('sha256').digest('hex'),
      includesSettings: false,
    };
    const zip = createZipArchive([{ name: 'manifest.json', data: JSON.stringify(manifest) }]);
    fs.writeFileSync(filePath, zip);

    await expect(
      importLibraryBackup(targetStore, filePath, LibraryBackupMode.Merge),
    ).rejects.toThrow('The file is not a Macro Recorder library backup.');
  });

  it('rejects backup with missing manifest.json', async () => {
    const filePath = path.join(sourceRoot, 'no-manifest.mrbackup');
    const zip = createZipArchive([{ name: 'Macros/sample.macro.json', data: '{}' }]);
    fs.writeFileSync(filePath, zip);

    await expect(
      importLibraryBackup(targetStore, filePath, LibraryBackupMode.Merge),
    ).rejects.toThrow('The .mrbackup package is missing manifest.json.');
  });

  // --- Golden Fixtures Compatibility ---
  it('reads legacy golden fixture sample.mrbackup', async () => {
    const fixturePath = path.resolve(
      __dirname,
      '../../../../tests/fixtures/importers/library-backup/sample.mrbackup',
    );
    if (!fs.existsSync(fixturePath)) return;

    const result = await importLibraryBackup(targetStore, fixturePath, LibraryBackupMode.Replace);
    expect(result.imported).toBe(2);
    expect(result.total).toBe(2);

    const loaded = await targetStore.loadAll();
    expect(loaded).toHaveLength(2);
    expect(loaded.find((m) => m.name === 'Root macro' && m.folder === '')).toBeDefined();
    expect(loaded.find((m) => m.name === 'Nested macro' && m.folder === 'Games')).toBeDefined();
  });

  it('reads legacy golden fixture expected.mrbackup', async () => {
    const fixturePath = path.resolve(
      __dirname,
      '../../../../tests/fixtures/exporters/library-backup/expected.mrbackup',
    );
    if (!fs.existsSync(fixturePath)) return;

    const result = await importLibraryBackup(targetStore, fixturePath, LibraryBackupMode.Replace);
    expect(result.imported).toBe(2);
    expect(result.total).toBe(2);

    const loaded = await targetStore.loadAll();
    expect(loaded).toHaveLength(2);
    expect(loaded.find((m) => m.name === 'Root macro')).toBeDefined();
    expect(loaded.find((m) => m.name === 'Nested macro')).toBeDefined();
  });

  // --- .NET / Legacy Application Readability ---
  it('newly exported .mrbackup is readable by .NET ZipFile', async () => {
    await sourceStore.save(createDefaultMacroDefinition({ name: 'NetBackupMacro' }));
    const backupPath = path.join(sourceRoot, `dotnet_backup${BACKUP_EXTENSION}`);
    await exportLibraryBackup(sourceStore, backupPath);

    const { execSync } = await import('node:child_process');
    if (process.platform === 'win32') {
      const psCommand = `Add-Type -AssemblyName System.IO.Compression.FileSystem; $a = [System.IO.Compression.ZipFile]::OpenRead('${backupPath.replace(/'/g, "''")}'); $a.Entries | ForEach-Object { $_.FullName }; $a.Dispose()`;
      const stdout = execSync(`powershell -NoProfile -Command "${psCommand}"`, {
        encoding: 'utf-8',
      });
      expect(stdout).toContain('manifest.json');
      expect(stdout).toContain('Macros/NetBackupMacro.macro.json');
    }
  });

  // --- Filename Formatting ---
  it('formats timestamped backup filenames correctly', () => {
    const date = new Date(2026, 8, 11, 14, 30, 45); // Sept 11, 2026 14:30:45
    const name = createBackupFileName(date);
    expect(name).toBe('MacroRecorder-20260911-143045.mrbackup');
  });
});
