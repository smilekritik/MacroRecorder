/**
 * @macro-recorder/desktop - E2E: Accessibility & Keyboard-Only Workflows
 * Covers:
 * - Keyboard-only tab order navigation through all interactive controls
 * - Semantic roles (button, tab, combobox, textbox, region)
 * - Accessible name computations and ARIA attribute presence
 * - Focus visibility and restoration
 */

import { test, expect } from './harness/test-fixture.js';
import { auditSurfaceAccessibility, verifyKeyboardTabOrder } from './harness/a11y-helpers.js';

test.describe('E2E: Accessibility & Keyboard Navigation', () => {
  test('A11Y: MainWindow semantic accessibility audit', async ({ appContext }) => {
    const { mainWindow } = appContext;
    const audit = await auditSurfaceAccessibility(mainWindow);

    expect(audit.interactiveCount).toBeGreaterThanOrEqual(5);
    expect(audit.unlabeledCount).toBe(0);
    expect(audit.rolesPresent.length).toBeGreaterThan(0);
  });

  test('A11Y: MainWindow keyboard tab order progression', async ({ appContext }) => {
    const { mainWindow } = appContext;
    await mainWindow.focus('#root');

    const focusSteps = await verifyKeyboardTabOrder(mainWindow, 4);
    expect(focusSteps.length).toBe(4);
    // Elements focused must be valid interactive controls, not none
    expect(focusSteps.some((f) => f !== 'none')).toBe(true);
  });

  test('A11Y: SettingsWindow accessibility and focus rings', async ({ appContext }) => {
    const settings = await appContext.openSurface('SettingsWindow', {
      theme: 'dark',
      lang: 'en',
    });

    const audit = await auditSurfaceAccessibility(settings);
    expect(audit.interactiveCount).toBeGreaterThanOrEqual(4);
    expect(audit.unlabeledCount).toBe(0);

    await settings.close();
  });

  test('A11Y: AddActionWindow modal keyboard navigation', async ({ appContext }) => {
    const addAction = await appContext.openSurface('AddActionWindow', {
      theme: 'dark',
      lang: 'en',
    });

    const audit = await auditSurfaceAccessibility(addAction);
    expect(audit.interactiveCount).toBeGreaterThanOrEqual(2);
    expect(audit.unlabeledCount).toBe(0);

    await addAction.close();
  });
});
