import { describe, it, expect } from 'vitest';
import {
  formatPlaceholder,
  extractPlaceholders,
  validatePlaceholderArity,
  ruCatalog,
} from '../src/index.js';

describe('format and placeholders', () => {
  describe('formatPlaceholder', () => {
    it('returns empty string for empty template', () => {
      expect(formatPlaceholder('')).toBe('');
    });

    it('returns literal string unchanged when no placeholders exist', () => {
      expect(formatPlaceholder('Hello world')).toBe('Hello world');
    });

    it('substitutes single placeholder {0}', () => {
      expect(formatPlaceholder('Slot {0}', 1)).toBe('Slot 1');
      expect(formatPlaceholder('Could not open the page: {0}', '404')).toBe(
        'Could not open the page: 404',
      );
    });

    it('substitutes multiple placeholders {0}, {1}, {2}', () => {
      expect(
        formatPlaceholder('● Recording • {0} ms • actions: {1} • last: {2}', 1250, 14, 'Click'),
      ).toBe('● Recording • 1250 ms • actions: 14 • last: Click');
    });

    it('handles escaped braces {{ and }} properly', () => {
      expect(formatPlaceholder('{{0}}')).toBe('{0}');
      expect(formatPlaceholder('{{escaped}} {0}', 'val')).toBe('{escaped} val');
      expect(formatPlaceholder('Double {{ and }} braces')).toBe('Double { and } braces');
    });

    it('formats null or undefined argument as empty string', () => {
      expect(formatPlaceholder('Val: {0}', null)).toBe('Val: ');
      expect(formatPlaceholder('Val: {0}', undefined)).toBe('Val: ');
    });

    it('preserves placeholder when argument is not supplied', () => {
      expect(formatPlaceholder('Needs {0} and {1}', 'A')).toBe('Needs A and {1}');
    });
  });

  describe('extractPlaceholders', () => {
    it('extracts indices from template', () => {
      expect(extractPlaceholders('● Recording • {0} ms • actions: {1} • last: {2}')).toEqual([
        0, 1, 2,
      ]);
      expect(extractPlaceholders('{2} then {0} and {1}')).toEqual([0, 1, 2]);
      expect(extractPlaceholders('No placeholders')).toEqual([]);
    });

    it('ignores escaped {{ and }}', () => {
      expect(extractPlaceholders('{{0}} and {1}')).toEqual([1]);
      expect(extractPlaceholders('{{not a placeholder}}')).toEqual([]);
    });
  });

  describe('validatePlaceholderArity', () => {
    it('validates matching arity', () => {
      const res = validatePlaceholderArity(
        '● Recording • {0} ms • actions: {1} • last: {2}',
        '● Запись • {0} мс • действий: {1} • последнее: {2}',
      );
      expect(res.valid).toBe(true);
      expect(res.missingInTranslation).toEqual([]);
      expect(res.extraInTranslation).toEqual([]);
    });

    it('detects missing placeholder in translation', () => {
      const res = validatePlaceholderArity('Key with {0} and {1}', 'Key with only {0}');
      expect(res.valid).toBe(false);
      expect(res.missingInTranslation).toEqual([1]);
      expect(res.extraInTranslation).toEqual([]);
    });

    it('detects unexpected placeholder in translation', () => {
      const res = validatePlaceholderArity('Key with {0}', 'Key with {0} and {1}');
      expect(res.valid).toBe(false);
      expect(res.missingInTranslation).toEqual([]);
      expect(res.extraInTranslation).toEqual([1]);
    });

    it('validates all 905 entries in migrated ruCatalog have matching arity', () => {
      const failures: { key: string; translation: string }[] = [];
      for (const [key, translation] of Object.entries(ruCatalog)) {
        const res = validatePlaceholderArity(key, translation);
        if (!res.valid) {
          failures.push({ key, translation });
        }
      }
      expect(failures).toEqual([]);
    });
  });
});
