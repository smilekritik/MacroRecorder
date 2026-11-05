/**
 * @macro-recorder/desktop - Unified Root Application Providers
 * Combines API bridge, Theme, Localization, Library, Timeline, and Dialog contexts
 * under a resilient top-level Error Boundary.
 */

import React from 'react';
import { ApiProvider } from '../state/ApiContext.js';
import { ThemeProvider } from '../state/ThemeContext.js';
import { LocalizationProvider } from '../hooks/useLocalization.js';
import { LibraryStateProvider } from '../state/LibraryStateContext.js';
import { TimelineStateProvider } from '../state/TimelineStateContext.js';
import { DialogProvider } from '../state/DialogContext.js';
import { AppErrorBoundary } from './AppErrorBoundary.js';
import type { MacroRecorderApi } from '../hooks/useApi.js';
import type { ThemeMode } from './types.js';

export interface AppProvidersProps {
  readonly api?: MacroRecorderApi | undefined;
  readonly initialTheme?: ThemeMode | undefined;
  readonly initialLanguage?: 'en' | 'ru' | undefined;
  readonly children?: React.ReactNode | undefined;
}

const SafeLocalizationProvider = LocalizationProvider as unknown as React.ComponentType<{
  readonly initialLanguage?: 'en' | 'ru' | undefined;
  readonly syncAcrossWindows?: boolean | undefined;
  readonly children?: React.ReactNode | undefined;
}>;

export function AppProviders({
  api,
  initialTheme = 'dark',
  initialLanguage = 'en',
  children,
}: AppProvidersProps): React.ReactElement {
  return (
    <AppErrorBoundary>
      <ApiProvider api={api}>
        <ThemeProvider initialMode={initialTheme}>
          <SafeLocalizationProvider initialLanguage={initialLanguage} syncAcrossWindows={true}>
            <LibraryStateProvider>
              <TimelineStateProvider>
                <DialogProvider>
                  {children}
                </DialogProvider>
              </TimelineStateProvider>
            </LibraryStateProvider>
          </SafeLocalizationProvider>
        </ThemeProvider>
      </ApiProvider>
    </AppErrorBoundary>
  );
}
