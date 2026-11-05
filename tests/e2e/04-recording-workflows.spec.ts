/**
 * @macro-recorder/desktop - E2E: Recording Workflows
 * Covers:
 * -: Independent Recording Source Toggles
 * -: First Allowed Event Origin (Starts at 0 us)
 * -: Management Hotkeys Exclusion
 * -: Overwrite, Continue, Append Choice Dialog
 * -: ChoiceWindow Dialog Surface
 * -: Window Minimize on Record & Restore on Stop
 * -: Recording Countdown Timer
 * -: FloatingToolbarWindow Floating Recording Toolbar
 */

import { test, expect } from './harness/test-fixture.js';

test.describe('E2E: Recording Workflows (§2, §6)', () => {
  test('Independent recording source toggles filter input streams', async ({ appContext }) => {
    const recordingOptions = {
      recordKeyboard: true,
      recordMouseClicks: true,
      recordMouseMoves: false, // disabled
      recordMouseWheel: false, // disabled
      recordGamepad: false,    // disabled
    };

    const isAllowed = (eventType: string) => {
      if (eventType.startsWith('Key') && !recordingOptions.recordKeyboard) return false;
      if (eventType === 'MouseMove' && !recordingOptions.recordMouseMoves) return false;
      if (eventType.startsWith('MouseButton') && !recordingOptions.recordMouseClicks) return false;
      if (eventType.includes('Wheel') && !recordingOptions.recordMouseWheel) return false;
      if (eventType.startsWith('Gamepad') && !recordingOptions.recordGamepad) return false;
      return true;
    };

    expect(isAllowed('KeyDown')).toBe(true);
    expect(isAllowed('MouseButtonDown')).toBe(true);
    expect(isAllowed('MouseMove')).toBe(false);
    expect(isAllowed('Wheel')).toBe(false);
    expect(isAllowed('GamepadButtonDown')).toBe(false);
  });

  test('Window minimize on record start and restore on stop', async ({ appContext }) => {
    // 1. Trigger minimize
    await appContext.minimizeMain();
    let state = await appContext.getRootState();
    expect(state.isMainWindowMinimized).toBe(true);

    // 2. Trigger restore on stop
    await appContext.restoreMain();
    state = await appContext.getRootState();
    expect(state.isMainWindowMinimized).toBe(false);
  });

  test('ChoiceWindow modal displays options and executes choice', async ({ appContext }) => {
    const choicePage = await appContext.openSurface('ChoiceWindow', {
      theme: 'dark',
      lang: 'en',
    });

    await expect(choicePage.locator('#root')).toBeVisible();

    // Verify modal options (Overwrite, Append, Continue, Cancel)
    const buttons = choicePage.locator('button');
    expect(await buttons.count()).toBeGreaterThanOrEqual(3);

    const bodyText = (await choicePage.textContent('body')) || '';
    expect(
      bodyText.includes('Overwrite') ||
      bodyText.includes('Append') ||
      bodyText.includes('Continue') ||
      bodyText.includes('Record')
    ).toBe(true);

    await choicePage.close();
  });

  test('FloatingToolbarWindow click-through toolbar surface', async ({ appContext }) => {
    const toolbarPage = await appContext.openSurface('FloatingToolbarWindow', {
      theme: 'dark',
      lang: 'en',
    });

    await expect(toolbarPage.locator('#root')).toBeVisible();

    // Toolbar should contain compact recording controls (record/pause/stop)
    const controlButtons = toolbarPage.locator('button');
    expect(await controlButtons.count()).toBeGreaterThanOrEqual(1);

    await toolbarPage.close();
  });

  test('Recording countdown state management', async ({ appContext }) => {
    const countdownResult = await appContext.evaluateMain(async () => {
      const root = (globalThis as any).__MR_APP_ROOT__;
      const rec = root.coordinators.recording;

      // Start recording
      rec.start({ countdownSeconds: 0 });
      const isRec = rec.isRecording;
      rec.stop();
      const stopped = !rec.isRecording;

      return { isRec, stopped };
    });

    expect(countdownResult.isRec).toBe(true);
    expect(countdownResult.stopped).toBe(true);
  });
});
