import React from 'react';
import { LocalizationContext, type LocalizationContextValue } from './context.js';
import { localizationManager, LocalizationManager } from '../manager.js';
import type { LanguageCode } from '../types.js';

export interface LocalizationProviderProps {
  readonly children?: React.ReactNode;
  readonly initialLanguage?: LanguageCode;
  readonly manager?: LocalizationManager;
  readonly syncAcrossWindows?: boolean;
  readonly channelName?: string;
}

export interface WindowSyncOptions {
  readonly manager?: LocalizationManager;
  readonly channelName?: string;
  readonly onLanguageChange?: (language: LanguageCode) => void;
}

export interface WindowSyncHandle {
  readonly broadcast: (language: LanguageCode) => void;
  readonly close: () => void;
}

export const DEFAULT_CHANNEL_NAME = 'macro-recorder:localization';

/**
 * Sets up live cross-window synchronization via BroadcastChannel.
 * When language is updated in one window, all other open windows update without restarting.
 */
export function setupWindowLocalizationSync(options: WindowSyncOptions = {}): WindowSyncHandle {
  const manager = options.manager ?? localizationManager;
  const channelName = options.channelName ?? DEFAULT_CHANNEL_NAME;

  if (typeof BroadcastChannel === 'undefined') {
    return {
      broadcast: () => {},
      close: () => {},
    };
  }

  let channel: BroadcastChannel | null = null;
  try {
    channel = new BroadcastChannel(channelName);
    channel.onmessage = (event: MessageEvent) => {
      if (
        event.data &&
        typeof event.data === 'object' &&
        event.data.type === 'LANGUAGE_CHANGED' &&
        typeof event.data.language === 'string'
      ) {
        const remoteLang = event.data.language as LanguageCode;
        if (remoteLang !== manager.currentLanguage) {
          manager.setLanguage(remoteLang);
          options.onLanguageChange?.(remoteLang);
        }
      }
    };
  } catch {
    // In non-browser environments or unsupported environments, gracefully ignore
  }

  return {
    broadcast: (language: LanguageCode) => {
      if (channel) {
        try {
          channel.postMessage({
            type: 'LANGUAGE_CHANGED',
            language,
          });
        } catch {
          // Graceful fallback
        }
      }
    },
    close: () => {
      if (channel) {
        channel.close();
        channel = null;
      }
    },
  };
}

export const LocalizationProvider: React.FC<LocalizationProviderProps> = ({
  children,
  initialLanguage,
  manager = localizationManager,
  syncAcrossWindows = true,
  channelName = DEFAULT_CHANNEL_NAME,
}) => {
  const [language, setLanguageState] = React.useState<LanguageCode>(() => {
    if (initialLanguage) {
      manager.setLanguage(initialLanguage);
      return initialLanguage;
    }
    return manager.currentLanguage;
  });

  // Cross-window broadcast channel ref
  const syncHandleRef = React.useRef<WindowSyncHandle | null>(null);

  // Synchronize internal manager events to React state
  React.useEffect(() => {
    const unsubscribe = manager.subscribe((newLang) => {
      setLanguageState(newLang);
    });
    return unsubscribe;
  }, [manager]);

  // Set up BroadcastChannel to update every open renderer window without restart
  React.useEffect(() => {
    if (!syncAcrossWindows) {
      return;
    }

    const syncHandle = setupWindowLocalizationSync({
      manager,
      channelName,
      onLanguageChange: (newLang) => {
        setLanguageState(newLang);
      },
    });
    syncHandleRef.current = syncHandle;

    return () => {
      syncHandle.close();
      syncHandleRef.current = null;
    };
  }, [channelName, manager, syncAcrossWindows]);

  const setLanguage = React.useCallback(
    (code: string | LanguageCode) => {
      manager.setLanguage(code);
      const newLang = manager.currentLanguage;
      setLanguageState(newLang);

      // Broadcast to other open windows so they update immediately without restart
      if (syncAcrossWindows && syncHandleRef.current) {
        syncHandleRef.current.broadcast(newLang);
      }
    },
    [manager, syncAcrossWindows],
  );

  const t = React.useCallback((key: string) => manager.translate(key), [manager, language]);

  const format = React.useCallback(
    (key: string, ...args: readonly unknown[]) => manager.format(key, ...args),
    [manager, language],
  );

  const contextValue: LocalizationContextValue = React.useMemo(
    () => ({
      language,
      setLanguage,
      t,
      format,
      languages: manager.languages,
      isRussian: language === 'ru',
      isEnglish: language === 'en',
    }),
    [language, setLanguage, t, format, manager.languages],
  );

  return React.createElement(LocalizationContext.Provider, { value: contextValue }, children);
};
