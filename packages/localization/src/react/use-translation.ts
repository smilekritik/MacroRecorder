import { useLocalization } from './use-localization.js';
import type { LanguageCode } from '../types.js';

export interface UseTranslationResult {
  readonly t: (key: string) => string;
  readonly format: (key: string, ...args: readonly unknown[]) => string;
  readonly language: LanguageCode;
  readonly isRussian: boolean;
  readonly isEnglish: boolean;
}

export function useTranslation(): UseTranslationResult {
  const { t, format, language, isRussian, isEnglish } = useLocalization();
  return { t, format, language, isRussian, isEnglish };
}
