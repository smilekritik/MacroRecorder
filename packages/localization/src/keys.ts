import ruCatalogJson from './catalogs/ru.json';

export type KnownLocalizationKey = keyof typeof ruCatalogJson;

/**
 * LocalizationKey represents all known English source keys migrated from the
 * legacy catalog, with a fallback union that allows arbitrary string keys
 * while preserving full IDE auto-completion.
 */
export type LocalizationKey = KnownLocalizationKey | (string & {});

export const LOCALIZATION_KEYS: readonly string[] = Object.keys(ruCatalogJson);
