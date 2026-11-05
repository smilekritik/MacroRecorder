// Catalogs
export { ruCatalog, enCatalog, getCatalog, isSupportedLanguage } from './catalogs/index.js';

// Keys
export { LOCALIZATION_KEYS, type LocalizationKey, type KnownLocalizationKey } from './keys.js';

// Types
export {
  SUPPORTED_LANGUAGES,
  DEFAULT_LANGUAGE,
  type LanguageCode,
  type LanguageOption,
  type TranslationCatalog,
  type TranslationFunction,
  type FormatFunction,
  type LanguageChangeListener,
  type Unsubscribe,
  type PlaceholderValidationResult,
  type ExtractedKeyInfo,
  type ExtractedKeyLocation,
  type MissingKeyReport,
  type ArityMismatchReport,
  type CoverageReport,
} from './types.js';

// Manager & Shorthands
export { LocalizationManager, localizationManager, t, format } from './manager.js';

// Format & Placeholders
export { formatPlaceholder, extractPlaceholders, validatePlaceholderArity } from './format.js';

// Native Key & Gamepad Legends
export {
  getGamepadButtonLegend,
  getGamepadAxisLegend,
  getVirtualKeyLegend,
  getMouseButtonKey,
  getMouseButtonName,
  isNonLinguisticLegend,
  type GamepadButton,
  type GamepadAxis,
  type MouseButton,
} from './legends.js';

// React & Multi-Window Integration
export {
  LocalizationContext,
  LocalizationProvider,
  setupWindowLocalizationSync,
  DEFAULT_CHANNEL_NAME,
  useLocalization,
  useTranslation,
  Tr,
  type LocalizationContextValue,
  type LocalizationProviderProps,
  type WindowSyncOptions,
  type WindowSyncHandle,
  type UseTranslationResult,
  type TrProps,
} from './react/index.js';

// Extraction
export {
  extractKeysFromContent,
  extractKeysFromDirectory,
  unescapeJsString,
  unescapeCsString,
  decodeXmlEntities,
  type ExtractDirectoryOptions,
} from './extraction/index.js';

// Coverage Checks
export { runCoverageCheck, runCli, type CoverageCheckOptions } from './checks/index.js';
