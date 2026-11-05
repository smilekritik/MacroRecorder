/**
 * Absolute-deadline playback engine.
 */

import { format, t } from '../../../localization/src/index.js';
import {
  DispatchReceiptModel,
  EngineState,
  FocusLossBehavior,
  getMacroDurationMicroseconds,
  isAutomaticTriggerMacro,
  isCommentEvent,
  MacroEventType,
  normalizeEvents,
  sendsInput,
  TargetMode,
} from '../model/index.js';
import type {
  DispatchReceipt,
  MacroDefinition,
  MacroEvent,
  PixelColorTriggerEvent,
  RunMacroEvent,
  WaitForPixelGoneEvent,
  WaitForWindowEvent,
  WaitForKeyEvent,
} from '../model/types.js';
import {
  type CancellationToken,
  CancellationTokenSource,
  checkCancellation,
  OperationCanceledException,
  sleep,
} from './cancellation.js';
import { PauseGate } from './pause-gate.js';
import {
  type IInputInjector,
  type IPixelColorProvider,
  type IPlaybackClock,
  type IPrecisionWaiter,
  invokeGetPixelColorRgb,
  invokeReleaseAll,
  invokeSendAsync,
  invokeUntilAsync,
  Stopwatch,
} from './ports.js';
import { ManagedPrecisionWaiter } from './waiter.js';

export class InvalidOperationException extends Error {
  public constructor(message?: string) {
    super(message);
    this.name = 'InvalidOperationException';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export type StateChangedListener = (sender: PlaybackEngine, state: EngineState) => void;
export type EventDispatchedListener = (sender: PlaybackEngine, receipt: DispatchReceipt) => void;

export class PlaybackEngine {
  private readonly _injector: IInputInjector;
  private readonly _waiter: IPrecisionWaiter;
  private readonly _pixelColorProvider: IPixelColorProvider | null;
  private readonly _clock: IPlaybackClock;
  private readonly _pauseGate: PauseGate = new PauseGate(true);
  private _receipts: DispatchReceipt[] = [];
  private _state: EngineState = EngineState.Idle;
  private _cts: CancellationTokenSource | null = null;
  private _activePromise: Promise<void> | null = null;

  private readonly _stateChangedListeners: Set<(state: EngineState) => void> = new Set();
  private readonly _eventDispatchedListeners: Set<(receipt: DispatchReceipt) => void> = new Set();

  public stateChanged?: ((state: EngineState) => void) | null | undefined;
  public StateChanged?: StateChangedListener | null | undefined;
  public eventDispatched?: ((receipt: DispatchReceipt) => void) | null | undefined;
  public EventDispatched?: EventDispatchedListener | null | undefined;

  public targetIsActive?: ((macro: MacroDefinition) => boolean) | null | undefined;
  public get TargetIsActive(): ((macro: MacroDefinition) => boolean) | null | undefined {
    return this.targetIsActive;
  }
  public set TargetIsActive(val: ((macro: MacroDefinition) => boolean) | null | undefined) {
    this.targetIsActive = val;
  }

  public foregroundMatches?:
    | ((processName?: string | null, windowTitle?: string | null) => boolean)
    | null
    | undefined;
  public get ForegroundMatches():
    | ((processName?: string | null, windowTitle?: string | null) => boolean)
    | null
    | undefined {
    return this.foregroundMatches;
  }
  public set ForegroundMatches(
    val:
      | ((processName?: string | null, windowTitle?: string | null) => boolean)
      | null
      | undefined,
  ) {
    this.foregroundMatches = val;
  }

  public keyIsDown?: ((virtualKey: number) => boolean) | null | undefined;
  public get KeyIsDown(): ((virtualKey: number) => boolean) | null | undefined {
    return this.keyIsDown;
  }
  public set KeyIsDown(val: ((virtualKey: number) => boolean) | null | undefined) {
    this.keyIsDown = val;
  }

  public resolveMacro?: ((name: string) => MacroDefinition | null | undefined) | null | undefined;
  public get ResolveMacro():
    | ((name: string) => MacroDefinition | null | undefined)
    | null
    | undefined {
    return this.resolveMacro;
  }
  public set ResolveMacro(
    val: ((name: string) => MacroDefinition | null | undefined) | null | undefined,
  ) {
    this.resolveMacro = val;
  }

  public targetWindow = 0;
  public get TargetWindow(): number {
    return this.targetWindow;
  }
  public set TargetWindow(val: number) {
    this.targetWindow = val;
  }

  private static readonly MaxSubMacroDepth = 16;

  public constructor(
    injector: IInputInjector,
    waiter?: IPrecisionWaiter | null,
    pixelColorProvider?: IPixelColorProvider | null,
    clock?: IPlaybackClock,
  ) {
    this._injector = injector;
    this._clock = clock ?? Stopwatch;
    this._waiter = waiter ?? new ManagedPrecisionWaiter(this._clock);
    this._pixelColorProvider = pixelColorProvider ?? null;
  }

  public get state(): EngineState {
    return this._state;
  }
  public get State(): EngineState {
    return this._state;
  }

  public get receipts(): readonly DispatchReceipt[] {
    return this._receipts;
  }
  public get Receipts(): readonly DispatchReceipt[] {
    return this._receipts;
  }

  public get clock(): IPlaybackClock {
    return this._clock;
  }

  public get waiter(): IPrecisionWaiter {
    return this._waiter;
  }

  public get injector(): IInputInjector {
    return this._injector;
  }

  public get pixelColorProvider(): IPixelColorProvider | null {
    return this._pixelColorProvider;
  }

  public onStateChanged(callback: (state: EngineState) => void): () => void {
    this._stateChangedListeners.add(callback);
    return () => {
      this._stateChangedListeners.delete(callback);
    };
  }

  public onEventDispatched(callback: (receipt: DispatchReceipt) => void): () => void {
    this._eventDispatchedListeners.add(callback);
    return () => {
      this._eventDispatchedListeners.delete(callback);
    };
  }

  private setState(newState: EngineState): void {
    if (this._state === newState) return;
    this._state = newState;
    this.stateChanged?.(newState);
    this.StateChanged?.(this, newState);
    for (const listener of this._stateChangedListeners) {
      listener(newState);
    }
  }

  private emitReceipt(receipt: DispatchReceipt): void {
    this.eventDispatched?.(receipt);
    this.EventDispatched?.(this, receipt);
    for (const listener of this._eventDispatchedListeners) {
      listener(receipt);
    }
  }

  public async playAsync(
    macro: MacroDefinition,
    externalToken?: CancellationToken | AbortSignal,
  ): Promise<void> {
    return this.startAsync(macro, false, externalToken);
  }

  public async PlayAsync(
    macro: MacroDefinition,
    externalToken?: CancellationToken | AbortSignal,
  ): Promise<void> {
    return this.playAsync(macro, externalToken);
  }

  public async playAutomaticTriggerAsync(
    macro: MacroDefinition,
    externalToken?: CancellationToken | AbortSignal,
  ): Promise<void> {
    return this.startAsync(macro, true, externalToken);
  }

  public async PlayAutomaticTriggerAsync(
    macro: MacroDefinition,
    externalToken?: CancellationToken | AbortSignal,
  ): Promise<void> {
    return this.playAutomaticTriggerAsync(macro, externalToken);
  }

  private async startAsync(
    macro: MacroDefinition,
    automaticTrigger: boolean,
    externalToken?: CancellationToken | AbortSignal,
  ): Promise<void> {
    if (this._activePromise !== null) {
      throw new InvalidOperationException(t('Another macro is already running.'));
    }
    if (automaticTrigger && !isAutomaticTriggerMacro(macro)) {
      throw new InvalidOperationException(
        t('Automatic mode requires a pixel color trigger as the first action.'),
      );
    }

    this._cts = CancellationTokenSource.createLinkedTokenSource(externalToken);
    this._receipts = [];
    this._pauseGate.set();

    const promise = this.runAsync(macro, automaticTrigger, this._cts.token);
    this._activePromise = promise;
    return promise;
  }

  public pause(): void {
    if (this._state !== EngineState.Playing) return;
    this._pauseGate.reset();
    this.setState(EngineState.Paused);
  }

  public Pause(): void {
    this.pause();
  }

  public resume(): void {
    if (this._state !== EngineState.Paused) return;
    this._pauseGate.set();
    this.setState(EngineState.Playing);
  }

  public Resume(): void {
    this.resume();
  }

  public stop(): void {
    this.setState(EngineState.Stopping);
    this._cts?.cancel();
    this._pauseGate.set();
    invokeReleaseAll(this._injector);
  }

  public Stop(): void {
    this.stop();
  }

  private async runAsync(
    macro: MacroDefinition,
    automaticTrigger: boolean,
    token: CancellationToken,
  ): Promise<void> {
    this.setState(EngineState.Playing);
    try {
      await this.playEventsAsync(macro, automaticTrigger, 0, new Set([macro.id]), token);
    } catch (err) {
      if (
        err instanceof OperationCanceledException ||
        (err instanceof Error && err.name === 'AbortError')
      ) {
        // Normal cancellation
      } else {
        throw err;
      }
    } finally {
      invokeReleaseAll(this._injector);
      this.setState(EngineState.Idle);
      this._activePromise = null;
    }
  }

  private async playEventsAsync(
    macro: MacroDefinition,
    automaticTrigger: boolean,
    depth: number,
    callStack: Set<string>,
    token: CancellationToken,
  ): Promise<void> {
    const rawEvents: MacroEvent[] = (
      macro.events as readonly (MacroEvent | { toEvent: () => MacroEvent })[]
    ).map((e) => ('toEvent' in e && typeof e.toEvent === 'function' ? e.toEvent() : (e as MacroEvent)));
    const events = normalizeEvents(rawEvents).filter((item) => !isCommentEvent(item));
    const repeatForever = depth === 0 && (automaticTrigger || macro.playback.repeatCount === 0);
    const repeats = Math.max(1, macro.playback.repeatCount);
    const speed = Math.min(10, Math.max(0.1, macro.playback.speed));
    const automaticCooldown = automaticTrigger
      ? Math.max(
          0,
          (
            events.find(
              (item) => item.type === MacroEventType.PixelColorTrigger,
            ) as PixelColorTriggerEvent | undefined
          )?.triggerCooldownMilliseconds ?? 0,
        )
      : 0;

    const hasJitter = macro.playback.randomizeTiming && macro.playback.timingJitterMilliseconds > 0;
    const jitterUs = Math.max(0, macro.playback.timingJitterMilliseconds) * 1000;

    for (let repeat = 0; repeatForever || repeat < repeats; repeat++) {
      token.throwIfCancellationRequested();
      const start = this._clock.getTimestamp();
      let pausedTicks = 0;
      let previousPlannedUs = -1;

      const groups = this.groupEventsByTime(events);

      for (const group of groups) {
        if (
          depth === 0 &&
          this.targetWindow === 0 &&
          macro.playback.targetMode === TargetMode.SpecificWindow &&
          this.targetIsActive &&
          macro.playback.focusLossBehavior !== FocusLossBehavior.Continue
        ) {
          if (
            macro.playback.focusLossBehavior === FocusLossBehavior.Stop &&
            !this.targetIsActive(macro)
          ) {
            throw new OperationCanceledException(t('The target window lost focus.'), token);
          }
          let targetPauseStarted = 0;
          while (!this.targetIsActive(macro)) {
            if (targetPauseStarted === 0) {
              targetPauseStarted = this._clock.getTimestamp();
            }
            this.setState(EngineState.Paused);
            await sleep(100, token);
          }
          if (targetPauseStarted !== 0) {
            pausedTicks += this._clock.getTimestamp() - targetPauseStarted;
          }
          if (this._state === EngineState.Paused) {
            this.setState(EngineState.Playing);
          }
        }

        let pauseStarted = 0;
        if (!this._pauseGate.isSet) {
          pauseStarted = this._clock.getTimestamp();
        }
        await this._pauseGate.wait(token);
        if (pauseStarted !== 0) {
          pausedTicks += this._clock.getTimestamp() - pauseStarted;
        }

        const authoredUs = Math.trunc(group.timeMicroseconds / speed);
        let plannedUs = authoredUs;
        if (hasJitter) {
          const delta = Math.floor(Math.random() * (2 * jitterUs + 1)) - jitterUs;
          plannedUs = Math.max(0, authoredUs + delta);
          if (plannedUs < previousPlannedUs) {
            plannedUs = previousPlannedUs;
          }
        }
        previousPlannedUs = plannedUs;
        const plannedTag = plannedUs !== authoredUs ? plannedUs : null;

        await invokeUntilAsync(this._waiter, start, plannedUs, pausedTicks, token, this._pauseGate);

        let pauseAfterWait = 0;
        if (!this._pauseGate.isSet) {
          pauseAfterWait = this._clock.getTimestamp();
        }
        await this._pauseGate.wait(token);
        if (pauseAfterWait !== 0) {
          pausedTicks += this._clock.getTimestamp() - pauseAfterWait;
        }

        for (const item of group.events) {
          if (this.isBlockingWait(item.type)) {
            const waitStarted = this._clock.getTimestamp();
            const satisfied = await this.waitForConditionAsync(item, token);
            const waitFinished = this._clock.getTimestamp();
            const actualUs = Math.round(
              ((waitFinished - start - pausedTicks) * 1_000_000) / this._clock.frequency,
            );
            pausedTicks += waitFinished - waitStarted;
            const triggerReceipt = new DispatchReceiptModel(
              item.id,
              authoredUs,
              actualUs,
              actualUs,
              actualUs,
              satisfied,
              satisfied ? null : t('Wait timed out'),
            );
            this._receipts.push(triggerReceipt);
            this.emitReceipt(triggerReceipt);
            continue;
          }

          if (item.type === MacroEventType.RunMacro) {
            const subStarted = this._clock.getTimestamp();
            const { ok, error } = await this.runSubMacroAsync(item, depth, callStack, token);
            const subFinished = this._clock.getTimestamp();
            const actualUs = Math.round(
              ((subFinished - start - pausedTicks) * 1_000_000) / this._clock.frequency,
            );
            pausedTicks += subFinished - subStarted;
            const subReceipt = new DispatchReceiptModel(
              item.id,
              authoredUs,
              actualUs,
              actualUs,
              actualUs,
              ok,
              error,
            );
            this._receipts.push(subReceipt);
            this.emitReceipt(subReceipt);
            continue;
          }

          let receipt: DispatchReceipt;
          if (sendsInput(item)) {
            const rawReceipt = await invokeSendAsync(
              this._injector,
              item,
              authoredUs,
              start + pausedTicks,
              macro.playback.targetMode === TargetMode.SpecificWindow &&
                macro.playback.preferScanCodes,
              this.targetWindow,
              token,
            );
            receipt = new DispatchReceiptModel({
              ...rawReceipt,
              plannedMicroseconds: plannedTag,
            });
          } else {
            receipt = new DispatchReceiptModel(
              item.id,
              authoredUs,
              plannedUs,
              plannedUs,
              null,
              true,
              null,
              plannedTag,
            );
          }
          this._receipts.push(receipt);
          this.emitReceipt(receipt);
        }
      }

      const finishUs = Math.trunc(getMacroDurationMicroseconds(macro) / speed);
      if (finishUs > 0) {
        await invokeUntilAsync(this._waiter, start, finishUs, pausedTicks, token, this._pauseGate);
      }

      const repeatDelay = automaticTrigger
        ? automaticCooldown
        : macro.playback.repeatDelayMilliseconds;
      if ((repeatForever || repeat + 1 < repeats) && repeatDelay > 0) {
        await sleep(repeatDelay, token);
      }
    }
  }

  private async runSubMacroAsync(
    item: MacroEvent,
    depth: number,
    callStack: Set<string>,
    token: CancellationToken,
  ): Promise<{ ok: boolean; error: string | null }> {
    const subMacroName = (item as RunMacroEvent).subMacroName ?? '';
    const sub = this.resolveMacro?.(subMacroName);
    if (!sub) {
      return { ok: false, error: format('Sub-macro “{0}” not found', subMacroName) };
    }
    if (depth + 1 > PlaybackEngine.MaxSubMacroDepth) {
      return { ok: false, error: t('Macro call nesting is too deep.') };
    }
    if (callStack.has(sub.id)) {
      return { ok: false, error: format('Cyclic call of macro “{0}”', sub.name) };
    }
    callStack.add(sub.id);
    try {
      await this.playEventsAsync(sub, false, depth + 1, callStack, token);
      return { ok: true, error: null };
    } finally {
      callStack.delete(sub.id);
    }
  }

  private isBlockingWait(type: MacroEventType): boolean {
    return (
      type === MacroEventType.PixelColorTrigger ||
      type === MacroEventType.WaitForPixelGone ||
      type === MacroEventType.WaitForWindow ||
      type === MacroEventType.WaitForKey
    );
  }

  private async waitForConditionAsync(
    item: MacroEvent,
    token: CancellationToken,
  ): Promise<boolean> {
    switch (item.type) {
      case MacroEventType.PixelColorTrigger:
        return this.waitPixelAsync(item as PixelColorTriggerEvent, true, 0, token);
      case MacroEventType.WaitForPixelGone: {
        const goneEvent = item as WaitForPixelGoneEvent;
        return this.waitPixelAsync(
          goneEvent,
          false,
          goneEvent.waitTimeoutMilliseconds ?? 0,
          token,
        );
      }
      case MacroEventType.WaitForWindow: {
        const winEvent = item as WaitForWindowEvent;
        return this.waitPollAsync(
          () =>
            this.foregroundMatches
              ? this.foregroundMatches(
                  winEvent.waitProcessName ?? null,
                  winEvent.waitWindowTitle ?? null,
                )
              : true,
          winEvent.waitTimeoutMilliseconds ?? 0,
          50,
          token,
        );
      }
      case MacroEventType.WaitForKey: {
        const keyEvent = item as WaitForKeyEvent;
        return this.waitPollAsync(
          () =>
            !keyEvent.waitKeyVirtualKey ||
            (this.keyIsDown ? this.keyIsDown(keyEvent.waitKeyVirtualKey) : true),
          keyEvent.waitTimeoutMilliseconds ?? 0,
          10,
          token,
        );
      }
      default:
        return true;
    }
  }

  private async waitPixelAsync(
    item: PixelColorTriggerEvent | WaitForPixelGoneEvent,
    mustMatch: boolean,
    timeoutMs: number,
    token: CancellationToken,
  ): Promise<boolean> {
    if (!this._pixelColorProvider) {
      throw new InvalidOperationException(t('Pixel color detection is unavailable.'));
    }
    const provider = this._pixelColorProvider;
    const expected = (item.pixelColor ?? 0) & 0xffffff;
    const pixelX = item.pixelX ?? 0;
    const pixelY = item.pixelY ?? 0;

    return this.waitPollAsync(
      () => {
        const color = invokeGetPixelColorRgb(provider, pixelX, pixelY) & 0xffffff;
        return (color === expected) === mustMatch;
      },
      timeoutMs,
      10,
      token,
    );
  }

  private async waitPollAsync(
    condition: () => boolean,
    timeoutMs: number,
    pollMilliseconds: number,
    token: CancellationToken,
  ): Promise<boolean> {
    const deadline =
      timeoutMs > 0
        ? this._clock.getTimestamp() + Math.round((timeoutMs / 1000) * this._clock.frequency)
        : 0;

    while (true) {
      checkCancellation(token);
      await this._pauseGate.wait(token);
      if (condition()) {
        return true;
      }
      if (deadline !== 0 && this._clock.getTimestamp() >= deadline) {
        return false;
      }
      await sleep(pollMilliseconds, token);
    }
  }

  private groupEventsByTime(
    events: readonly MacroEvent[],
  ): Array<{ timeMicroseconds: number; events: MacroEvent[] }> {
    const result: Array<{ timeMicroseconds: number; events: MacroEvent[] }> = [];
    for (const event of events) {
      const last = result[result.length - 1];
      if (last && last.timeMicroseconds === event.timeMicroseconds) {
        last.events.push(event);
      } else {
        result.push({ timeMicroseconds: event.timeMicroseconds, events: [event] });
      }
    }
    return result;
  }
}
