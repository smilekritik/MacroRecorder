/**
 * Monotonic clock implementations for recording time origin and elapsed duration tracking.
 * Includes both high-resolution system clock and deterministic virtual clock for hardware-free testing.
 */

import { type Microseconds } from '../model/index.js';
import { type MonotonicClock } from './types.js';

/**
 * High-resolution monotonic system clock using Node.js process.hrtime.bigint or performance.now.
 * Guarantees monotonic non-decreasing microsecond precision.
 */
export class SystemMonotonicClock implements MonotonicClock {
  nowMicroseconds(): Microseconds {
    if (
      typeof process !== 'undefined' &&
      typeof process.hrtime === 'function' &&
      typeof process.hrtime.bigint === 'function'
    ) {
      return Number(process.hrtime.bigint() / 1000n);
    }
    if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
      return Math.round(performance.now() * 1000);
    }
    return Date.now() * 1000;
  }
}

/**
 * Deterministic virtual monotonic clock for testing.
 * Manually controllable, zero reliance on physical hardware or timers.
 */
export class DeterministicClock implements MonotonicClock {
  private currentTimeUs: Microseconds;

  constructor(initialTimeUs: Microseconds = 0) {
    this.currentTimeUs = Math.max(0, initialTimeUs);
  }

  nowMicroseconds(): Microseconds {
    return this.currentTimeUs;
  }

  advanceMicroseconds(deltaUs: Microseconds): Microseconds {
    if (deltaUs < 0) {
      throw new RangeError(`Cannot advance clock backwards: ${deltaUs} microseconds`);
    }
    this.currentTimeUs += deltaUs;
    return this.currentTimeUs;
  }

  advanceMilliseconds(deltaMs: number): Microseconds {
    return this.advanceMicroseconds(Math.round(deltaMs * 1000));
  }

  setTimeMicroseconds(targetUs: Microseconds): void {
    if (targetUs < this.currentTimeUs) {
      throw new RangeError(
        `Monotonic clock cannot jump backwards: target ${targetUs} < current ${this.currentTimeUs}`,
      );
    }
    this.currentTimeUs = targetUs;
  }
}

/**
 * Factory for monotonic clock instances.
 */
export function createMonotonicClock(deterministic = false, initialTimeUs = 0): MonotonicClock {
  return deterministic ? new DeterministicClock(initialTimeUs) : new SystemMonotonicClock();
}
