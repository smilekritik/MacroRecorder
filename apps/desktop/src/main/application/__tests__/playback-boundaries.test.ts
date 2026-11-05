import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setImmediate } from 'node:timers';
import { getEventListeners } from 'node:events';
import { createDefaultMacroDefinition } from '../../../../../../packages/contracts/src/domain/macro.js';
import { FakeInputAdapter, NativeInputAdapter } from '../adapters/input-adapter.js';
import { FakeWindowAdapter } from '../adapters/window-adapter.js';
import { PlaybackCoordinator, type PlaybackCoordinatorOptions } from '../coordinators/playback-coordinator.js';
import { ConcurrentMacroManager } from '../state/concurrent-macro-manager.js';
import type { OverlayCoordinator } from '../state/overlay-coordinator.js';
import type { MacroDefinition, MacroEvent } from '../../ipc/types.js';

const key = (id: string, virtualKey = 65): MacroEvent => ({ id, type: 'KeyDown', eventType: 'KeyDown', timeMicroseconds: 0, virtualKey });

function setup(events: readonly MacroEvent[] = [key('key')], overrides: Partial<PlaybackCoordinatorOptions> = {}) {
  const input = new FakeInputAdapter();
  const windows = new FakeWindowAdapter();
  windows.openWindows = [{ handle: 42, title: 'Document - Editor', processName: 'editor', processId: 100 }];
  windows.currentForeground = { handle: 99, title: 'Other', processName: 'other', processId: 101 };
  const manager = new ConcurrentMacroManager();
  const overlay = { updateMacroOverlay: vi.fn(), clearMacroOverlay: vi.fn(), clearAllOverlays: vi.fn(), showTextCountdown: vi.fn() };
  const coordinator = new PlaybackCoordinator({ concurrentManager: manager, injector: input, windowAdapter: windows, overlayCoordinator: overlay as unknown as OverlayCoordinator, ...overrides });
  const base = createDefaultMacroDefinition();
  const macro = { ...base, events } as unknown as MacroDefinition;
  const directed = { ...macro, playback: { ...base.playback, targetMode: 'SpecificWindow', targetProcessName: 'EDITOR', targetWindowTitle: 'document - editor' } };
  return { input, windows, manager, coordinator, macro, directed };
}

describe('Production playback boundaries', () => {
  beforeEach(() => vi.useFakeTimers({ toFake: ['Date', 'performance', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] }));
  afterEach(() => vi.useRealTimers());

  it('resolves the saved background target without activating it', async () => {
    const { input, windows, coordinator, directed } = setup();
    await coordinator.play(directed);
    await vi.runAllTimersAsync();
    expect({ targets: input.targetWindows, activated: windows.activatedHandles }).toEqual({ targets: [42], activated: [] });
  });

  it('refuses a missing selected window before creating a session', async () => {
    const { input, windows, manager, coordinator, directed } = setup();
    windows.openWindows = [];
    await expect(coordinator.play(directed)).rejects.toThrow(/window.*not found/i);
    expect({ sessions: manager.activeSessionCount, sends: input.sentItems.length }).toEqual({ sessions: 0, sends: 0 });
  });

  it('matches the reference fallback when the selected title gains a suffix', async () => {
    const { input, windows, coordinator, directed } = setup();
    windows.openWindows = [{ handle: 42, title: 'Document - Editor (modified)', processName: 'editor', processId: 100 }];
    await coordinator.play(directed);
    await vi.runAllTimersAsync();
    expect(input.targetWindows).toEqual([42]);
  });

  it('requires a target selection instead of falling back to global input', async () => {
    const { coordinator, directed } = setup();
    await expect(coordinator.play({ ...directed, playback: { ...directed.playback, targetWindowTitle: '' } })).rejects.toThrow(/select.*target window/i);
  });

  it('checks the integrity of the actual target rather than the foreground window', async () => {
    const { coordinator, windows, directed } = setup();
    windows.higherIntegrityHandles.add(42);
    await expect(coordinator.play(directed)).rejects.toThrow(/privileges|integrity|UIPI/i);
  });

  it('keeps foreground delivery global when a saved window selection is present', async () => {
    const { input, coordinator, directed } = setup();
    await coordinator.play({ ...directed, playback: { ...directed.playback, targetMode: 'ForegroundAtStart' } });
    await vi.runAllTimersAsync();
    expect(input.targetWindows).toEqual([0]);
  });

  it('uses an explicit target handle without activating the window', async () => {
    const { input, coordinator, macro } = setup();
    await coordinator.play(macro, { targetWindowHandle: 42 });
    await vi.runAllTimersAsync();
    expect(input.targetWindows).toEqual([42]);
  });

  it('does not record user cancellation as a failed macro action', async () => {
    const { coordinator, manager, macro } = setup([{ id: 'pending', type: 'Delay', eventType: 'Delay', timeMicroseconds: 1_000_000 }]);
    const close = vi.spyOn(manager, 'closeSession');
    await coordinator.play(macro);
    coordinator.emergencyStop();
    await vi.runAllTimersAsync();
    expect(close.mock.results[0]?.value?.receipts).toEqual([]);
  });

  it('lets an emergency-stop callback interrupt a large zero-time group', async () => {
    const { input, coordinator, manager, macro } = setup(Array.from({ length: 10_000 }, (_, i) => key(`key-${i}`, 65 + i % 2)));
    const stop = new Promise<void>(resolve => setImmediate(() => { coordinator.emergencyStop(); resolve(); }));
    await coordinator.play(macro);
    await stop;
    await vi.advanceTimersByTimeAsync(0);
    expect({ stopped: manager.activeSessionCount === 0, interrupted: input.sentItems.length < 10_000, released: input.getHeldInputsCount() === 0 }).toEqual({ stopped: true, interrupted: true, released: true });
  });

  it('preserves stable order while yielding a large zero-time group', async () => {
    const events = Array.from({ length: 130 }, (_, i) => key(`key-${i}`));
    const { input, coordinator, manager, macro } = setup(events);
    await coordinator.play(macro);
    while (manager.activeSessionCount) await new Promise<void>(resolve => setImmediate(resolve));
    expect(input.sentItems.map(event => event.id)).toEqual(events.map(event => event.id));
  });

  it('shares the stop-response budget across nested macro calls', async () => {
    const child = setup(Array.from({ length: 63 }, (_, i) => key(`child-${i}`))).macro;
    const calls = Array.from({ length: 100 }, (_, i): MacroEvent => ({ id: `call-${i}`, type: 'RunMacro', eventType: 'RunMacro', timeMicroseconds: 0, subMacroName: child.name }));
    const { input, coordinator, macro } = setup(calls, { resolveMacroByName: () => child });
    const stop = new Promise<void>(resolve => setImmediate(() => { coordinator.emergencyStop(); resolve(); }));
    await coordinator.play(macro);
    await stop;
    await vi.advanceTimersByTimeAsync(0);
    expect(input.sentItems.length).toBeLessThan(64);
  });

  it('does not overflow the Node timer limit for distant deadlines', async () => {
    const timer = vi.spyOn(globalThis, 'setTimeout');
    const { coordinator, macro } = setup([{ id: 'distant', type: 'Delay', eventType: 'Delay', timeMicroseconds: 3_000_000_000_000 }]);
    await coordinator.play(macro);
    const requestedDelay = timer.mock.calls[0]?.[1];
    coordinator.emergencyStop();
    await vi.runAllTimersAsync();
    timer.mockRestore();
    expect(requestedDelay).toBeLessThanOrEqual(2_147_483_647);
  });

  it('detaches external cancellation listeners after a session completes', () => {
    const { manager, macro } = setup();
    const cancellation = new AbortController();
    const session = manager.createSession(macro, 1, 0, cancellation.signal);
    manager.closeSession(session.sessionId);
    expect(getEventListeners(cancellation.signal, 'abort')).toHaveLength(0);
  });

  it('attempts remaining releases after one native key release fails', async () => {
    const injectKeyboard = vi.fn((command: { virtualKey: number; isUp: boolean }) => ({ success: !command.isUp || command.virtualKey !== 65 }));
    const input = new NativeInputAdapter({ injectKeyboard });
    await input.sendAsync(key('a', 65), 0, 0, false, 42);
    await input.sendAsync(key('b', 66), 0, 0, false, 42);
    expect(() => input.releaseInputs([key('a', 65), key('b', 66)], 42)).toThrow();
    expect(injectKeyboard.mock.calls.filter(([command]) => command.isUp).map(([command]) => command.virtualKey)).toEqual([65, 66]);
  });

  it('releases a scan-code key using the original native key identity', async () => {
    const injectKeyboard = vi.fn(() => ({ success: true }));
    const input = new NativeInputAdapter({ injectKeyboard });
    const event = { ...key('scan'), scanCode: 30, extended: true };
    await input.sendAsync(event, 0, 0, true, 42);
    input.releaseInputs([event], 42);
    expect(injectKeyboard).toHaveBeenLastCalledWith(expect.objectContaining({ virtualKey: 65, scanCode: 30, extended: true, isUp: true, targetWindow: 42 }));
  });

  it('keeps the pressed key identity when its explicit key-up uses different options', async () => {
    const injectKeyboard = vi.fn(() => ({ success: true }));
    const input = new NativeInputAdapter({ injectKeyboard });
    await input.sendAsync({ ...key('down'), scanCode: 30, extended: true }, 0, 0, true, 42);
    await input.sendAsync({ ...key('up'), type: 'KeyUp', eventType: 'KeyUp', scanCode: 0, extended: false }, 0, 0, false, 42);
    expect(injectKeyboard).toHaveBeenLastCalledWith(expect.objectContaining({ scanCode: 30, extended: true, isUp: true }));
    expect(input.getHeldInputsCount()).toBe(0);
  });

  it('rejects a missing native acknowledgement instead of recording success', async () => {
    const input = new NativeInputAdapter({ injectKeyboard: () => undefined });
    await expect(input.sendAsync(key('key'), 0, 0, false, 0)).rejects.toThrow(/injection failed|receipt|acknowledgement/i);
    expect(input.getHeldInputsCount()).toBe(0);
  });

  it.each(['MouseButtonDown', 'MouseMove', 'Wheel', 'HorizontalWheel', 'TypeText'])('rejects a missing native acknowledgement for %s', async type => {
    const input = new NativeInputAdapter({ injectKeyboard: () => undefined, injectMouse: () => undefined });
    const event = { id: 'missing', type, eventType: type, timeMicroseconds: 0, button: 'Left', text: 'test', wheelDelta: 120 } as MacroEvent;
    await expect(input.sendAsync(event, 0, 0, false, 0)).rejects.toThrow(/failed/i);
    expect(input.getHeldInputsCount()).toBe(0);
  });
});
