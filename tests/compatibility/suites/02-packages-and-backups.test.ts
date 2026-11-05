import * as fs from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import { describe, expect, it, beforeEach, afterEach } from 'vitest';

import {
  createDefaultMacroDefinition,
  MacroEventType,
  LibraryBackupMode,
  portableMacroManifestSchema,
  libraryBackupManifestSchema,
  PORTABLE_FORMAT_ID,
} from '../../../packages/contracts/src/index.js';

import { MacroLibraryStore } from '../../../packages/storage/src/library/library-store.js';
import {
  exportPortablePackage,
  importPortablePackage,
} from '../../../packages/storage/src/portable/portable-package.js';
import {
  exportLibraryBackup,
  importLibraryBackup,
} from '../../../packages/storage/src/backup/library-backup.js';
import { computeBundleHash } from '../../../packages/storage/src/backup/bundle-hash.js';
import { BACKUP_EXTENSION, BACKUP_FORMAT_ID } from '../../../packages/storage/src/backup/types.js';
import { createZipArchive, readZipArchive } from '../../../packages/storage/src/portable/zip.js';
import { importMacro } from '../../../packages/import-export/src/import/dispatcher.js';
import { LibraryBackupImporter } from '../../../packages/import-export/src/import/library-backup-importer.js';

import { LegacyMacroLibraryStoreOracle } from '../oracle/legacy-oracle.js';
import { getFixturePath, loadFixtureJson, DPI_FIXTURES, IMPORTER_FIXTURES } from '../../fixtures/index.js';

describe('Suite 02: Packages and Backups', () => {
  let tempRoot: string;
  let store: MacroLibraryStore;

  beforeEach(() => {
    tempRoot = MacroLibraryStore.createTemporaryRoot();
    store = new MacroLibraryStore(tempRoot);
  });

  afterEach(() => {
    MacroLibraryStore.deleteTemporaryRoot(tempRoot);
  });

  // --- 1. Cross-Reading: Legacy Packages and Backups ---
  describe('Cross-Reading: Legacy Packages and Backups', () => {
    it('Rewrite successfully reads legacy-produced .mrmacro package fixture', () => {
      const packagePath = getFixturePath(IMPORTER_FIXTURES.MACRO_PACKAGE);
      const expected = loadFixtureJson<Record<string, unknown>>(IMPORTER_FIXTURES.MACRO_PACKAGE_EXPECTED);
      const expectedWarnings = loadFixtureJson<string[]>(IMPORTER_FIXTURES.MACRO_PACKAGE_WARNINGS);

      const result = importMacro(packagePath, 'sample');
      expect(result.macros).toHaveLength(1);
      const macro = result.macros[0]!;

      expect(macro.name).toBe(expected['name']);
      expect(macro.description).toBe(expected['description']);
      expect(macro.isEnabled).toBe(false); // Packages are imported disabled by rule
      expect(result.warnings.map((w) => w.message)).toEqual(expectedWarnings);

      // Verify legacy oracle parses the zip archive manifest identically
      const zipBytes = fs.readFileSync(packagePath);
      const entries = readZipArchive(zipBytes);
      expect(entries.has('manifest.json')).toBe(true);
      expect(entries.has('macro.json')).toBe(true);

      const manifestRaw = JSON.parse(entries.get('manifest.json')!.toString('utf-8'));
      const manifestValidation = portableMacroManifestSchema.parse(manifestRaw);
      expect(manifestValidation.success).toBe(true);
      if (manifestValidation.success) {
        expect(manifestValidation.data.format).toBe(PORTABLE_FORMAT_ID);
        expect(manifestValidation.data.formatVersion).toBe(1);
        expect(manifestValidation.data.macroSchemaVersion).toBe(12);
      }
    });

    it('Rewrite successfully reads legacy-produced .mrbackup backup fixture', () => {
      const backupPath = getFixturePath(IMPORTER_FIXTURES.LIBRARY_BACKUP);
      const expected = loadFixtureJson<{ macroCount: number; macros: { Name: string; Folder: string }[] }>(
        IMPORTER_FIXTURES.LIBRARY_BACKUP_EXPECTED,
      );
      const expectedWarnings = loadFixtureJson<string[]>(IMPORTER_FIXTURES.LIBRARY_BACKUP_WARNINGS);

      const backupBytes = fs.readFileSync(backupPath);
      const result = LibraryBackupImporter.import(backupBytes, 'sample');

      expect(result.macroCount).toBe(expected.macroCount);
      expect(result.macros).toHaveLength(expected.macros.length);
      for (let i = 0; i < expected.macros.length; i++) {
        expect(result.macros[i]!.name).toBe(expected.macros[i]!.Name);
        expect(result.macros[i]!.folder).toBe(expected.macros[i]!.Folder);
      }
      expect(result.warnings.map((w) => w.message)).toEqual(expectedWarnings);

      // Verify bundle hash matches both the current and the reference algorithms
      const entries = readZipArchive(backupBytes);
      const manifest = JSON.parse(entries.get('manifest.json')!.toString('utf-8'));
      const manifestValidation = libraryBackupManifestSchema.parse(manifest);
      expect(manifestValidation.success).toBe(true);

      const macroEntries: { name: string; bytes: Buffer }[] = [];
      for (const [entryName, entryBytes] of entries.entries()) {
        if (entryName.startsWith('Macros/') && entryName.endsWith('.macro.json')) {
          macroEntries.push({ name: entryName, bytes: entryBytes });
        }
      }

      const rewriteHash = computeBundleHash(macroEntries);
      const legacyOracleHash = LegacyMacroLibraryStoreOracle.computeBundleHash(macroEntries);
      expect(rewriteHash).toBe(manifest.sha256);
      expect(legacyOracleHash).toBe(manifest.sha256);
      expect(rewriteHash).toBe(legacyOracleHash);
    });
  });

  // --- 2. Cross-Writing: Rewrite-Produced Packages and Backups ---
  describe('Cross-Writing: Rewrite Packages and Backups', () => {
    it('Exported .mrmacro package matches standard layout, manifest schema, and SHA-256', async () => {
      const macro = createDefaultMacroDefinition({
        name: 'ExportedMacro',
        description: 'Compatibility Test Macro',
        isEnabled: true,
        events: [
          {
            id: crypto.randomUUID(),
            timeMicroseconds: 0,
            type: MacroEventType.KeyDown,
            virtualKey: 65,
            scanCode: 30,
            extended: false,
            device: 'Keyboard',
            comment: '',
          },
          {
            id: crypto.randomUUID(),
            timeMicroseconds: 50_000,
            type: MacroEventType.KeyUp,
            virtualKey: 65,
            scanCode: 30,
            extended: false,
            device: 'Keyboard',
            comment: '',
          },
        ],
      });

      const packagePath = path.join(tempRoot, 'exported.mrmacro');
      await exportPortablePackage(macro, packagePath, { currentDisplayDpi: 144 });

      const buffer = fs.readFileSync(packagePath);
      const entries = readZipArchive(buffer);
      expect(entries.has('manifest.json')).toBe(true);
      expect(entries.has('macro.json')).toBe(true);

      const manifestBytes = entries.get('manifest.json')!;
      const macroBytes = entries.get('macro.json')!;
      const manifest = JSON.parse(manifestBytes.toString('utf-8'));

      const validation = portableMacroManifestSchema.parse(manifest);
      expect(validation.success).toBe(true);
      if (validation.success) {
        expect(validation.data.format).toBe(PORTABLE_FORMAT_ID);
        expect(validation.data.formatVersion).toBe(1);
        expect(validation.data.sourceDpi).toBe(144);
        expect(validation.data.macroEntry).toBe('macro.json');
        const expectedSha = crypto.createHash('sha256').update(macroBytes).digest('hex').toLowerCase();
        expect(validation.data.macroSha256).toBe(expectedSha);
      }
    });

    it('Exported .mrbackup matches layout, bundle hash, and library-backup manifest schema', async () => {
      await store.save(createDefaultMacroDefinition({ name: 'MacroAlpha', folder: '' }));
      await store.save(createDefaultMacroDefinition({ name: 'MacroBeta', folder: 'Folder1' }));

      const backupPath = path.join(tempRoot, `backup${BACKUP_EXTENSION}`);
      const exportedCount = await exportLibraryBackup(store, backupPath, { includeSettings: false });
      expect(exportedCount).toBe(2);

      const buffer = fs.readFileSync(backupPath);
      const entries = readZipArchive(buffer);
      expect(entries.has('manifest.json')).toBe(true);

      const manifest = JSON.parse(entries.get('manifest.json')!.toString('utf-8'));
      const validation = libraryBackupManifestSchema.parse(manifest);
      expect(validation.success).toBe(true);
      if (validation.success) {
        expect(validation.data.format).toBe(BACKUP_FORMAT_ID);
        expect(validation.data.formatVersion).toBe(1);
        expect(validation.data.macroCount).toBe(2);
        expect(validation.data.includesSettings).toBe(false);

        const macroEntries: { name: string; bytes: Buffer }[] = [];
        for (const [entryName, entryBytes] of entries.entries()) {
          if (entryName.startsWith('Macros/') && entryName.endsWith('.macro.json')) {
            macroEntries.push({ name: entryName, bytes: entryBytes });
          }
        }

        const rewriteHash = computeBundleHash(macroEntries);
        const legacyOracleHash = LegacyMacroLibraryStoreOracle.computeBundleHash(macroEntries);
        expect(rewriteHash).toBe(validation.data.sha256);
        expect(legacyOracleHash).toBe(validation.data.sha256);
      }
    });
  });

  // --- 3. Tampered Packages and Backups Rejection ---
  describe('Tampering and Integrity Rejection', () => {
    it('Rejects .mrmacro with tampered payload checksum', async () => {
      const validBytes = fs.readFileSync(getFixturePath(IMPORTER_FIXTURES.MACRO_PACKAGE));
      const entries = readZipArchive(validBytes);
      const manifestBytes = entries.get('manifest.json')!;

      // Tampered macro payload
      const tamperedMacroBytes = Buffer.from('{"name":"Tampered","schemaVersion":12,"events":[]}', 'utf-8');
      const tamperedZip = createZipArchive([
        { name: 'manifest.json', data: manifestBytes },
        { name: 'macro.json', data: tamperedMacroBytes },
      ]);

      const tamperedPath = path.join(tempRoot, 'tampered-checksum.mrmacro');
      fs.writeFileSync(tamperedPath, tamperedZip);

      await expect(importPortablePackage(tamperedPath, store)).rejects.toThrow(/checksum|integrity|hash/i);
    });

    it('Rejects .mrmacro with unsupported format version', async () => {
      const validBytes = fs.readFileSync(getFixturePath(IMPORTER_FIXTURES.MACRO_PACKAGE));
      const entries = readZipArchive(validBytes);
      const macroBytes = entries.get('macro.json')!;
      const manifest = JSON.parse(entries.get('manifest.json')!.toString('utf-8'));
      manifest.formatVersion = 99; // Unsupported future version

      const tamperedZip = createZipArchive([
        { name: 'manifest.json', data: Buffer.from(JSON.stringify(manifest), 'utf-8') },
        { name: 'macro.json', data: macroBytes },
      ]);

      const tamperedPath = path.join(tempRoot, 'tampered-version.mrmacro');
      fs.writeFileSync(tamperedPath, tamperedZip);

      await expect(importPortablePackage(tamperedPath, store)).rejects.toThrow(/format|version|unsupported/i);
    });

    it('Rejects .mrmacro with bad format identifier', async () => {
      const validBytes = fs.readFileSync(getFixturePath(IMPORTER_FIXTURES.MACRO_PACKAGE));
      const entries = readZipArchive(validBytes);
      const macroBytes = entries.get('macro.json')!;
      const manifest = JSON.parse(entries.get('manifest.json')!.toString('utf-8'));
      manifest.format = 'invalid-format-id';

      const tamperedZip = createZipArchive([
        { name: 'manifest.json', data: Buffer.from(JSON.stringify(manifest), 'utf-8') },
        { name: 'macro.json', data: macroBytes },
      ]);

      const tamperedPath = path.join(tempRoot, 'tampered-format.mrmacro');
      fs.writeFileSync(tamperedPath, tamperedZip);

      await expect(importPortablePackage(tamperedPath, store)).rejects.toThrow(
        /not a Macro Recorder package|format|unsupported/i,
      );
    });

    it('Rejects .mrmacro with missing macro.json entry', async () => {
      const validBytes = fs.readFileSync(getFixturePath(IMPORTER_FIXTURES.MACRO_PACKAGE));
      const entries = readZipArchive(validBytes);
      const manifestBytes = entries.get('manifest.json')!;

      const tamperedZip = createZipArchive([
        { name: 'manifest.json', data: manifestBytes },
      ]);

      const tamperedPath = path.join(tempRoot, 'tampered-missing.mrmacro');
      fs.writeFileSync(tamperedPath, tamperedZip);

      await expect(importPortablePackage(tamperedPath, store)).rejects.toThrow(
        /has no macro\.json|missing|entry|not found/i,
      );
    });

    it('Rejects .mrbackup with tampered entry checksum', async () => {
      const validBytes = fs.readFileSync(getFixturePath(IMPORTER_FIXTURES.LIBRARY_BACKUP));
      const entries = readZipArchive(validBytes);
      const manifestBytes = entries.get('manifest.json')!;

      // Change one entry
      const tamperedZip = createZipArchive([
        { name: 'manifest.json', data: manifestBytes },
        { name: 'Macros/Root macro.macro.json', data: Buffer.from('{"name":"Tampered"}', 'utf-8') },
      ]);

      const tamperedPath = path.join(tempRoot, 'tampered-backup-checksum.mrbackup');
      fs.writeFileSync(tamperedPath, tamperedZip);

      await expect(importLibraryBackup(store, tamperedPath, LibraryBackupMode.Merge)).rejects.toThrow(
        /checksum|hash|integrity/i,
      );
    });

    it('Rejects .mrbackup with bad format identifier', async () => {
      const validBytes = fs.readFileSync(getFixturePath(IMPORTER_FIXTURES.LIBRARY_BACKUP));
      const entries = readZipArchive(validBytes);
      const manifest = JSON.parse(entries.get('manifest.json')!.toString('utf-8'));
      manifest.format = 'bad-backup-format';

      const manifestBytes = Buffer.from(JSON.stringify(manifest), 'utf-8');
      const newEntries = [{ name: 'manifest.json', data: manifestBytes }];
      for (const [name, data] of entries.entries()) {
        if (name !== 'manifest.json') newEntries.push({ name, data });
      }

      const tamperedPath = path.join(tempRoot, 'tampered-backup-format.mrbackup');
      fs.writeFileSync(tamperedPath, createZipArchive(newEntries));

      await expect(importLibraryBackup(store, tamperedPath, LibraryBackupMode.Merge)).rejects.toThrow(
        /not a Macro Recorder library backup|format|invalid/i,
      );
    });

    it('Rejects .mrbackup with missing manifest.json', async () => {
      const tamperedZip = createZipArchive([
        { name: 'Macros/Macro1.macro.json', data: Buffer.from('{"name":"Test"}', 'utf-8') },
      ]);

      const tamperedPath = path.join(tempRoot, 'tampered-missing-manifest.mrbackup');
      fs.writeFileSync(tamperedPath, tamperedZip);

      await expect(importLibraryBackup(store, tamperedPath, LibraryBackupMode.Merge)).rejects.toThrow(
        /manifest|missing/i,
      );
    });
  });

  // --- 4. DPI Rescaling ---
  describe('DPI Rescaling', () => {
    it('Source DPI 96 imported at target DPI 144 matches expected rescaling and legacy oracle', async () => {
      const packagePath = getFixturePath(DPI_FIXTURES.DPI_96_PACKAGE);
      const expected = loadFixtureJson<Record<string, unknown>>(DPI_FIXTURES.DPI_96_TARGET_144_EXPECTED);
      const expectedWarnings = loadFixtureJson<string[]>(DPI_FIXTURES.DPI_96_TARGET_144_WARNINGS);

      const result = await importPortablePackage(packagePath, { store, currentDisplayDpi: 144 });
      expect(result.warnings.map((w) => w.message)).toEqual(expectedWarnings);

      expect(result.macros).toHaveLength(1);
      const importedMacro = result.macros[0]!;
      expect(importedMacro.name).toBe(expected['name']);

      // Check coordinates: pixelX: 100 * 1.5 = 150, pixelY: 200 * 1.5 = 300
      const pixelEvent = importedMacro.events.find((e) => e.type === MacroEventType.PixelColorTrigger);
      expect(pixelEvent).toBeDefined();
      expect((pixelEvent as unknown as Record<string, unknown>)['pixelX']).toBe(150);
      expect((pixelEvent as unknown as Record<string, unknown>)['pixelY']).toBe(300);

      // Mouse move: deltaX: 120 * 1.5 = 180, deltaY: 240 * 1.5 = 360
      const moveEvent = importedMacro.events.find((e) => e.type === MacroEventType.MouseMove);
      expect(moveEvent).toBeDefined();
      expect((moveEvent as unknown as Record<string, unknown>)['deltaX']).toBe(180);
      expect((moveEvent as unknown as Record<string, unknown>)['deltaY']).toBe(360);

      // Verify legacy oracle rescaleForDpi produces the exact same results
      const legacyRescale = LegacyMacroLibraryStoreOracle.rescaleForDpi(
        [
          {
            Id: crypto.randomUUID(),
            TimeMicroseconds: 0,
            Device: 'Keyboard',
            Type: 'PixelColorTrigger',
            PixelX: 100,
            PixelY: 200,
            PixelColor: 1122867,
            TriggerCooldownMilliseconds: 0,
            VirtualKey: 0,
            ScanCode: 0,
            Extended: false,
            Button: 'None',
            DeltaX: 0,
            DeltaY: 0,
            WheelDelta: 0,
            AbsoluteMove: false,
            GamepadButton: 'None',
            GamepadAxis: 'None',
            AxisValue: 0,
            PadIndex: 0,
            Text: '',
            Comment: '',
            DurationMicroseconds: 0,
            ShowOverlayTiming: false,
            WaitProcessName: '',
            WaitWindowTitle: '',
            WaitKeyVirtualKey: 0,
            WaitTimeoutMilliseconds: 0,
            SubMacroName: '',
          },
          {
            Id: crypto.randomUUID(),
            TimeMicroseconds: 10000,
            Device: 'Mouse',
            Type: 'MouseMove',
            PixelX: 0,
            PixelY: 0,
            PixelColor: 0,
            TriggerCooldownMilliseconds: 0,
            VirtualKey: 0,
            ScanCode: 0,
            Extended: false,
            Button: 'None',
            DeltaX: 120,
            DeltaY: 240,
            WheelDelta: 0,
            AbsoluteMove: true,
            GamepadButton: 'None',
            GamepadAxis: 'None',
            AxisValue: 0,
            PadIndex: 0,
            Text: '',
            Comment: '',
            DurationMicroseconds: 0,
            ShowOverlayTiming: false,
            WaitProcessName: '',
            WaitWindowTitle: '',
            WaitKeyVirtualKey: 0,
            WaitTimeoutMilliseconds: 0,
            SubMacroName: '',
          },
        ],
        96,
        144,
      );
      expect(legacyRescale.rescaled).toBe(true);
      expect(legacyRescale.events[0]?.PixelX).toBe(150);
      expect(legacyRescale.events[0]?.PixelY).toBe(300);
      expect(legacyRescale.events[1]?.DeltaX).toBe(180);
      expect(legacyRescale.events[1]?.DeltaY).toBe(360);
    });

    it('Source DPI 144 imported at target DPI 96 matches expected down-scaling and legacy oracle', async () => {
      const packagePath = getFixturePath(DPI_FIXTURES.DPI_144_PACKAGE);
      const expectedWarnings = loadFixtureJson<string[]>(DPI_FIXTURES.DPI_144_TARGET_96_WARNINGS);

      const result = await importPortablePackage(packagePath, { store, currentDisplayDpi: 96 });
      expect(result.warnings.map((w) => w.message)).toEqual(expectedWarnings);

      expect(result.macros).toHaveLength(1);
      const importedMacro = result.macros[0]!;

      const pixelEvent = importedMacro.events.find((e) => e.type === MacroEventType.PixelColorTrigger);
      expect(pixelEvent).toBeDefined();
      expect((pixelEvent as unknown as Record<string, unknown>)['pixelX']).toBe(100);
      expect((pixelEvent as unknown as Record<string, unknown>)['pixelY']).toBe(200);

      const moveEvent = importedMacro.events.find((e) => e.type === MacroEventType.MouseMove);
      expect(moveEvent).toBeDefined();
      expect((moveEvent as unknown as Record<string, unknown>)['deltaX']).toBe(120);
      expect((moveEvent as unknown as Record<string, unknown>)['deltaY']).toBe(240);
    });

    it('Source DPI omitted imports coordinates without scaling and warns about layout', async () => {
      const packagePath = getFixturePath(DPI_FIXTURES.DPI_OMITTED_PACKAGE);
      const expectedWarnings = loadFixtureJson<string[]>(DPI_FIXTURES.DPI_OMITTED_WARNINGS);

      const result = await importPortablePackage(packagePath, { store, currentDisplayDpi: 144 });
      expect(result.warnings.map((w) => w.message)).toEqual(expectedWarnings);

      expect(result.macros).toHaveLength(1);
      const importedMacro = result.macros[0]!;

      // Coordinates remain original (100, 200, 120, 240)
      const pixelEvent = importedMacro.events.find((e) => e.type === MacroEventType.PixelColorTrigger);
      expect((pixelEvent as unknown as Record<string, unknown>)['pixelX']).toBe(100);
      expect((pixelEvent as unknown as Record<string, unknown>)['pixelY']).toBe(200);
    });
  });
});
