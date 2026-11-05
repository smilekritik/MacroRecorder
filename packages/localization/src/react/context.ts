import React from 'react';
import type { LanguageCode, LanguageOption } from '../types.js';

export interface LocalizationContextValue {
  readonly language: LanguageCode;
  readonly setLanguage: (code: string | LanguageCode) => void;
  readonly t: (key: string) => string;
  readonly format: (key: string, ...args: readonly unknown[]) => string;
  readonly languages: readonly LanguageOption[];
  readonly isRussian: boolean;
  readonly isEnglish: boolean;
}

export const LocalizationContext = React.createContext<LocalizationContextValue | null>(null);
