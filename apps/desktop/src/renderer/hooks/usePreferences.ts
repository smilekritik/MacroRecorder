import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  IpcChannels,
  type AppPreferences,
} from '../../../../../packages/contracts/src/index.js';
import { useIpcQuery } from './useIpcQuery.js';
import { useIpcMutation } from './useIpcMutation.js';
import type { MacroRecorderApi } from './useApi.js';

export interface UsePreferencesOptions {
  readonly apiOverride?: MacroRecorderApi | undefined;
}

/** Longest a coalesced change waits, so a slider drag saves a few times a second at most. */
const COALESCE_MS = 150;

export function usePreferences(options: UsePreferencesOptions = {}) {
  const query = useIpcQuery(
    IpcChannels.PREFERENCES_LOAD,
    {},
    { apiOverride: options.apiOverride },
  );

  const saveMutation = useIpcMutation(IpcChannels.PREFERENCES_SAVE, {
    apiOverride: options.apiOverride,
  });

  const resetMutation = useIpcMutation(IpcChannels.PREFERENCES_RESET, {
    apiOverride: options.apiOverride,
    onSuccess: () => {
      void query.refetch();
    },
  });

  // Local changes show at once; the disk write and its echo must not hold up a control being dragged.
  const [draft, setDraft] = useState<Partial<AppPreferences>>({});
  const pendingRef = useRef<Partial<AppPreferences>>({});
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveRef = useRef(saveMutation.mutateAsync);
  saveRef.current = saveMutation.mutateAsync;

  const flushPreferences = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    const patch = pendingRef.current;
    if (Object.keys(patch).length === 0) return;
    pendingRef.current = {};
    // A failure is reported through `error`.
    void saveRef.current({ preferences: patch }).catch(() => undefined);
  }, []);

  /** Saves only the given fields, so values changed by other windows are never overwritten. */
  const patchPreferences = useCallback(
    (patch: Partial<AppPreferences>, options: { readonly coalesce?: boolean } = {}) => {
      setDraft((current) => ({ ...current, ...patch }));
      pendingRef.current = { ...pendingRef.current, ...patch };
      if (!options.coalesce) flushPreferences();
      else if (!timerRef.current) timerRef.current = setTimeout(flushPreferences, COALESCE_MS);
    },
    [flushPreferences],
  );

  // Closing the window ends the page without unmounting React.
  useEffect(() => {
    window.addEventListener('pagehide', flushPreferences);
    return () => {
      window.removeEventListener('pagehide', flushPreferences);
      flushPreferences();
    };
  }, [flushPreferences]);

  const loaded = query.data?.preferences;
  const preferences = useMemo(
    () => (loaded && Object.keys(draft).length > 0 ? { ...loaded, ...draft } : loaded),
    [loaded, draft],
  );

  const updatePreferences = useCallback(
    async (preferences: AppPreferences) => {
      const saved = await saveMutation.mutateAsync({ preferences });
      void query.refetch();
      return saved;
    },
    [saveMutation, query],
  );

  const resetPreferences = useCallback(async () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    pendingRef.current = {};
    setDraft({});
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    pendingRef.current = {};
    setDraft({});
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    pendingRef.current = {};
    setDraft({});
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    pendingRef.current = {};
    setDraft({});
    return await resetMutation.mutateAsync({});
  }, [resetMutation]);

  return {
    preferences,
    isLoading: query.isLoading,
    error: query.error || saveMutation.error || resetMutation.error,
    updatePreferences,
    patchPreferences,
    flushPreferences,
    resetPreferences,
    refetch: query.refetch,
  };
}
