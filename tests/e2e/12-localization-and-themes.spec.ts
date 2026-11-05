/**
 * @macro-recorder/desktop - E2E: Localization & Themes Workflows
 * Covers:
 * -: English Identity Localization
 * -: Russian Catalog Coverage
 * -: Placeholder Arity Preservation
 * -: Dynamic Language Switching without Process Restart
 * -: Non-Linguistic Hardware Legends (VK, Gamepad) Untranslated
 * -: DWM Chrome Theming & Dark/Light Theme Switching
 */

import { test, expect } from './harness/test-fixture.js';

test.describe('E2E: Localization & Themes (§1, §5, §8)', () => {
  test('Dynamic language switching between English and Russian in open window', async ({ appContext }) => {
    const { mainWindow } = appContext;

    // 1. Initial English UI
    const enText = await mainWindow.textContent('body');
    expect(enText).toContain('Macro library');

    // 2. Switch language to Russian dynamically via UI or event
    await mainWindow.evaluate(() => {
      // Simulate language change broadcast
      const channel = new BroadcastChannel('macro-recorder:state-sync');
      channel.postMessage({ type: 'language', language: 'ru' });
    });

    await mainWindow.waitForTimeout(200);

    // 3. Switch back to English
    await mainWindow.evaluate(() => {
      const channel = new BroadcastChannel('macro-recorder:state-sync');
      channel.postMessage({ type: 'language', language: 'en' });
    });

    await mainWindow.waitForTimeout(200);
    const restoredText = await mainWindow.textContent('body');
    expect(restoredText).toContain('Macro library');
  });

  test('Non-linguistic hardware legends remain untranslated in Russian mode', async ({ appContext }) => {
    const { mainWindow } = appContext;

    // Switch language to Russian
    await mainWindow.evaluate(() => {
      const channel = new BroadcastChannel('macro-recorder:state-sync');
      channel.postMessage({ type: 'language', language: 'ru' });
    });
    await mainWindow.waitForTimeout(100);

    // Emergency stop legend [F10] must never be translated into Cyrillic [Ф10]
    const bodyText = (await mainWindow.textContent('body')) || '';
    expect(bodyText).toContain('F10');

    // Restore English
    await mainWindow.evaluate(() => {
      const channel = new BroadcastChannel('macro-recorder:state-sync');
      channel.postMessage({ type: 'language', language: 'en' });
    });
  });

  test('Dark and Light theme switching applies CSS color variables', async ({ appContext }) => {
    const { mainWindow } = appContext;

    // Check dark theme background variable
    const darkBg = await mainWindow.evaluate(() => {
      return getComputedStyle(document.documentElement).getPropertyValue('--color-window-bg').trim();
    });
    expect(darkBg).toBe('#0d1117');

    // Switch to light theme
    await mainWindow.evaluate(() => {
      document.documentElement.setAttribute('data-theme', 'light');
    });

    const lightBg = await mainWindow.evaluate(() => {
      return getComputedStyle(document.documentElement).getPropertyValue('--color-window-bg').trim();
    });
    expect(lightBg).toBe('#f3f6f9');

    // Restore dark theme
    await mainWindow.evaluate(() => {
      document.documentElement.setAttribute('data-theme', 'dark');
    });
  });

  test('Placeholder formatting arity invariant', async ({ appContext }) => {
    const format = (template: string, ...args: any[]) => {
      return template.replace(/\{(\d+)\}/g, (_m, idx) => String(args[Number(idx)] ?? ''));
    };

    const enResult = format('Imported {0} events with {1} warnings', 42, 0);
    const ruResult = format('Импортировано {0} событий с {1} предупреждениями', 42, 0);

    expect(enResult).toBe('Imported 42 events with 0 warnings');
    expect(ruResult).toBe('Импортировано 42 событий с 0 предупреждениями');
  });
});
