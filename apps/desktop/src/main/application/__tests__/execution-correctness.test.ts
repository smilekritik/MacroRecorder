import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDefaultMacroDefinition } from '../../../../../../packages/contracts/src/domain/macro.js';
import { injectKeyboardCommandSchema } from '../../../../../../packages/contracts/src/native/commands.js';
import { FakeInputAdapter, NativeInputAdapter } from '../adapters/input-adapter.js';
import { FakeWindowAdapter } from '../adapters/window-adapter.js';
import { PlaybackCoordinator, type PlaybackCoordinatorOptions } from '../coordinators/playback-coordinator.js';
import { ConcurrentMacroManager } from '../state/concurrent-macro-manager.js';
import type { OverlayCoordinator } from '../state/overlay-coordinator.js';
import type { MacroDefinition } from '../../ipc/types.js';

function setup(events: readonly Record<string, unknown>[], overrides: Partial<PlaybackCoordinatorOptions> = {}) {
  const input = new FakeInputAdapter();
  const manager = new ConcurrentMacroManager();
  const overlay = { updateMacroOverlay: vi.fn(), showTextCountdown: vi.fn(), clearMacroOverlay: vi.fn(), clearAllOverlays: vi.fn() };
  const coordinator = new PlaybackCoordinator({ concurrentManager: manager, injector: input, overlayCoordinator: overlay as unknown as OverlayCoordinator, ...overrides });
  const macro = createDefaultMacroDefinition();
  const applicationMacro = { ...macro, events: events.map(event => ({ ...event, eventType: event['type'] })) } as unknown as MacroDefinition;
  return { input, manager, overlay, coordinator, macro: applicationMacro };
}

describe('Production execution correctness', () => {
  beforeEach(() => vi.useFakeTimers({ toFake: ['Date', 'performance', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] }));
  afterEach(() => vi.useRealTimers());

  it('allows the first activation immediately after startup', () => {
    const { coordinator, macro } = setup([]);
    expect(coordinator.evaluateActivation(macro, undefined, true)).toBe('Start');
  });

  it('stops WhileHeld immediately on release without the toggle debounce guard', () => {
    const { coordinator, manager, macro } = setup([]);
    const heldMacro = { ...macro, playback: { ...(macro['playback'] as Record<string, unknown>), activationMode: 'WhileHeld' } };
    const session = manager.createSession(heldMacro);
    expect(coordinator.evaluateActivation(heldMacro, session, false)).toBe('Stop');
  });

  it('publishes Idle when playback finishes', async () => {
    const { coordinator, macro } = setup([{ id: 'key', type: 'KeyDown', timeMicroseconds: 1000, virtualKey: 65 }]);
    const states: string[] = [];
    coordinator.onStatusChange(status => states.push(status.state));
    await coordinator.play(macro);
    await vi.runAllTimersAsync();
    expect(states.at(-1)).toBe('Idle');
  });

  it('ignores a repeated Once shortcut while its macro is running', async () => {
    const { coordinator, manager, macro } = setup([{ id: 'delay', type: 'Delay', timeMicroseconds: 1_000_000 }]);
    await coordinator.activate(macro);
    await coordinator.activate(macro);
    expect(manager.activeSessionCount).toBe(1);
    coordinator.emergencyStop();
    await vi.runAllTimersAsync();
  });

  it('stops a ToggleStop shortcut instead of launching a second session', async () => {
    const { coordinator, manager, macro } = setup([{ id: 'delay', type: 'Delay', timeMicroseconds: 1_000_000 }]);
    const toggle = { ...macro, playback: { ...(macro['playback'] as Record<string, unknown>), activationMode: 'ToggleStop' } };
    await coordinator.activate(toggle);
    await vi.advanceTimersByTimeAsync(50);
    await coordinator.activate(toggle);
    await vi.runAllTimersAsync();
    expect(manager.activeSessionCount).toBe(0);
  });

  it('stops a WhileHeld macro when the physical shortcut is released', async () => {
    const { input, coordinator, manager, macro } = setup([{ id: 'delay', type: 'Delay', timeMicroseconds: 1_000_000 }]);
    const key = vi.spyOn(input, 'isKeyDown').mockReturnValue(true);
    const held = { ...macro, hotkey: { virtualKey: 65 }, playback: { ...(macro['playback'] as Record<string, unknown>), activationMode: 'WhileHeld' } };
    await coordinator.activate(held);
    key.mockReturnValue(false);
    await vi.advanceTimersByTimeAsync(20);
    expect(manager.activeSessionCount).toBe(0);
  });

  it('keeps a pending event blocked when paused during its deadline wait', async () => {
    const { input, coordinator, macro } = setup([{ id: 'key', type: 'KeyDown', timeMicroseconds: 1_000_000, virtualKey: 65 }]);
    await coordinator.play(macro);
    await vi.advanceTimersByTimeAsync(100);
    coordinator.pause();
    await vi.advanceTimersByTimeAsync(1500);
    expect(input.sentItems).toHaveLength(0);
    coordinator.resume();
    await vi.advanceTimersByTimeAsync(899);
    expect(input.sentItems).toHaveLength(0);
    await vi.runAllTimersAsync();
    expect(input.sentItems).toHaveLength(1);
  });

  it('preserves the interval between repeats', async () => {
    const { input, coordinator, macro } = setup([{ id: 'key', type: 'KeyDown', timeMicroseconds: 0, virtualKey: 65 }]);
    const repeated = { ...macro, playback: { ...(macro['playback'] as Record<string, unknown>), repeatCount: 2, repeatDelayMilliseconds: 500 } };
    await coordinator.play(repeated);
    await vi.advanceTimersByTimeAsync(499);
    expect(input.sentItems).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(input.sentItems).toHaveLength(2);
  });

  it.each([['ForegroundAtStart', false], ['SpecificWindow', true]])('matches reference scan-code policy for %s', async (targetMode, expected) => {
    const windows = new FakeWindowAdapter();
    windows.openWindows = [{ handle: 42, title: 'Editor', processName: 'editor', processId: 100 }];
    const { input, coordinator, macro } = setup([{ id: 'key', type: 'KeyDown', timeMicroseconds: 0, virtualKey: 65 }], { windowAdapter: windows });
    const configured = { ...macro, playback: { ...(macro['playback'] as Record<string, unknown>), targetMode, preferScanCodes: true, targetProcessName: 'editor', targetWindowTitle: 'Editor' } };
    await coordinator.play(configured);
    await vi.runAllTimersAsync();
    expect(input.scanCodePreferences).toEqual([expected]);
  });

  it('uses nested macro speed and preserves the following parent interval', async () => {
    const childBase = setup([{ id: 'child-key', type: 'KeyDown', timeMicroseconds: 100_000, virtualKey: 65 }]).macro;
    const child = { ...childBase, id: 'child', name: 'child', playback: { ...(childBase['playback'] as Record<string, unknown>), speed: 2 } };
    const { input, coordinator, macro } = setup([
      { id: 'call', type: 'RunMacro', timeMicroseconds: 0, subMacroName: 'child' },
      { id: 'parent-key', type: 'KeyDown', timeMicroseconds: 100_000, virtualKey: 66 },
    ], { resolveMacroByName: () => child });
    await coordinator.play(macro);
    await vi.advanceTimersByTimeAsync(49);
    expect(input.sentItems).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(1);
    expect(input.sentItems).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(99);
    expect(input.sentItems).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(input.sentItems).toHaveLength(2);
  });

  it.each([65, 66])('keeps another session holding key %i when the first macro ends', async secondKey => {
    const { input, coordinator, macro } = setup([
      { id: 'down-a', type: 'KeyDown', timeMicroseconds: 0, virtualKey: 65 },
      { id: 'end-a', type: 'Delay', timeMicroseconds: 100_000 },
    ]);
    const second = { ...macro, id: 'second-macro', events: [
      { id: 'down-b', type: 'KeyDown', eventType: 'KeyDown', timeMicroseconds: 0, virtualKey: secondKey },
      { id: 'end-b', type: 'Delay', eventType: 'Delay', timeMicroseconds: 200_000 },
    ] };
    await coordinator.play(macro);
    await coordinator.play(second);
    await vi.advanceTimersByTimeAsync(100);
    expect(input.isKeyDown(secondKey)).toBe(true);
    await vi.runAllTimersAsync();
    expect(input.getHeldInputsCount()).toBe(0);
  });

  it('shows an overlay at its authored time without blocking the next input', async () => {
    const { input, overlay, coordinator, macro } = setup([
      { id: 'text', type: 'OverlayText', timeMicroseconds: 1_000_000, durationMicroseconds: 2_000_000, text: 'message' },
      { id: 'key', type: 'KeyDown', timeMicroseconds: 1_100_000, virtualKey: 65 },
    ]);
    await coordinator.play(macro);
    expect(overlay.showTextCountdown).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1000);
    expect(overlay.showTextCountdown).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(100);
    expect(input.sentItems).toHaveLength(1);
    await vi.runAllTimersAsync();
  });

  it('starts a condition at its authored time', async () => {
    const { input, coordinator, macro } = setup([{ id: 'wait', type: 'WaitForKey', timeMicroseconds: 1_000_000, waitKeyVirtualKey: 65 }]);
    const keyState = vi.spyOn(input, 'isKeyDown').mockReturnValue(true);
    await coordinator.play(macro);
    expect(keyState).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1000);
    expect(keyState).toHaveBeenCalledOnce();
  });

  it('preserves the authored interval after a blocking condition', async () => {
    const { input, coordinator, macro } = setup([
      { id: 'wait', type: 'WaitForKey', timeMicroseconds: 0, waitKeyVirtualKey: 65 },
      { id: 'key', type: 'KeyDown', timeMicroseconds: 100_000, virtualKey: 66 },
    ]);
    vi.spyOn(input, 'isKeyDown').mockImplementation(() => performance.now() >= 50);
    await coordinator.play(macro);
    await vi.advanceTimersByTimeAsync(159);
    expect(input.sentItems).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(1);
    expect(input.sentItems).toHaveLength(1);
  });

  it('does not turn an unavailable foreground window into a satisfied wait', async () => {
    const { coordinator, manager, macro } = setup([{ id: 'wait', type: 'WaitForWindow', timeMicroseconds: 0, waitProcessName: 'missing', waitTimeoutMilliseconds: 10 }]);
    const closeSession = vi.spyOn(manager, 'closeSession');
    await coordinator.play(macro);
    await vi.runAllTimersAsync();
    expect(manager.activeSessionCount).toBe(0);
    expect(closeSession.mock.results[0]?.value?.receipts[0]?.success).toBe(false);
  });

  it('sends Unicode text once through the native text contract', async () => {
    const injectKeyboard = vi.fn(() => ({ success: true, confirmedMicroseconds: null }));
    const input = new NativeInputAdapter({ injectKeyboard });
    await input.sendAsync({ id: 'text', type: 'TypeText', eventType: 'TypeText', text: 'A\r\n😀', timeMicroseconds: 0 }, 0, 0, false, 0);
    expect(injectKeyboard).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ isUnicode: true, unicodeChar: 'A\r\n😀' }));
  });

  it('validates a whole Unicode string at the native text boundary', () => {
    expect(injectKeyboardCommandSchema.parse({ virtualKey: 0, scanCode: 0, extended: false, isUp: false, isUnicode: true, unicodeChar: 'A\r\n😀', targetWindow: 123 }).success).toBe(true);
  });

  it('preserves missing native hook confirmation', async () => {
    const input = new NativeInputAdapter({ injectKeyboard: () => ({ success: true, confirmedMicroseconds: null }) });
    const receipt = await input.sendAsync({ id: 'key', type: 'KeyDown', eventType: 'KeyDown', timeMicroseconds: 0, virtualKey: 65 }, 0, 0, false, 0);
    expect(receipt.confirmedMicroseconds).toBeNull();
  });

  it('routes targeted keyboard input to the native window contract', async () => {
    const injectKeyboard = vi.fn(() => ({ success: true, confirmedMicroseconds: null }));
    const input = new NativeInputAdapter({ injectKeyboard });
    await input.sendAsync({ id: 'targeted', type: 'KeyDown', eventType: 'KeyDown', virtualKey: 65, timeMicroseconds: 0 }, 0, 0, false, 123);
    expect(injectKeyboard).toHaveBeenCalledWith(expect.objectContaining({ targetWindow: 123, virtualKey: 65 }));
  });

  it('preserves the X2 mouse button in the native command', async () => {
    const injectMouse = vi.fn(() => ({ success: true, confirmedMicroseconds: null }));
    const input = new NativeInputAdapter({ injectMouse });
    await input.sendAsync({ id: 'x2', type: 'MouseButtonDown', eventType: 'MouseButtonDown', button: 'X2', timeMicroseconds: 0 }, 0, 0, false, 0);
    expect(injectMouse).toHaveBeenCalledWith(expect.objectContaining({ button: 'X2' }));
  });
});
