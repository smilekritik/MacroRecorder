import { describe, it, expect } from 'vitest';
import {
  ruCatalog,
  enCatalog,
  getCatalog,
  isSupportedLanguage,
  SUPPORTED_LANGUAGES,
  DEFAULT_LANGUAGE,
} from '../src/index.js';

describe('catalogs', () => {
  it('contains zero empty or whitespace-only translations in Russian catalog', () => {
    const emptyKeys: string[] = [];
    for (const [key, value] of Object.entries(ruCatalog)) {
      if (!value || !value.trim()) {
        emptyKeys.push(key);
      }
    }
    expect(emptyKeys).toEqual([]);
  });

  it('enCatalog is an identity or empty map', () => {
    expect(enCatalog).toBeDefined();
    expect(typeof enCatalog).toBe('object');
  });

  it('getCatalog returns correct catalog for language', () => {
    expect(getCatalog('ru')).toBe(ruCatalog);
    expect(getCatalog('en')).toBe(enCatalog);
  });

  it('isSupportedLanguage validates supported language codes', () => {
    expect(isSupportedLanguage('ru')).toBe(true);
    expect(isSupportedLanguage('en')).toBe(true);
    expect(isSupportedLanguage('de')).toBe(false);
    expect(isSupportedLanguage('')).toBe(false);
  });

  it('SUPPORTED_LANGUAGES matches legacy Russian and English options in order', () => {
    expect(SUPPORTED_LANGUAGES).toHaveLength(2);
    expect(SUPPORTED_LANGUAGES[0]).toEqual({ code: 'ru', displayName: 'Русский' });
    expect(SUPPORTED_LANGUAGES[1]).toEqual({ code: 'en', displayName: 'English' });
    expect(DEFAULT_LANGUAGE).toBe('en');
  });
});
