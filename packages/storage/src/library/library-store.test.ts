import * as fs from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import { describe, expect, it, beforeEach, afterEach } from 'vitest';

import {
  CURRENT_SCHEMA_VERSION,
  createDefaultMacroDefinition,
  MacroEventType,
  MouseButton,
  OverlayCardOverride,
} from '../../../contracts/src/index.js';

import { MacroLibraryStore } from './library-store.js';
import { recoverInterruptedWrite } from '../atomic/atomic-file.js';
import { MAXIMUM_FOLDER_DEPTH } from './constants.js';

describe('MacroLibraryStore (storage-library)', () => {
  let root: string;
  let store: MacroLibraryStore;

  beforeEach(() => {
    root = MacroLibraryStore.createTemporaryRoot();
    store = new MacroLibraryStore(root);
  });

  afterEach(() => {
    MacroLibraryStore.deleteTemporaryRoot(root);
  });

  // --- ---
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

  // --- ---
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

    // Assert temporary write file (.tmp) does not remain after save
    const tempFile = path.join(store.macrosPath, `${macro.id.replace(/-/g, '')}.macro.json.tmp`);
    expect(fs.existsSync(tempFile)).toBe(false);

    // Verify wire JSON has PascalCase properties
    const savedFile = path.join(store.macrosPath, 'roundtrip.macro.json');
    expect(fs.existsSync(savedFile)).toBe(true);
    const text = fs.readFileSync(savedFile, 'utf-8');
    const json = JSON.parse(text);
    expect(json.SchemaVersion).toBe(12);
    expect(json.Name).toBe('roundtrip');
    expect(json.Events[0].TimeMicroseconds).toBe(42_000);
    expect(json.Hotkey.MouseButton).toBe('X2');
    expect(json.Hotkey.Control).toBe(true);
  });

  // --- ---
  it('Store_KeepsNamesUniqueAndNamesFilesAfterMacros', async () => {
    const first = createDefaultMacroDefinition({ name: 'combo' });
    const second = createDefaultMacroDefinition({ name: 'combo' });

    await store.save(first);
    await store.save(second);

    expect(first.name).toBe('combo');
    expect(second.name).toBe('combo 2');

    expect(fs.existsSync(path.join(store.macrosPath, 'combo.macro.json'))).toBe(true);
    expect(fs.existsSync(path.join(store.macrosPath, 'combo 2.macro.json'))).toBe(true);

    // Rename second macro and re-save: old file combo 2.macro.json deleted, another.macro.json created
    (second as { name: string }).name = 'another';
    await store.save(second);

    expect(fs.existsSync(path.join(store.macrosPath, 'combo 2.macro.json'))).toBe(false);
    expect(fs.existsSync(path.join(store.macrosPath, 'another.macro.json'))).toBe(true);
  });

  // --- ---
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

  // --- ---
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

  // --- ---
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

  // --- Success Criteria: Unknown Fields Forward-Compatibility ---
  it('preserves unrelated unknown fields across load and save', async () => {
    const rawJson = {
      SchemaVersion: 12,
      Id: crypto.randomUUID(),
      Name: 'UnknownFieldsMacro',
      Folder: '',
      ModifiedAt: '2026-09-11T00:00:00+00:00',
      Events: [],
      FutureSchemaAdditions: {
        aiAssistedOptimization: true,
        targetEngineVersion: '2.5.0',
      },
      CustomUnknownTag: 'ExperimentalFeatureAlpha',
    };

    const filePath = path.join(store.macrosPath, 'UnknownFieldsMacro.macro.json');
    fs.mkdirSync(store.macrosPath, { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(rawJson, null, 2));

    const loaded = await store.loadAll();
    expect(loaded).toHaveLength(1);
    const macro = loaded[0]!;

    expect(macro.unknownFields).toBeDefined();
    expect(macro.unknownFields?.['FutureSchemaAdditions']).toEqual({
      aiAssistedOptimization: true,
      targetEngineVersion: '2.5.0',
    });
    expect(macro.unknownFields?.['CustomUnknownTag']).toBe('ExperimentalFeatureAlpha');

    // Modify a standard field and save
    (macro as { description: string }).description = 'Updated description';
    await store.save(macro);

    const savedText = fs.readFileSync(filePath, 'utf-8');
    const savedJson = JSON.parse(savedText);

    expect(savedJson.Description).toBe('Updated description');
    expect(savedJson.FutureSchemaAdditions).toEqual({
      aiAssistedOptimization: true,
      targetEngineVersion: '2.5.0',
    });
    expect(savedJson.CustomUnknownTag).toBe('ExperimentalFeatureAlpha');
  });

  // --- Success Criteria: Power-Loss Simulation ---
  it('power-loss simulation never leaves both current and recovery copy invalid', async () => {
    const macro = createDefaultMacroDefinition({ name: 'power-loss-test' });
    await store.save(macro);

    const macroFile = path.join(store.macrosPath, 'power-loss-test.macro.json');
    expect(fs.existsSync(macroFile)).toBe(true);

    // Save update 2
    (macro as { description: string }).description = 'Version 2';
    await store.save(macro);

    const backupFile = `${macroFile}.bak`;
    expect(fs.existsSync(backupFile)).toBe(true);

    // Simulate power loss that corrupts the target file
    fs.writeFileSync(macroFile, '{"truncated": true, ');

    // Current is corrupted, but recovery copy (.bak) is valid
    const recovery = await recoverInterruptedWrite(macroFile);
    expect(recovery.recovered).toBe(true);

    const recoveredJson = JSON.parse(fs.readFileSync(macroFile, 'utf-8'));
    expect(recoveredJson.Name).toBe('power-loss-test');
  });

  // --- Success Criteria: Path Escape Rejection ---
  it('rejects path escape attempts outside the library root', () => {
    expect(() => store.resolveFolderPath('../outside')).toThrow('Path escape rejected');
    expect(() => store.resolveFolderPath('..\\..\\Windows\\System32')).toThrow(
      'Path escape rejected',
    );
  });

  // --- Success Criteria: Max Folder Depth ---
  it('enforces maximum folder nesting depth of 8 levels', async () => {
    let current = '';
    for (let i = 1; i <= MAXIMUM_FOLDER_DEPTH; i++) {
      current = await store.createFolder(current, `Level${i}`);
    }

    // Creating a 9th level must throw error
    await expect(store.createFolder(current, 'Level9')).rejects.toThrow(
      'Folders are nested too deeply: 8 levels maximum.',
    );
  });

  // --- Trash and Restore Workflows ---
  it('moves macro to trash and restores it with unique naming', async () => {
    const macro = createDefaultMacroDefinition({ name: 'trash-me' });
    await store.save(macro);

    const filePath = path.join(store.macrosPath, 'trash-me.macro.json');
    expect(fs.existsSync(filePath)).toBe(true);

    const token = await store.delete(macro);
    expect(token).toBeTruthy();
    expect(fs.existsSync(filePath)).toBe(false);
    expect(fs.existsSync(token)).toBe(true);

    // Create another macro with the same name before restoring
    const conflict = createDefaultMacroDefinition({ name: 'trash-me' });
    await store.save(conflict);

    // Restore from trash: should be restored as "trash-me 2"
    const restored = await store.restoreMacro(token, '', 'trash-me');
    expect(restored).toBe(true);
    expect(fs.existsSync(path.join(store.macrosPath, 'trash-me.macro.json'))).toBe(true);
    expect(fs.existsSync(path.join(store.macrosPath, 'trash-me 2.macro.json'))).toBe(true);
  });

  it('moves folder to trash and restores it', async () => {
    const folder = await store.createFolder('', 'TrashFolder');
    const macro = createDefaultMacroDefinition({ name: 'nested', folder });
    await store.save(macro);

    const token = await store.deleteFolder(folder);
    expect(token).toBeTruthy();
    expect(fs.existsSync(path.join(store.macrosPath, 'TrashFolder'))).toBe(false);
    expect(fs.existsSync(token)).toBe(true);

    const restored = await store.restoreFolder(token, 'TrashFolder');
    expect(restored).toBe(true);
    expect(fs.existsSync(path.join(store.macrosPath, 'TrashFolder', 'nested.macro.json'))).toBe(
      true,
    );
  });

  it('cleans up trash entries older than threshold', async () => {
    const macro = createDefaultMacroDefinition({ name: 'old-trash' });
    await store.save(macro);
    const token = await store.delete(macro);
    expect(token).toBeTruthy();

    const slotDir = path.dirname(token);
    // Backdate slot folder
    const pastTime = (Date.now() - 100_000) / 1000;
    fs.utimesSync(slotDir, pastTime, pastTime);

    const cleaned = await store.cleanupTrash(50_000);
    expect(cleaned).toBeGreaterThanOrEqual(1);
    expect(fs.existsSync(slotDir)).toBe(false);
  });

  // --- Recovery Fixture: Corrupted Syntax File Stays in Place ---
  it('leaves corrupted macro syntax error files in place on disk for recovery', async () => {
    fs.mkdirSync(store.macrosPath, { recursive: true });
    const corruptPath = path.join(store.macrosPath, 'corrupted.macro.json');
    const corruptSyntax = '{\n  "SchemaVersion": 12,\n  "Name": "Damaged syntax,\n  "Events": [\n';
    fs.writeFileSync(corruptPath, corruptSyntax);

    const validMacro = createDefaultMacroDefinition({ name: 'valid' });
    await store.save(validMacro);

    const loaded = await store.loadAll();
    expect(loaded).toHaveLength(1);
    expect(loaded[0]?.name).toBe('valid');

    // Corrupted file must still exist on disk untouched
    expect(fs.existsSync(corruptPath)).toBe(true);
    expect(fs.readFileSync(corruptPath, 'utf-8')).toBe(corruptSyntax);
  });

  // --- Recovery Fixture: Duplicate IDs ---
  it('disambiguates duplicate IDs and names matching duplicate-ids.expected.json', async () => {
    fs.mkdirSync(store.macrosPath, { recursive: true });
    const dupId = '88888888-8888-8888-8888-888888888888';

    const file1 = path.join(store.macrosPath, 'macro-1.macro.json');
    const file2 = path.join(store.macrosPath, 'macro-2-same-id.macro.json');

    const macro1Data = {
      SchemaVersion: 12,
      Id: dupId,
      Name: 'Original Macro',
      Folder: '',
      ModifiedAt: '2026-09-11T00:00:00+00:00',
      Events: [],
    };
    const macro2Data = {
      SchemaVersion: 12,
      Id: dupId,
      Name: 'Original Macro',
      Folder: '',
      ModifiedAt: '2026-09-11T00:00:00+00:00',
      Events: [],
    };

    fs.writeFileSync(file1, JSON.stringify(macro1Data, null, 2));
    fs.writeFileSync(file2, JSON.stringify(macro2Data, null, 2));

    const loaded = await store.loadAll();
    expect(loaded).toHaveLength(2);

    const first = loaded.find((m) => m.name === 'Original Macro');
    const second = loaded.find((m) => m.name === 'Original Macro 2');

    expect(first).toBeDefined();
    expect(first?.id).toBe(dupId);

    expect(second).toBeDefined();
    expect(second?.id).not.toBe(dupId);
  });

  // --- Recovery Fixture: Folder Tree and Macro Counts ---
  it('loads folder hierarchy and counts matching folder-tree.expected.json', async () => {
    // Structure:
    // RootMacro (root)
    // Gaming/Combo
    // Gaming/Shooter/Aim
    // Work/Email
    // Work/Daily/Report

    await store.save(createDefaultMacroDefinition({ name: 'RootMacro' }));
    await store.save(createDefaultMacroDefinition({ name: 'Combo', folder: 'Gaming' }));
    await store.save(createDefaultMacroDefinition({ name: 'Aim', folder: 'Gaming/Shooter' }));
    await store.save(createDefaultMacroDefinition({ name: 'Email', folder: 'Work' }));
    await store.save(createDefaultMacroDefinition({ name: 'Report', folder: 'Work/Daily' }));

    const info = await store.getFolderTreeInfo();

    expect(info.folders.map((f) => f.replace(/\\/g, '/'))).toEqual([
      'Gaming',
      'Gaming/Shooter',
      'Work',
      'Work/Daily',
    ]);

    expect(info.macroCounts['']).toBe(5);
    expect(info.macroCounts['Gaming']).toBe(2);
    expect(info.macroCounts['Gaming/Shooter']).toBe(1);
    expect(info.macroCounts['Work']).toBe(2);
    expect(info.macroCounts['Work/Daily']).toBe(1);
  });

  // --- Safe Custom Library Roots: Copy Library ---
  it('copies library safely to new location and rejects if destination is inside source', async () => {
    await store.save(createDefaultMacroDefinition({ name: 'Root macro' }));
    await store.save(createDefaultMacroDefinition({ name: 'Nested', folder: 'Games' }));

    const destRoot = MacroLibraryStore.createTemporaryRoot();
    try {
      await store.copyLibrary(destRoot);

      const destStore = new MacroLibraryStore(destRoot);
      const loaded = await destStore.loadAll();
      expect(loaded).toHaveLength(2);

      const namesAndFolders = loaded.map((m) => ({
        name: m.name,
        folder: m.folder.replace(/\\/g, '/'),
      }));
      expect(namesAndFolders).toContainEqual({ name: 'Root macro', folder: '' });
      expect(namesAndFolders).toContainEqual({ name: 'Nested', folder: 'Games' });

      // Attempting to copy into a subfolder of source must be rejected
      const insideDest = path.join(root, 'Macros', 'InsideTarget');
      await expect(store.copyLibrary(insideDest)).rejects.toThrow(
        'The new folder is inside the current library.',
      );
    } finally {
      MacroLibraryStore.deleteTemporaryRoot(destRoot);
    }
  });

  // --- Folder Rename and Case-only Rename ---
  it('renames folders and allows case-only renames without numeric suffixes', async () => {
    const original = await store.createFolder('', 'myfolder');
    expect(original).toBe('myfolder');

    // Case-only rename
    const caseOnly = await store.renameFolder('myfolder', 'MyFolder');
    expect(caseOnly).toBe('MyFolder');

    // Standard rename
    const renamed = await store.renameFolder('MyFolder', 'RenamedFolder');
    expect(renamed).toBe('RenamedFolder');

    const folders = await store.loadFolders();
    expect(folders).toEqual(['RenamedFolder']);
  });
});
