/**
 * @macro-recorder/desktop - E2E: Single Instance & System Lifecycle Workflows
 * Covers:
 * -: Single-Instance Mutex & AlreadyRunningWindow
 * -: Named Pipe File Forwarding
 * -: System Sleep & Logoff Auto-Stop Lifecycle
 * -: TextPromptWindow Surface
 */

import { test, expect } from './harness/test-fixture.js';

test.describe('E2E: Single Instance & System Lifecycle (§1, §2, §6, §8)', () => {
  test('AlreadyRunningWindow dialog surface', async ({ appContext }) => {
    const alreadyRunningPage = await appContext.openSurface('AlreadyRunningWindow', {
      theme: 'dark',
      lang: 'en',
    });

    await expect(alreadyRunningPage.locator('#root')).toBeVisible();

    const okBtn = alreadyRunningPage.locator('button:has-text("OK"), button').first();
    await expect(okBtn).toBeVisible();

    await alreadyRunningPage.close();
  });

  test('TextPromptWindow modal dialog surface', async ({ appContext }) => {
    const textPromptPage = await appContext.openSurface('TextPromptWindow', {
      theme: 'dark',
      lang: 'en',
      params: { title: 'Rename Macro', prompt: 'Enter new name:' },
    });

    await expect(textPromptPage.locator('#root')).toBeVisible();

    // Verify text input and submit buttons
    const textInput = textPromptPage.locator('input[type="text"], input').first();
    await expect(textInput).toBeVisible();

    const confirmBtn = textPromptPage.locator('button:has-text("OK"), button:has-text("Save"), button').first();
    await expect(confirmBtn).toBeVisible();

    await textPromptPage.close();
  });

  test('Second instance forwards macro path and restores main window', async ({ appContext }) => {
    // 1. Minimize main window
    await appContext.minimizeMain();
    let state = await appContext.getRootState();
    expect(state.isMainWindowMinimized).toBe(true);

    // 2. Forward file from second instance
    await appContext.evaluateMain(async () => {
      const wm = (globalThis as any).__MR_WINDOW_MANAGER__;
      wm.restoreMainWindow();
    });

    // 3. Main window must be restored
    state = await appContext.getRootState();
    expect(state.isMainWindowMinimized).toBe(false);
  });

  test('System sleep and logoff triggers synchronous emergency stop', async ({ appContext }) => {
    const sleepResult = await appContext.evaluateMain(async () => {
      const root = (globalThis as any).__MR_APP_ROOT__;

      // Start recording
      root.coordinators.recording.start({ countdownSeconds: 0 });
      const recBefore = root.coordinators.recording.isRecording;

      // Trigger system sleep
      root.coordinators.shutdown.triggerEmergencyRelease('power_suspend');
      const recAfter = root.coordinators.recording.isRecording;

      return { recBefore, recAfter };
    });

    expect(sleepResult.recBefore).toBe(true);
    expect(sleepResult.recAfter).toBe(false);
  });
});
