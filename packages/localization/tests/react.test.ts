import { describe, it, expect, beforeEach } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import {
  LocalizationProvider,
  setupWindowLocalizationSync,
  useLocalization,
  useTranslation,
  Tr,
  LocalizationManager,
} from '../src/index.js';

describe('React localization components and hooks', () => {
  let testManager: LocalizationManager;

  beforeEach(() => {
    testManager = new LocalizationManager('en');
  });

  it('renders Tr component with English translation', () => {
    const Component = () =>
      React.createElement(
        LocalizationProvider,
        { manager: testManager, syncAcrossWindows: false },
        React.createElement(Tr, { text: 'Gamepad' }),
      );

    const html = renderToString(React.createElement(Component));
    expect(html).toBe('Gamepad');
  });

  it('renders Tr component with Russian translation when switched', () => {
    testManager.setLanguage('ru');

    const Component = () =>
      React.createElement(
        LocalizationProvider,
        { manager: testManager, syncAcrossWindows: false },
        React.createElement(Tr, { text: 'Gamepad' }),
      );

    const html = renderToString(React.createElement(Component));
    expect(html).toBe('Геймпад');
  });

  it('renders Tr component with format args', () => {
    testManager.setLanguage('ru');

    const Component = () =>
      React.createElement(
        LocalizationProvider,
        { manager: testManager, syncAcrossWindows: false },
        React.createElement(Tr, { text: 'Slot {0}', args: [3] }),
      );

    const html = renderToString(React.createElement(Component));
    expect(html).toBe('Слот 3');
  });

  it('renders Tr component with custom tag or className', () => {
    const Component = () =>
      React.createElement(
        LocalizationProvider,
        { manager: testManager, syncAcrossWindows: false },
        React.createElement(Tr, {
          text: 'Gamepad',
          as: 'div',
          className: 'title-text',
        }),
      );

    const html = renderToString(React.createElement(Component));
    expect(html).toBe('<div class="title-text">Gamepad</div>');
  });

  it('useLocalization hook provides reactive state and helpers', () => {
    let capturedHook: ReturnType<typeof useLocalization> | null = null;

    const TestConsumer = () => {
      capturedHook = useLocalization();
      return React.createElement('div', null, capturedHook.t('Gamepad'));
    };

    renderToString(
      React.createElement(
        LocalizationProvider,
        { manager: testManager, syncAcrossWindows: false },
        React.createElement(TestConsumer),
      ),
    );

    expect(capturedHook).not.toBeNull();
    expect(capturedHook!.language).toBe('en');
    expect(capturedHook!.isEnglish).toBe(true);
    expect(capturedHook!.isRussian).toBe(false);
    expect(capturedHook!.languages).toHaveLength(2);
  });

  it('useTranslation hook provides t and format shorthands', () => {
    let capturedHook: ReturnType<typeof useTranslation> | null = null;

    const TestConsumer = () => {
      capturedHook = useTranslation();
      return React.createElement('div', null, capturedHook.format('Slot {0}', 5));
    };

    renderToString(
      React.createElement(
        LocalizationProvider,
        { manager: testManager, syncAcrossWindows: false },
        React.createElement(TestConsumer),
      ),
    );

    expect(capturedHook).not.toBeNull();
    expect(capturedHook!.format('Slot {0}', 5)).toBe('Slot 5');
  });

  describe('multi-window synchronization', () => {
    it('synchronizes language changes across independent window managers via BroadcastChannel', async () => {
      const channelName = `macro-recorder:test-sync-${Date.now()}`;
      const managerA = new LocalizationManager('en');
      const managerB = new LocalizationManager('en');

      const bChanges: string[] = [];
      const syncB = setupWindowLocalizationSync({
        manager: managerB,
        channelName,
        onLanguageChange: (newLang) => {
          bChanges.push(newLang);
        },
      });

      const syncA = setupWindowLocalizationSync({
        manager: managerA,
        channelName,
      });

      // Window A changes language and broadcasts to other windows
      managerA.setLanguage('ru');
      syncA.broadcast('ru');

      // Allow message dispatch over BroadcastChannel
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(managerB.currentLanguage).toBe('ru');
      expect(managerB.translate('Gamepad')).toBe('Геймпад');
      expect(bChanges).toEqual(['ru']);

      // Window A switches back to en
      managerA.setLanguage('en');
      syncA.broadcast('en');

      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(managerB.currentLanguage).toBe('en');
      expect(managerB.translate('Gamepad')).toBe('Gamepad');
      expect(bChanges).toEqual(['ru', 'en']);

      syncA.close();
      syncB.close();
    });

    it('cleans up channel listeners on close', async () => {
      const channelName = `macro-recorder:test-cleanup-${Date.now()}`;
      const managerA = new LocalizationManager('en');
      const managerB = new LocalizationManager('en');

      const bChanges: string[] = [];
      const syncB = setupWindowLocalizationSync({
        manager: managerB,
        channelName,
        onLanguageChange: (newLang) => {
          bChanges.push(newLang);
        },
      });

      const syncA = setupWindowLocalizationSync({
        manager: managerA,
        channelName,
      });

      // Close syncB
      syncB.close();

      // Window A broadcasts
      syncA.broadcast('ru');

      await new Promise((resolve) => setTimeout(resolve, 50));

      // Manager B should remain untouched
      expect(managerB.currentLanguage).toBe('en');
      expect(bChanges).toEqual([]);

      syncA.close();
    });
  });
});
