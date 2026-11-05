/**
 * @macro-recorder/desktop - Root Application Component
 * Top-level application tree combining providers, error boundary, and routing.
 */

import React from 'react';
import { AppProviders } from './AppProviders.js';
import { AppRouter } from './AppRouter.js';
import type { MacroRecorderApi } from '../hooks/useApi.js';
import type { ThemeMode } from './types.js';

export interface AppProps {
  readonly api?: MacroRecorderApi | undefined;
  readonly initialTheme?: ThemeMode | undefined;
  readonly initialLanguage?: 'en' | 'ru' | undefined;
  readonly routeOverride?: string | undefined;
  readonly paramsOverride?: Readonly<Record<string, string>> | undefined;
}

export function App({
  api,
  initialTheme,
  initialLanguage,
  routeOverride,
  paramsOverride,
}: AppProps = {}): React.ReactElement {
  return (
    <AppProviders
      {...(api !== undefined ? { api } : {})}
      {...(initialTheme !== undefined ? { initialTheme } : {})}
      {...(initialLanguage !== undefined ? { initialLanguage } : {})}
    >
      <AppRouter
        {...(routeOverride !== undefined ? { routeOverride } : {})}
        {...(paramsOverride !== undefined ? { paramsOverride } : {})}
      />
    </AppProviders>
  );
}

export default App;
