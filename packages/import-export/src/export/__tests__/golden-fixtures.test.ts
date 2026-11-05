import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';

import { exportAutoHotkeyV2 } from '../autohotkey.js';
import { buildDiagnosticSummary } from '../diagnostic-bundle.js';
import { exportDiagnosticsCsv } from '../diagnostics-csv.js';
import { exportDiagnosticsJson } from '../diagnostics-json.js';
import { exportMacroPackage } from '../macro-package.js';
import { exportNativeJson } from '../native-json.js';
import { DEFAULT_FIXED_ZIP_DATE, readZipEntry } from '../zip-writer.js';

function findFixturesDir(): string {
  const candidates = [
    path.resolve(__dirname, '../../../../../tests/fixtures/exporters'),
    path.resolve(__dirname, '../../../../../../tests/fixtures/exporters'),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return candidates[0]!;
}

const FIXTURES_DIR = findFixturesDir();

describe('Golden Compatibility Exporter Fixtures', () => {
  it('matches golden autohotkey-v2 fixture', () => {
    const sourcePath = path.join(FIXTURES_DIR, 'autohotkey-v2', 'source.macro.json');
    const expectedPath = path.join(FIXTURES_DIR, 'autohotkey-v2', 'expected.ahk');

    const source = JSON.parse(fs.readFileSync(sourcePath, 'utf8'));
    const expected = fs.readFileSync(expectedPath, 'utf8');

    const generated = exportAutoHotkeyV2(source, {
      lineEnding: expected.includes('\r\n') ? '\r\n' : '\n',
    });
    expect(generated).toBe(expected);
  });

  it('matches golden diagnostics-csv fixture', () => {
    const sourcePath = path.join(FIXTURES_DIR, 'diagnostics-csv', 'source-receipts.json');
    const expectedPath = path.join(FIXTURES_DIR, 'diagnostics-csv', 'expected.csv');

    const source = JSON.parse(fs.readFileSync(sourcePath, 'utf8'));
    const expected = fs.readFileSync(expectedPath, 'utf8');

    const generated = exportDiagnosticsCsv(source);
    expect(generated).toBe(expected);
  });

  it('matches golden diagnostics-json fixture', () => {
    const sourcePath = path.join(FIXTURES_DIR, 'diagnostics-json', 'source-receipts.json');
    const expectedPath = path.join(FIXTURES_DIR, 'diagnostics-json', 'expected.json');

    const source = JSON.parse(fs.readFileSync(sourcePath, 'utf8'));
    const expected = JSON.parse(fs.readFileSync(expectedPath, 'utf8'));

    const generatedStr = exportDiagnosticsJson(source);
    const generated = JSON.parse(generatedStr);

    expect(generated).toEqual(expected);
  });

  it('matches golden diagnostic-bundle summary fixture', () => {
    const sourcePath = path.join(FIXTURES_DIR, 'diagnostic-bundle', 'source-timing.json');
    const expectedZipPath = path.join(FIXTURES_DIR, 'diagnostic-bundle', 'expected-bundle.zip');

    const source = JSON.parse(fs.readFileSync(sourcePath, 'utf8'));
    const expectedZipBuffer = fs.readFileSync(expectedZipPath);
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
  });

  it('matches golden native-json fixture', () => {
    const sourcePath = path.join(FIXTURES_DIR, 'native-json', 'source.macro.json');
    const expectedPath = path.join(FIXTURES_DIR, 'native-json', 'expected.macro.json');

    const source = JSON.parse(fs.readFileSync(sourcePath, 'utf8'));
    const expected = JSON.parse(fs.readFileSync(expectedPath, 'utf8'));

    const generatedStr = exportNativeJson(source);
    const generated = JSON.parse(generatedStr);

    expect(generated).toEqual(expected);
  });

  it('matches golden macro-package fixture entries', () => {
    const sourcePath = path.join(FIXTURES_DIR, 'macro-package', 'source.macro.json');
    const expectedZipPath = path.join(FIXTURES_DIR, 'macro-package', 'expected.mrmacro');

    const source = JSON.parse(fs.readFileSync(sourcePath, 'utf8'));
    const expectedZipBuffer = fs.readFileSync(expectedZipPath);

    const expectedManifest = JSON.parse(
      readZipEntry(expectedZipBuffer, 'manifest.json')!.toString('utf8'),
    );
    const expectedMacro = JSON.parse(
      readZipEntry(expectedZipBuffer, 'macro.json')!.toString('utf8'),
    );

    const generatedBuffer = exportMacroPackage(source, {
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
});
