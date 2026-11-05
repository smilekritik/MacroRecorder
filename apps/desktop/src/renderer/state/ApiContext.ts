import React, { createContext, useContext } from 'react';
import type { MacroRecorderApi } from '../hooks/useApi.js';
import { useApi as useDefaultApi } from '../hooks/useApi.js';

const ApiContext = createContext<MacroRecorderApi | null>(null);

export interface ApiProviderProps {
  readonly api?: MacroRecorderApi | undefined;
  readonly children?: React.ReactNode | undefined;
}

/**
 * Provides the strongly-typed IPC API bridge to the component subtree.
 * Decouples the React renderer entirely from Electron / Node runtimes.
 */
export function ApiProvider({ api, children }: ApiProviderProps): React.ReactElement {
  const defaultApi = useDefaultApi();
  const effectiveApi = api ?? defaultApi;

  return React.createElement(ApiContext.Provider, { value: effectiveApi }, children);
}

export function useApiContext(): MacroRecorderApi {
  const ctx = useContext(ApiContext);
  if (ctx) {
    return ctx;
  }
  // Fallback to window or mock API
  return useDefaultApi();
}
