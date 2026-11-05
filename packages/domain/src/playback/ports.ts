/**
 * Injected ports and clock interfaces for playback engine.
 */

import {
  type DispatchReceipt,
  type MacroEvent,
  type Microseconds,
} from '../model/types.js';
import { type CancellationToken } from './cancellation.js';

export interface IInputInjector {
  sendAsync?(
    item: MacroEvent,
    scheduledMicroseconds: Microseconds,
    clockStartTimestamp: number,
    preferScanCodes: boolean,
    targetWindow: number,
    token?: CancellationToken | AbortSignal,
  ): Promise<DispatchReceipt>;

  SendAsync?(
    item: MacroEvent,
    scheduledMicroseconds: Microseconds,
    clockStartTimestamp: number,
    preferScanCodes: boolean,
    targetWindow: number,
    token?: CancellationToken | AbortSignal,
  ): Promise<DispatchReceipt>;

  releaseAll?(): void;
  ReleaseAll?(): void;
}

import type { PauseGate } from './pause-gate.js';

export interface IPrecisionWaiter {
  untilAsync?(
    startTimestamp: number,
    targetMicroseconds: Microseconds,
    pausedTicks: number,
    token?: CancellationToken | AbortSignal,
    pauseGate?: PauseGate,
  ): Promise<void>;

  UntilAsync?(
    startTimestamp: number,
    targetMicroseconds: Microseconds,
    pausedTicks: number,
    token?: CancellationToken | AbortSignal,
    pauseGate?: PauseGate,
  ): Promise<void>;
}

export interface IPixelColorProvider {
  getPixelColorRgb?(x: number, y: number): number;
  GetPixelColorRgb?(x: number, y: number): number;
}

export interface IPlaybackClock {
  getTimestamp(): number;
  GetTimestamp?(): number;
  readonly frequency: number;
  readonly Frequency?: number;
}

export async function invokeSendAsync(
  injector: IInputInjector,
  item: MacroEvent,
  scheduledMicroseconds: Microseconds,
  clockStartTimestamp: number,
  preferScanCodes: boolean,
  targetWindow: number,
  token?: CancellationToken | AbortSignal,
): Promise<DispatchReceipt> {
  if (typeof injector.sendAsync === 'function') {
    return injector.sendAsync(
      item,
      scheduledMicroseconds,
      clockStartTimestamp,
      preferScanCodes,
      targetWindow,
      token,
    );
  }
  if (typeof injector.SendAsync === 'function') {
    return injector.SendAsync(
      item,
      scheduledMicroseconds,
      clockStartTimestamp,
      preferScanCodes,
      targetWindow,
      token,
    );
  }
  throw new Error('InputInjector must implement sendAsync or SendAsync');
}

export function invokeReleaseAll(injector: IInputInjector): void {
  if (typeof injector.releaseAll === 'function') {
    injector.releaseAll();
  } else if (typeof injector.ReleaseAll === 'function') {
    injector.ReleaseAll();
  }
}

export async function invokeUntilAsync(
  waiter: IPrecisionWaiter,
  startTimestamp: number,
  targetMicroseconds: Microseconds,
  pausedTicks: number,
  token?: CancellationToken | AbortSignal,
  pauseGate?: PauseGate,
): Promise<void> {
  if (typeof waiter.untilAsync === 'function') {
    return waiter.untilAsync(
      startTimestamp,
      targetMicroseconds,
      pausedTicks,
      token,
      pauseGate,
    );
  }
  if (typeof waiter.UntilAsync === 'function') {
    return waiter.UntilAsync(
      startTimestamp,
      targetMicroseconds,
      pausedTicks,
      token,
      pauseGate,
    );
  }
  throw new Error('PrecisionWaiter must implement untilAsync or UntilAsync');
}

export function invokeGetPixelColorRgb(
  provider: IPixelColorProvider,
  x: number,
  y: number,
): number {
  if (typeof provider.getPixelColorRgb === 'function') {
    return provider.getPixelColorRgb(x, y);
  }
  if (typeof provider.GetPixelColorRgb === 'function') {
    return provider.GetPixelColorRgb(x, y);
  }
  throw new Error('PixelColorProvider must implement getPixelColorRgb or GetPixelColorRgb');
}

export interface StopwatchInstance {
  readonly elapsedMilliseconds: number;
  readonly ElapsedMilliseconds: number;
  stop(): void;
  Stop(): void;
}

export const Stopwatch: IPlaybackClock & {
  getTimestamp(): number;
  GetTimestamp(): number;
  readonly frequency: number;
  readonly Frequency: number;
  startNew(): StopwatchInstance;
  StartNew(): StopwatchInstance;
} = {
  get frequency(): number {
    return 1_000_000;
  },
  get Frequency(): number {
    return 1_000_000;
  },
  getTimestamp(): number {
    if (typeof process !== 'undefined' && typeof process.hrtime?.bigint === 'function') {
      return Number(process.hrtime.bigint() / 1000n);
    }
    return Math.round(performance.now() * 1000);
  },
  GetTimestamp(): number {
    return this.getTimestamp();
  },
  startNew(): StopwatchInstance {
    const start = this.getTimestamp();
    return {
      get elapsedMilliseconds(): number {
        return (Stopwatch.getTimestamp() - start) / 1000.0;
      },
      get ElapsedMilliseconds(): number {
        return this.elapsedMilliseconds;
      },
      stop(): void {},
      Stop(): void {},
    };
  },
  StartNew(): StopwatchInstance {
    return this.startNew();
  },
};
