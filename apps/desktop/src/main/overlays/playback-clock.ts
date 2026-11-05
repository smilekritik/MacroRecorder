/**
 * @macro-recorder/desktop - High-Resolution Monotonic Playback Clock
 * Tracks countdown and text annotation duration against high-resolution system
 * monotonic timestamps (hrtime / performance.now) rather than renderer frame rate.
 *
 * Prevents timer drift regardless of background throttling, renderer frame drops,
 * or UI pauses.
 *
 * System.Diagnostics.Stopwatch.GetTimestamp.
 */

import type { IPlaybackClock } from './types.js';

export interface PlaybackClockOptions {
  readonly tickIntervalMs?: number;
  readonly nowFn?: () => number; // Returns microseconds
}

/**
 * Default high-resolution microsecond clock source using process.hrtime.bigint.
 */
export function defaultNowMicroseconds(): number {
  if (typeof process !== 'undefined' && typeof process.hrtime?.bigint === 'function') {
    const ns = process.hrtime.bigint();
    return Number(ns / 1000n);
  }
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return Math.round(performance.now() * 1000);
  }
  return Date.now() * 1000;
}

export class PlaybackClock implements IPlaybackClock {
  private readonly nowFn: () => number;
  private readonly tickIntervalMs: number;
  private intervalTimer: NodeJS.Timeout | null = null;

  private active = false;
  private paused = false;
  private durationUs = 0;
  private remainingUs = 0;
  private playbackSpeed = 1.0;
  private lastTimestampUs = 0;

  private readonly tickCallbacks = new Set<(remainingUs: number, remainingSec: number) => void>();
  private readonly finishedCallbacks = new Set<() => void>();

  constructor(options: PlaybackClockOptions = {}) {
    this.nowFn = options.nowFn ?? defaultNowMicroseconds;
    this.tickIntervalMs = options.tickIntervalMs ?? 50;
  }

  public get isPaused(): boolean {
    return this.paused;
  }

  public get isActive(): boolean {
    return this.active;
  }

  public get nowMicroseconds(): () => number {
    return this.nowFn;
  }

  /**
   * Starts a countdown for the specified duration in microseconds.
   * Playback speed scales the clock (e.g. 2.0x runs twice as fast).
   */
  public start(durationMicroseconds: number, speed = 1.0): void {
    this.stop();

    this.durationUs = Math.max(0, durationMicroseconds);
    this.remainingUs = this.durationUs;
    this.playbackSpeed = Math.max(0.1, Math.min(10.0, speed));
    this.active = true;
    this.paused = false;
    this.lastTimestampUs = this.nowFn();

    this.notifyTick();

    if (this.durationUs > 0) {
      this.intervalTimer = setInterval(() => {
        this.tick();
      }, this.tickIntervalMs);
    } else {
      this.finish();
    }
  }

  /**
   * Advances the clock using true elapsed monotonic time.
   * Callable manually in tests or driven by the interval timer.
   */
  public tick(): void {
    if (!this.active || this.paused) {
      return;
    }

    const now = this.nowFn();
    const elapsedUs = Math.max(0, now - this.lastTimestampUs);
    this.lastTimestampUs = now;

    const scaledElapsedUs = Math.round(elapsedUs * this.playbackSpeed);
    this.remainingUs = Math.max(0, this.remainingUs - scaledElapsedUs);

    this.notifyTick();

    if (this.remainingUs <= 0) {
      this.finish();
    }
  }

  /**
   * Pauses the countdown clock, freezing the remaining microseconds.
   */
  public pause(): void {
    if (!this.active || this.paused) {
      return;
    }
    this.tick();
    this.paused = true;
  }

  /**
   * Resumes the countdown clock from its paused state, re-anchoring the timestamp.
   */
  public resume(): void {
    if (!this.active || !this.paused) {
      return;
    }
    this.paused = false;
    this.lastTimestampUs = this.nowFn();
  }

  /**
   * Stops the countdown timer and clears active state.
   */
  public stop(): void {
    if (this.intervalTimer !== null) {
      clearInterval(this.intervalTimer);
      this.intervalTimer = null;
    }
    this.active = false;
    this.paused = false;
    this.remainingUs = 0;
  }

  public getRemainingMicroseconds(): number {
    return this.remainingUs;
  }

  public getRemainingSeconds(): number {
    return Math.max(0, Math.ceil(this.remainingUs / 1_000_000));
  }

  public isExpired(): boolean {
    return this.remainingUs <= 0;
  }

  public onTick(callback: (remainingUs: number, remainingSec: number) => void): () => void {
    this.tickCallbacks.add(callback);
    return () => {
      this.tickCallbacks.delete(callback);
    };
  }

  public onFinished(callback: () => void): () => void {
    this.finishedCallbacks.add(callback);
    return () => {
      this.finishedCallbacks.delete(callback);
    };
  }

  private notifyTick(): void {
    const sec = this.getRemainingSeconds();
    for (const cb of this.tickCallbacks) {
      try {
        cb(this.remainingUs, sec);
      } catch (err) {
        console.warn('[PlaybackClock] tick callback error:', err);
      }
    }
  }

  private finish(): void {
    this.stop();
    for (const cb of this.finishedCallbacks) {
      try {
        cb();
      } catch (err) {
        console.warn('[PlaybackClock] finished callback error:', err);
      }
    }
  }
}
