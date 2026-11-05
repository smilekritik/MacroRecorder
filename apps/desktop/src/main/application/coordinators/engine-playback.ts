/**
 * Application-side view of native playback sessions: status, diagnostics, overlays and history.
 * Nothing here is on the timing path; it only reflects what the engine reports.
 */

import { t } from '../../../../../../packages/localization/src/manager.js';
import type { EngineReceiptReport, EngineReport, IPlaybackEngine } from '../adapters/engine-adapter.js';
import type { ConcurrentMacroManager } from '../state/concurrent-macro-manager.js';
import type { OverlayCoordinator } from '../state/overlay-coordinator.js';
import type {
  DispatchReceipt,
  IRunHistoryStore,
  MacroExecutionContext,
  PlaybackSessionStatus,
} from '../types.js';
import type { MacroDefinition } from '../../ipc/types.js';

/** Bounds memory for endless macros; statistics describe the most recent actions. */
const MAX_RECEIPTS_PER_SESSION = 100_000;

interface TrackedSession {
  readonly nativeId: number;
  readonly macro: MacroDefinition;
  readonly activation: string;
  readonly automatic: boolean;
  readonly context: MacroExecutionContext | null;
  readonly receipts: DispatchReceipt[];
  totalActions: number;
  readonly peaks: LoadPeaks;
}

export interface LoadPeaks {
  peakCpuPercent: number | null;
  peakGpuPercent: number | null;
  peakMemoryPercent: number | null;
}

export function toDispatchReceipt(report: EngineReceiptReport): DispatchReceipt {
  const planned = report.plannedMicroseconds ?? null;
  const confirmed = report.confirmedMicroseconds ?? null;
  const target = planned ?? report.scheduledMicroseconds;
  return {
    eventId: report.id,
    id: report.id,
    scheduledMicroseconds: report.scheduledMicroseconds,
    dispatchStartedMicroseconds: report.startedMicroseconds,
    startedMicroseconds: report.startedMicroseconds,
    dispatchCompletedMicroseconds: report.completedMicroseconds,
    completedMicroseconds: report.completedMicroseconds,
    hookConfirmedMicroseconds: confirmed,
    confirmedMicroseconds: confirmed,
    success: report.success,
    error: report.error ?? null,
    plannedMicroseconds: planned,
    dispatchJitterMilliseconds: (report.startedMicroseconds - target) / 1000,
    confirmationMilliseconds: confirmed === null ? null : (confirmed - report.startedMicroseconds) / 1000,
  };
}

export interface EnginePlaybackOptions {
  readonly engine: IPlaybackEngine;
  readonly sessions: ConcurrentMacroManager;
  readonly overlay: OverlayCoordinator;
  readonly history?: IRunHistoryStore | undefined;
  readonly resolveMacro?: ((id: string) => MacroDefinition | undefined) | undefined;
  readonly notifyStatus: (status: PlaybackSessionStatus) => void;
  readonly clampSpeed: (speed: number | undefined) => number;
  readonly onRunLoadPeaks?: ((macroId: string, peaks: LoadPeaks) => void) | undefined;
}

export class EnginePlayback {
  private readonly tracked = new Map<number, TrackedSession>();
  private loadTimer: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly options: EnginePlaybackOptions) {
    options.engine.onReport((report) => this.handle(report));
  }

  public play(
    macro: MacroDefinition,
    settings?: { speed?: number | undefined; targetWindowHandle?: number | undefined; activationName?: string | undefined },
  ): { started: boolean; activeMacroId: string } {
    const { engine } = this.options;
    const stored = (macro.playback ?? {}) as Record<string, unknown>;
    // The UI may run edits that are not saved yet, and a request may override the speed.
    const speed = this.options.clampSpeed(settings?.speed ?? Number(stored['speed'] ?? 1));
    const effective = { ...macro, playback: { ...stored, speed } } as unknown as MacroDefinition;
    const loadErrors = engine.upsertMacro(effective);
    if (loadErrors.length > 0) throw new Error(loadErrors.join('; '));
    try {
      engine.start(macro.id, settings?.activationName ?? 'Manual', settings?.targetWindowHandle);
    } catch (error) {
      // The engine reports target problems with English source keys.
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(t(message));
    }
    return { started: true, activeMacroId: macro.id };
  }

  public activate(macro: MacroDefinition): void {
    this.options.engine.activate(macro.id);
  }

  private nativeIdOf(sessionId: string | undefined): number | undefined {
    if (sessionId === undefined) return undefined;
    for (const session of this.tracked.values()) {
      if (session.context?.sessionId === sessionId) return session.nativeId;
    }
    return undefined;
  }

  public pause(sessionId?: string): boolean {
    this.options.engine.pause(this.nativeIdOf(sessionId));
    return this.sessionStates(sessionId).includes('Paused');
  }

  public resume(sessionId?: string): boolean {
    this.options.engine.resume(this.nativeIdOf(sessionId));
    return this.sessionStates(sessionId).includes('Playing');
  }

  private sessionStates(sessionId: string | undefined): string[] {
    return this.options.sessions
      .getAllActiveSessions()
      .filter((session) => sessionId === undefined || session.sessionId === sessionId)
      .map((session) => String(session.state));
  }

  public stop(sessionId?: string): void {
    this.options.engine.stop(this.nativeIdOf(sessionId));
  }

  public emergencyStop(reason: string): void {
    this.options.engine.emergencyStop(reason);
    this.options.overlay.clearAllOverlays();
  }

  private handle(report: EngineReport): void {
    const id = report.sessionId ?? undefined;
    switch (report.kind) {
      case 'state':
        if (id !== undefined) this.handleState(id, report);
        break;
      case 'receipts':
        if (id !== undefined) this.handleReceipts(id, report);
        break;
      case 'overlay':
        if (id !== undefined) this.handleOverlay(id, report);
        break;
      case 'finished':
        if (id !== undefined) this.handleFinished(id, report);
        break;
      case 'emergency':
        this.options.overlay.clearAllOverlays();
        break;
      default:
        break;
    }
  }

  private macroFor(report: EngineReport): MacroDefinition {
    const id = String(report.macroId ?? '');
    return this.options.resolveMacro?.(id) ?? ({ id, name: String(report.macroName ?? ''), events: [] } as unknown as MacroDefinition);
  }

  private track(id: number, report: EngineReport): TrackedSession {
    const existing = this.tracked.get(id);
    if (existing) return existing;
    const macro = this.macroFor(report);
    const activation = String(report.activation ?? 'Manual');
    const automatic = activation === 'Automatic';
    const playback = (macro.playback ?? {}) as Record<string, unknown>;
    // A background monitor is not "playing": it must not take over status and overlay.
    const context = automatic
      ? null
      : this.options.sessions.createSession(macro, this.options.clampSpeed(Number(playback['speed'] ?? 1)));
    const session: TrackedSession = {
      nativeId: id,
      macro,
      activation,
      automatic,
      context,
      receipts: context?.receipts ?? [],
      totalActions: report.totalActions ?? 0,
      peaks: { peakCpuPercent: null, peakGpuPercent: null, peakMemoryPercent: null },
    };
    this.tracked.set(id, session);
    this.syncLoadSampling();
    return session;
  }

  private handleState(id: number, report: EngineReport): void {
    const session = this.track(id, report);
    if (!session.context) return;
    const state = report.state === 'Paused' ? 'Paused' : 'Playing';
    this.options.sessions.updateSessionState(session.context.sessionId, state);
    const speed = session.context.speed;
    this.options.overlay.updateMacroOverlay(session.macro, state, undefined, speed);
    this.notify(session);
  }

  private handleReceipts(id: number, report: EngineReport): void {
    const session = this.tracked.get(id);
    if (!session || !report.receipts) return;
    for (const receipt of report.receipts) session.receipts.push(toDispatchReceipt(receipt));
    if (session.receipts.length > MAX_RECEIPTS_PER_SESSION) {
      session.receipts.splice(0, session.receipts.length - MAX_RECEIPTS_PER_SESSION);
    }
    if (session.context) this.notify(session);
  }

  private handleOverlay(id: number, report: EngineReport): void {
    const session = this.tracked.get(id);
    const macroId = session?.macro.id ?? String(report.macroId ?? '');
    const macroName = session?.macro.name ?? String(report.macroName ?? '');
    this.options.overlay.showTextCountdown(
      macroId,
      macroName,
      String(report.text ?? ''),
      Number(report.durationMicroseconds ?? 0) / 1_000_000,
    );
  }

  private handleFinished(id: number, report: EngineReport): void {
    const session = this.track(id, report);
    this.tracked.delete(id);
    this.syncLoadSampling();
    this.options.onRunLoadPeaks?.(session.macro.id, session.peaks);
    if (report.error) {
      console.error(`[EnginePlayback] "${session.macro.name}" did not start: ${report.error}`);
      session.receipts.push(
        toDispatchReceipt({
          id: `failure-${id}`,
          scheduledMicroseconds: 0,
          startedMicroseconds: 0,
          completedMicroseconds: 0,
          success: false,
          error: t(report.error),
        }),
      );
    }
    if (session.context) {
      this.options.overlay.clearMacroOverlay(session.macro.id);
      this.options.sessions.closeSession(session.context.sessionId);
      session.context.state = 'Idle';
      this.notify(session);
    }
    try {
      this.options.history?.record(
        session.macro,
        session.receipts,
        session.activation,
        Math.round(Number(report.elapsedMicroseconds ?? 0) / 1000),
      );
    } catch (error) {
      console.error('[EnginePlayback] Could not record run history:', error);
    }
  }

  /** Load is sampled for diagnostics only while a macro plays, so idle costs nothing. */
  private syncLoadSampling(): void {
    const needed = [...this.tracked.values()].some((session) => !session.automatic);
    if (needed && !this.loadTimer) {
      this.loadTimer = setInterval(() => this.sampleLoad(), 1000);
    } else if (!needed && this.loadTimer) {
      clearInterval(this.loadTimer);
      this.loadTimer = null;
    }
  }

  private sampleLoad(): void {
    const sample = this.options.engine.sampleSystemLoad?.();
    if (!sample) return;
    const peak = (current: number | null, next: number | null | undefined) =>
      (typeof next === 'number' ? Math.max(current ?? 0, next) : current);
    for (const session of this.tracked.values()) {
      session.peaks.peakCpuPercent = peak(session.peaks.peakCpuPercent, sample.cpuPercent);
      session.peaks.peakGpuPercent = peak(session.peaks.peakGpuPercent, sample.gpuPercent);
      session.peaks.peakMemoryPercent = peak(session.peaks.peakMemoryPercent, sample.memoryPercent);
    }
  }

  private notify(session: TrackedSession): void {
    const { context } = session;
    if (!context) return;
    this.options.notifyStatus({
      sessionId: context.sessionId,
      macroId: context.macroId,
      macroName: context.macroName,
      state: context.state,
      elapsedMicroseconds: Math.max(0, Math.round(performance.now() * 1000) - context.startedAtMicroseconds),
      currentActionIndex: session.receipts.length,
      totalActions: session.totalActions,
      receiptsCount: session.receipts.length,
    });
  }
}
