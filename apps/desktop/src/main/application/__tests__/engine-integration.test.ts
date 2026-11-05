import { describe, expect, it, vi } from 'vitest';
import { buildEnginePlan, hotkeyModifiers, isAutomaticMacro, MOD_CONTROL, MOD_SHIFT } from '../adapters/engine-plan.js';
import type { EngineReport, IPlaybackEngine } from '../adapters/engine-adapter.js';
import { GlobalControlCoordinator } from '../coordinators/global-control-coordinator.js';
import { PlaybackCoordinator } from '../coordinators/playback-coordinator.js';
import { RecordingCoordinator } from '../coordinators/recording-coordinator.js';
import { FakeHotkeyAdapter } from '../adapters/hotkey-adapter.js';
import { FakeInputAdapter } from '../adapters/input-adapter.js';
import { FakeWindowOrchestrator } from '../adapters/window-orchestrator.js';
import { ConcurrentMacroManager } from '../state/concurrent-macro-manager.js';
import { OverlayCoordinator } from '../state/overlay-coordinator.js';
import type { MacroDefinition, MacroEvent } from '../../ipc/types.js';

function macro(overrides: Partial<MacroDefinition> & Record<string, unknown> = {}): MacroDefinition {
  return { id: 'm1', name: 'Macro', isEnabled: true, events: [], playback: {}, ...overrides } as unknown as MacroDefinition;
}

function event(type: string, time: number, extra: Record<string, unknown> = {}): MacroEvent {
  return { id: `${type}-${time}`, type, timeMicroseconds: time, comment: '', ...extra } as unknown as MacroEvent;
}

class FakeEngine implements IPlaybackEngine {
  public readonly calls: unknown[][] = [];
  public failStartWith: string | null = null;
  private listeners = new Set<(report: EngineReport) => void>();
  private nextId = 1;

  public emit(report: EngineReport): void {
    for (const listener of this.listeners) listener(report);
  }
  public onReport(listener: (report: EngineReport) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  public loadMacros(macros: readonly MacroDefinition[]): readonly string[] {
    this.calls.push(['loadMacros', macros.map((item) => item.id)]);
    return [];
  }
  public upsertMacro(item: MacroDefinition): readonly string[] {
    this.calls.push(['upsertMacro', item]);
    return [];
  }
  public start(macroId: string, activation: string, target?: number): number {
    if (this.failStartWith) throw new Error(this.failStartWith);
    this.calls.push(['start', macroId, activation, target]);
    return this.nextId++;
  }
  public activate(macroId: string): void {
    this.calls.push(['activate', macroId]);
  }
  public pause(sessionId?: number): boolean {
    this.calls.push(['pause', sessionId]);
    return true;
  }
  public resume(sessionId?: number): boolean {
    this.calls.push(['resume', sessionId]);
    return true;
  }
  public stop(sessionId?: number): boolean {
    this.calls.push(['stop', sessionId]);
    return true;
  }
  public emergencyStop(reason: string): void {
    this.calls.push(['emergencyStop', reason]);
  }
  public suspendAutomatic(suspended: boolean): void {
    this.calls.push(['suspendAutomatic', suspended]);
  }
  public setRecording(recording: boolean, gamepad: boolean): void {
    this.calls.push(['setRecording', recording, gamepad]);
  }
  public configureGamepad(output: string, hideReal: boolean): void {
    this.calls.push(['configureGamepad', output, hideReal]);
  }
}

function playbackWith(engine: FakeEngine, history?: { record: ReturnType<typeof vi.fn> }) {
  const sessions = new ConcurrentMacroManager();
  const coordinator = new PlaybackCoordinator({
    concurrentManager: sessions,
    injector: new FakeInputAdapter(),
    overlayCoordinator: new OverlayCoordinator(new FakeWindowOrchestrator()),
    historyStore: history as never,
    resolveMacroById: () => macro(),
    engine,
  });
  return { coordinator, sessions };
}

describe('engine plans', () => {
  it('orders by time, puts waits first within a moment, and drops comments', () => {
    const plan = buildEnginePlan(macro({
      events: [
        event('KeyUp', 2000, { virtualKey: 65 }),
        event('Comment', 1000),
        event('KeyDown', 1000, { virtualKey: 65, scanCode: 30 }),
        event('WaitForKey', 1000, { waitKeyVirtualKey: 66, waitTimeoutMilliseconds: 250 }),
      ],
    }));
    expect(plan.events.map((item) => item.kind)).toEqual(['WaitForKey', 'KeyDown', 'KeyUp']);
    expect(plan.events[0]).toMatchObject({ waitKey: 66, timeoutMilliseconds: 250 });
    expect(plan.events[1]).toMatchObject({ virtualKey: 65, scanCode: 30 });
  });

  it('keeps press and release order at the same moment', () => {
    const plan = buildEnginePlan(macro({
      events: [event('KeyDown', 1000, { id: 'a' }), event('KeyUp', 1000, { id: 'b' })],
    }));
    expect(plan.events.map((item) => item.id)).toEqual(['a', 'b']);
  });

  it('counts an overlay duration in the macro length', () => {
    const plan = buildEnginePlan(macro({
      events: [event('OverlayText', 1000, { text: 'x', durationMicroseconds: 5000 }), event('KeyDown', 2000)],
    }));
    expect(plan.durationMicroseconds).toBe(6000);
  });

  it('maps every event family to the fields the engine reads', () => {
    const plan = buildEnginePlan(macro({
      events: [
        event('MouseMove', 0, { deltaX: 3, deltaY: -4, absoluteMove: true }),
        event('MouseButtonDown', 1, { button: 'X2' }),
        event('Wheel', 2, { wheelDelta: -120 }),
        event('TypeText', 3, { text: 'héllo' }),
        event('PixelColorTrigger', 4, { pixelX: 1, pixelY: 2, pixelColor: 0x1ffffff, triggerCooldownMilliseconds: 9 }),
        event('RunMacro', 5, { subMacroName: 'Sub' }),
        event('GamepadAxis', 6, { gamepadAxis: 'LeftStickX', axisValue: 123 }),
        event('WaitForWindow', 7, { waitProcessName: 'p', waitWindowTitle: 't' }),
      ],
    }));
    expect(plan.events[0]).toMatchObject({ deltaX: 3, deltaY: -4, absolute: true });
    expect(plan.events[1]).toMatchObject({ button: 'X2' });
    expect(plan.events[2]).toMatchObject({ wheelDelta: -120 });
    expect(plan.events[3]).toMatchObject({ text: 'héllo' });
    expect(plan.events[4]).toMatchObject({ pixelX: 1, pixelY: 2, pixelColor: 0xffffff, cooldownMilliseconds: 9 });
    expect(plan.events[5]).toMatchObject({ subMacro: 'Sub' });
    expect(plan.events[6]).toMatchObject({ gamepadAxis: 'LeftStickX', axisValue: 123 });
    expect(plan.events[7]).toMatchObject({ waitProcess: 'p', waitTitle: 't' });
  });

  it('reads modifiers from stored flags and detects automatic macros past comments', () => {
    expect(hotkeyModifiers({ control: true, shift: true })).toBe(MOD_CONTROL | MOD_SHIFT);
    expect(isAutomaticMacro(macro({ events: [event('Comment', 0), event('PixelColorTrigger', 0)] }))).toBe(true);
    expect(isAutomaticMacro(macro({ events: [event('KeyDown', 0), event('PixelColorTrigger', 1)] }))).toBe(false);
  });
});

describe('playback through the engine', () => {
  it('sends the plan, then starts, and reflects reported state', async () => {
    const engine = new FakeEngine();
    const { coordinator, sessions } = playbackWith(engine);
    await coordinator.play(macro(), { speed: 2, activationName: 'Manual' });
    expect(engine.calls[0]?.[0]).toBe('upsertMacro');
    expect(((engine.calls[0]?.[1] as MacroDefinition).playback as Record<string, unknown>)['speed']).toBe(2);
    expect(engine.calls[1]).toEqual(['start', 'm1', 'Manual', undefined]);

    engine.emit({ kind: 'state', sessionId: 1, macroId: 'm1', macroName: 'Macro', state: 'Playing', activation: 'Manual' });
    expect(coordinator.getStatus().state).toBe('Playing');
    expect(sessions.activeSessionCount).toBe(1);
    engine.emit({ kind: 'finished', sessionId: 1, macroId: 'm1', macroName: 'Macro', elapsedMicroseconds: 5000 });
    expect(coordinator.getStatus().state).toBe('Idle');
  });

  it('records history with converted receipts when a run ends', () => {
    const engine = new FakeEngine();
    const history = { record: vi.fn() };
    playbackWith(engine, history);
    engine.emit({ kind: 'state', sessionId: 7, macroId: 'm1', macroName: 'Macro', activation: 'Hotkey' });
    engine.emit({
      kind: 'receipts',
      sessionId: 7,
      receipts: [{ id: 'e', scheduledMicroseconds: 1000, startedMicroseconds: 1500, completedMicroseconds: 1600, success: true, confirmedMicroseconds: 1550 }],
    });
    engine.emit({ kind: 'finished', sessionId: 7, macroId: 'm1', elapsedMicroseconds: 9000 });
    const [, receipts, activation, duration] = history.record.mock.calls[0] as [unknown, Array<{ dispatchJitterMilliseconds: number; confirmationMilliseconds: number }>, string, number];
    expect(activation).toBe('Hotkey');
    expect(duration).toBe(9);
    expect(receipts[0]?.dispatchJitterMilliseconds).toBe(0.5);
    expect(receipts[0]?.confirmationMilliseconds).toBe(0.05);
  });

  it('measures jitter from the randomized target, not the authored time', () => {
    const engine = new FakeEngine();
    const history = { record: vi.fn() };
    playbackWith(engine, history);
    engine.emit({ kind: 'state', sessionId: 1, macroId: 'm1', activation: 'Manual' });
    engine.emit({ kind: 'receipts', sessionId: 1, receipts: [{ id: 'e', scheduledMicroseconds: 1000, plannedMicroseconds: 4000, startedMicroseconds: 4100, completedMicroseconds: 4100, success: true }] });
    engine.emit({ kind: 'finished', sessionId: 1, macroId: 'm1' });
    const receipts = history.record.mock.calls[0]?.[1] as Array<{ dispatchJitterMilliseconds: number }>;
    expect(receipts[0]?.dispatchJitterMilliseconds).toBe(0.1);
  });

  it('keeps background monitors out of the playback status', () => {
    const engine = new FakeEngine();
    const { coordinator } = playbackWith(engine);
    engine.emit({ kind: 'state', sessionId: 1, macroId: 'm1', activation: 'Automatic', state: 'Playing' });
    expect(coordinator.getStatus().state).toBe('Idle');
  });

  it('routes control commands to the matching native session', async () => {
    const engine = new FakeEngine();
    const { coordinator, sessions } = playbackWith(engine);
    engine.emit({ kind: 'state', sessionId: 42, macroId: 'm1', activation: 'Hotkey' });
    const sessionId = sessions.getAllActiveSessions()[0]!.sessionId;
    coordinator.pause(sessionId);
    coordinator.resume(sessionId);
    coordinator.stop(sessionId, 'because');
    coordinator.stop();
    coordinator.emergencyStop('now');
    expect(engine.calls).toEqual([
      ['pause', 42],
      ['resume', 42],
      ['stop', 42],
      ['stop', undefined],
      ['emergencyStop', 'now'],
    ]);
  });

  it('surfaces a target problem to the caller', async () => {
    const engine = new FakeEngine();
    engine.failStartWith = 'Select a target window on the Playback tab first.';
    const { coordinator } = playbackWith(engine);
    await expect(coordinator.play(macro())).rejects.toThrow(/target window/);
  });

  it('reports a bind-started failure in the run history', () => {
    const engine = new FakeEngine();
    const history = { record: vi.fn() };
    playbackWith(engine, history);
    engine.emit({ kind: 'finished', sessionId: 3, macroId: 'm1', macroName: 'Macro', activation: 'Hotkey', error: 'The selected window was not found.' });
    const receipts = history.record.mock.calls[0]?.[1] as Array<{ success: boolean }>;
    expect(receipts[0]?.success).toBe(false);
  });
});

describe('recording', () => {
  function recorder() {
    const coordinator = new RecordingCoordinator({ windowOrchestrator: new FakeWindowOrchestrator() });
    const capture = { setRecording: vi.fn(), suspendAutomatic: vi.fn() };
    const persist = vi.fn();
    coordinator.configure({
      capture,
      persist,
      controlGestures: () => ({ virtualKeys: [0x77], mouseButtons: ['X2'] }),
    });
    return { coordinator, capture, persist };
  }

  const key = (type: string, virtualKey: number) => ({ id: `${type}${virtualKey}`, type, virtualKey } as unknown as MacroEvent);

  it('forwards physical input only during the session, with the gamepad flag', () => {
    const { coordinator, capture } = recorder();
    coordinator.start({ gamepad: false });
    expect(capture.setRecording).toHaveBeenLastCalledWith(true, false);
    expect(capture.suspendAutomatic).toHaveBeenLastCalledWith(true);
    coordinator.stop();
    expect(capture.setRecording).toHaveBeenLastCalledWith(false, false);
    expect(capture.suspendAutomatic).toHaveBeenLastCalledWith(false);
  });

  it('turns the gamepad poller on only when asked', () => {
    const { coordinator, capture } = recorder();
    coordinator.start({ gamepad: true });
    expect(capture.setRecording).toHaveBeenLastCalledWith(true, true);
  });

  it('ignores auto-repeat, releases without a press, and control gestures', () => {
    const { coordinator } = recorder();
    coordinator.start({});
    coordinator.addEvent(key('KeyUp', 65), 100);
    coordinator.addEvent(key('KeyDown', 66), 1000);
    coordinator.addEvent(key('KeyDown', 66), 1100);
    coordinator.addEvent(key('KeyUp', 66), 1200);
    coordinator.addEvent(key('KeyDown', 0x77), 1300);
    coordinator.addEvent({ id: 'x', type: 'MouseButtonDown', button: 'X2' } as unknown as MacroEvent, 1400);
    const result = coordinator.stop();
    expect(result.events?.map((item) => `${String(item.type)}${String(item['virtualKey'])}`)).toEqual(['KeyDown66', 'KeyUp66']);
  });

  it('adds relative moves when compressing, keeping the total distance', () => {
    const { coordinator } = recorder();
    coordinator.start({ mouseMoveBucketMilliseconds: 10 });
    const move = (dx: number, dy: number) => ({ id: `${dx}`, type: 'MouseMove', deltaX: dx, deltaY: dy } as unknown as MacroEvent);
    coordinator.addEvent(move(1, 2), 100_000);
    coordinator.addEvent(move(3, 4), 102_000);
    coordinator.addEvent(move(5, 6), 104_000);
    coordinator.addEvent(move(7, 8), 120_000);
    const moves = coordinator.stop().events ?? [];
    expect(moves.reduce((sum, item) => sum + Number(item['deltaX']), 0)).toBe(16);
    expect(moves.reduce((sum, item) => sum + Number(item['deltaY']), 0)).toBe(20);
    expect(moves).toHaveLength(2);
  });

  it('drops a modifier left unreleased, so a replay cannot leave it held', () => {
    const { coordinator } = recorder();
    coordinator.start({});
    coordinator.addEvent(key('KeyDown', 0x11), 1000);
    coordinator.addEvent(key('KeyDown', 65), 2000);
    coordinator.addEvent(key('KeyUp', 65), 3000);
    const events = coordinator.stop().events ?? [];
    expect(events.map((item) => item['virtualKey'])).toEqual([65, 65]);
    expect(events[0]?.timeMicroseconds).toBe(0);
  });

  const base = () => macro({ events: [event('KeyDown', 0, { virtualKey: 1 }), event('KeyUp', 50_000, { virtualKey: 1 })] });

  it('saves into the target macro, keeping its identity and settings', () => {
    const { coordinator, persist } = recorder();
    coordinator.start({}, 0, 'Overwrite', macro({ name: 'Kept', hotkey: { virtualKey: 70 }, events: [event('KeyDown', 0)] }));
    coordinator.addEvent(key('KeyDown', 65), 1000);
    coordinator.stop();
    const saved = persist.mock.calls[0]?.[0] as MacroDefinition;
    expect(saved).toMatchObject({ id: 'm1', name: 'Kept', hotkey: { virtualKey: 70 } });
    expect(saved.events?.map((item) => item['virtualKey'])).toEqual([65]);
  });

  it('appends after the macro end with a gap', () => {
    const { coordinator } = recorder();
    coordinator.start({}, 0, 'Append', base());
    coordinator.addEvent(key('KeyDown', 65), 1000);
    expect(coordinator.stop().events?.at(-1)?.timeMicroseconds).toBe(60_000);
  });

  it('inserts at the selected action and shifts later ones', () => {
    const { coordinator } = recorder();
    coordinator.start({}, 0, 'Continue', base(), 50_000);
    coordinator.addEvent(key('KeyDown', 65), 1000);
    coordinator.addEvent(key('KeyUp', 65), 21_000);
    const events = coordinator.stop().events ?? [];
    expect(events.map((item) => [item['virtualKey'], item.timeMicroseconds])).toEqual([
      [1, 0],
      [65, 50_000],
      [65, 70_000],
      [1, 80_000],
    ]);
  });

  it('does not touch the macro when a session never began', () => {
    const { coordinator, persist } = recorder();
    coordinator.start({}, 5, 'Overwrite', base());
    coordinator.stop();
    expect(persist).not.toHaveBeenCalled();
  });
});

describe('binds', () => {
  function control(engine?: FakeEngine) {
    const hotkey = new FakeHotkeyAdapter();
    const sessions = new ConcurrentMacroManager();
    const playback = new PlaybackCoordinator({
      concurrentManager: sessions,
      injector: new FakeInputAdapter(),
      overlayCoordinator: new OverlayCoordinator(new FakeWindowOrchestrator()),
      engine,
    });
    const coordinator = new GlobalControlCoordinator({
      hotkeyAdapter: hotkey,
      playbackCoordinator: playback,
      recordingCoordinator: new RecordingCoordinator({ windowOrchestrator: new FakeWindowOrchestrator() }),
      windowOrchestrator: new FakeWindowOrchestrator(),
      onMacrosChanged: (macros) => engine?.loadMacros(macros),
    });
    return { coordinator, hotkey };
  }

  it('registers modifiers from stored flags instead of a bare key', () => {
    const { coordinator, hotkey } = control();
    coordinator.refreshMacroHotkeys([macro({ hotkey: { virtualKey: 0x31, control: true, shift: true, mouseButton: 'None', wheel: 'None' } })]);
    const registered = hotkey.getRegisteredHotkeys().find((item) => item.macroId === 'm1');
    expect(registered).toMatchObject({ virtualKey: 0x31, modifiers: MOD_CONTROL | MOD_SHIFT });
  });

  it('registers mouse and wheel binds, which have no virtual key', () => {
    const { coordinator, hotkey } = control();
    coordinator.refreshMacroHotkeys([
      macro({ hotkey: { virtualKey: 0, mouseButton: 'X1', wheel: 'None' } }),
      macro({ id: 'm2', hotkey: { virtualKey: 0, mouseButton: 'None', wheel: 'Up' } }),
    ]);
    const list = hotkey.getRegisteredHotkeys();
    expect(list.find((item) => item.macroId === 'm1')).toMatchObject({ mouseButton: 'X1' });
    expect(list.find((item) => item.macroId === 'm2')).toMatchObject({ wheel: 'Up' });
  });

  it('applies pass-through and window scope from the playback options', () => {
    const { coordinator, hotkey } = control();
    coordinator.refreshMacroHotkeys([macro({
      hotkey: { virtualKey: 65 },
      playback: { passThroughHotkey: true, hotkeyScopedToTarget: true, targetProcessName: 'game.exe', targetWindowTitle: 'Game' },
    })]);
    expect(hotkey.getRegisteredHotkeys().find((item) => item.macroId === 'm1')).toMatchObject({
      passThrough: true,
      scopeProcess: 'game.exe',
      scopeTitle: 'Game',
    });
  });

  it('gives automatic macros no bind, and loads plans before registering', () => {
    const engine = new FakeEngine();
    const { coordinator, hotkey } = control(engine);
    coordinator.refreshMacroHotkeys([macro({ hotkey: { virtualKey: 65 }, events: [event('PixelColorTrigger', 0)] })]);
    expect(hotkey.getRegisteredHotkeys().some((item) => item.macroId === 'm1')).toBe(false);
    expect(engine.calls[0]).toEqual(['loadMacros', ['m1']]);
  });

  it('leaves a deliberately cleared application command without a bind', () => {
    const { coordinator, hotkey } = control();
    coordinator.refreshSystemHotkeys({ recordingStopHotkey: { virtualKey: 0, mouseButton: 'None', wheel: 'None' } });
    expect(hotkey.getRegisteredHotkeys().some((item) => item.id === 3)).toBe(false);
  });

  it('marks the emergency bind for native handling', () => {
    const { coordinator, hotkey } = control();
    coordinator.refreshSystemHotkeys({});
    expect(hotkey.getRegisteredHotkeys().find((item) => item.id === 1)?.emergency).toBe(true);
  });
});
