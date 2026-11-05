import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it, beforeEach, afterEach } from 'vitest';

import {
  createDefaultMacroDefinition,
  type TimingSummary,
} from '../../../packages/contracts/src/index.js';

import { exportAutoHotkeyV2 } from '../../../packages/import-export/src/export/autohotkey.js';
import { exportDiagnosticsCsv } from '../../../packages/import-export/src/export/diagnostics-csv.js';
import { exportDiagnosticsJson } from '../../../packages/import-export/src/export/diagnostics-json.js';
import { buildDiagnosticSummary, DiagnosticBundle } from '../../../packages/import-export/src/export/diagnostic-bundle.js';
import { exportNativeJson } from '../../../packages/import-export/src/export/native-json.js';
import { exportMacroPackage } from '../../../packages/import-export/src/export/macro-package.js';
import { DEFAULT_FIXED_ZIP_DATE, readZipEntry, readZipEntryNames } from '../../../packages/import-export/src/export/zip-writer.js';

import { MacroLibraryStore } from '../../../packages/storage/src/library/library-store.js';
import { exportLibraryBackup } from '../../../packages/storage/src/backup/library-backup.js';
import { computeBundleHash } from '../../../packages/storage/src/backup/bundle-hash.js';
import { BACKUP_EXTENSION, BACKUP_FORMAT_ID } from '../../../packages/storage/src/backup/types.js';
import { readZipArchive } from '../../../packages/storage/src/portable/zip.js';
import { LibraryBackupImporter } from '../../../packages/import-export/src/import/library-backup-importer.js';

import { LegacyMacroLibraryStoreOracle } from '../oracle/legacy-oracle.js';
import { getFixturePath, loadFixtureJson, loadFixtureText, EXPORTER_FIXTURES } from '../../fixtures/index.js';

describe('Suite 04: Exporters (All 7 Supported Formats)', () => {
  let tempRoot: string;
  let store: MacroLibraryStore;

  beforeEach(() => {
    tempRoot = MacroLibraryStore.createTemporaryRoot();
    store = new MacroLibraryStore(tempRoot);
  });

  afterEach(() => {
    MacroLibraryStore.deleteTemporaryRoot(tempRoot);
  });

  // 1. AutoHotkey v2
  it('1. AutoHotkey v2 exporter generates exact script matching canonical fixture', () => {
    const source = loadFixtureJson<Record<string, unknown>>(EXPORTER_FIXTURES.AUTOHOTKEY_SOURCE);
    const expected = loadFixtureText(EXPORTER_FIXTURES.AUTOHOTKEY_EXPECTED);

    const generated = exportAutoHotkeyV2(source as any, {
      lineEnding: expected.includes('\r\n') ? '\r\n' : '\n',
    });
    expect(generated).toBe(expected);
  });

  // 2. Diagnostics CSV
  it('2. Diagnostics CSV exporter matches canonical format and column headers', () => {
    const source = loadFixtureJson<any[]>(EXPORTER_FIXTURES.DIAGNOSTICS_CSV_SOURCE);
    const expected = loadFixtureText(EXPORTER_FIXTURES.DIAGNOSTICS_CSV_EXPECTED);

    const generated = exportDiagnosticsCsv(source);
    expect(generated).toBe(expected);
  });

  // 3. Diagnostics JSON
  it('3. Diagnostics JSON exporter matches canonical structure', () => {
    const source = loadFixtureJson<any[]>(EXPORTER_FIXTURES.DIAGNOSTICS_JSON_SOURCE);
    const expected = loadFixtureJson<any[]>(EXPORTER_FIXTURES.DIAGNOSTICS_JSON_EXPECTED);

    const generatedStr = exportDiagnosticsJson(source);
    const generated = JSON.parse(generatedStr);

    expect(generated).toEqual(expected);
  });

  // 4. Diagnostic Bundle & Strict Privacy Redaction
  it('4. Diagnostic bundle matches summary fixture and strictly redacts keystrokes and events', async () => {
    const source = loadFixtureJson<TimingSummary>(EXPORTER_FIXTURES.DIAGNOSTIC_BUNDLE_SOURCE);
    const expectedZipBuffer = fs.readFileSync(getFixturePath(EXPORTER_FIXTURES.DIAGNOSTIC_BUNDLE_EXPECTED));
    const expectedSummaryJson = readZipEntry(expectedZipBuffer, 'summary.json');
    expect(expectedSummaryJson).not.toBeNull();
    const expected = JSON.parse(expectedSummaryJson!.toString('utf8'));

    const generatedSummary = buildDiagnosticSummary(source, {
      generatedAt: expected.generatedAt,
      appVersion: '1.0.0.0',
      os: 'Microsoft Windows NT 10.0.22631.0',
      runtime: '.NET 10.0.0',
      architecture: 'X64',
    });
    expect(generatedSummary).toEqual(expected);

    // Verify bundle file creation and privacy redaction
    const bundleZipPath = path.join(tempRoot, 'diagnostic-privacy-test.zip');
    await DiagnosticBundle.create(bundleZipPath, source);

    const zipBuffer = fs.readFileSync(bundleZipPath);
    const entryNames = readZipEntryNames(zipBuffer);
    expect(entryNames).toHaveLength(1);
    expect(entryNames[0]).toBe('summary.json');

    const summaryBuffer = readZipEntry(zipBuffer, 'summary.json');
    expect(summaryBuffer).not.toBeNull();
    const content = summaryBuffer!.toString('utf8');

    expect(content).toContain('privacy');
    expect(content).not.toContain('VirtualKey');
    expect(content).not.toContain('MacroEvent');
    expect(content).not.toContain('keystroke');
    expect(content).not.toContain('inputPayload');
  });

  // 5. Native JSON
  it('5. Native JSON exporter generates semantically valid macro schema 12', () => {
    const source = loadFixtureJson<Record<string, unknown>>(EXPORTER_FIXTURES.NATIVE_JSON_SOURCE);
    const expected = loadFixtureJson<Record<string, unknown>>(EXPORTER_FIXTURES.NATIVE_JSON_EXPECTED);

    const generatedStr = exportNativeJson(source as any);
    const generated = JSON.parse(generatedStr);

    expect(generated).toEqual(expected);
  });

  // 6. Macro Package (.mrmacro)
  it('6. Macro package exporter produces standard zip layout and verified hash', () => {
    const source = loadFixtureJson<Record<string, unknown>>(EXPORTER_FIXTURES.MACRO_PACKAGE_SOURCE);
    const expectedZipBuffer = fs.readFileSync(getFixturePath(EXPORTER_FIXTURES.MACRO_PACKAGE_EXPECTED));

    const expectedManifest = JSON.parse(
      readZipEntry(expectedZipBuffer, 'manifest.json')!.toString('utf8'),
    );
    const expectedMacro = JSON.parse(
      readZipEntry(expectedZipBuffer, 'macro.json')!.toString('utf8'),
    );

    const generatedBuffer = exportMacroPackage(source as any, {
      fixedDate: DEFAULT_FIXED_ZIP_DATE,
      createdAtUtc: expectedManifest.createdAtUtc,
      sourceDpi: expectedManifest.sourceDpi,
    });

    const generatedManifest = JSON.parse(
      readZipEntry(generatedBuffer, 'manifest.json')!.toString('utf8'),
    );
    const generatedMacro = JSON.parse(
      readZipEntry(generatedBuffer, 'macro.json')!.toString('utf8'),
    );

    expect(generatedMacro).toEqual(expectedMacro);
    expect(generatedManifest.format).toBe(expectedManifest.format);
    expect(generatedManifest.formatVersion).toBe(expectedManifest.formatVersion);
    expect(generatedManifest.macroSchemaVersion).toBe(expectedManifest.macroSchemaVersion);
    expect(generatedManifest.macroEntry).toBe(expectedManifest.macroEntry);
    expect(generatedManifest.macroSha256).toBe(expectedManifest.macroSha256);
    expect(generatedManifest.sourceDpi).toBe(expectedManifest.sourceDpi);
  });

  // 7. Library Backup (.mrbackup)
  it('7. Library backup exporter matches legacy oracle bundle hash and reads cleanly', async () => {
    await store.save(createDefaultMacroDefinition({ name: 'Root macro', folder: '' }));
    await store.save(createDefaultMacroDefinition({ name: 'Nested macro', folder: 'Games' }));

    const backupPath = path.join(tempRoot, `library-export${BACKUP_EXTENSION}`);
    const exportedCount = await exportLibraryBackup(store, backupPath, { includeSettings: false });
    expect(exportedCount).toBe(2);

    const backupBuffer = fs.readFileSync(backupPath);
    const entries = readZipArchive(backupBuffer);
    expect(entries.has('manifest.json')).toBe(true);

    const manifest = JSON.parse(entries.get('manifest.json')!.toString('utf8'));
    expect(manifest.format).toBe(BACKUP_FORMAT_ID);
    expect(manifest.formatVersion).toBe(1);
    expect(manifest.macroCount).toBe(2);

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

    // Verify reading with LibraryBackupImporter
    const importResult = LibraryBackupImporter.import(new Uint8Array(backupBuffer), 'backup');
    expect(importResult.macroCount).toBe(2);
    expect(importResult.macros).toHaveLength(2);
  });
});
