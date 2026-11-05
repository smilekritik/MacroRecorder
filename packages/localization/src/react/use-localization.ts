import React from 'react';
import { LocalizationContext, type LocalizationContextValue } from './context.js';
import { localizationManager } from '../manager.js';
import type { LanguageCode } from '../types.js';

export function useLocalization(): LocalizationContextValue {
  const context = React.useContext(LocalizationContext);

  if (context) {
    return context;
  }

  // Fallback if rendered outside LocalizationProvider
  const fallbackLanguage = localizationManager.currentLanguage;
  return {
    language: fallbackLanguage,
    setLanguage: (code: string | LanguageCode) => localizationManager.setLanguage(code),
    t: (key: string) => localizationManager.translate(key),
    format: (key: string, ...args: readonly unknown[]) => localizationManager.format(key, ...args),
    languages: localizationManager.languages,
    isRussian: fallbackLanguage === 'ru',
    isEnglish: fallbackLanguage === 'en',
  };
}
