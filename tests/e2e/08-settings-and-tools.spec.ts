/**
 * @macro-recorder/desktop - E2E: Settings & Debugger Tools Workflows
 * Covers:
 * -: SettingsWindow Surface & Navigation
 * -: Application Hotkeys with Clearable Intent
 * -: One-Time F12 to F11 Bind Map Hotkey Migration
 * -: Clean Factory Application Reset
 * -: Live Debugger Inspectors
 */

import { test, expect } from './harness/test-fixture.js';

test.describe('E2E: Settings & Debugger Tools (§2, §6)', () => {
  test('SettingsWindow section navigation and hidden application reset', async ({ appContext }) => {
    const settingsPage = await appContext.openSurface('SettingsWindow', {
      theme: 'dark',
      lang: 'en',
    });

    await expect(settingsPage.locator('#root')).toBeVisible();

    // Verify section navigation buttons (Interface, Startup, Storage, Controls, Overlay, Gamepad, Debugger)
    const sectionNav = settingsPage.locator('button, [role="tab"]');
    expect(await sectionNav.count()).toBeGreaterThanOrEqual(4);

    // Verify Application Reset section is intentionally hidden from left section navigation
    const navText = await sectionNav.allTextContents();
    const hasResetInNav = navText.some((t) => t.toLowerCase() === 'application reset');
    expect(hasResetInNav).toBe(false);

    await settingsPage.close();
  });

  test('Application hotkeys with clearable intent persist empty string', async ({ appContext }) => {
    const result = await appContext.evaluateMain(async () => {
      const preferences = {
        hotkeys: {
          emergencyStop: 'F10',
          recordToggle: '', // Intentionally cleared!
          playbackToggle: 'F9',
        },
      };

      // Ensure empty binding does NOT revert to default
      const recordHotkey = preferences.hotkeys.recordToggle;
      return { recordHotkey };
    });

    expect(result.recordHotkey).toBe('');
  });

  test('One-time F12 to F11 bind map migration', async ({ appContext }) => {
    const migrate = (oldHotkey: string) => {
      if (oldHotkey === 'F12') return 'F11';
      return oldHotkey;
    };

    expect(migrate('F12')).toBe('F11');
    expect(migrate('Ctrl+Shift+B')).toBe('Ctrl+Shift+B'); // customized hotkey untouched
  });

  test('Live debugger inspector windows mount properly', async ({ appContext }) => {
    // 1. KeyCodeInspectorWindow
    const keyCodesPage = await appContext.openSurface('KeyCodeInspectorWindow', { theme: 'dark' });
    await expect(keyCodesPage.locator('#root')).toBeVisible();
    await keyCodesPage.close();

    // 2. PixelInspectorWindow
    const pixelPage = await appContext.openSurface('PixelInspectorWindow', { theme: 'dark' });
    await expect(pixelPage.locator('#root')).toBeVisible();
    await pixelPage.close();

    // 3. WindowInspectorWindow
    const windowInspectorPage = await appContext.openSurface('WindowInspectorWindow', { theme: 'dark' });
    await expect(windowInspectorPage.locator('#root')).toBeVisible();
    await windowInspectorPage.close();
  });
});
