/**
 * High-resolution precision waiters for playback scheduler.
 */

import {
  type CancellationToken,
  checkCancellation,
  sleep,
} from './cancellation.js';
import type { PauseGate } from './pause-gate.js';
import {
  type IPlaybackClock,
  type IPrecisionWaiter,
  Stopwatch,
} from './ports.js';

export class ManagedPrecisionWaiter implements IPrecisionWaiter {
  public constructor(private readonly clock: IPlaybackClock = Stopwatch) {}

  public async untilAsync(
    startTimestamp: number,
    targetMicroseconds: number,
    pausedTicks: number,
    token?: CancellationToken | AbortSignal,
    pauseGate?: PauseGate,
  ): Promise<void> {
    let currentPausedTicks = pausedTicks;
    let targetTicks =
      startTimestamp +
      currentPausedTicks +
      Math.round((targetMicroseconds * this.clock.frequency) / 1_000_000);

    while (true) {
      checkCancellation(token);

      if (pauseGate) {
        let pauseStarted = 0;
        if (!pauseGate.isSet) {
          pauseStarted = this.clock.getTimestamp();
        }
        await pauseGate.wait(token);
        if (pauseStarted !== 0) {
          currentPausedTicks += this.clock.getTimestamp() - pauseStarted;
          targetTicks =
            startTimestamp +
            currentPausedTicks +
            Math.round((targetMicroseconds * this.clock.frequency) / 1_000_000);
        }
      }

      const remainingTicks = targetTicks - this.clock.getTimestamp();
      if (remainingTicks <= 0) return;

      const remainingMs = (remainingTicks * 1000) / this.clock.frequency;
      if (remainingMs > 3) {
        const sleepMs = pauseGate
          ? Math.min(20, Math.max(1, Math.floor(remainingMs - 2)))
          : Math.max(1, Math.floor(remainingMs - 2));
        await sleep(sleepMs, token);
      } else if (remainingMs > 0.5) {
        await new Promise<void>((resolve) => {
          setImmediate(resolve);
        });
      } else {
        while (this.clock.getTimestamp() < targetTicks) {
          checkCancellation(token);
        }
        return;
      }
    }
  }

  public async UntilAsync(
    startTimestamp: number,
    targetMicroseconds: number,
    pausedTicks: number,
    token?: CancellationToken | AbortSignal,
    pauseGate?: PauseGate,
  ): Promise<void> {
    return this.untilAsync(
      startTimestamp,
      targetMicroseconds,
      pausedTicks,
      token,
      pauseGate,
    );
  }
}

/**
 * Windows precision waiter alias mapped to high-resolution waiter.
 */
export class WindowsPrecisionWaiter extends ManagedPrecisionWaiter {}

/**
 * Deterministic precision waiter for fast, instant test execution.
 */
export class DeterministicManualWaiter implements IPrecisionWaiter {
  public untilCalls: Array<{
    startTimestamp: number;
    targetMicroseconds: number;
    pausedTicks: number;
  }> = [];

  public async untilAsync(
    startTimestamp: number,
    targetMicroseconds: number,
    pausedTicks: number,
    token?: CancellationToken | AbortSignal,
    _pauseGate?: PauseGate,
  ): Promise<void> {
    checkCancellation(token);
    this.untilCalls.push({ startTimestamp, targetMicroseconds, pausedTicks });
  }

  public async UntilAsync(
    startTimestamp: number,
    targetMicroseconds: number,
    pausedTicks: number,
    token?: CancellationToken | AbortSignal,
    pauseGate?: PauseGate,
  ): Promise<void> {
    return this.untilAsync(
      startTimestamp,
      targetMicroseconds,
      pausedTicks,
      token,
      pauseGate,
    );
  }
}
