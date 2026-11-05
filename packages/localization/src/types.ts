export type LanguageCode = 'en' | 'ru';

export interface LanguageOption {
  readonly code: LanguageCode;
  readonly displayName: string;
}

export const SUPPORTED_LANGUAGES: readonly LanguageOption[] = [
  { code: 'ru', displayName: 'Русский' },
  { code: 'en', displayName: 'English' },
] as const;

export const DEFAULT_LANGUAGE: LanguageCode = 'en';

export type TranslationCatalog = Readonly<Record<string, string>>;

export type TranslationFunction = (key: string) => string;

export type FormatFunction = (key: string, ...args: readonly unknown[]) => string;

export type LanguageChangeListener = (language: LanguageCode) => void;

export type Unsubscribe = () => void;

export interface PlaceholderValidationResult {
  readonly valid: boolean;
  readonly keyPlaceholders: readonly number[];
  readonly translationPlaceholders: readonly number[];
  readonly missingInTranslation: readonly number[];
  readonly extraInTranslation: readonly number[];
}

export interface ExtractedKeyLocation {
  readonly file: string;
  readonly line: number;
  readonly column: number;
}

export interface ExtractedKeyInfo {
  readonly key: string;
  readonly file: string;
  readonly line: number;
  readonly column: number;
  readonly sourceSnippet?: string;
}

export interface MissingKeyReport {
  readonly key: string;
  readonly occurrences: readonly ExtractedKeyLocation[];
}

export interface ArityMismatchReport {
  readonly key: string;
  readonly translation: string;
  readonly keyPlaceholders: readonly number[];
  readonly translationPlaceholders: readonly number[];
}

export interface CoverageReport {
  readonly totalCatalogKeys: number;
  readonly emptyCatalogKeys: readonly string[];
  readonly referencedKeysCount: number;
  readonly missingKeys: readonly MissingKeyReport[];
  readonly arityMismatches: readonly ArityMismatchReport[];
  readonly isValid: boolean;
}
