import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App.js';
import type { ThemeMode } from './app/types.js';

const params = new URLSearchParams(window.location.search);
const routeOverride = params.get('windowId') ?? 'MainWindow';
const initialTheme: ThemeMode = params.get('theme') === 'light' ? 'light' : 'dark';
const initialLanguage = params.get('lang') === 'ru' ? 'ru' : 'en';
const paramsOverride: Record<string, string> = {};

for (const [key, value] of params.entries()) {
  if (key !== 'windowId' && key !== 'theme' && key !== 'lang') {
    paramsOverride[key] = value;
  }
}

const container = document.getElementById('root');
if (!container) {
  throw new Error('Renderer root element was not found');
}

createRoot(container).render(
  <React.StrictMode>
    <App
      initialLanguage={initialLanguage}
      initialTheme={initialTheme}
      routeOverride={routeOverride}
      paramsOverride={Object.keys(paramsOverride).length > 0 ? paramsOverride : undefined}
    />
  </React.StrictMode>,
);
