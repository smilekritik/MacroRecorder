import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  MacroEventType,
  createDefaultMacroDefinition,
} from '../../../../../../packages/contracts/src/index.js';
import { MacroLibraryStore } from '../../../../../../packages/storage/src/library/library-store.js';
import { readZipArchive } from '../../../../../../packages/storage/src/portable/index.js';
import { ImportExportCoordinator } from '../coordinators/import-export-coordinator.js';
import type { MacroDefinition as IpcMacroDefinition } from '../../ipc/types.js';

const FIXTURES_ROOT = path.resolve(__dirname, '../../../../../../tests/fixtures');

function fixture(relativePath: string): string {
  return path.join(FIXTURES_ROOT, relativePath);
}

describe('ImportExportCoordinator production integration', () => {
  let rootPath: string;
  let coordinator: ImportExportCoordinator;

  beforeEach(() => {
    rootPath = fs.mkdtempSync(path.join(os.tmpdir(), 'import-export-coordinator-'));
    coordinator = new ImportExportCoordinator({
      libraryRootPath: rootPath,
      currentDisplayDpi: 144,
    });
  });

  afterEach(() => {
    fs.rmSync(rootPath, { recursive: true, force: true });
  });

  it.each([
    ['NativeJson', 'importers/native-json/sample.macro.json'],
    ['AutoHotkey', 'importers/autohotkey/sample.ahk'],
    ['AutoIt', 'importers/autoit/sample.au3'],
    ['Amc', 'importers/amc/sample.amc'],
    ['JitbitMrf', 'importers/jitbit-mrf/sample.mrf'],
    ['Razer', 'importers/razer/sample.xml'],
    ['TinyTask', 'importers/tinytask/sample.rec'],
    ['MacroPackage', 'importers/macro-package/sample.mrmacro'],
  ] as const)('delegates %s imports to the production parser', async (expectedFormat, relativePath) => {
    const sourcePath = fixture(relativePath);

    expect(coordinator.detectFormat(sourcePath)).toBe(expectedFormat);
    const result = await coordinator.importMacro(sourcePath);

    expect(result.sourceFormat).toBe(expectedFormat);
    expect(result.macro.events.length).toBeGreaterThan(0);
    expect(result.macro['isEnabled']).toBe(false);
  });

  it('validates package integrity and rescales package coordinates for the target DPI', async () => {
    const result = await coordinator.importMacro(fixture('dpi/source-dpi-96.mrmacro'));
    const trigger = result.macro.events.find(
      (event) => event['type'] === MacroEventType.PixelColorTrigger,
    );

    expect(trigger?.['pixelX']).toBe(150);
    expect(trigger?.['pixelY']).toBe(300);
    expect(result.warnings.some((warning) => warning.includes('DPI 96 to 144'))).toBe(true);

    const damagedPath = path.join(rootPath, 'damaged.mrmacro');
    const archive = readZipArchive(fs.readFileSync(fixture('dpi/source-dpi-96.mrmacro')));
    const macroBytes = Buffer.from(archive.get('macro.json')!);
    macroBytes[0] = macroBytes[0] === 0x7b ? 0x5b : 0x7b;
    const { createZipArchive } = await import(
      '../../../../../../packages/storage/src/portable/index.js'
    );
    fs.writeFileSync(
      damagedPath,
      createZipArchive([
        { name: 'manifest.json', data: archive.get('manifest.json')! },
        { name: 'macro.json', data: macroBytes },
      ]),
    );

    await expect(coordinator.importMacro(damagedPath)).rejects.toThrow(/checksum/i);
  });

  it('writes real Native JSON, AutoHotkey, and portable package exports', async () => {
    const macro = createDefaultMacroDefinition({
      name: 'Production export',
      events: [
        {
          id: crypto.randomUUID(),
          timeMicroseconds: 0,
          type: MacroEventType.Comment,
          text: 'real event',
          comment: '',
        },
      ],
    }) as unknown as IpcMacroDefinition;
    const jsonPath = path.join(rootPath, 'macro.json');
    const ahkPath = path.join(rootPath, 'macro.ahk');
    const packagePath = path.join(rootPath, 'macro.mrmacro');

    await coordinator.exportMacro(macro, 'json', jsonPath);
    await coordinator.exportMacro(macro, 'ahk', ahkPath);
    await coordinator.exportMacro(macro, 'zip', packagePath);

    expect(JSON.parse(fs.readFileSync(jsonPath, 'utf8')).Name).toBe('Production export');
    expect(fs.readFileSync(ahkPath, 'utf8')).toContain('#Requires AutoHotkey v2.0');

    const entries = readZipArchive(fs.readFileSync(packagePath));
    expect(entries.get('manifest.json')?.length).toBeGreaterThan(0);
    expect(entries.get('macro.json')?.length).toBeGreaterThan(0);
    expect(JSON.parse(entries.get('manifest.json')!.toString('utf8')).sourceDpi).toBe(144);

    const roundTrip = await coordinator.importMacro(packagePath);
    expect(roundTrip.macro.name).toBe('Production export');
    await expect(coordinator.exportMacro(macro, 'csv', path.join(rootPath, 'macro.csv')))
      .rejects.toThrow(/diagnostics export format/i);
    expect(fs.existsSync(path.join(rootPath, 'macro.csv'))).toBe(false);
  });

  it('exports and restores checksummed library backups in Merge and Replace modes', async () => {
    const sourceStore = new MacroLibraryStore(rootPath);
    await sourceStore.save(createDefaultMacroDefinition({ name: 'Root macro' }));
    await sourceStore.save(createDefaultMacroDefinition({ name: 'Nested macro', folder: 'Games' }));
    fs.writeFileSync(path.join(rootPath, 'settings.json'), '{"theme":"Dark"}', 'utf8');

    const backupPath = path.join(rootPath, 'library.mrbackup');
    await coordinator.exportBackup(backupPath, true);

    const backupEntries = readZipArchive(fs.readFileSync(backupPath));
    expect(backupEntries.get('manifest.json')?.length).toBeGreaterThan(0);
    expect(backupEntries.has('Macros/Root macro.macro.json')).toBe(true);
    expect(backupEntries.has('Macros/Games/Nested macro.macro.json')).toBe(true);
    expect(backupEntries.has('settings.json')).toBe(true);

    const targetRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'import-export-target-'));
    try {
      const targetStore = new MacroLibraryStore(targetRoot);
      await targetStore.save(createDefaultMacroDefinition({ name: 'Existing macro' }));
      const targetCoordinator = new ImportExportCoordinator({ libraryRootPath: targetRoot });

      const merged = await targetCoordinator.restoreBackup(backupPath, 'Merge');
      expect(merged).toEqual({
        macrosRestored: 2,
        foldersRestored: 1,
        replacedLibraryTrashToken: undefined,
      });
      expect(await targetStore.loadAll()).toHaveLength(3);

      const replaced = await targetCoordinator.restoreBackup(backupPath, 'Replace');
      expect(replaced.macrosRestored).toBe(2);
      expect(replaced.foldersRestored).toBe(1);
      expect(replaced.replacedLibraryTrashToken).toBeTruthy();
      expect(await targetStore.loadAll()).toHaveLength(2);
      expect(
        fs.existsSync(path.join(targetStore.trashPath, replaced.replacedLibraryTrashToken!, 'Macros')),
      ).toBe(true);
    } finally {
      fs.rmSync(targetRoot, { recursive: true, force: true });
    }
  });

  it('persists OS-activated imports through the importFile alias', async () => {
    let persisted: IpcMacroDefinition | undefined;
    const aliasCoordinator = new ImportExportCoordinator({
      libraryRootPath: rootPath,
      libraryCoordinator: {
        async importMacro(macro) {
          persisted = macro;
          return { macro };
        },
      },
    });

    const result = await aliasCoordinator.importFile(
      fixture('importers/autohotkey/sample.ahk'),
    );

    expect(persisted).toBe(result.macro);
  });

  it('rejects library backups through the single-macro import API', async () => {
    await expect(
      coordinator.importMacro(fixture('importers/library-backup/sample.mrbackup')),
    ).rejects.toThrow(/explicit Merge or Replace mode/i);
  });
});
