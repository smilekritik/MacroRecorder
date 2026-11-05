/**
 * Concurrent Macro Session Manager.
 * Guarantees complete isolation across concurrent macro executions,
 * separate cancellation tokens, dedicated overlay card tracking, and receipts collections.
 */

import type {
  DispatchReceipt,
  MacroExecutionContext,
  OverlayCardState,
  PlaybackSessionStatus,
} from '../types.js';
import type { EngineState, MacroDefinition } from '../../ipc/types.js';

let sessionCounter = 0;

export class ConcurrentMacroManager {
  private readonly activeSessions = new Map<string, MacroExecutionContext>();
  private readonly sessionListeners = new Set<(status: PlaybackSessionStatus) => void>();
  private readonly externalSignalCleanups = new Map<string, () => void>();

  /**
   * Creates an isolated execution context for a macro execution.
   */
  public createSession(
    macro: MacroDefinition,
    speed = 1.0,
    targetWindowHandle = 0,
    externalSignal?: AbortSignal,
  ): MacroExecutionContext {
    sessionCounter++;
    const sessionId = `session-${macro.id}-${Date.now()}-${sessionCounter}`;
    const abortController = new AbortController();

    if (externalSignal) {
      if (externalSignal.aborted) {
        abortController.abort();
      } else {
        const abort = () => abortController.abort(externalSignal.reason);
        externalSignal.addEventListener('abort', abort, { once: true });
        this.externalSignalCleanups.set(sessionId, () => externalSignal.removeEventListener('abort', abort));
      }
    }

    const overlayState: OverlayCardState = {
      macroId: macro.id,
      macroName: macro.name,
      state: 'Playing',
      visible: true,
      infoX: 1.0,
      infoY: 0.0,
      scalePercent: 100,
      transparencyPercent: 0,
    };

    const context: MacroExecutionContext = {
      sessionId,
      macroId: macro.id,
      macroName: macro.name,
      abortController,
      startedAtMicroseconds: Math.round(performance.now() * 1000),
      overlayState,
      state: 'Playing',
      speed,
      targetWindowHandle,
      receipts: [],
    };

    this.activeSessions.set(sessionId, context);
    this.emitStatus(context);
    return context;
  }

  public getSession(sessionId: string): MacroExecutionContext | undefined {
    return this.activeSessions.get(sessionId);
  }

  public getSessionByMacroId(macroId: string): MacroExecutionContext | undefined {
    for (const ctx of this.activeSessions.values()) {
      if (ctx.macroId === macroId) {
        return ctx;
      }
    }
    return undefined;
  }

  public getAllActiveSessions(): readonly MacroExecutionContext[] {
    return Array.from(this.activeSessions.values());
  }

  public isMacroRunning(macroId: string): boolean {
    return this.getSessionByMacroId(macroId) !== undefined;
  }

  public get activeSessionCount(): number {
    return this.activeSessions.size;
  }

  /**
   * Updates state for a session and notifies listeners.
   */
  public updateSessionState(sessionId: string, state: EngineState): void {
    const ctx = this.activeSessions.get(sessionId);
    if (ctx) {
      ctx.state = state;
      (ctx.overlayState as { state: EngineState }).state = state;
      this.emitStatus(ctx);
    }
  }

  /**
   * Appends an event dispatch receipt to the isolated session's receipts array.
   */
  public addReceipt(sessionId: string, receipt: DispatchReceipt): void {
    const ctx = this.activeSessions.get(sessionId);
    if (ctx) {
      ctx.receipts.push(receipt);
    }
  }

  /**
   * Closes and completes a session.
   */
  public closeSession(sessionId: string): MacroExecutionContext | undefined {
    const ctx = this.activeSessions.get(sessionId);
    if (ctx) {
      ctx.state = 'Idle';
      this.externalSignalCleanups.get(sessionId)?.();
      this.externalSignalCleanups.delete(sessionId);
      this.emitStatus(ctx);
      this.activeSessions.delete(sessionId);
    }
    return ctx;
  }

  /**
   * Stops an individual session via cancellation.
   */
  public stopSession(sessionId: string, reason = 'Playback stopped'): boolean {
    const ctx = this.activeSessions.get(sessionId);
    if (ctx) {
      ctx.abortController.abort(reason);
      ctx.state = 'Stopping';
      this.emitStatus(ctx);
      return true;
    }
    return false;
  }

  /**
   * Universal Emergency Stop:
   * Synchronously signals cancellation to ALL currently active macro sessions.
   */
  public stopAllSessions(reason = 'Emergency stop initiated'): number {
    let stoppedCount = 0;
    for (const ctx of this.activeSessions.values()) {
      try {
        ctx.abortController.abort(reason);
        ctx.state = 'Stopping';
        stoppedCount++;
      } catch {
        // Continue stopping remaining sessions
      }
    }
    return stoppedCount;
  }

  public cancelAll(reason = 'Emergency stop initiated'): number {
    return this.stopAllSessions(reason);
  }

  public onSessionStatusChanged(listener: (status: PlaybackSessionStatus) => void): () => void {
    this.sessionListeners.add(listener);
    return () => {
      this.sessionListeners.delete(listener);
    };
  }

  private emitStatus(ctx: MacroExecutionContext): void {
    const nowUs = Math.round(performance.now() * 1000);
    const elapsedUs = Math.max(0, nowUs - ctx.startedAtMicroseconds);

    const status: PlaybackSessionStatus = {
      sessionId: ctx.sessionId,
      macroId: ctx.macroId,
      macroName: ctx.macroName,
      state: ctx.state,
      elapsedMicroseconds: elapsedUs,
      currentActionIndex: ctx.receipts.length,
      totalActions: 0,
      receiptsCount: ctx.receipts.length,
    };

    for (const listener of this.sessionListeners) {
      try {
        listener(status);
      } catch (err) {
        console.warn('[ConcurrentMacroManager] Listener error:', err);
      }
    }
  }
}
