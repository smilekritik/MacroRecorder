/**
 * @macro-recorder/desktop - Cross-Window State Synchronization Hook
 * Coordinates live state sync across all open BrowserWindows using BroadcastChannel.
 * Guarantees theme, language, library, macro state, and hotkeys remain in lockstep.
 */

import { useEffect, useRef, useCallback } from 'react';
import { useThemeContext } from '../state/ThemeContext.js';
import { useLocalization } from '../hooks/useLocalization.js';
import { useApi } from '../hooks/useApi.js';
import type {
  ThemeSyncPayload,
  LanguageSyncPayload,
  LanguageCode,
  LibrarySyncPayload,
  MacroStateSyncPayload,
  HotkeysSyncPayload,
} from './types.js';

export interface UseCrossWindowStateSyncOptions {
  readonly onLanguageChange?: ((payload: LanguageSyncPayload) => void) | undefined;
  readonly onLibraryChange?: ((payload: LibrarySyncPayload) => void) | undefined;
  readonly onMacroStateChange?: ((payload: MacroStateSyncPayload) => void) | undefined;
  readonly onHotkeysChange?: ((payload: HotkeysSyncPayload) => void) | undefined;
}

export function useCrossWindowStateSync(options: UseCrossWindowStateSyncOptions = {}) {
  const { mode, setMode } = useThemeContext();
  const { language, setLanguage } = useLocalization();
  const api = useApi();

  const themeChannelRef = useRef<BroadcastChannel | null>(null);
  const languageChannelRef = useRef<BroadcastChannel | null>(null);
  const libraryChannelRef = useRef<BroadcastChannel | null>(null);
  const macroStateChannelRef = useRef<BroadcastChannel | null>(null);
  const hotkeysChannelRef = useRef<BroadcastChannel | null>(null);

  // --- 1. Theme Synchronization ---
  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') return;

    try {
      const channel = new BroadcastChannel('macro-recorder:theme');
      themeChannelRef.current = channel;

      channel.onmessage = (event: MessageEvent<ThemeSyncPayload>) => {
        if (event.data && event.data.theme && event.data.theme !== mode) {
          setMode(event.data.theme);
        }
      };

      return () => {
        channel.close();
        themeChannelRef.current = null;
      };
    } catch {
      return undefined;
    }
  }, [mode, setMode]);

  const broadcastTheme = useCallback((newTheme: 'dark' | 'light' | 'system') => {
    if (themeChannelRef.current) {
      try {
        themeChannelRef.current.postMessage({
          theme: newTheme,
          timestamp: Date.now(),
        } satisfies ThemeSyncPayload);
      } catch {
        // Fallback
      }
    }
  }, []);

  // --- 2. Language Synchronization ---
  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') return;

    try {
      const channel = new BroadcastChannel('macro-recorder:language');
      languageChannelRef.current = channel;

      channel.onmessage = (event: MessageEvent<LanguageSyncPayload>) => {
        if (event.data && event.data.language && event.data.language !== language) {
          if (event.data.language === 'en' || event.data.language === 'ru') {
            setLanguage(event.data.language);
          }
          options.onLanguageChange?.(event.data);
        }
      };

      return () => {
        channel.close();
        languageChannelRef.current = null;
      };
    } catch {
      return undefined;
    }
  }, [language, setLanguage, options.onLanguageChange]);

  const broadcastLanguage = useCallback((newLanguage: LanguageCode) => {
    if (languageChannelRef.current) {
      try {
        languageChannelRef.current.postMessage({
          language: newLanguage,
          timestamp: Date.now(),
        } satisfies LanguageSyncPayload);
      } catch {
        // Fallback
      }
    }
  }, []);

  // --- 3. Macro Library Synchronization ---
  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') return;

    try {
      const channel = new BroadcastChannel('macro-recorder:library');
      libraryChannelRef.current = channel;

      channel.onmessage = (event: MessageEvent<LibrarySyncPayload>) => {
        if (event.data) {
          options.onLibraryChange?.(event.data);
        }
      };

      return () => {
        channel.close();
        libraryChannelRef.current = null;
      };
    } catch {
      return undefined;
    }
  }, [options.onLibraryChange]);

  const broadcastLibraryMutation = useCallback(
    (action: 'loaded' | 'saved' | 'deleted' | 'restored' | 'moved', macroId?: string) => {
      if (libraryChannelRef.current) {
        try {
          libraryChannelRef.current.postMessage({
            action,
            ...(macroId !== undefined ? { macroId } : {}),
            timestamp: Date.now(),
          } satisfies LibrarySyncPayload);
        } catch {
          // Fallback
        }
      }
    },
    [],
  );

  // --- 4. Macro Engine State Synchronization ---
  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') return;

    try {
      const channel = new BroadcastChannel('macro-recorder:macro-state');
      macroStateChannelRef.current = channel;

      channel.onmessage = (event: MessageEvent<MacroStateSyncPayload>) => {
        if (event.data) {
          options.onMacroStateChange?.(event.data);
        }
      };

      return () => {
        channel.close();
        macroStateChannelRef.current = null;
      };
    } catch {
      return undefined;
    }
  }, [options.onMacroStateChange]);

  const broadcastMacroState = useCallback(
    (engineState: string, activeMacroId?: string, activeMacroName?: string) => {
      if (macroStateChannelRef.current) {
        try {
          macroStateChannelRef.current.postMessage({
            engineState,
            ...(activeMacroId !== undefined ? { activeMacroId } : {}),
            ...(activeMacroName !== undefined ? { activeMacroName } : {}),
            timestamp: Date.now(),
          } satisfies MacroStateSyncPayload);
        } catch {
          // Fallback
        }
      }
    },
    [],
  );

  // --- 5. Hotkeys Synchronization ---
  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') return;

    try {
      const channel = new BroadcastChannel('macro-recorder:hotkeys');
      hotkeysChannelRef.current = channel;

      channel.onmessage = (event: MessageEvent<HotkeysSyncPayload>) => {
        if (event.data) {
          options.onHotkeysChange?.(event.data);
        }
      };

      return () => {
        channel.close();
        hotkeysChannelRef.current = null;
      };
    } catch {
      return undefined;
    }
  }, [options.onHotkeysChange]);

  const broadcastHotkeys = useCallback(
    (hotkeys: ReadonlyArray<{ readonly id: number; readonly key: string }>) => {
      if (hotkeysChannelRef.current) {
        try {
          hotkeysChannelRef.current.postMessage({
            hotkeys,
            timestamp: Date.now(),
          } satisfies HotkeysSyncPayload);
        } catch {
          // Fallback
        }
      }
    },
    [],
  );

  // --- 6. Push Subscriptions on Window Lifecycle ---
  useEffect(() => {
    const unsub = api.on('window:state-changed', (_info: unknown) => {
      // Refresh or handle remote window focus/close
    });

    return () => {
      unsub();
    };
  }, [api]);

  return {
    broadcastTheme,
    broadcastLanguage,
    broadcastLibraryMutation,
    broadcastMacroState,
    broadcastHotkeys,
  };
}
