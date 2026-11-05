/**
 * Golden compatibility fixture tests.
 * Validates all 10 fixture types in tests/fixtures/importers against their
 * sample.expected.json and sample.expected.warnings.json.
 */

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { MacroEventType } from '../../../../contracts/src/index.js';
import { importMacro } from '../dispatcher.js';
import { LibraryBackupImporter } from '../library-backup-importer.js';
import { ImportProbe } from '../probe.js';

function findFixturesRoot(): string {
  const candidates = [
    resolve(__dirname, '../../../../../tests/fixtures/importers'),
    resolve(__dirname, '../../../../../../tests/fixtures/importers'),
  ];
  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  return candidates[0]!;
}

const FIXTURES_ROOT = findFixturesRoot();

function readFixtureText(relPath: string): string {
  return readFileSync(resolve(FIXTURES_ROOT, relPath), 'utf-8');
}

function readFixtureBytes(relPath: string): Uint8Array {
  return new Uint8Array(readFileSync(resolve(FIXTURES_ROOT, relPath)));
}

function readFixtureJson<T>(relPath: string): T {
  return JSON.parse(readFixtureText(relPath)) as T;
}

describe('Golden Compatibility Fixtures', () => {
  it('AMC: sample.amc matches sample.expected.json and warnings', () => {
    const filePath = resolve(FIXTURES_ROOT, 'amc/sample.amc');
    const result = importMacro(filePath, 'sample');
    const expected = readFixtureJson<Record<string, unknown>>(
      'amc/sample.expected.json',
    );
    const expectedWarnings = readFixtureJson<string[]>(
      'amc/sample.expected.warnings.json',
    );

    expect(result.macros.length).toBe(1);
    const macro = result.macros[0]!;
    expect(macro.name).toBe(expected['Name']);
    expect(macro.description).toBe(expected['Description']);
    expect(macro.isEnabled).toBe(expected['IsEnabled']);
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

  it('AutoHotkey: sample.ahk matches sample.expected.json and warnings', () => {
    const filePath = resolve(FIXTURES_ROOT, 'autohotkey/sample.ahk');
    const result = importMacro(filePath, 'sample');
    const expected = readFixtureJson<Record<string, unknown>>(
      'autohotkey/sample.expected.json',
    );
    const expectedWarnings = readFixtureJson<string[]>(
      'autohotkey/sample.expected.warnings.json',
    );

    expect(result.macros.length).toBe(1);
    const macro = result.macros[0]!;
    expect(macro.isEnabled).toBe(expected['IsEnabled']);

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

  it('AutoHotkey: comments.ahk matches comments.expected.json and warnings', () => {
    const filePath = resolve(FIXTURES_ROOT, 'autohotkey/comments.ahk');
    const result = importMacro(filePath, 'comments');
    const expected = readFixtureJson<Record<string, unknown>>(
      'autohotkey/comments.expected.json',
    );
    const expectedWarnings = readFixtureJson<string[]>(
      'autohotkey/comments.expected.warnings.json',
    );

    expect(result.macros.length).toBe(1);
    const macro = result.macros[0]!;
    expect(macro.name).toBe(expected['Name']);

    const comments = macro.events
      .filter((e) => e.type === MacroEventType.Comment)
      .map((e) => e.text);
    expect(comments).toEqual(expected['Comments']);

    const actionWithComment = macro.events.find(
      (e) => e.comment !== undefined && e.comment !== null && e.comment !== '',
    );
    expect(actionWithComment?.comment).toBe(expected['ActionComment']);

    const maxTime = Math.max(...macro.events.map((e) => e.timeMicroseconds));
    expect(maxTime).toBe(expected['DurationMicroseconds']);

    expect(result.warnings.map((w) => w.message)).toEqual(expectedWarnings);
  });

  it('AutoIt: sample.au3 matches sample.expected.json and warnings', () => {
    const filePath = resolve(FIXTURES_ROOT, 'autoit/sample.au3');
    const result = importMacro(filePath, 'sample');
    const expected = readFixtureJson<Record<string, unknown>>(
      'autoit/sample.expected.json',
    );
    const expectedWarnings = readFixtureJson<string[]>(
      'autoit/sample.expected.warnings.json',
    );

    expect(result.macros.length).toBe(1);
    const macro = result.macros[0]!;
    expect(macro.name).toBe(expected['Name']);
    expect(macro.isEnabled).toBe(expected['IsEnabled']);

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

  it('Jitbit / Bartels: sample.mrf matches sample.expected.json and warnings', () => {
    const filePath = resolve(FIXTURES_ROOT, 'jitbit-mrf/sample.mrf');
    const result = importMacro(filePath, 'sample');
    const expected = readFixtureJson<Record<string, unknown>>(
      'jitbit-mrf/sample.expected.json',
    );
    const expectedWarnings = readFixtureJson<string[]>(
      'jitbit-mrf/sample.expected.warnings.json',
    );

    expect(result.macros.length).toBe(1);
    const macro = result.macros[0]!;
    expect(macro.name).toBe(expected['Name']);
    expect(macro.isEnabled).toBe(expected['IsEnabled']);

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

  it('JSON: sample-legacy.json matches expected and warnings', () => {
    const filePath = resolve(FIXTURES_ROOT, 'legacy-json/sample-legacy.json');
    const result = importMacro(filePath, 'sample-legacy');
    const expected = readFixtureJson<Record<string, unknown>>(
      'legacy-json/sample-legacy.expected.json',
    );
    const expectedWarnings = readFixtureJson<string[]>(
      'legacy-json/sample-legacy.expected.warnings.json',
    );

    expect(result.macros.length).toBe(1);
    const macro = result.macros[0]!;
    expect(macro.name).toBe(expected['Name']);
    expect(macro.isEnabled).toBe(expected['IsEnabled']);

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

  it('Native JSON: sample.macro.json matches expected and warnings', () => {
    const filePath = resolve(FIXTURES_ROOT, 'native-json/sample.macro.json');
    const result = importMacro(filePath, 'sample');
    const expected = readFixtureJson<Record<string, unknown>>(
      'native-json/sample.macro.expected.json',
    );
    const expectedWarnings = readFixtureJson<string[]>(
      'native-json/sample.macro.expected.warnings.json',
    );

    expect(result.macros.length).toBe(1);
    const macro = result.macros[0]!;
    expect(macro.name).toBe(expected['Name']);
    expect(macro.description).toBe(expected['Description']);
    expect(macro.isEnabled).toBe(expected['IsEnabled']);

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

  it('Razer: sample.xml matches sample.expected.json and warnings', () => {
    const filePath = resolve(FIXTURES_ROOT, 'razer/sample.xml');
    const result = importMacro(filePath, 'sample');
    const expected = readFixtureJson<Record<string, unknown>>(
      'razer/sample.expected.json',
    );
    const expectedWarnings = readFixtureJson<string[]>(
      'razer/sample.expected.warnings.json',
    );

    expect(result.macros.length).toBe(1);
    const macro = result.macros[0]!;
    expect(macro.name).toBe(expected['Name']);
    expect(macro.isEnabled).toBe(expected['IsEnabled']);

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

  it('TinyTask: sample.rec matches sample.expected.json and warnings', () => {
    const filePath = resolve(FIXTURES_ROOT, 'tinytask/sample.rec');
    const result = importMacro(filePath, 'sample');
    const expected = readFixtureJson<Record<string, unknown>>(
      'tinytask/sample.expected.json',
    );
    const expectedWarnings = readFixtureJson<string[]>(
      'tinytask/sample.expected.warnings.json',
    );

    expect(result.macros.length).toBe(1);
    const macro = result.macros[0]!;
    expect(macro.name).toBe(expected['Name']);
    expect(macro.isEnabled).toBe(expected['IsEnabled']);

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

  it('MacroPackage: sample.mrmacro matches sample.expected.json and warnings', () => {
    const bytes = readFixtureBytes('macro-package/sample.mrmacro');
    const probe = ImportProbe.fromBytes('.mrmacro', bytes);
    const result = importMacro(probe, 'sample');
    const expected = readFixtureJson<Record<string, unknown>>(
      'macro-package/sample.expected.json',
    );
    const expectedWarnings = readFixtureJson<string[]>(
      'macro-package/sample.expected.warnings.json',
    );

    expect(result.macros.length).toBe(1);
    const macro = result.macros[0]!;
    expect(macro.name).toBe(expected['name']);
    expect(macro.description).toBe(expected['description']);
    expect(macro.isEnabled).toBe(expected['isEnabled']);

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

  it('LibraryBackup: sample.mrbackup matches sample.expected.json and warnings', () => {
    const bytes = readFixtureBytes('library-backup/sample.mrbackup');
    const result = LibraryBackupImporter.import(bytes, 'sample');
    const expected = readFixtureJson<{
      macroCount: number;
      macros: { Name: string; Folder: string }[];
    }>('library-backup/sample.expected.json');
    const expectedWarnings = readFixtureJson<string[]>(
      'library-backup/sample.expected.warnings.json',
    );

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
