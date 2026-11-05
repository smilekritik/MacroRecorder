/**
 * @macro-recorder/desktop - BindMapView Component Rendering & Snapshot Tests
 */

import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { BindMapView, BindMapLegend } from '../index.js';
import {
  DEFAULT_HOTKEY_BINDING,
  DEFAULT_RECORDING_OPTIONS,
  DEFAULT_PLAYBACK_OPTIONS,
  type MacroDefinition,
} from '../../../../../../../packages/contracts/src/index.js';
import { ruCatalog } from '../../../../../../../packages/localization/src/catalogs/index.js';

let currentTestLang = 'en';

// Mock useLocalization
vi.mock('../../../hooks/useLocalization.js', () => ({
  useTranslation: () => ({
    t: (key: string) => (currentTestLang === 'ru' ? (ruCatalog[key] ?? key) : key),
    format: (key: string, ...args: unknown[]) => {
      const template = currentTestLang === 'ru' ? (ruCatalog[key] ?? key) : key;
      return template.replace(/{(\d+)}/g, (_, i) => String(args[Number(i)] ?? ''));
    },
    language: currentTestLang,
    isRussian: currentTestLang === 'ru',
    isEnglish: currentTestLang === 'en',
  }),
  useLocalization: () => ({
    language: currentTestLang,
    setLanguage: (lang: string) => {
      currentTestLang = lang;
    },
    t: (key: string) => (currentTestLang === 'ru' ? (ruCatalog[key] ?? key) : key),
    format: (key: string, ...args: unknown[]) => {
      const template = currentTestLang === 'ru' ? (ruCatalog[key] ?? key) : key;
      return template.replace(/{(\d+)}/g, (_, i) => String(args[Number(i)] ?? ''));
    },
  }),
}));

// Mock useTheme
vi.mock('../../../hooks/useTheme.js', () => ({
  useTheme: () => ({
    mode: 'dark',
    resolvedTheme: 'dark',
    setMode: vi.fn(),
    toggleTheme: vi.fn(),
  }),
}));

// Mock design-system Modal
vi.mock('../../../design-system/Modal.js', () => ({
  Modal: ({ isOpen, children, title }: any) => {
    if (!isOpen) return null;
    return React.createElement(
      'div',
      { 'data-modal-open': 'true', 'data-modal-title': typeof title === 'string' ? title : 'modal' },
      children,
    );
  },
}));

function createSampleMacro(overrides: Partial<MacroDefinition> = {}): MacroDefinition {
  return {
    schemaVersion: 12,
    id: 'sample-macro-1',
    name: 'Auto Buyer',
    folder: '',
    description: '',
    isEnabled: true,
    tags: [],
    modifiedAt: '2026-01-01T00:00:00.000Z',
    recording: DEFAULT_RECORDING_OPTIONS,
    playback: DEFAULT_PLAYBACK_OPTIONS,
    hotkey: {
      ...DEFAULT_HOTKEY_BINDING,
      virtualKey: 0x70, // F1
    },
    events: [],
    ...overrides,
  };
}

describe('BindMapView Component Rendering', () => {
  it('renders complete full-screen binding map surface', () => {
    const macro1 = createSampleMacro();
    const html = renderToString(
      React.createElement(BindMapView, {
        isOpen: true,
        macros: [macro1],
        closeHotkey: 'F11',
        onClose: () => {},
      }),
    );

    // Root container
    expect(html).toContain('data-testid="bind-map-window-root"');
    // Title
    expect(html).toContain('data-testid="bind-map-title"');
    expect(html).toContain('Bind map');
    // Hint with F11 close hotkey
    expect(html).toContain('data-testid="bind-map-hint"');
    expect(html).toContain('F11');
    // Canvas SVG with uniform viewBox
    expect(html).toContain('viewBox="0 0 1360 310"');
    expect(html).toContain('data-testid="bind-map-svg"');
    expect(html).toContain('data-testid="bind-map-keyboard-group"');
    expect(html).toContain('data-testid="bind-map-mouse-group"');
    // Legend bar
    expect(html).toContain('data-testid="bind-map-legend"');
    expect(html).toContain('data-testid="bind-map-close-btn"');
    expect(html).toContain('Close');
  });

  it('renders all 5 semantic legend pills in English', () => {
    const html = renderToString(
      React.createElement(BindMapLegend, {
        onClose: () => {},
      }),
    );

    expect(html).toContain('enabled macro');
    expect(html).toContain('disabled macro — click to enable');
    expect(html).toContain('application shortcut');
    expect(html).toContain('second key of a combination');
    expect(html).toContain('held by another application');
  });

  it('renders Russian localization with catalog', () => {
    currentTestLang = 'ru';
    try {
      const html = renderToString(
        React.createElement(BindMapView, {
          isOpen: true,
          closeHotkey: 'F11',
          onClose: () => {},
        }),
      );

      // Russian title
      expect(html).toContain('Карта биндов');
      // Russian hint
      expect(html).toContain('Зелёная клавиша — включённый макрос');
      expect(html).toContain('F11');
      // Russian legend items
      expect(html).toContain('включённый макрос');
      expect(html).toContain('выключенный макрос — нажмите, чтобы включить');
      expect(html).toContain('бинд приложения');
      expect(html).toContain('вторая клавиша сочетания');
      expect(html).toContain('занято другим приложением');
      expect(html).toContain('Закрыть');
    } finally {
      currentTestLang = 'en';
    }
  });

  it('renders correctly with dark and light themes', () => {
    const darkHtml = renderToString(
      React.createElement(BindMapView, {
        isOpen: true,
        theme: 'dark',
      }),
    );
    expect(darkHtml).toContain('data-testid="bind-map-window-root"');

    const lightHtml = renderToString(
      React.createElement(BindMapView, {
        isOpen: true,
        theme: 'light',
      }),
    );
    expect(lightHtml).toContain('data-testid="bind-map-window-root"');
  });

  it('does not render when isOpen is false', () => {
    const html = renderToString(
      React.createElement(BindMapView, {
        isOpen: false,
      }),
    );
    expect(html).toBe('');
  });
});
