export { LocalizationContext, type LocalizationContextValue } from './context.js';
export {
  LocalizationProvider,
  setupWindowLocalizationSync,
  DEFAULT_CHANNEL_NAME,
  type LocalizationProviderProps,
  type WindowSyncOptions,
  type WindowSyncHandle,
} from './provider.js';
export { useLocalization } from './use-localization.js';
export { useTranslation, type UseTranslationResult } from './use-translation.js';
export { Tr, type TrProps } from './Tr.js';
