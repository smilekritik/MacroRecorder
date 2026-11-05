import { randomUUID } from 'node:crypto';
import type { Page } from '@playwright/test';
import { test, expect } from '../harness/packaged-fixture.js';

// Runs against the real executable and native engine. F24 is the only key sent.
const F24 = 0x87;
const ALLOWED_AVERAGE_JITTER_MS = 1;

function f24Events(pairs: number, stepUs = 20_000): unknown[] {
  const events: unknown[] = [];
  for (let i = 0; i < pairs; i++) {
    const time = 50_000 + i * stepUs;
    const common = { virtualKey: F24, scanCode: 0x76, extended: false, comment: '', device: 'Keyboard' };
    events.push({ id: randomUUID(), type: 'KeyDown', timeMicroseconds: time, ...common });
    events.push({ id: randomUUID(), type: 'KeyUp', timeMicroseconds: time + stepUs / 2, ...common });
  }
  return events;
}

type Invoke = (channel: string, request?: Record<string, unknown>) => Promise<any>;

function ipc(page: Page): Invoke {
  return (channel, request = {}) =>
    page.evaluate(
      ([name, body]) => (window as any).macroRecorderApi.invoke(name, { requestId: `e2e-${Math.random()}`, ...(body as object) }),
      [channel, request] as const,
    );
}

async function saveMacro(invoke: Invoke, name: string, overrides: Record<string, unknown>): Promise<string> {
  const library = await invoke('storage:load-library');
  const id = randomUUID();
  const base = library.data.macros[0];
  const macro = { ...base, id, name, isEnabled: true, storagePath: undefined, ...overrides };
  const saved = await invoke('storage:save-macro', { macro });
  expect(saved.success, JSON.stringify(saved.error)).toBe(true);
  return id;
}

async function waitUntilIdle(page: Page, invoke: Invoke, limitMs: number): Promise<void> {
  const deadline = Date.now() + limitMs;
  while (Date.now() < deadline) {
    const status = await invoke('playback:get-status');
    if (status.data?.state === 'Idle') return;
    await page.waitForTimeout(50);
  }
  throw new Error('Playback did not finish in time');
}

async function historyOf(invoke: Invoke, name: string): Promise<any> {
  const history = await invoke('storage:load-run-history');
  return history.data.entries.find((entry: { macroName: string }) => entry.macroName === name);
}

test.describe('Native macro engine in the packaged application', () => {
  test('runs a macro with sub-millisecond average timing and full confirmation', async ({ packagedApp }) => {
    const page = packagedApp.mainWindow;
    const invoke = ipc(page);
    const macroId = await saveMacro(invoke, 'Engine timing', { events: f24Events(100) });

    const started = await invoke('playback:start', { macroId });
    expect(started.success, JSON.stringify(started.error)).toBe(true);
    await page.waitForTimeout(300);
    await waitUntilIdle(page, invoke, 10_000);
    await page.waitForTimeout(400);

    const entry = await historyOf(invoke, 'Engine timing');
    expect(entry.totalDispatched).toBe(200);
    expect(entry.totalFailed).toBe(0);
    expect(entry.totalUnconfirmed).toBe(0);
    expect(entry.averageJitterMs).toBeLessThan(ALLOWED_AVERAGE_JITTER_MS);
  });

  test('keeps timing while the main process is blocked', async ({ packagedApp }) => {
    const page = packagedApp.mainWindow;
    const invoke = ipc(page);
    const macroId = await saveMacro(invoke, 'Engine blocked', { events: f24Events(100) });

    await invoke('playback:start', { macroId });
    await packagedApp.app.evaluate(() => {
      const end = Date.now() + 1500;
      while (Date.now() < end);
    });
    await waitUntilIdle(page, invoke, 10_000);
    await page.waitForTimeout(400);

    const entry = await historyOf(invoke, 'Engine blocked');
    expect(entry.totalDispatched).toBe(200);
    expect(entry.averageJitterMs).toBeLessThan(ALLOWED_AVERAGE_JITTER_MS);
  });

  test('pauses, resumes and stops a running macro', async ({ packagedApp }) => {
    const page = packagedApp.mainWindow;
    const invoke = ipc(page);
    const macroId = await saveMacro(invoke, 'Engine control', { events: f24Events(200) });

    await invoke('playback:start', { macroId });
    await page.waitForTimeout(300);
    expect((await invoke('playback:get-status')).data.state).toBe('Playing');

    await invoke('playback:pause');
    await page.waitForTimeout(150);
    expect((await invoke('playback:get-status')).data.state).toBe('Paused');

    await invoke('playback:resume');
    await page.waitForTimeout(150);
    expect((await invoke('playback:get-status')).data.state).toBe('Playing');

    const stopAsked = Date.now();
    await invoke('playback:stop');
    await waitUntilIdle(page, invoke, 2000);
    expect(Date.now() - stopAsked).toBeLessThan(1000);
  });

  test('emergency stop ends an endless macro that holds a key', async ({ packagedApp }) => {
    const page = packagedApp.mainWindow;
    const invoke = ipc(page);
    const library = await invoke('storage:load-library');
    const playback = { ...library.data.macros[0].playback, repeatCount: 0 };
    const macroId = await saveMacro(invoke, 'Engine endless', {
      playback,
      events: [{ id: randomUUID(), type: 'KeyDown', timeMicroseconds: 1000, virtualKey: F24, scanCode: 0x76, extended: false, comment: '', device: 'Keyboard' }],
    });

    await invoke('playback:start', { macroId });
    await page.waitForTimeout(200);
    expect((await invoke('playback:get-status')).data.state).toBe('Playing');

    await invoke('emergency:stop', { reason: 'acceptance' });
    await waitUntilIdle(page, invoke, 2000);
  });

  test('runs a nested macro as part of its parent', async ({ packagedApp }) => {
    const page = packagedApp.mainWindow;
    const invoke = ipc(page);
    await saveMacro(invoke, 'Engine inner', { events: f24Events(5) });
    const macroId = await saveMacro(invoke, 'Engine outer', {
      events: [
        { id: randomUUID(), type: 'RunMacro', timeMicroseconds: 0, subMacroName: 'Engine inner', comment: '' },
        ...f24Events(1),
      ],
    });
    await invoke('playback:start', { macroId });
    await page.waitForTimeout(200);
    await waitUntilIdle(page, invoke, 5000);
    await page.waitForTimeout(400);
    const entry = await historyOf(invoke, 'Engine outer');
    expect(entry.totalDispatched).toBeGreaterThanOrEqual(13);
    expect(entry.totalFailed).toBe(0);
  });

  test('a saved shortcut with modifiers is registered as that exact gesture', async ({ packagedApp }) => {
    const page = packagedApp.mainWindow;
    const invoke = ipc(page);
    await saveMacro(invoke, 'Engine bind', {
      events: f24Events(1),
      hotkey: { virtualKey: 0x87, mouseButton: 'None', wheel: 'None', control: true, alt: true, shift: true, windows: false },
    });
    const registered = await packagedApp.app.evaluate(() => {
      const addon = (process as any).addon;
      return addon.probeHotkeyAvailability([{ id: 1, virtualKey: 0x87, modifiers: 0 }]);
    });
    // The bare key stays free: only the combination with modifiers belongs to the macro.
    expect(registered).toEqual([true]);
  });
});
