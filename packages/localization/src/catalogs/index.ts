import ruCatalogJson from './ru.json';
import enCatalogJson from './en.json';
import type { LanguageCode, TranslationCatalog } from '../types.js';

export const ruCatalog: TranslationCatalog = ruCatalogJson as Record<string, string>;
export const enCatalog: TranslationCatalog = enCatalogJson as Record<string, string>;

export function getCatalog(language: LanguageCode): TranslationCatalog {
  switch (language) {
    case 'ru':
      return ruCatalog;
    case 'en':
      return enCatalog;
    default:
      return enCatalog;
  }
}

export function isSupportedLanguage(code: string): code is LanguageCode {
  return code === 'en' || code === 'ru';
}
