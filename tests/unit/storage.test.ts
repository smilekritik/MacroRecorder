/**
 * Unit tests for MacroLibraryStore, portable .mrmacro packages, library backups,
 * unique naming, nested folders, DPI rescaling, and temporary roots.
 * Mapped to legacy MacroRecorder.Tests.StorageTests.cs.
 * Covers LEGACY-TEST-073 through LEGACY-TEST-086 ( .., HELPER-STORE-085, 086).
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import {
  CURRENT_SCHEMA_VERSION,
  DEFAULT_PLAYBACK_OPTIONS,
  createDefaultMacroDefinition,
  LibraryBackupMode,
  MacroEventType,
  MacroImportFormat,
  MouseButton,
  OverlayCardOverride,
  TargetMode,
  type PixelColorTriggerEvent,
} from '../../packages/contracts/src/index.js';
import { MacroLibraryStore } from '../../packages/storage/src/library/library-store.js';
import {
  exportPortablePackage,
  importPortablePackage,
} from '../../packages/storage/src/portable/portable-package.js';
import {
  createZipArchive,
  readZipArchive,
} from '../../packages/storage/src/portable/zip.js';
import {
  exportLibraryBackup,
  importLibraryBackup,
} from '../../packages/storage/src/backup/library-backup.js';
import { BACKUP_EXTENSION } from '../../packages/storage/src/backup/types.js';
import { PORTABLE_FORMAT_ID } from '../../packages/storage/src/portable/types.js';
import { importMacro } from '../../packages/import-export/src/import/index.js';
import {
  createTemporaryRoot,
  deleteTemporaryRoot,
} from './test-helpers.js';

describe('StorageTests', () => {
  let root: string;
  let store: MacroLibraryStore;

  beforeEach(() => {
    root = createTemporaryRoot();
    store = new MacroLibraryStore(root);
  });

  afterEach(() => {
    deleteTemporaryRoot(root);
  });

  /**
   * [Fact]
   * public async Task Store_RoundTripsPerMacroOverlayOverrides
   * Mapped to LEGACY-TEST-073 /
   */
  it('Store_RoundTripsPerMacroOverlayOverrides', async () => {
    const macro = createDefaultMacroDefinition({ name: 'overlay' });
    const macroMutable = macro as {
      playback: {
        infoCardOverride: OverlayCardOverride;
        customTextOverride: OverlayCardOverride;
      };
    };
    macroMutable.playback.infoCardOverride = OverlayCardOverride.ForceHide;
    macroMutable.playback.customTextOverride = OverlayCardOverride.ForceShow;

    await store.save(macro);
    const loaded = await store.loadAll();
    expect(loaded).toHaveLength(1);

    expect(loaded[0]?.playback.infoCardOverride).toBe(OverlayCardOverride.ForceHide);
    expect(loaded[0]?.playback.customTextOverride).toBe(OverlayCardOverride.ForceShow);
  });

  /**
   * [Fact]
   * public async Task Store_RoundTripsAndUsesVersionedFile
   * Mapped to LEGACY-TEST-074 /
   */
  it('Store_RoundTripsAndUsesVersionedFile', async () => {
    const macro = createDefaultMacroDefinition({
      name: 'roundtrip',
      hotkey: {
        virtualKey: 0,
        mouseButton: MouseButton.X2,
        wheel: 'None',
        control: true,
        alt: false,
        shift: false,
        windows: false,
      },
      events: [
        {
          id: crypto.randomUUID(),
          timeMicroseconds: 42_000,
          type: MacroEventType.KeyDown,
          device: 'Keyboard' as const,
          virtualKey: 65,
          scanCode: 30,
          extended: false,
          comment: '',
        },
      ],
    });

    await store.save(macro);
    const loaded = await store.loadAll();
    expect(loaded).toHaveLength(1);

    const first = loaded[0]!;
    expect(first.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(first.events[0]?.timeMicroseconds).toBe(42_000);
    expect(first.hotkey.mouseButton).toBe(MouseButton.X2);
    expect(first.hotkey.control).toBe(true);

    // Verify temp file does not remain
    const tempFile = path.join(store.macrosPath, `${macro.id.replace(/-/g, '')}.macro.json.tmp`);
    expect(fs.existsSync(tempFile)).toBe(false);

    // Verify saved file exists with PascalCase properties
    const savedFile = path.join(store.macrosPath, 'roundtrip.macro.json');
    expect(fs.existsSync(savedFile)).toBe(true);
    const json = JSON.parse(fs.readFileSync(savedFile, 'utf-8'));
    expect(json.SchemaVersion).toBe(12);
    expect(json.Name).toBe('roundtrip');
    expect(json.Events[0].TimeMicroseconds).toBe(42_000);
    expect(json.Hotkey.MouseButton).toBe('X2');
    expect(json.Hotkey.Control).toBe(true);
  });

  /**
   * [Fact]
   * public async Task MrMacroPackage_RoundTripsPortableDataAndHasManifest
   * Mapped to LEGACY-TEST-075 /
   */
  it('MrMacroPackage_RoundTripsPortableDataAndHasManifest', async () => {
    const filePath = path.join(root, 'transfer.mrmacro');
    const source = createDefaultMacroDefinition({
      name: 'transfer',
      description: 'portable',
      isEnabled: true,
      hotkey: {
        virtualKey: 0,
        mouseButton: MouseButton.X1,
        wheel: 'None',
        control: true,
        alt: false,
        shift: false,
        windows: false,
      },
      playback: {
        ...DEFAULT_PLAYBACK_OPTIONS,
        activationMode: 'Once',
        targetMode: TargetMode.SpecificWindow,
        targetProcessName: 'sample',
        targetWindowTitle: 'Sample window',
      },
      events: [
        {
          id: crypto.randomUUID(),
          timeMicroseconds: 0,
          type: MacroEventType.PixelColorTrigger,
          pixelX: 140,
          pixelY: -30,
          pixelColor: 0x123abc,
          triggerCooldownMilliseconds: 4200,
          comment: '',
        },
        {
          id: crypto.randomUUID(),
          timeMicroseconds: 50_000,
          type: MacroEventType.KeyDown,
          device: 'Keyboard',
          virtualKey: 0x45,
          scanCode: 18,
          extended: false,
          comment: '',
        },
      ],
    });

    const originalId = source.id;
    await exportPortablePackage(source, filePath, { currentDisplayDpi: 96 });

    // Verify ZIP archive entries
    const buffer = fs.readFileSync(filePath);
    const entries = readZipArchive(buffer);
    expect(entries.has('manifest.json')).toBe(true);
    expect(entries.has('macro.json')).toBe(true);

    const manifest = JSON.parse(entries.get('manifest.json')!.toString('utf-8'));
    expect(manifest.format).toBe(PORTABLE_FORMAT_ID);
    expect(manifest.formatVersion).toBe(1);
    expect(manifest.sourceDpi).toBe(96);
    expect(manifest.macroEntry).toBe('macro.json');
    expect(manifest.macroSha256).toBeTruthy();

    // Import package
    const result = await importPortablePackage(filePath, { store, currentDisplayDpi: 96 });
    expect(result.macros).toHaveLength(1);
    const imported = result.macros[0]!;

    expect(result.format).toBe(MacroImportFormat.MacroPackage);
    expect(imported.id).not.toBe(originalId);
    expect(imported.isEnabled).toBe(false);
    expect(imported.name).toBe('transfer');
    expect(imported.hotkey.mouseButton).toBe(MouseButton.X1);
    expect(imported.playback.targetMode).toBe(TargetMode.SpecificWindow);

    const firstEvent = imported.events[0] as PixelColorTriggerEvent;
    expect(firstEvent.triggerCooldownMilliseconds).toBe(4200);
    expect(firstEvent.pixelColor).toBe(0x123abc);
    expect(result.warnings.length).toBeGreaterThanOrEqual(2);
    expect(
      result.warnings.some((w) =>
        w.message.toLowerCase().includes('disabled so it can be reviewed safely'),
      ),
    ).toBe(false);
  });

  /**
   * [Fact]
   * public async Task MrMacroPackage_RejectsModifiedPayload
   * Mapped to LEGACY-TEST-076 /
   */
  it('MrMacroPackage_RejectsModifiedPayload', async () => {
    const filePath = path.join(root, 'damaged.mrmacro');
    const source = createDefaultMacroDefinition({ name: 'checksum' });
    await exportPortablePackage(source, filePath);

    // Tamper with macro.json
    const buffer = fs.readFileSync(filePath);
    const entries = readZipArchive(buffer);
    const manifestBytes = entries.get('manifest.json')!;
    const tamperedZip = createZipArchive([
      { name: 'manifest.json', data: manifestBytes },
      { name: 'macro.json', data: '{}' },
    ]);
    fs.writeFileSync(filePath, tamperedZip);

    await expect(importPortablePackage(filePath, { store })).rejects.toThrow(/checksum/i);
  });

  /**
   * [Fact]
   * public async Task Store_KeepsNamesUniqueAndNamesFilesAfterMacros
   * Mapped to LEGACY-TEST-077 /
   */
  it('Store_KeepsNamesUniqueAndNamesFilesAfterMacros', async () => {
    const first = createDefaultMacroDefinition({ name: 'combo' });
    const second = createDefaultMacroDefinition({ name: 'combo' });

    await store.save(first);
    await store.save(second);

    expect(first.name).toBe('combo');
    expect(second.name).toBe('combo 2');

    expect(fs.existsSync(path.join(store.macrosPath, 'combo.macro.json'))).toBe(true);
    expect(fs.existsSync(path.join(store.macrosPath, 'combo 2.macro.json'))).toBe(true);

    (second as { name: string }).name = 'another';
    await store.save(second);

    expect(fs.existsSync(path.join(store.macrosPath, 'combo 2.macro.json'))).toBe(false);
    expect(fs.existsSync(path.join(store.macrosPath, 'another.macro.json'))).toBe(true);
  });

  /**
   * [Fact]
   * public async Task Store_MovesMacroIntoNestedFolderThatExistsOnDisk
   * Mapped to LEGACY-TEST-078 /
   */
  it('Store_MovesMacroIntoNestedFolderThatExistsOnDisk', async () => {
    const parent = await store.createFolder('', 'Parent');
    const nested = await store.createFolder(parent, 'Combo');
    const macro = createDefaultMacroDefinition({ name: 'hit' });
    await store.save(macro);

    await store.moveToFolder(macro, nested);

    const expectedFolder = path.join('Parent', 'Combo');
    expect(macro.folder).toBe(expectedFolder);
    expect(fs.existsSync(path.join(store.macrosPath, 'Parent', 'Combo', 'hit.macro.json'))).toBe(
      true,
    );
    expect(fs.existsSync(path.join(store.macrosPath, 'hit.macro.json'))).toBe(false);

    const folders = await store.loadFolders();
    expect(folders).toContain(expectedFolder);

    const loaded = await store.loadAll();
    expect(loaded).toHaveLength(1);
    expect(loaded[0]?.folder).toBe(expectedFolder);
    expect(loaded[0]?.name).toBe('hit');
  });

  /**
   * [Fact]
   * public async Task Store_MoveFolderCarriesContentAndRejectsSelfNesting
   * Mapped to LEGACY-TEST-079 /
   */
  it('Store_MoveFolderCarriesContentAndRejectsSelfNesting', async () => {
    const source = await store.createFolder('', 'A');
    const target = await store.createFolder('', 'B');
    const macro = createDefaultMacroDefinition({ name: 'inside', folder: source });
    await store.save(macro);

    const moved = await store.moveFolder(source, target);

    const expectedMoved = path.join('B', 'A');
    expect(moved).toBe(expectedMoved);
    expect(fs.existsSync(path.join(store.macrosPath, 'B', 'A', 'inside.macro.json'))).toBe(true);

    // Moving "B" into moved ("B/A") must reject self-nesting
    await expect(store.moveFolder('B', moved)).rejects.toThrow(
      'A folder cannot be moved inside itself.',
    );

    // Deleting the library root must be rejected
    await expect(store.deleteFolder('')).rejects.toThrow('The library root cannot be deleted.');
  });

  /**
   * [Fact]
   * public async Task Store_MigratesLegacyFileNamesAndSeparatesEqualNames
   * Mapped to LEGACY-TEST-080 /
   */
  it('Store_MigratesLegacyFileNamesAndSeparatesEqualNames', async () => {
    fs.mkdirSync(store.macrosPath, { recursive: true });

    const legacy1 = {
      SchemaVersion: 12,
      Id: crypto.randomUUID(),
      Name: 'same',
      Folder: '',
      ModifiedAt: '2026-09-11T00:00:00+00:00',
      Events: [],
    };
    const legacy2 = {
      SchemaVersion: 12,
      Id: crypto.randomUUID(),
      Name: 'same',
      Folder: '',
      ModifiedAt: '2026-09-11T00:00:00+00:00',
      Events: [],
    };

    const legacyPath1 = path.join(store.macrosPath, `${legacy1.Id.replace(/-/g, '')}.macro.json`);
    const legacyPath2 = path.join(store.macrosPath, `${legacy2.Id.replace(/-/g, '')}.macro.json`);

    fs.writeFileSync(legacyPath1, JSON.stringify(legacy1, null, 2));
    fs.writeFileSync(legacyPath2, JSON.stringify(legacy2, null, 2));

    const loaded = await store.loadAll();
    const names = loaded.map((m) => m.name).sort();
    expect(names).toEqual(['same', 'same 2']);

    expect(fs.existsSync(path.join(store.macrosPath, 'same.macro.json'))).toBe(true);
    expect(fs.existsSync(path.join(store.macrosPath, 'same 2.macro.json'))).toBe(true);

    const macroFiles = fs.readdirSync(store.macrosPath).filter((f) => f.endsWith('.macro.json'));
    expect(macroFiles).toHaveLength(2);
  });

  /**
   * [Fact]
   * public async Task Import_UsesSelectedFolderAndRenamesRepeatedImport
   * Mapped to LEGACY-TEST-081 /
   */
  it('Import_UsesSelectedFolderAndRenamesRepeatedImport', async () => {
    const importSource = path.join(root, 'test.ahk');
    fs.writeFileSync(
      importSource,
      'XButton2:: {\nSend "{q down}"\nSleep 25\nSend "{q up}"\n}',
    );
    const libraryStore = new MacroLibraryStore(path.join(root, 'library'));
    const folder = await libraryStore.createFolder('', 'Imported');

    const fallbackName = path.basename(importSource, path.extname(importSource));
    const content = fs.readFileSync(importSource, 'utf-8');
    const first = importMacro(content, fallbackName);
    for (const m of first.macros) {
      (m as { folder: string }).folder = folder;
      await libraryStore.save(m);
    }

    const second = importMacro(content, fallbackName);
    for (const m of second.macros) {
      (m as { folder: string }).folder = folder;
      await libraryStore.save(m);
    }

    expect(first.macros[0]!.name).toBe('test');
    expect(second.macros[0]!.name).toBe('test 2');
    expect(second.macros[0]!.folder).toBe('Imported');
    expect(
      fs.existsSync(path.join(libraryStore.macrosPath, 'Imported', 'test 2.macro.json')),
    ).toBe(true);
  });

  /**
   * [Fact]
   * public async Task PortableImport_RescalesPixelCoordinatesForDpi
   * Mapped to LEGACY-TEST-082 /
   */
  it('PortableImport_RescalesPixelCoordinatesForDpi', async () => {
    const filePath = path.join(root, 'x.mrmacro');
    const macro = createDefaultMacroDefinition({
      name: 'dpi',
      events: [
        {
          id: crypto.randomUUID(),
          timeMicroseconds: 0,
          type: MacroEventType.PixelColorTrigger,
          pixelX: 100,
          pixelY: 200,
          pixelColor: 0x112233,
          triggerCooldownMilliseconds: 0,
          comment: '',
        },
      ],
    });

    const storeDpi96 = new MacroLibraryStore({ rootPath: root, currentDisplayDpi: 96 });
    await exportPortablePackage(macro, filePath, { currentDisplayDpi: storeDpi96.currentDisplayDpi });

    const storeDpi144 = new MacroLibraryStore({ rootPath: root, currentDisplayDpi: 144 });
    const result = await importPortablePackage(filePath, {
      store: storeDpi144,
      currentDisplayDpi: storeDpi144.currentDisplayDpi,
    });
    expect(result.macros).toHaveLength(1);
    const imported = result.macros[0]!;
    const trigger = imported.events[0] as PixelColorTriggerEvent;

    expect(trigger.pixelX).toBe(150); // 100 * 144 / 96
    expect(trigger.pixelY).toBe(300); // 200 * 144 / 96
  });

  /**
   * [Fact]
   * public async Task LibraryBackup_RoundTripsMacrosAndFolders
   * Mapped to LEGACY-TEST-083 /
   */
  it('LibraryBackup_RoundTripsMacrosAndFolders', async () => {
    const sourceRoot = createTemporaryRoot('mr-bk-src-');
    const targetRoot = createTemporaryRoot('mr-bk-dst-');
    try {
      const origin = new MacroLibraryStore(sourceRoot);
      await origin.save(createDefaultMacroDefinition({ name: 'Root macro' }));
      await origin.save(createDefaultMacroDefinition({ name: 'Nested', folder: 'Games' }));

      const backup = path.join(sourceRoot, `lib${BACKUP_EXTENSION}`);
      const exported = await exportLibraryBackup(origin, backup, {
        includeSettings: false,
        settingsPath: undefined,
      });
      expect(exported).toBe(2);

      const restored = new MacroLibraryStore(targetRoot);
      const result = await importLibraryBackup(restored, backup, LibraryBackupMode.Merge);
      expect(result.imported).toBe(2);

      const loaded = await restored.loadAll();
      expect(loaded.some((m) => m.name === 'Root macro' && m.folder === '')).toBe(true);
      expect(loaded.some((m) => m.name === 'Nested' && m.folder === 'Games')).toBe(true);
    } finally {
      deleteTemporaryRoot(sourceRoot);
      deleteTemporaryRoot(targetRoot);
    }
  });

  /**
   * [Fact]
   * public async Task LibraryBackup_RejectsTamperedChecksum
   * Mapped to LEGACY-TEST-084 /
   */
  it('LibraryBackup_RejectsTamperedChecksum', async () => {
    await store.save(createDefaultMacroDefinition({ name: 'One' }));
    const backupPath = path.join(root, `b${BACKUP_EXTENSION}`);
    await exportLibraryBackup(store, backupPath, { includeSettings: false });

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
      importLibraryBackup(store, backupPath, LibraryBackupMode.Merge),
    ).rejects.toThrow(/checksum/i);
  });

  /**
   * [Helper]
   * public static string CreateTemporaryRoot
   * Mapped to LEGACY-TEST-085 / HELPER-STORE-085
   */
  it('HELPER-STORE-085: CreateTemporaryRoot creates isolated test directory', () => {
    const tempDir = createTemporaryRoot('mr-store-helper-');
    expect(fs.existsSync(tempDir)).toBe(true);
    expect(tempDir).toContain('MacroRecorderTests');
    deleteTemporaryRoot(tempDir);
  });

  /**
   * [Helper]
   * public static void DeleteTemporaryRoot(string root)
   * Mapped to LEGACY-TEST-086 / HELPER-STORE-086
   */
  it('HELPER-STORE-086: DeleteTemporaryRoot cleans up temporary directory', () => {
    const tempDir = createTemporaryRoot('mr-store-del-');
    expect(fs.existsSync(tempDir)).toBe(true);
    deleteTemporaryRoot(tempDir);
    expect(fs.existsSync(tempDir)).toBe(false);
  });
});
