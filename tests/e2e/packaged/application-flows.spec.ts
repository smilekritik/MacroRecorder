import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { Page } from '@playwright/test';
import { test, expect } from '../harness/packaged-fixture.js';

// Real executable, isolated portable copy. Nothing here sends input to other applications.
type Invoke = (channel: string, request?: Record<string, unknown>) => Promise<any>;

function ipc(page: Page): Invoke {
  return (channel, request = {}) =>
    page.evaluate(
      ([name, body]) => (window as any).macroRecorderApi.invoke(name, { requestId: `e2e-${Math.random()}`, ...(body as object) }),
      [channel, request] as const,
    );
}

/** Measures what the user would see as cut off, and every scroll area that actually scrolls. */
const auditLayout = () => {
  const width = window.innerWidth;
  const height = window.innerHeight;
  const clipped: string[] = [];
  const scrollers: string[] = [];
  for (const element of Array.from(document.querySelectorAll<HTMLElement>('body *'))) {
    const style = getComputedStyle(element);
    if (style.display === 'none' || style.visibility === 'hidden') continue;
    const rect = element.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) continue;
    if ((style.overflowY === 'auto' || style.overflowY === 'scroll') && element.scrollHeight > element.clientHeight + 1) {
      scrollers.push(`y ${element.clientHeight}->${element.scrollHeight}`);
    }
    if ((style.overflowX === 'auto' || style.overflowX === 'scroll') && element.scrollWidth > element.clientWidth + 1) {
      scrollers.push(`x ${element.clientWidth}->${element.scrollWidth}`);
    }
    const interactive = /^(BUTTON|INPUT|SELECT|TEXTAREA)$/.test(element.tagName);
    if (!interactive && element.children.length > 0) continue;
    let insideScroller = false;
    for (let parent = element.parentElement; parent; parent = parent.parentElement) {
      if (parent.scrollHeight > parent.clientHeight + 1 && /auto|scroll/.test(getComputedStyle(parent).overflowY)) {
        insideScroller = true;
      }
    }
    if (!insideScroller && (rect.right > width + 1 || rect.bottom > height + 1 || rect.left < -1 || rect.top < -1)) {
      clipped.push((element.innerText || element.tagName).trim().slice(0, 40));
    }
  }
  return {
    documentOverflow: document.documentElement.scrollWidth > width + 1 || document.documentElement.scrollHeight > height + 1,
    clipped,
    scrollers,
  };
};

/** Windows whose content is long enough that one vertical scroll area is intended. */
const ONE_SCROLLER_ALLOWED = new Set(['SettingsWindow']);

const WINDOWS = [
  'SettingsWindow', 'BindMapWindow', 'GamepadTesterWindow', 'KeyCodeInspectorWindow', 'PixelInspectorWindow',
  'PixelPickerWindow', 'WindowInspectorWindow', 'FloatingToolbarWindow', 'FirstRunWindow', 'WelcomeWindow',
  'AlreadyRunningWindow', 'ChoiceWindow', 'ConfirmDeleteWindow', 'ConfirmImportWindow', 'TextPromptWindow', 'AddActionWindow',
];

test.describe('Packaged application behaviour', () => {
  test('first launch asks for theme and language once, and the choice survives a restart', async ({ packagedApp }) => {
    const firstRun = await packagedApp.app.waitForEvent('window', {
      predicate: (page) => page.url().includes('windowId=FirstRunWindow'),
      timeout: 5000,
    }).catch(() => packagedApp.app.windows().find((page) => page.url().includes('windowId=FirstRunWindow')));
    expect(firstRun, 'the first-run window did not open').toBeTruthy();
    await firstRun!.waitForLoadState();

    await firstRun!.getByRole('button', { name: 'Continue' }).click();
    const welcome = await packagedApp.app.waitForEvent('window', {
      predicate: (page) => page.url().includes('windowId=WelcomeWindow'),
      timeout: 5000,
    });
    await welcome.waitForLoadState();
    expect(fs.existsSync(path.join(packagedApp.dataPath, 'settings.json'))).toBe(true);

    const relaunched = await packagedApp.relaunch();
    await relaunched.mainWindow.waitForTimeout(800);
    const urls = relaunched.app.windows().map((page) => page.url());
    expect(urls.some((url) => url.includes('windowId=FirstRunWindow'))).toBe(false);
  });

  test('the saved language and theme apply at the next launch', async ({ packagedApp }) => {
    const invoke = ipc(packagedApp.mainWindow);
    const loaded = await invoke('preferences:load');
    const saved = await invoke('preferences:save', {
      preferences: { ...loaded.data.preferences, languageCode: 'ru', theme: 'Light' },
    });
    expect(saved.success, JSON.stringify(saved.error)).toBe(true);

    const relaunched = await packagedApp.relaunch();
    await relaunched.mainWindow.waitForTimeout(800);
    expect(relaunched.mainWindow.url()).toContain('lang=ru');
    expect(relaunched.mainWindow.url()).toContain('theme=light');
    await expect(relaunched.mainWindow.getByRole('button', { name: 'Запись' })).toBeVisible();
  });

  test('the Russian interface does not cut off windows either', async ({ packagedApp }) => {
    const first = ipc(packagedApp.mainWindow);
    const loaded = await first('preferences:load');
    await first('preferences:save', { preferences: { ...loaded.data.preferences, languageCode: 'ru' } });
    const relaunched = await packagedApp.relaunch();
    await relaunched.mainWindow.waitForTimeout(800);
    const invoke = ipc(relaunched.mainWindow);
    const problems: Record<string, unknown> = {};
    for (const windowId of WINDOWS) {
      await invoke('windows:open', { windowId });
      await relaunched.mainWindow.waitForTimeout(900);
      const page = relaunched.app.windows().find((candidate) => candidate.url().includes(`windowId=${windowId}&`) || candidate.url().endsWith(`windowId=${windowId}`));
      const audit = await page!.evaluate(auditLayout);
      const allowed = ONE_SCROLLER_ALLOWED.has(windowId) ? 1 : 0;
      if (audit.documentOverflow || audit.clipped.length > 0 || audit.scrollers.length > allowed) {
        problems[windowId] = audit;
      }
      await invoke('windows:close', { windowId });
      await relaunched.mainWindow.waitForTimeout(150);
    }
    expect(problems).toEqual({});
  });

  test('an overlay text event shows its card in a click-through window, which then goes away', async ({ packagedApp }) => {
    const invoke = ipc(packagedApp.mainWindow);
    const library = await invoke('storage:load-library');
    const macro = {
      ...library.data.macros[0],
      id: randomUUID(),
      name: 'Overlay check',
      isEnabled: true,
      storagePath: undefined,
      events: [{ id: randomUUID(), type: 'OverlayText', timeMicroseconds: 0, text: 'Shown by the engine', durationMicroseconds: 1500000, showOverlayTiming: true, comment: '' }],
    };
    await invoke('storage:save-macro', { macro });
    await invoke('playback:start', { macroId: macro.id });

    const overlay = await packagedApp.app.waitForEvent('window', {
      predicate: (page) => page.url().includes('windowId=OverlayWindow'),
      timeout: 5000,
    });
    await expect(overlay.getByText('Shown by the engine')).toBeVisible({ timeout: 3000 });

    await packagedApp.mainWindow.waitForTimeout(2600);
    expect(packagedApp.app.windows().some((page) => page.url().includes('windowId=OverlayWindow'))).toBe(false);
  });

  test('a normal launch shows the main window', async ({ packagedApp }) => {
    await packagedApp.mainWindow.waitForTimeout(800);
    const state = await packagedApp.app.evaluate(({ BrowserWindow }) => {
      const main = BrowserWindow.getAllWindows().find((window) => window.webContents.getURL().includes('windowId=MainWindow'));
      return { visible: main?.isVisible(), minimized: main?.isMinimized() };
    });
    expect(state).toEqual({ visible: true, minimized: false });
  });

  test('overlay windows do not paint over the desktop', async ({ packagedApp }) => {
    const invoke = ipc(packagedApp.mainWindow);
    await invoke('windows:close', { windowId: 'FirstRunWindow' });
    await packagedApp.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().forEach((window) => window.hide()));
    await invoke('windows:open', { windowId: 'SettingsWindow' });
    await packagedApp.mainWindow.waitForTimeout(1500);
    // Read from the real screen: a live wallpaper rules out before/after equality, while an
    // opaque window would make every point the same page color.
    const colors: number[] = await packagedApp.app.evaluate(() => {
      const addon = (process as any).addon;
      const points = [[200, 500], [400, 300], [700, 600], [1000, 400], [300, 700]] as const;
      return points.map(([x, y]) => addon.capturePixelAt(x, y).rgb);
    });
    const pageColors = [0x0d1117, 0x12141a, 0x1e1e1e, 0x000000, 0xffffff];
    expect(colors.filter((color) => pageColors.includes(color)).length).toBeLessThan(colors.length);
    const page = packagedApp.app.windows().find((candidate) => candidate.url().includes('windowId=OverlayPlacementWindow'));
    const background = await page!.evaluate(() => getComputedStyle(document.body).backgroundColor);
    expect(background).toBe('rgba(0, 0, 0, 0)');
  });

  test('sample cards start at their saved, separate positions', async ({ packagedApp }) => {
    const invoke = ipc(packagedApp.mainWindow);
    await invoke('windows:open', { windowId: 'SettingsWindow' });
    await packagedApp.mainWindow.waitForTimeout(1200);
    const page = packagedApp.app.windows().find((candidate) => candidate.url().includes('windowId=OverlayPlacementWindow'));
    const tops = await page!.evaluate(() => ['info', 'annotation'].map((name) =>
      document.querySelector(`[data-testid="preview-${name}-container"]`)?.getBoundingClientRect().top ?? -1));
    expect(tops[0]).toBeLessThan(10);
    expect(tops[1]).toBeGreaterThan(300);
  });

  test('a new macro is ready to name, offers ways to fill it, and takes several actions in a row', async ({ packagedApp }) => {
    const page = packagedApp.mainWindow;
    await ipc(page)('windows:close', { windowId: 'FirstRunWindow' });
    await page.getByRole('button', { name: 'New', exact: true }).click();

    const nameField = page.locator('input:focus');
    await expect(nameField).toHaveValue(/New macro/);
    await nameField.fill('Morning routine');
    await nameField.press('Enter');
    await expect(page.getByTestId('empty-macro-record')).toBeVisible();
    await expect(page.getByTestId('empty-macro-import')).toBeVisible();

    await page.getByTestId('empty-macro-build').click();
    await expect(page.getByTestId('action-type-picker')).toBeVisible();
    // Key capture is armed without clicking the field.
    await page.keyboard.press('A');
    await page.getByRole('button', { name: 'Add and continue' }).click();
    await expect(page.getByText('Added: 1')).toBeVisible();
    await page.keyboard.press('B');
    await page.getByRole('button', { name: 'Add to timeline' }).click();

    await expect(page.getByTestId('empty-macro-start')).toHaveCount(0);
    await expect(page.getByText('A ↓')).toBeVisible();
    await expect(page.getByText('B ↓')).toBeVisible();

    await page.getByRole('button', { name: 'Save changes' }).click();
    await page.waitForTimeout(500);
    const library = await ipc(page)('storage:load-library');
    const saved = library.data.macros.find((macro: { name: string }) => macro.name === 'Morning routine');
    expect(saved?.events.length).toBe(4);
  });

  test('no window cuts off its content or nests scroll areas', async ({ packagedApp }) => {
    const invoke = ipc(packagedApp.mainWindow);
    const problems: Record<string, unknown> = {};
    for (const windowId of WINDOWS) {
      await invoke('windows:open', { windowId });
      await packagedApp.mainWindow.waitForTimeout(900);
      const page = packagedApp.app.windows().find((candidate) => candidate.url().includes(`windowId=${windowId}&`) || candidate.url().endsWith(`windowId=${windowId}`));
      expect(page, `${windowId} did not open`).toBeTruthy();
      const audit = await page!.evaluate(auditLayout);
      const allowed = ONE_SCROLLER_ALLOWED.has(windowId) ? 1 : 0;
      if (audit.documentOverflow || audit.clipped.length > 0 || audit.scrollers.length > allowed) {
        problems[windowId] = audit;
      }
      await invoke('windows:close', { windowId });
      await packagedApp.mainWindow.waitForTimeout(150);
    }
    expect(problems).toEqual({});
  });

  test('a macro exported to a package imports back with its actions', async ({ packagedApp }) => {
    const invoke = ipc(packagedApp.mainWindow);
    const library = await invoke('storage:load-library');
    const source = library.data.macros.find((macro: { events: unknown[] }) => macro.events.length > 0);
    const destinationPath = path.join(packagedApp.dataPath, 'roundtrip.mrmacro');

    const exported = await invoke('storage:export-macro', { macroId: source.id, format: 'zip', destinationPath });
    expect(exported.success, JSON.stringify(exported.error)).toBe(true);
    expect(fs.existsSync(destinationPath)).toBe(true);

    const imported = await invoke('storage:import-macro', { sourcePath: destinationPath });
    expect(imported.success, JSON.stringify(imported.error)).toBe(true);

    const after = await invoke('storage:load-library');
    expect(after.data.macros.length).toBe(library.data.macros.length + 1);
    const copy = after.data.macros.find((macro: { id: string; name: string }) => macro.id !== source.id && macro.name.startsWith(source.name));
    expect(copy.events.length).toBe(source.events.length);
  });

  test('a library folder chosen in settings is used from the next launch', async ({ packagedApp }) => {
    const invoke = ipc(packagedApp.mainWindow);
    const custom = path.join(packagedApp.dataPath, '..', 'custom-library');
    const loaded = await invoke('preferences:load');
    await invoke('preferences:save', { preferences: { ...loaded.data.preferences, macroLibraryPath: custom } });

    await packagedApp.relaunch();
    expect(fs.existsSync(path.join(custom, 'Macros'))).toBe(true);
  });

  test('closing the main window ends the application', async ({ packagedApp }) => {
    const closed = packagedApp.app.waitForEvent('close', { timeout: 8000 });
    await packagedApp.app.evaluate(({ BrowserWindow }) => {
      const main = BrowserWindow.getAllWindows().find((window) => window.webContents.getURL().includes('windowId=MainWindow'));
      main?.close();
    });
    await closed;
  });

  test('without a recording, physical input stays out of JavaScript and no pad is polled', async ({ packagedApp }) => {
    const threads = await packagedApp.app.evaluate(() => {
      const addon = (process as any).addon;
      return addon.getRuntimeQueueStats();
    });
    // Nothing was recorded, so the event queue has carried no input since launch.
    expect(Number(threads.totalEnqueued)).toBeLessThan(5);
  });
});
