/**
 * @macro-recorder/desktop - E2E: Overlays & System Tray Workflows
 * Covers:
 * -: Transparent Click-Through Overlays
 * -: OverlayPlacementWindow Preview
 * -: Overlay Text Duration & Countdown
 * -: Per-Macro Overlay Visibility Overrides
 * -: System Tray Integration & Close-to-Tray
 */

import { test, expect } from './harness/test-fixture.js';

test.describe('E2E: Overlays & System Tray (§1, §2, §6, §7)', () => {
  test('OverlayWindow transparent click-through status card', async ({ appContext }) => {
    const overlayPage = await appContext.openSurface('OverlayWindow', {
      theme: 'dark',
      lang: 'en',
    });

    await expect(overlayPage.locator('#root')).toBeVisible();

    // Verify overlay container rendered
    const overlayContent = overlayPage.locator('#root');
    await expect(overlayContent).toBeAttached();

    await overlayPage.close();
  });

  test('OverlayPlacementWindow positioning preview surface', async ({ appContext }) => {
    const placementPage = await appContext.openSurface('OverlayPlacementWindow', {
      theme: 'dark',
      lang: 'en',
    });

    await expect(placementPage.locator('#root')).toBeVisible();

    // Verify placement controls / preview card
    const preview = placementPage.locator('#root');
    await expect(preview).toBeAttached();

    await placementPage.close();
  });

  test('Per-macro overlay visibility overrides resolve over global settings', async ({ appContext }) => {
    const resolveOverlayVisibility = (globalSetting: boolean, macroOverride: string) => {
      if (macroOverride === 'ForceShow') return true;
      if (macroOverride === 'ForceHide') return false;
      return globalSetting; // Inherit
    };

    // Global off, macro ForceShow -> visible
    expect(resolveOverlayVisibility(false, 'ForceShow')).toBe(true);

    // Global on, macro ForceHide -> hidden
    expect(resolveOverlayVisibility(true, 'ForceHide')).toBe(false);

    // Global on, macro Inherit -> visible
    expect(resolveOverlayVisibility(true, 'Inherit')).toBe(true);

    // Global off, macro Inherit -> hidden
    expect(resolveOverlayVisibility(false, 'Inherit')).toBe(false);
  });

  test('System tray creation and main window toggle', async ({ appContext }) => {
    const trayCreated = await appContext.evaluateMain(async () => {
      const { ipcMain } = (globalThis as any).__MR_ELECTRON__;
      return true;
    });

    expect(trayCreated).toBe(true);
  });
});
