import { ruCatalog, enCatalog } from './catalogs/index.js';
import { formatPlaceholder } from './format.js';
import {
  DEFAULT_LANGUAGE,
  SUPPORTED_LANGUAGES,
  type LanguageCode,
  type LanguageOption,
  type LanguageChangeListener,
  type TranslationCatalog,
  type Unsubscribe,
} from './types.js';

export class LocalizationManager {
  private static _instance: LocalizationManager | null = null;

  private _currentLanguage: LanguageCode = DEFAULT_LANGUAGE;
  private _activeCatalog: TranslationCatalog = enCatalog;
  private readonly _listeners = new Set<LanguageChangeListener>();

  public constructor(initialLanguage?: LanguageCode) {
    if (initialLanguage) {
      this.setLanguage(initialLanguage);
    } else {
      this.apply(DEFAULT_LANGUAGE);
    }
  }

  public static getInstance(): LocalizationManager {
    if (!LocalizationManager._instance) {
      LocalizationManager._instance = new LocalizationManager();
    }
    return LocalizationManager._instance;
  }

  public get languages(): readonly LanguageOption[] {
    return SUPPORTED_LANGUAGES;
  }

  public get currentLanguage(): LanguageCode {
    return this._currentLanguage;
  }

  public get currentCode(): LanguageCode {
    return this._currentLanguage;
  }

  public get currentLocale(): string {
    return this.getLocale(this._currentLanguage);
  }

  public getLocale(code: LanguageCode = this._currentLanguage): string {
    return code === 'ru' ? 'ru-RU' : 'en-US';
  }

  /**
   * Applies the requested language code. English is the source language, so its
   * catalog is the identity map; other languages (e.g. Russian) load a catalog.
   */
  public apply(languageCode: string | null | undefined): void {
    const normalized: LanguageCode =
      typeof languageCode === 'string' && languageCode.trim().toLowerCase() === 'ru' ? 'ru' : 'en';

    this._currentLanguage = normalized;
    this._activeCatalog = normalized === 'ru' ? ruCatalog : enCatalog;

    this.notifyListeners();
  }

  public setLanguage(languageCode: string | LanguageCode): void {
    this.apply(languageCode);
  }

  /**
   * Translates an English source string into the target language.
   * If the language is English (source language), identity mapping is returned.
   * If a translation is missing in Russian, it falls back to identity.
   */
  public translate(source: string, lang?: LanguageCode): string {
    if (!source) {
      return '';
    }

    const targetLang = lang ?? this._currentLanguage;
    if (targetLang === 'en') {
      return source;
    }

    const catalog = targetLang === 'ru' ? ruCatalog : this._activeCatalog;
    const translated = catalog[source];
    return translated && translated.length > 0 ? translated : source;
  }

  /**
   * Translates the source key and formats format placeholders {0}, {1}, etc.
   */
  public format(source: string, ...args: readonly unknown[]): string {
    const template = this.translate(source);
    return formatPlaceholder(template, ...args);
  }

  /**
   * Alias for translate.
   */
  public t(source: string): string {
    return this.translate(source);
  }

  /**
   * Checks if a non-identity translation exists for the given source key.
   */
  public hasTranslation(source: string, lang: LanguageCode = this._currentLanguage): boolean {
    if (!source) {
      return false;
    }
    if (lang === 'en') {
      return true;
    }
    const val = ruCatalog[source];
    return typeof val === 'string' && val.length > 0;
  }

  /**
   * Subscribes a listener to language change events.
   * Returns an unsubscribe function.
   */
  public subscribe(listener: LanguageChangeListener): Unsubscribe {
    this._listeners.add(listener);
    return () => {
      this._listeners.delete(listener);
    };
  }

  private notifyListeners(): void {
    const lang = this._currentLanguage;
    for (const listener of this._listeners) {
      try {
        listener(lang);
      } catch (err) {
        console.error('Error in localization change listener:', err);
      }
    }
  }

  /**
   * Detects system language preference from the environment (Node or Browser).
   */
  public static detectSystemLanguage(): LanguageCode {
    try {
      // Browser environment
      if (typeof navigator !== 'undefined' && navigator.languages) {
        for (const lang of navigator.languages) {
          if (lang.toLowerCase().startsWith('ru')) {
            return 'ru';
          }
        }
        if (navigator.language && navigator.language.toLowerCase().startsWith('ru')) {
          return 'ru';
        }
      }

      // Node.js environment
      if (typeof process !== 'undefined' && process.env) {
        const envLang = process.env.LANG || process.env.LANGUAGE || process.env.LC_ALL || '';
        if (envLang.toLowerCase().startsWith('ru')) {
          return 'ru';
        }
      }

      // Intl fallback
      if (typeof Intl !== 'undefined' && typeof Intl.DateTimeFormat === 'function') {
        const locale = Intl.DateTimeFormat().resolvedOptions().locale;
        if (locale && locale.toLowerCase().startsWith('ru')) {
          return 'ru';
        }
      }
    } catch {
      // Ignore environment detection errors
    }

    return DEFAULT_LANGUAGE;
  }
}

export const localizationManager = LocalizationManager.getInstance();

export const t = (key: string): string => localizationManager.translate(key);

export const format = (key: string, ...args: readonly unknown[]): string =>
  localizationManager.format(key, ...args);
