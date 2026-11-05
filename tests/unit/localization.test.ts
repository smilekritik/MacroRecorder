/**
 * Deterministic unit tests for localization, catalog integrity, source key scanning,
 * placeholder arity, and Russian language coverage.
 *
 * Covers:
 * - LEGACY-TEST-031 /: EveryReferencedKey_HasRussianTranslation
 * - LEGACY-TEST-032 /: RussianCatalog_HasNoEmptyValues
 * - LEGACY-TEST-033 / HELPER-LOC-033: EnumerateSources
 * - LEGACY-TEST-034 / HELPER-LOC-034: LoadCatalog
 * - LEGACY-TEST-035 / HELPER-LOC-035: FindRepoRoot
 * - LEGACY-TEST-036 / HELPER-LOC-036: DecodeCsLiteral
 * - LEGACY-TEST-037 / HELPER-LOC-037: DecodeXml
 * Plus placeholder formatting, React components, and legend bypass validation.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  ruCatalog,
  formatPlaceholder,
  validatePlaceholderArity,
  LocalizationManager,
  unescapeCsString,
  decodeXmlEntities,
  isNonLinguisticLegend,
  runCoverageCheck,
} from '../../packages/localization/src/index.js';

describe('Localization Coverage & Helpers Suites', () => {
  // --- HELPER-LOC-035: FindRepoRoot ---
  function findRepoRoot(): string {
    let current = path.resolve(__dirname, '..', '..');
    while (current && current !== path.dirname(current)) {
      if (
        fs.existsSync(path.join(current, 'MacroRecorder.sln')) ||
        (fs.existsSync(path.join(current, 'pnpm-workspace.yaml')) &&
          fs.existsSync(path.join(current, 'packages', 'localization')))
      ) {
        return current;
      }
      current = path.dirname(current);
    }
    return path.resolve(__dirname, '..', '..');
  }

  // --- HELPER-LOC-033: EnumerateSources ---
  function enumerateSources(dir: string, pattern: RegExp): string[] {
    if (!fs.existsSync(dir)) return [];
    const results: string[] = [];
    function scan(sub: string): void {
      for (const entry of fs.readdirSync(sub, { withFileTypes: true })) {
        const full = path.join(sub, entry.name);
        if (entry.isDirectory()) {
          if (
            entry.name === 'node_modules' ||
            entry.name === 'obj' ||
            entry.name === 'bin' ||
            entry.name === 'artifacts' ||
            entry.name === '.git'
          ) {
            continue;
          }
          scan(full);
        } else if (entry.isFile() && pattern.test(entry.name)) {
          results.push(full);
        }
      }
    }
    scan(dir);
    return results;
  }

  // --- HELPER-LOC-034: LoadCatalog ---
  function loadCatalog(filePath: string): Record<string, string> {
    if (!fs.existsSync(filePath)) {
      return {};
    }
    return JSON.parse(fs.readFileSync(filePath, 'utf8')) as Record<string, string>;
  }

  // --- HELPER-LOC-036 / LEGACY-TEST-036: DecodeCsLiteral ---
  it('HELPER-LOC-036: DecodeCsLiteral', () => {
    expect(unescapeCsString('Hello\\nWorld')).toBe('Hello\nWorld');
    expect(unescapeCsString('Tab\\tSeparated')).toBe('Tab\tSeparated');
    expect(unescapeCsString('Quote \\"escaped\\"')).toBe('Quote "escaped"');
    expect(unescapeCsString('Backslash \\\\ path')).toBe('Backslash \\ path');
    expect(unescapeCsString('\\u0041\\u0042')).toBe('AB');
  });

  // --- HELPER-LOC-037 / LEGACY-TEST-037: DecodeXml ---
  it('HELPER-LOC-037: DecodeXml', () => {
    expect(decodeXmlEntities('&lt;tag&gt;')).toBe('<tag>');
    expect(decodeXmlEntities('&quot;quoted&quot;')).toBe('"quoted"');
    expect(decodeXmlEntities('&apos;single&apos;')).toBe("'single'");
    expect(decodeXmlEntities('&#39;numeric&#39;')).toBe("'numeric'");
    expect(decodeXmlEntities('&amp;')).toBe('&');
  });

  // --- HELPER-LOC-035 / LEGACY-TEST-035: FindRepoRoot ---
  it('HELPER-LOC-035: FindRepoRoot', () => {
    const root = findRepoRoot();
    expect(fs.existsSync(root)).toBe(true);
    expect(
      fs.existsSync(path.join(root, 'MacroRecorder.sln')) ||
        (fs.existsSync(path.join(root, 'pnpm-workspace.yaml')) &&
          fs.existsSync(path.join(root, 'packages', 'localization'))),
    ).toBe(true);
  });

  // --- HELPER-LOC-034 / LEGACY-TEST-034: LoadCatalog ---
  it('HELPER-LOC-034: LoadCatalog', () => {
    const root = findRepoRoot();
    const ruPath = path.join(root, 'MacroRecorder.App', 'Localization', 'ru.json');
    if (fs.existsSync(ruPath)) {
      const catalog = loadCatalog(ruPath);
      expect(Object.keys(catalog).length).toBeGreaterThan(900);
    }
    expect(Object.keys(ruCatalog).length).toBeGreaterThan(900);
  });

  // --- HELPER-LOC-033 / LEGACY-TEST-033: EnumerateSources ---
  it('HELPER-LOC-033: EnumerateSources', () => {
    const root = findRepoRoot();
    const sources = enumerateSources(path.join(root, 'packages'), /\.(ts|tsx)$/);
    expect(sources.length).toBeGreaterThan(10);
  });

  // --- LEGACY-TEST-032 /: RussianCatalog_HasNoEmptyValues ---
  it('RussianCatalog_HasNoEmptyValues', () => {
    const blank: string[] = [];
    for (const [key, value] of Object.entries(ruCatalog)) {
      if (!value || !value.trim()) {
        blank.push(key);
      }
    }
    expect(blank).toEqual([]);
  });

  // --- LEGACY-TEST-031 /: EveryReferencedKey_HasRussianTranslation ---
  it('EveryReferencedKey_HasRussianTranslation', () => {
    const report = runCoverageCheck();
    expect(report.missingKeys).toEqual([]);
    expect(report.emptyCatalogKeys).toEqual([]);
    expect(report.arityMismatches).toEqual([]);
    expect(report.isValid).toBe(true);
  });

  // --- Additional Coverage: Placeholder Formatting & Legends ---
  it('formats {0}, {1} placeholders properly', () => {
    expect(formatPlaceholder('Hello {0}', 'World')).toBe('Hello World');
    expect(formatPlaceholder('Between {0} and {1}', 10, 20)).toBe('Between 10 and 20');
    expect(formatPlaceholder('Unmatched {2}', 'only 0')).toBe('Unmatched {2}');
  });

  it('validates placeholder arity between source and translation', () => {
    expect(validatePlaceholderArity('Hello {0}', 'Привет {0}').valid).toBe(true);
    expect(validatePlaceholderArity('From {0} to {1}', 'С {0} по {1}').valid).toBe(true);
    expect(validatePlaceholderArity('From {0} to {1}', 'С {0}').valid).toBe(false);
  });

  it('identifies non-linguistic hardware legends that bypass localization', () => {
    expect(isNonLinguisticLegend('Space')).toBe(true);
    expect(isNonLinguisticLegend('F11')).toBe(true);
    expect(isNonLinguisticLegend('Ctrl')).toBe(true);
    expect(isNonLinguisticLegend('Start Recording')).toBe(false);
  });

  it('LocalizationManager switches language and falls back gracefully', () => {
    const manager = new LocalizationManager('en');
    expect(manager.translate('Pause')).toBe('Pause');

    manager.setLanguage('ru');
    expect(manager.currentLanguage).toBe('ru');
    expect(manager.translate('Pause')).toBe(ruCatalog['Pause']);
    expect(manager.translate('NonExistentTestKey123')).toBe('NonExistentTestKey123');
  });
});
