/**
 * Playback Coordinator.
 * Coordinates macro execution across single and concurrent sessions,
 * enforces speed clamping, activation repeat modes, nested macro safety,
 * condition waits, random jitter monotonicity, universal input release,
 * and quiet run-history logging.
 */

import { setImmediate as yieldToEventLoop } from 'node:timers/promises';
import { t } from '../../../../../../packages/localization/src/manager.js';
import type {
  DispatchReceipt,
  IInputInjectorAdapter,
  IPixelColorAdapter,
  IRunHistoryStore,
  IWindowTargetingAdapter,
  MacroExecutionContext,
  PlaybackSessionStatus,
} from '../types.js';
import type { IPlaybackEngine } from '../adapters/engine-adapter.js';
import { EnginePlayback, type LoadPeaks } from './engine-playback.js';
import type { ConcurrentMacroManager } from '../state/concurrent-macro-manager.js';
import type { OverlayCoordinator } from '../state/overlay-coordinator.js';
import type {
  EngineState,
  MacroDefinition,
  MacroEvent,
  PlaybackPauseResponse,
  PlaybackResumeResponse,
  PlaybackStartRequest,
  PlaybackStartResponse,
  PlaybackStopResponse,
} from '../../ipc/types.js';

export interface PlaybackCoordinatorOptions {
  readonly concurrentManager?: ConcurrentMacroManager | undefined;
  readonly concurrentMacroManager?: ConcurrentMacroManager | undefined;
  readonly injector?: IInputInjectorAdapter | undefined;
  readonly inputAdapter?: IInputInjectorAdapter | undefined;
  readonly overlayCoordinator: OverlayCoordinator;
  readonly pixelAdapter?: IPixelColorAdapter | undefined;
  readonly windowAdapter?: IWindowTargetingAdapter | undefined;
  readonly windowTargetingAdapter?: IWindowTargetingAdapter | undefined;
  readonly historyStore?: IRunHistoryStore | undefined;
  readonly runHistoryStore?: IRunHistoryStore | undefined;
  readonly libraryCoordinator?: unknown | undefined;
  readonly resolveMacroByName?: ((name: string) => MacroDefinition | undefined) | undefined;
  readonly resolveMacroById?: ((id: string) => MacroDefinition | undefined) | undefined;
  /** Production execution path. Without it, the coroutine scheduler below serves test doubles only. */
  readonly engine?: IPlaybackEngine | undefined;
  readonly onRunLoadPeaks?: ((macroId: string, peaks: LoadPeaks) => void) | undefined;
}

export type ActivationMode = 'Once' | 'WhileHeld' | 'Restart' | 'ToggleStop' | 'PressToStart' | 'TogglePause' | 'HoldToRun';

export class PlaybackCoordinator {
  private readonly concurrentManager: ConcurrentMacroManager;
  private readonly injector: IInputInjectorAdapter;
  private readonly overlayCoordinator: OverlayCoordinator;
  private readonly pixelAdapter: IPixelColorAdapter | undefined;
  private readonly windowAdapter: IWindowTargetingAdapter | undefined;
  private readonly historyStore: IRunHistoryStore | undefined;
  private readonly resolveMacroByName: ((name: string) => MacroDefinition | undefined) | undefined;
  private readonly resolveMacroById: ((id: string) => MacroDefinition | undefined) | undefined;
  private readonly statusListeners = new Set<(status: PlaybackSessionStatus) => void>();
  private readonly pauseStartedAtMicroseconds = new Map<string, number>();
  private readonly pausedDurationMicroseconds = new Map<string, number>();
  private readonly timelineWakeups = new Map<string, () => void>();
  private readonly heldInputOwners = new Map<string, Set<string>>();
  private readonly sessionHeldInputs = new Map<string, Map<string, MacroEvent>>();

  private readonly activationTimestamps = new Map<string, number>();
  private readonly sessionTasks = new Map<string, Promise<void>>();
  private readonly sessionActionCounts = new Map<string, number>();
  private readonly heldKeyMonitors = new Map<string, ReturnType<typeof setInterval>>();
  private static readonly ActivationGuardMs = 50;
  private static readonly MaxSubMacroDepth = 16;
  private static readonly EventsPerYield = 64;
  private readonly enginePlayback: EnginePlayback | undefined;

  constructor(options: PlaybackCoordinatorOptions) {
    const manager = options.concurrentManager ?? options.concurrentMacroManager;
    if (!manager) {
      throw new Error('concurrentManager is required for PlaybackCoordinator');
    }
    const injector = options.injector ?? options.inputAdapter;
    if (!injector) {
      throw new Error('injector is required for PlaybackCoordinator');
    }
    this.concurrentManager = manager;
    this.injector = injector;
    this.overlayCoordinator = options.overlayCoordinator;
    this.pixelAdapter = options.pixelAdapter;
    this.windowAdapter = options.windowAdapter ?? options.windowTargetingAdapter;
    this.historyStore = options.historyStore ?? options.runHistoryStore;
    this.resolveMacroByName = options.resolveMacroByName;
    this.resolveMacroById = options.resolveMacroById;
    this.enginePlayback = options.engine
      ? new EnginePlayback({
          engine: options.engine,
          sessions: manager,
          overlay: options.overlayCoordinator,
          history: this.historyStore,
          resolveMacro: options.resolveMacroById,
          notifyStatus: (status) => this.notifyStatusChange(status),
          clampSpeed: (speed) => this.clampSpeed(speed),
          onRunLoadPeaks: options.onRunLoadPeaks,
        })
      : undefined;
  }

  /**
   * Playback speed is clamped between 0.1x and 10.0x.
   */
  public clampSpeed(speed: number | undefined): number {
    if (typeof speed !== 'number' || Number.isNaN(speed)) {
      return 1.0;
    }
    return Math.min(10.0, Math.max(0.1, speed));
  }

  /**
   * Resolves activation repeat mode and enforces the 50 ms debounce guard.
   */
  public evaluateActivation(
    macro: MacroDefinition,
    currentSession: MacroExecutionContext | undefined,
    isKeyDown: boolean,
  ): 'Start' | 'Pause' | 'Resume' | 'Stop' | 'Restart' | 'Ignore' {
    const now = performance.now();
    const playbackOpts = (macro['playback'] ?? {}) as Record<string, unknown>;
    const repeatForever = playbackOpts['repeatCount'] === 0;
    let mode = (playbackOpts['activationMode'] ?? 'ToggleStop') as ActivationMode;

    // RepeatForever forces ToggleStop
    if (repeatForever) {
      mode = 'ToggleStop';
    }

    if (!currentSession || currentSession.state === 'Idle') {
      if (isKeyDown) this.activationTimestamps.set(macro.id, now);
      return isKeyDown ? 'Start' : 'Ignore';
    }

    switch (mode) {
      case 'PressToStart':
      case 'Once':
        return 'Ignore';
      case 'TogglePause':
        if (!isKeyDown) return 'Ignore';
        return currentSession.state === 'Playing' ? 'Pause' : 'Resume';
      case 'ToggleStop':
        if (now - (this.activationTimestamps.get(macro.id) ?? -Infinity) < PlaybackCoordinator.ActivationGuardMs) return 'Ignore';
        return isKeyDown ? 'Stop' : 'Ignore';
      case 'HoldToRun':
      case 'WhileHeld':
        return isKeyDown ? 'Ignore' : 'Stop';
      case 'Restart':
        return isKeyDown ? 'Restart' : 'Ignore';
      default:
        return 'Ignore';
    }
  }

  public async activate(macro: MacroDefinition, isKeyDown = true): Promise<void> {
    if (this.enginePlayback) {
      if (isKeyDown) this.enginePlayback.activate(macro);
      return;
    }
    const session = this.concurrentManager.getSessionByMacroId(macro.id);
    const action = this.evaluateActivation(macro, session, isKeyDown);
    if (action === 'Stop' && session) { this.stop(session.sessionId, 'Shortcut released or pressed again'); return; }
    if (action === 'Pause' && session) { this.pause(session.sessionId); return; }
    if (action === 'Resume' && session) { this.resume(session.sessionId); return; }
    if (action === 'Restart' && session) {
      this.stop(session.sessionId, 'Restart shortcut pressed');
      await this.sessionTasks.get(session.sessionId);
    } else if (action !== 'Start') return;
    await this.play(macro, { activationName: 'Hotkey' });
    const active = this.concurrentManager.getSessionByMacroId(macro.id);
    const playback = (macro['playback'] ?? {}) as Record<string, unknown>;
    const hotkey = (macro['hotkey'] ?? {}) as Record<string, unknown>;
    const virtualKey = Number(hotkey['virtualKey'] ?? 0);
    if (active && virtualKey > 0 && (playback['activationMode'] === 'WhileHeld' || playback['activationMode'] === 'HoldToRun') && playback['repeatCount'] !== 0) {
      const monitor = setInterval(() => {
        const held = this.injector.isKeyDown(virtualKey)
          && (!hotkey['control'] || this.injector.isKeyDown(0x11))
          && (!hotkey['alt'] || this.injector.isKeyDown(0x12))
          && (!hotkey['shift'] || this.injector.isKeyDown(0x10))
          && (!hotkey['windows'] || this.injector.isKeyDown(0x5b) || this.injector.isKeyDown(0x5c));
        if (!held) this.stop(active.sessionId, 'Shortcut released');
      }, 20);
      this.heldKeyMonitors.set(active.sessionId, monitor);
    }
  }

  /**
   * Starts macro playback.
   */
  public onStatusChange(listener: (status: PlaybackSessionStatus) => void): () => void {
    this.statusListeners.add(listener);
    return () => {
      this.statusListeners.delete(listener);
    };
  }

  private notifyStatusChange(status: PlaybackSessionStatus): void {
    for (const listener of this.statusListeners) {
      try {
        listener(status);
      } catch {
        // Ignore listener error
      }
    }
  }

  public async start(request: PlaybackStartRequest): Promise<PlaybackStartResponse> {
    let macro = request.macro;
    if (!macro && request.macroId && this.resolveMacroById) {
      macro = this.resolveMacroById(request.macroId);
    }
    if (!macro && request.macroId && this.resolveMacroByName) {
      macro = this.resolveMacroByName(request.macroId);
    }
    if (!macro) {
      throw new Error(`Cannot start playback: macro not found (${request.macroId ?? 'unknown'})`);
    }

    const res = await this.play(macro, {
      speed: request.speed,
      targetWindowHandle: request.targetWindowHandle,
    });
    return res;
  }

  /**
   * Starts macro playback.
   */
  public async play(
    macro: MacroDefinition,
    options?: {
      speed?: number | undefined;
      targetWindowHandle?: number | undefined;
      cancellationToken?: AbortSignal | undefined;
      activationName?: string | undefined;
    },
  ): Promise<{ started: boolean; activeMacroId: string }> {
    if (this.enginePlayback) return this.enginePlayback.play(macro, options);
    const playbackOptions = (macro['playback'] ?? {}) as Record<string, unknown>;
    const effectiveSpeed = this.clampSpeed(options?.speed ?? Number(playbackOptions['speed'] ?? 1));
    const targetHwnd = this.resolveTargetWindow(macro, options?.targetWindowHandle);

    const session = this.concurrentManager.createSession(
      macro,
      effectiveSpeed,
      targetHwnd,
      options?.cancellationToken,
    );
    this.pausedDurationMicroseconds.set(session.sessionId, 0);
    this.sessionActionCounts.set(session.sessionId, macro.events?.length ?? 0);

    // Update overlay
    this.overlayCoordinator.updateMacroOverlay(macro, 'Playing', undefined, effectiveSpeed);

    this.notifyStatusChange({
      sessionId: session.sessionId,
      macroId: macro.id,
      macroName: macro.name,
      state: 'Playing',
      elapsedMicroseconds: 0,
      currentActionIndex: 0,
      totalActions: macro.events?.length ?? 0,
      receiptsCount: 0,
    });

    // Run asynchronously
    const execution = this.executeMacroSession(session, macro, effectiveSpeed, targetHwnd, options?.activationName ?? 'Manual');
    this.sessionTasks.set(session.sessionId, execution);
    void execution.then(() => this.sessionTasks.delete(session.sessionId), error => {
      this.sessionTasks.delete(session.sessionId);
      console.error('Playback session failed', error);
    });

    return {
      started: true,
      activeMacroId: macro.id,
    };
  }

  private resolveTargetWindow(macro: MacroDefinition, explicitHandle?: number): number {
    const playback = (macro.playback ?? {}) as Record<string, unknown>;
    const directed = playback['targetMode'] === 'SpecificWindow' || (explicitHandle ?? 0) !== 0;
    let target = explicitHandle ?? 0;
    if (directed) {
      if (!this.windowAdapter) throw new Error(t('Window detection is unavailable.'));
      const processName = String(playback['targetProcessName'] ?? '').trim();
      const title = String(playback['targetWindowTitle'] ?? '').trim();
      if (target === 0 && (!processName || !title)) {
        throw new Error(t('Select a target window on the Playback tab first.'));
      }
      const windows = this.windowAdapter.getOpenWindows();
      const candidates = windows.filter(candidate => candidate.processName.toLowerCase() === processName.toLowerCase());
      const window = target !== 0
        ? windows.find(candidate => candidate.handle === target)
        : candidates.find(candidate => candidate.title.toLowerCase() === title.toLowerCase())
          ?? candidates.find(candidate => candidate.title.toLowerCase().includes(title.toLowerCase()) || title.toLowerCase().includes(candidate.title.toLowerCase()));
      if (!window) throw new Error(t('The selected window was not found. Refresh the list and select the target again.'));
      target = window.handle;
    }
    const integrityTarget = target || this.windowAdapter?.getForegroundWindow()?.handle;
    if (integrityTarget && this.windowAdapter && !this.windowAdapter.checkWindowIntegrity(integrityTarget).canInject) {
      throw new Error(t('The target window has higher privileges (UIPI restriction).'));
    }
    // Directed messages deliberately leave the target in the background.
    return directed ? target : 0;
  }

  public pause(sessionId?: string): PlaybackPauseResponse {
    if (this.enginePlayback) return { isPaused: this.enginePlayback.pause(sessionId) };
    const sessions = sessionId
      ? [this.concurrentManager.getSession(sessionId)].filter(Boolean) as MacroExecutionContext[]
      : this.concurrentManager.getAllActiveSessions();

    let anyPaused = false;
    for (const session of sessions) {
      if (session.state === 'Playing') {
        this.pauseStartedAtMicroseconds.set(session.sessionId, performance.now() * 1000);
        session.state = 'Paused';
        this.timelineWakeups.get(session.sessionId)?.();
        this.concurrentManager.updateSessionState(session.sessionId, 'Paused');
        this.notifySessionStatus(session);
        this.overlayCoordinator.updateMacroOverlay({ id: session.macroId, name: session.macroName } as MacroDefinition, 'Paused');
        anyPaused = true;
      }
    }
    return { isPaused: anyPaused || sessions.some((s) => s.state === 'Paused') };
  }

  public resume(sessionId?: string): PlaybackResumeResponse {
    if (this.enginePlayback) return { isPlaying: this.enginePlayback.resume(sessionId) };
    const sessions = sessionId
      ? [this.concurrentManager.getSession(sessionId)].filter(Boolean) as MacroExecutionContext[]
      : this.concurrentManager.getAllActiveSessions();

    let anyResumed = false;
    for (const session of sessions) {
      if (session.state === 'Paused') {
        const pauseStarted = this.pauseStartedAtMicroseconds.get(session.sessionId);
        if (pauseStarted !== undefined) {
          const previousDuration = this.pausedDurationMicroseconds.get(session.sessionId) ?? 0;
          this.pausedDurationMicroseconds.set(
            session.sessionId,
            previousDuration + Math.max(0, performance.now() * 1000 - pauseStarted),
          );
          this.pauseStartedAtMicroseconds.delete(session.sessionId);
        }
        session.state = 'Playing';
        this.timelineWakeups.get(session.sessionId)?.();
        this.concurrentManager.updateSessionState(session.sessionId, 'Playing');
        this.notifySessionStatus(session);
        this.overlayCoordinator.updateMacroOverlay({ id: session.macroId, name: session.macroName } as MacroDefinition, 'Playing');
        anyResumed = true;
      }
    }
    return { isPlaying: anyResumed || sessions.some((s) => s.state === 'Playing') };
  }

  public stop(sessionIdOrReason?: string, maybeReason?: string): PlaybackStopResponse {
    let sessionId: string | undefined;
    let reason = 'Playback stopped';
    if (maybeReason !== undefined) {
      sessionId = sessionIdOrReason;
      reason = maybeReason;
    } else if (sessionIdOrReason) {
      if (this.concurrentManager.getSession(sessionIdOrReason)) {
        sessionId = sessionIdOrReason;
      } else {
        reason = sessionIdOrReason;
      }
    }

    if (this.enginePlayback) {
      this.enginePlayback.stop(sessionId);
      return { stopped: true };
    }

    if (sessionId) {
      const monitor = this.heldKeyMonitors.get(sessionId);
      if (monitor) clearInterval(monitor);
      this.heldKeyMonitors.delete(sessionId);
      this.concurrentManager.stopSession(sessionId, reason);
      this.releaseSessionInputs(sessionId);
    } else {
      for (const monitor of this.heldKeyMonitors.values()) clearInterval(monitor);
      this.heldKeyMonitors.clear();
      this.concurrentManager.stopAllSessions(reason);
      this.injector.releaseAll();
      this.heldInputOwners.clear();
      this.sessionHeldInputs.clear();
    }
    return { stopped: true };
  }

  /**
   * Universal Emergency Stop.
   * Immediately stops all running macros, signals abort tokens, and synchronously releases
   * all held keys, mouse buttons, and gamepad states across all targets.
   */
  public emergencyStop(reason = 'Emergency stop initiated'): {
    stopped: boolean;
    inputsReleased: boolean;
  } {
    if (this.enginePlayback) {
      this.enginePlayback.emergencyStop(reason);
      return { stopped: true, inputsReleased: true };
    }
    this.concurrentManager.stopAllSessions(reason);
    for (const monitor of this.heldKeyMonitors.values()) clearInterval(monitor);
    this.heldKeyMonitors.clear();
    this.injector.releaseAll();
    this.heldInputOwners.clear();
    this.sessionHeldInputs.clear();
    this.overlayCoordinator.clearAllOverlays();
    return {
      stopped: true,
      inputsReleased: true,
    };
  }

  public getStatus(sessionId?: string): {
    state: EngineState;
    currentMacroId?: string | undefined;
    elapsedMicroseconds: number;
  } {
    const session = sessionId
      ? this.concurrentManager.getSession(sessionId)
      : this.concurrentManager.getAllActiveSessions()[0];

    if (!session) {
      return {
        state: 'Idle',
        currentMacroId: undefined,
        elapsedMicroseconds: 0,
      };
    }

    const elapsed = Math.max(0, Math.round(performance.now() * 1000) - session.startedAtMicroseconds);
    return {
      state: session.state,
      currentMacroId: session.macroId,
      elapsedMicroseconds: elapsed,
    };
  }

  private async executeMacroSession(
    session: MacroExecutionContext,
    macro: MacroDefinition,
    speed: number,
    targetHwnd: number,
    activationName: string,
  ): Promise<void> {
    const signal = session.abortController.signal;
    const startTimeMs = Date.now();

    try {
      await this.runMacroRecursive(session, macro, 0, new Set([macro.id]), speed, targetHwnd, signal);
    } catch (err) {
      if (!signal.aborted) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        const failedAt = Math.max(
          0,
          Math.round(performance.now() * 1000) - session.startedAtMicroseconds,
        );
        session.receipts.push(this.createReceipt({
          id: `failure-${Date.now()}`,
          scheduledMicroseconds: 0,
          startedMicroseconds: failedAt,
          completedMicroseconds: failedAt,
          confirmedMicroseconds: null,
          success: false,
          error: errorMessage,
        }));
      }
    } finally {
      // Universal input release guarantee at the end of each macro execution
      try {
        this.releaseSessionInputs(session.sessionId);
      } catch (error) {
        // Preserve the failure for diagnostics while always closing the session below.
        console.error('Failed to release session input', error);
      }
      this.overlayCoordinator.clearMacroOverlay(macro.id);
      this.concurrentManager.closeSession(session.sessionId);
      const monitor = this.heldKeyMonitors.get(session.sessionId);
      if (monitor) clearInterval(monitor);
      this.heldKeyMonitors.delete(session.sessionId);
      this.notifySessionStatus(session);
      this.sessionActionCounts.delete(session.sessionId);
      this.pauseStartedAtMicroseconds.delete(session.sessionId);
      this.pausedDurationMicroseconds.delete(session.sessionId);

      // Quiet run history recording
      const durationMs = Math.max(0, Date.now() - startTimeMs);
      if (this.historyStore) {
        try {
          this.historyStore.record(
            macro,
            session.receipts,
            activationName,
            durationMs,
          );
        } catch {
          // Best effort quiet record
        }
      }
    }
  }

  private notifySessionStatus(session: MacroExecutionContext): void {
    this.notifyStatusChange({ sessionId: session.sessionId, macroId: session.macroId, macroName: session.macroName, state: session.state, elapsedMicroseconds: Math.max(0, Math.round(performance.now() * 1000 - session.startedAtMicroseconds - (this.pausedDurationMicroseconds.get(session.sessionId) ?? 0))), currentActionIndex: session.receipts.length, totalActions: this.sessionActionCounts.get(session.sessionId) ?? 0, receiptsCount: session.receipts.length });
  }

  private async runMacroRecursive(
    session: MacroExecutionContext,
    macro: MacroDefinition,
    depth: number,
    callStack: Set<string>,
    speed: number,
    targetHwnd: number,
    signal: AbortSignal,
    workBudget: { processed: number } = { processed: 0 },
  ): Promise<void> {
    signal.throwIfAborted();
    const events = [...(macro.events ?? [])].sort((left, right) => {
      const timeDifference = Number(left.timeMicroseconds ?? 0) - Number(right.timeMicroseconds ?? 0);
      return timeDifference || Number(this.isConditionWait(String(right.type))) - Number(this.isConditionWait(String(left.type)));
    });
    if (events.length === 0) return;
    const playback = (macro.playback ?? {}) as Record<string, unknown>;
    const repeatCount = typeof playback['repeatCount'] === 'number' ? playback['repeatCount'] : 1;
    const repeatForever = depth === 0 && repeatCount === 0;
    const repeats = Math.max(1, repeatCount);
    const jitterUs = playback['randomizeTiming'] ? Math.max(0, Number(playback['timingJitterMilliseconds'] ?? 0)) * 1000 : 0;
    const repeatDelayMs = Math.max(0, Number(playback['repeatDelayMilliseconds'] ?? 0));
    const groups = new Map<number, MacroEvent[]>();
    let durationUs = 0;
    for (const event of events) {
      if (event.type === 'Comment') continue;
      const time = Math.max(0, Number(event.timeMicroseconds ?? 0));
      const group = groups.get(time) ?? [];
      group.push(event);
      groups.set(time, group);
      const overlayDuration = event.type === 'OverlayText'
        ? Math.max(0, Number(event['durationMicroseconds'] ?? Number(event['durationMilliseconds'] ?? 2000) * 1000))
        : 0;
      durationUs = Math.max(durationUs, time + overlayDuration);
    }
    if (groups.size === 0) return;

    for (let repeat = 0; repeatForever || repeat < repeats; repeat++) {
      signal.throwIfAborted();
      const clockStart = performance.now() * 1000;
      const pausedAtStart = this.pausedDurationMicroseconds.get(session.sessionId) ?? 0;
      let blockedUs = 0;
      let previousPlannedUs = 0;
      for (const [time, group] of groups) {
        const authoredUs = Math.trunc(time / speed);
        const jitter = jitterUs > 0 ? Math.floor(Math.random() * (2 * jitterUs + 1)) - jitterUs : 0;
        const plannedUs = Math.max(previousPlannedUs, 0, authoredUs + jitter);
        previousPlannedUs = plannedUs;
        await this.waitForDeadline(session, clockStart, plannedUs, blockedUs, pausedAtStart, signal);

        for (const event of group) {
          // Resolved promises alone starve Node's input/IPC callbacks in a zero-time burst.
          if (++workBudget.processed >= PlaybackCoordinator.EventsPerYield) {
            workBudget.processed = 0;
            await yieldToEventLoop(undefined, { signal });
          }
          await this.waitWhilePaused(session, signal);
          signal.throwIfAborted();
          const eventType = String(event.type ?? event['eventType'] ?? '');
          if (this.isConditionWait(eventType) || eventType === 'RunMacro') {
            const started = performance.now() * 1000;
            const pauseBefore = this.pausedDurationMicroseconds.get(session.sessionId) ?? 0;
            let success = true;
            let error: string | null = null;
            if (this.isConditionWait(eventType)) {
              success = await this.waitForCondition(event, signal, session);
              if (!success) error = 'Wait timed out';
            } else {
              const name = String(event['subMacroName'] ?? '');
              const subMacro = this.resolveMacroByName?.(name);
              if (!subMacro) {
                success = false;
                error = `Sub-macro ${name} not found`;
              } else {
                if (depth + 1 > PlaybackCoordinator.MaxSubMacroDepth) throw new Error('Macro call nesting is too deep (recursion cap 16).');
                if (callStack.has(subMacro.id)) throw new Error(`Cyclic call of macro "${subMacro.name}"`);
                callStack.add(subMacro.id);
                try {
                  const subPlayback = (subMacro.playback ?? {}) as Record<string, unknown>;
                  await this.runMacroRecursive(session, subMacro, depth + 1, callStack, this.clampSpeed(Number(subPlayback['speed'] ?? 1)), targetHwnd, signal, workBudget);
                } finally { callStack.delete(subMacro.id); }
              }
            }
            const finished = performance.now() * 1000;
            const pauseAfter = this.pausedDurationMicroseconds.get(session.sessionId) ?? 0;
            const completed = Math.max(0, Math.round(finished - clockStart - blockedUs - pauseAfter + pausedAtStart));
            blockedUs += finished - started - pauseAfter + pauseBefore;
            session.receipts.push(this.createReceipt({ id: String(event.id), scheduledMicroseconds: authoredUs, startedMicroseconds: completed, completedMicroseconds: completed, success, error, plannedMicroseconds: jitterUs > 0 ? plannedUs : null }));
            continue;
          }

          if (eventType === 'OverlayText' || eventType === 'Delay') {
            if (eventType === 'OverlayText') {
              const duration = Math.max(0, Number(event['durationMicroseconds'] ?? Number(event['durationMilliseconds'] ?? 2000) * 1000)) / speed;
              this.overlayCoordinator.showTextCountdown(macro.id, macro.name, String(event['text'] ?? ''), duration / 1_000_000);
            }
            session.receipts.push(this.createReceipt({ id: String(event.id), scheduledMicroseconds: authoredUs, startedMicroseconds: plannedUs, completedMicroseconds: plannedUs, success: true, plannedMicroseconds: jitterUs > 0 ? plannedUs : null }));
            continue;
          }

          const pausedSinceStart = (this.pausedDurationMicroseconds.get(session.sessionId) ?? 0) - pausedAtStart;
          const receipt = await this.sendSessionEvent(session, event, authoredUs, clockStart + blockedUs + pausedSinceStart, playback['targetMode'] === 'SpecificWindow' && Boolean(playback['preferScanCodes']), targetHwnd, signal);
          session.receipts.push({ ...receipt, plannedMicroseconds: jitterUs > 0 ? plannedUs : null, dispatchJitterMilliseconds: (receipt.startedMicroseconds - plannedUs) / 1000 });
        }
      }
      await this.waitForDeadline(session, clockStart, Math.trunc(durationUs / speed), blockedUs, pausedAtStart, signal);
      if (repeatForever || repeat + 1 < repeats) {
        // Even a zero-duration infinite loop must yield so emergency-stop callbacks can run.
        const delayMs = repeatForever ? Math.max(1, repeatDelayMs) : repeatDelayMs;
        if (delayMs > 0) {
          await this.waitForDeadline(session, performance.now() * 1000, delayMs * 1000, 0, this.pausedDurationMicroseconds.get(session.sessionId) ?? 0, signal);
        }
      }
    }
  }

  private async waitWhilePaused(session: MacroExecutionContext, signal: AbortSignal): Promise<void> {
    while (session.state === 'Paused') {
      await this.delay(86_400_000, signal, session.sessionId);
    }
    signal.throwIfAborted();
  }

  private async sendSessionEvent(session: MacroExecutionContext, event: MacroEvent, authoredUs: number, clockStart: number, preferScanCodes: boolean, targetHwnd: number, signal: AbortSignal): Promise<DispatchReceipt> {
    const type = String(event.type);
    const keyboard = type === 'KeyDown' || type === 'KeyUp';
    const mouse = type === 'MouseButtonDown' || type === 'MouseButtonUp';
    if (!keyboard && !mouse) return this.injector.sendAsync(event, authoredUs, clockStart, preferScanCodes, targetHwnd, signal);
    const key = `${targetHwnd}/${keyboard ? 'key' : 'button'}/${keyboard ? Number(event['virtualKey']) : String(event['button'])}`;
    const owners = this.heldInputOwners.get(key) ?? new Set<string>();
    const isDown = type === 'KeyDown' || type === 'MouseButtonDown';
    const otherOwners = owners.size - Number(owners.has(session.sessionId));
    let receipt: DispatchReceipt;
    if (otherOwners > 0) {
      const now = Math.max(0, Math.round(performance.now() * 1000 - clockStart));
      receipt = this.createReceipt({ id: String(event.id), scheduledMicroseconds: authoredUs, startedMicroseconds: now, completedMicroseconds: now, success: true });
    } else {
      receipt = await this.injector.sendAsync(event, authoredUs, clockStart, preferScanCodes, targetHwnd, signal);
    }
    if (receipt.success) {
      const held = this.sessionHeldInputs.get(session.sessionId) ?? new Map<string, MacroEvent>();
      if (isDown) { owners.add(session.sessionId); held.set(key, event); }
      else { owners.delete(session.sessionId); held.delete(key); }
      if (owners.size > 0) this.heldInputOwners.set(key, owners);
      else this.heldInputOwners.delete(key);
      this.sessionHeldInputs.set(session.sessionId, held);
    }
    return receipt;
  }

  private releaseSessionInputs(sessionId: string): void {
    const session = this.concurrentManager.getSession(sessionId);
    const releases: MacroEvent[] = [];
    for (const [key, event] of this.sessionHeldInputs.get(sessionId) ?? []) {
      const owners = this.heldInputOwners.get(key);
      owners?.delete(sessionId);
      if (!owners || owners.size === 0) { releases.push(event); this.heldInputOwners.delete(key); }
    }
    this.sessionHeldInputs.delete(sessionId);
    try {
      this.injector.releaseInputs?.(releases, session?.targetWindowHandle ?? 0);
    } finally {
      if (this.concurrentManager.getAllActiveSessions().every(active => active.sessionId === sessionId)) this.injector.releaseAll();
    }
  }

  private async waitForDeadline(session: MacroExecutionContext, startUs: number, targetUs: number, blockedUs: number, pausedAtStart: number, signal: AbortSignal): Promise<void> {
    while (true) {
      await this.waitWhilePaused(session, signal);
      const pausedUs = (this.pausedDurationMicroseconds.get(session.sessionId) ?? 0) - pausedAtStart;
      const remainingUs = targetUs - (performance.now() * 1000 - startUs - blockedUs - pausedUs);
      if (remainingUs <= 0) return;
      await this.delay(Math.max(1, remainingUs / 1000), signal, session.sessionId);
    }
  }

  private createReceipt(params: {
    id: string;
    scheduledMicroseconds: number;
    startedMicroseconds: number;
    completedMicroseconds: number;
    confirmedMicroseconds?: number | null;
    success: boolean;
    error?: string | null;
    plannedMicroseconds?: number | null;
  }): DispatchReceipt {
    const planned = params.plannedMicroseconds ?? params.scheduledMicroseconds;
    const confirmed = params.confirmedMicroseconds ?? null;
    return {
      eventId: params.id,
      id: params.id,
      scheduledMicroseconds: params.scheduledMicroseconds,
      dispatchStartedMicroseconds: params.startedMicroseconds,
      startedMicroseconds: params.startedMicroseconds,
      dispatchCompletedMicroseconds: params.completedMicroseconds,
      completedMicroseconds: params.completedMicroseconds,
      hookConfirmedMicroseconds: confirmed,
      confirmedMicroseconds: confirmed,
      success: params.success,
      error: params.error ?? null,
      plannedMicroseconds: params.plannedMicroseconds ?? null,
      dispatchJitterMilliseconds: (params.startedMicroseconds - planned) / 1000,
      confirmationMilliseconds: confirmed === null
        ? null
        : (confirmed - params.startedMicroseconds) / 1000,
    };
  }

  private isConditionWait(eventType: string): boolean {
    return (
      eventType === 'PixelColorTrigger' ||
      eventType === 'WaitForPixelGone' ||
      eventType === 'WaitForWindow' ||
      eventType === 'WaitForKey'
    );
  }

  private async waitForCondition(event: MacroEvent, signal: AbortSignal, session: MacroExecutionContext): Promise<boolean> {
    const eventType = String(event['type'] ?? event['eventType'] ?? '');
    const timeoutMs = eventType === 'PixelColorTrigger' ? 0 : typeof event['waitTimeoutMilliseconds'] === 'number'
      ? event['waitTimeoutMilliseconds']
      : 5000;
    let deadline = timeoutMs > 0 ? performance.now() + timeoutMs : 0;

    while (!signal.aborted) {
      const pauseBefore = this.pausedDurationMicroseconds.get(session.sessionId) ?? 0;
      await this.waitWhilePaused(session, signal);
      if (deadline > 0) deadline += ((this.pausedDurationMicroseconds.get(session.sessionId) ?? 0) - pauseBefore) / 1000;
      let satisfied = false;

      if (eventType === 'PixelColorTrigger' || eventType === 'WaitForPixelGone') {
        const x = Number(event['pixelX'] ?? 0);
        const y = Number(event['pixelY'] ?? 0);
        const expected = Number(event['pixelColor'] ?? 0) & 0xffffff;
        if (!this.pixelAdapter) throw new Error('Pixel color detection is unavailable.');
        const current = this.pixelAdapter.getPixelColorRgb(x, y) & 0xffffff;
        satisfied = eventType === 'PixelColorTrigger' ? current === expected : current !== expected;
      } else if (eventType === 'WaitForWindow') {
        const procName = String(event['waitProcessName'] ?? '');
        const title = String(event['waitWindowTitle'] ?? '');
        const fg = this.windowAdapter?.getForegroundWindow();
        satisfied = fg
          ? (!procName || fg.processName.toLowerCase().includes(procName.toLowerCase())) &&
            (!title || fg.title.toLowerCase().includes(title.toLowerCase()))
          : false;
      } else if (eventType === 'WaitForKey') {
        const virtualKey = Number(event['waitKeyVirtualKey'] ?? 0);
        if (!Number.isInteger(virtualKey) || virtualKey <= 0) {
          throw new Error('WaitForKey requires a valid virtual key code.');
        }
        satisfied = this.injector.isKeyDown(virtualKey);
      }

      if (satisfied) return true;
      if (deadline > 0 && performance.now() >= deadline) return false;

      await this.delay(20, signal, session.sessionId);
    }
    return false;
  }

  private async delay(ms: number, signal?: AbortSignal, sessionId?: string): Promise<void> {
    signal?.throwIfAborted();
    if (ms <= 0) return;
    return new Promise((resolve, reject) => {
      const cleanup = () => {
        clearTimeout(timer);
        signal?.removeEventListener('abort', abort);
        if (sessionId && this.timelineWakeups.get(sessionId) === wake) this.timelineWakeups.delete(sessionId);
      };
      const wake = () => { cleanup(); resolve(); };
      const abort = () => { cleanup(); reject(new Error('Operation cancelled')); };
      // Node clamps an overflowing timeout to 1 ms, which would busy-poll long macros.
      const timer = setTimeout(wake, Math.min(ms, 2_147_483_647));
      if (sessionId) this.timelineWakeups.set(sessionId, wake);
      signal?.addEventListener('abort', abort, { once: true });
    });
  }
}
