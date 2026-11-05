import * as fs from 'node:fs';
import { describe, expect, it } from 'vitest';

import { MacroEventType } from '../../../packages/contracts/src/index.js';
import { importMacro } from '../../../packages/import-export/src/import/dispatcher.js';
import { LibraryBackupImporter } from '../../../packages/import-export/src/import/library-backup-importer.js';
import { ImportProbe } from '../../../packages/import-export/src/import/probe.js';

import { getFixturePath, loadFixtureJson, IMPORTER_FIXTURES } from '../../fixtures/index.js';

describe('Suite 03: Importers (All 10 Supported Formats)', () => {
  // 1. NativeJson (.macro.json, .json)
  it('1. NativeJson importer produces canonical expected macro and warnings', () => {
    const filePath = getFixturePath(IMPORTER_FIXTURES.NATIVE_JSON);
    const result = importMacro(filePath, 'sample');
    const expected = loadFixtureJson<Record<string, unknown>>(IMPORTER_FIXTURES.NATIVE_JSON_EXPECTED);
    const expectedWarnings = loadFixtureJson<string[]>(IMPORTER_FIXTURES.NATIVE_JSON_WARNINGS);

    expect(result.macros).toHaveLength(1);
    const macro = result.macros[0]!;
    expect(macro.name).toBe(expected['Name']);
    expect(macro.description).toBe(expected['Description']);
    expect(macro.isEnabled).toBe(false); // Never enabled on import

    const expectedEvents = expected['Events'] as Record<string, unknown>[];
    expect(macro.events.length).toBe(expectedEvents.length);
    for (let i = 0; i < expectedEvents.length; i++) {
      const exp = expectedEvents[i]!;
      const act = macro.events[i] as unknown as Record<string, unknown>;
      expect(act['timeMicroseconds']).toBe(exp['TimeMicroseconds']);
      expect(act['type']).toBe(exp['Type']);
      if ('VirtualKey' in exp) {
        expect(act['virtualKey']).toBe(exp['VirtualKey']);
      }
    }

    expect(result.warnings.map((w) => w.message)).toEqual(expectedWarnings);
  });

  // 2. LegacyJson (.json)
  it('2. LegacyJson importer produces canonical expected macro and warnings', () => {
    const filePath = getFixturePath(IMPORTER_FIXTURES.LEGACY_JSON);
    const result = importMacro(filePath, 'sample-legacy');
    const expected = loadFixtureJson<Record<string, unknown>>(IMPORTER_FIXTURES.LEGACY_JSON_EXPECTED);
    const expectedWarnings = loadFixtureJson<string[]>(IMPORTER_FIXTURES.LEGACY_JSON_WARNINGS);

    expect(result.macros).toHaveLength(1);
    const macro = result.macros[0]!;
    expect(macro.name).toBe(expected['Name']);
    expect(macro.isEnabled).toBe(false);

    const expectedEvents = expected['Events'] as Record<string, unknown>[];
    expect(macro.events.length).toBe(expectedEvents.length);
    for (let i = 0; i < expectedEvents.length; i++) {
      const exp = expectedEvents[i]!;
      const act = macro.events[i] as unknown as Record<string, unknown>;
      expect(act['timeMicroseconds']).toBe(exp['TimeMicroseconds']);
      expect(act['type']).toBe(exp['Type']);
      if ('VirtualKey' in exp) {
        expect(act['virtualKey']).toBe(exp['VirtualKey']);
      }
      if ('ScanCode' in exp) {
        expect(act['scanCode']).toBe(exp['ScanCode']);
      }
      if ('Button' in exp) {
        expect(act['button']).toBe(exp['Button']);
      }
    }

    expect(result.warnings.map((w) => w.message)).toEqual(expectedWarnings);
  });

  // 3. AutoHotkey (.ahk) - Sample
  it('3. AutoHotkey importer produces canonical expected macro and warnings', () => {
    const filePath = getFixturePath(IMPORTER_FIXTURES.AUTOHOTKEY);
    const result = importMacro(filePath, 'sample');
    const expected = loadFixtureJson<Record<string, unknown>>(IMPORTER_FIXTURES.AUTOHOTKEY_EXPECTED);
    const expectedWarnings = loadFixtureJson<string[]>(IMPORTER_FIXTURES.AUTOHOTKEY_WARNINGS);

    expect(result.macros).toHaveLength(1);
    const macro = result.macros[0]!;
    expect(macro.isEnabled).toBe(false);

    const expHotkey = expected['Hotkey'] as Record<string, unknown>;
    expect(macro.hotkey.mouseButton).toBe(expHotkey['MouseButton']);

    const expectedEvents = expected['Events'] as Record<string, unknown>[];
    expect(macro.events.length).toBe(expectedEvents.length);
    for (let i = 0; i < expectedEvents.length; i++) {
      const exp = expectedEvents[i]!;
      const act = macro.events[i] as unknown as Record<string, unknown>;
      expect(act['timeMicroseconds']).toBe(exp['TimeMicroseconds']);
      expect(act['type']).toBe(exp['Type']);
      if ('VirtualKey' in exp) {
        expect(act['virtualKey']).toBe(exp['VirtualKey']);
      }
      if ('Button' in exp) {
        expect(act['button']).toBe(exp['Button']);
      }
    }

    expect(result.warnings.map((w) => w.message)).toEqual(expectedWarnings);
  });

  // 4. AutoHotkey (.ahk) - Comments
  it('4. AutoHotkey comments script preserves comments and action comments', () => {
    const filePath = getFixturePath(IMPORTER_FIXTURES.AUTOHOTKEY_COMMENTS);
    const result = importMacro(filePath, 'comments');
    const expected = loadFixtureJson<Record<string, unknown>>(IMPORTER_FIXTURES.AUTOHOTKEY_COMMENTS_EXPECTED);
    const expectedWarnings = loadFixtureJson<string[]>(IMPORTER_FIXTURES.AUTOHOTKEY_COMMENTS_WARNINGS);

    expect(result.macros).toHaveLength(1);
    const macro = result.macros[0]!;
    expect(macro.name).toBe(expected['Name']);

    const comments = macro.events
      .filter((e) => e.type === MacroEventType.Comment)
      .map((e) => (e as unknown as Record<string, unknown>)['text']);
    expect(comments).toEqual(expected['Comments']);

    const actionWithComment = macro.events.find(
      (e) => e.comment !== undefined && e.comment !== null && e.comment !== '',
    );
    expect(actionWithComment?.comment).toBe(expected['ActionComment']);

    const maxTime = Math.max(...macro.events.map((e) => e.timeMicroseconds));
    expect(maxTime).toBe(expected['DurationMicroseconds']);

    expect(result.warnings.map((w) => w.message)).toEqual(expectedWarnings);
  });

  // 5. AMC (.amc)
  it('5. AMC importer produces canonical expected macro and warnings', () => {
    const filePath = getFixturePath(IMPORTER_FIXTURES.AMC);
    const result = importMacro(filePath, 'sample');
    const expected = loadFixtureJson<Record<string, unknown>>(IMPORTER_FIXTURES.AMC_EXPECTED);
    const expectedWarnings = loadFixtureJson<string[]>(IMPORTER_FIXTURES.AMC_WARNINGS);

    expect(result.macros).toHaveLength(1);
    const macro = result.macros[0]!;
    expect(macro.name).toBe(expected['Name']);
    expect(macro.description).toBe(expected['Description']);
    expect(macro.isEnabled).toBe(false);
    const duration = Math.max(0, ...macro.events.map((e) => e.timeMicroseconds));
    expect(duration).toBe(expected['DurationMicroseconds']);

    const expectedEvents = expected['Events'] as Record<string, unknown>[];
    expect(macro.events.length).toBe(expectedEvents.length);
    for (let i = 0; i < expectedEvents.length; i++) {
      const exp = expectedEvents[i]!;
      const act = macro.events[i] as unknown as Record<string, unknown>;
      expect(act['timeMicroseconds']).toBe(exp['TimeMicroseconds']);
      expect(act['type']).toBe(exp['Type']);
      if ('VirtualKey' in exp) {
        expect(act['virtualKey']).toBe(exp['VirtualKey']);
      }
      if ('Button' in exp) {
        expect(act['button']).toBe(exp['Button']);
      }
    }

    expect(result.warnings.map((w) => w.message)).toEqual(expectedWarnings);
  });

  // 6. JitBit MRF (.mrf)
  it('6. JitBit MRF importer produces canonical expected macro and warnings', () => {
    const filePath = getFixturePath(IMPORTER_FIXTURES.JITBIT_MRF);
    const result = importMacro(filePath, 'sample');
    const expected = loadFixtureJson<Record<string, unknown>>(IMPORTER_FIXTURES.JITBIT_MRF_EXPECTED);
    const expectedWarnings = loadFixtureJson<string[]>(IMPORTER_FIXTURES.JITBIT_MRF_WARNINGS);

    expect(result.macros).toHaveLength(1);
    const macro = result.macros[0]!;
    expect(macro.name).toBe(expected['Name']);
    expect(macro.isEnabled).toBe(false);

    const expectedEvents = expected['Events'] as Record<string, unknown>[];
    expect(macro.events.length).toBe(expectedEvents.length);
    for (let i = 0; i < expectedEvents.length; i++) {
      const exp = expectedEvents[i]!;
      const act = macro.events[i] as unknown as Record<string, unknown>;
      expect(act['timeMicroseconds']).toBe(exp['TimeMicroseconds']);
      expect(act['type']).toBe(exp['Type']);
      if ('VirtualKey' in exp) {
        expect(act['virtualKey']).toBe(exp['VirtualKey']);
      }
      if ('Button' in exp) {
        expect(act['button']).toBe(exp['Button']);
      }
      if ('DeltaX' in exp) {
        expect(act['deltaX']).toBe(exp['DeltaX']);
      }
      if ('DeltaY' in exp) {
        expect(act['deltaY']).toBe(exp['DeltaY']);
      }
      if ('Text' in exp) {
        expect(act['text']).toBe(exp['Text']);
      }
    }

    expect(result.warnings.map((w) => w.message)).toEqual(expectedWarnings);
  });

  // 7. AutoIt (.au3)
  it('7. AutoIt importer produces canonical expected macro and warnings', () => {
    const filePath = getFixturePath(IMPORTER_FIXTURES.AUTOIT);
    const result = importMacro(filePath, 'sample');
    const expected = loadFixtureJson<Record<string, unknown>>(IMPORTER_FIXTURES.AUTOIT_EXPECTED);
    const expectedWarnings = loadFixtureJson<string[]>(IMPORTER_FIXTURES.AUTOIT_WARNINGS);

    expect(result.macros).toHaveLength(1);
    const macro = result.macros[0]!;
    expect(macro.name).toBe(expected['Name']);
    expect(macro.isEnabled).toBe(false);

    const expHotkey = expected['Hotkey'] as Record<string, unknown>;
    expect(macro.hotkey.virtualKey).toBe(expHotkey['VirtualKey']);

    const expectedEvents = expected['Events'] as Record<string, unknown>[];
    expect(macro.events.length).toBe(expectedEvents.length);
    for (let i = 0; i < expectedEvents.length; i++) {
      const exp = expectedEvents[i]!;
      const act = macro.events[i] as unknown as Record<string, unknown>;
      expect(act['timeMicroseconds']).toBe(exp['TimeMicroseconds']);
      expect(act['type']).toBe(exp['Type']);
      if ('VirtualKey' in exp) {
        expect(act['virtualKey']).toBe(exp['VirtualKey']);
      }
      if ('Button' in exp) {
        expect(act['button']).toBe(exp['Button']);
      }
      if ('DeltaX' in exp) {
        expect(act['deltaX']).toBe(exp['DeltaX']);
      }
      if ('DeltaY' in exp) {
        expect(act['deltaY']).toBe(exp['DeltaY']);
      }
      if ('Text' in exp) {
        expect(act['text']).toBe(exp['Text']);
      }
    }

    expect(result.warnings.map((w) => w.message)).toEqual(expectedWarnings);
  });

  // 8. Razer (.xml)
  it('8. Razer importer produces canonical expected macro and warnings', () => {
    const filePath = getFixturePath(IMPORTER_FIXTURES.RAZER);
    const result = importMacro(filePath, 'sample');
    const expected = loadFixtureJson<Record<string, unknown>>(IMPORTER_FIXTURES.RAZER_EXPECTED);
    const expectedWarnings = loadFixtureJson<string[]>(IMPORTER_FIXTURES.RAZER_WARNINGS);

    expect(result.macros).toHaveLength(1);
    const macro = result.macros[0]!;
    expect(macro.name).toBe(expected['Name']);
    expect(macro.isEnabled).toBe(false);

    const expectedEvents = expected['Events'] as Record<string, unknown>[];
    expect(macro.events.length).toBe(expectedEvents.length);
    for (let i = 0; i < expectedEvents.length; i++) {
      const exp = expectedEvents[i]!;
      const act = macro.events[i] as unknown as Record<string, unknown>;
      expect(act['timeMicroseconds']).toBe(exp['TimeMicroseconds']);
      expect(act['type']).toBe(exp['Type']);
      if ('VirtualKey' in exp) {
        expect(act['virtualKey']).toBe(exp['VirtualKey']);
      }
      if ('Button' in exp) {
        expect(act['button']).toBe(exp['Button']);
      }
      if ('DeltaX' in exp) {
        expect(act['deltaX']).toBe(exp['DeltaX']);
      }
      if ('DeltaY' in exp) {
        expect(act['deltaY']).toBe(exp['DeltaY']);
      }
    }

    expect(result.warnings.map((w) => w.message)).toEqual(expectedWarnings);
  });

  // 9. TinyTask (.rec)
  it('9. TinyTask importer produces canonical expected macro and warnings', () => {
    const filePath = getFixturePath(IMPORTER_FIXTURES.TINYTASK);
    const result = importMacro(filePath, 'sample');
    const expected = loadFixtureJson<Record<string, unknown>>(IMPORTER_FIXTURES.TINYTASK_EXPECTED);
    const expectedWarnings = loadFixtureJson<string[]>(IMPORTER_FIXTURES.TINYTASK_WARNINGS);

    expect(result.macros).toHaveLength(1);
    const macro = result.macros[0]!;
    expect(macro.name).toBe(expected['Name']);
    expect(macro.isEnabled).toBe(false);

    const expectedEvents = expected['Events'] as Record<string, unknown>[];
    expect(macro.events.length).toBe(expectedEvents.length);
    for (let i = 0; i < expectedEvents.length; i++) {
      const exp = expectedEvents[i]!;
      const act = macro.events[i] as unknown as Record<string, unknown>;
      expect(act['timeMicroseconds']).toBe(exp['TimeMicroseconds']);
      expect(act['type']).toBe(exp['Type']);
      if ('VirtualKey' in exp) {
        expect(act['virtualKey']).toBe(exp['VirtualKey']);
      }
      if ('ScanCode' in exp) {
        expect(act['scanCode']).toBe(exp['ScanCode']);
      }
      if ('Button' in exp) {
        expect(act['button']).toBe(exp['Button']);
      }
      if ('DeltaX' in exp) {
        expect(act['deltaX']).toBe(exp['DeltaX']);
      }
      if ('DeltaY' in exp) {
        expect(act['deltaY']).toBe(exp['DeltaY']);
      }
    }

    expect(result.warnings.map((w) => w.message)).toEqual(expectedWarnings);
  });

  // 10. MacroPackage (.mrmacro)
  it('10. MacroPackage importer produces canonical expected macro and warnings', () => {
    const filePath = getFixturePath(IMPORTER_FIXTURES.MACRO_PACKAGE);
    const bytes = new Uint8Array(fs.readFileSync(filePath));
    const probe = ImportProbe.fromBytes('.mrmacro', bytes);
    const result = importMacro(probe, 'sample');
    const expected = loadFixtureJson<Record<string, unknown>>(IMPORTER_FIXTURES.MACRO_PACKAGE_EXPECTED);
    const expectedWarnings = loadFixtureJson<string[]>(IMPORTER_FIXTURES.MACRO_PACKAGE_WARNINGS);

    expect(result.macros).toHaveLength(1);
    const macro = result.macros[0]!;
    expect(macro.name).toBe(expected['name']);
    expect(macro.description).toBe(expected['description']);
    expect(macro.isEnabled).toBe(false);

    const expEvents = expected['events'] as Record<string, unknown>[];
    expect(macro.events.length).toBe(expEvents.length);
    for (let i = 0; i < expEvents.length; i++) {
      const exp = expEvents[i]!;
      const act = macro.events[i] as unknown as Record<string, unknown>;
      expect(act['timeMicroseconds']).toBe(exp['timeMicroseconds']);
      expect(act['type']).toBe(exp['type']);
      if ('pixelX' in exp) {
        expect(act['pixelX']).toBe(exp['pixelX']);
        expect(act['pixelY']).toBe(exp['pixelY']);
      }
      if ('virtualKey' in exp) {
        expect(act['virtualKey']).toBe(exp['virtualKey']);
      }
    }

    expect(result.warnings.map((w) => w.message)).toEqual(expectedWarnings);
  });

  // 11. LibraryBackup (.mrbackup)
  it('11. LibraryBackup importer produces canonical expected macro list and warnings', () => {
    const filePath = getFixturePath(IMPORTER_FIXTURES.LIBRARY_BACKUP);
    const bytes = new Uint8Array(fs.readFileSync(filePath));
    const result = LibraryBackupImporter.import(bytes, 'sample');
    const expected = loadFixtureJson<{
      macroCount: number;
      macros: { Name: string; Folder: string }[];
    }>(IMPORTER_FIXTURES.LIBRARY_BACKUP_EXPECTED);
    const expectedWarnings = loadFixtureJson<string[]>(IMPORTER_FIXTURES.LIBRARY_BACKUP_WARNINGS);

    expect(result.macroCount).toBe(expected.macroCount);
    expect(result.macros.length).toBe(expected.macros.length);

    for (let i = 0; i < expected.macros.length; i++) {
      const exp = expected.macros[i]!;
      const act = result.macros[i]!;
      expect(act.name).toBe(exp.Name);
      expect(act.folder).toBe(exp.Folder);
    }

    expect(result.warnings.map((w) => w.message)).toEqual(expectedWarnings);
  });
});
