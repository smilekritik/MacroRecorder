/**
 * Test helpers, mock ports, fake clocks, waiters, and temporary roots
 * for deterministic unit tests.
 *
 * (fake pixel color provider).
 * Mapped to legacy MacroRecorder.Tests.TestHelpers.cs.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as crypto from 'node:crypto';

import {
  type DispatchReceipt,
  type Microseconds,
  DispatchReceiptModel,
} from '../../packages/domain/src/model/index.js';
import {
  type IInputInjector,
  type IPixelColorProvider,
  type IPrecisionWaiter,
  type IPlaybackClock,
} from '../../packages/domain/src/playback/ports.js';
import { type CancellationToken } from '../../packages/domain/src/playback/cancellation.js';
import { type PauseGate } from '../../packages/domain/src/playback/pause-gate.js';

/**
 * HELPER-STORE-085: Creates an isolated temporary directory for file-based tests.
 * Never touches real user data or standard library folders.
 */
export function createTemporaryRoot(prefix = 'mr-unit-'): string {
  const dirName = `${prefix}${crypto.randomUUID().replace(/-/g, '')}`;
  const fullPath = path.join(os.tmpdir(), 'MacroRecorderTests', dirName);
  fs.mkdirSync(fullPath, { recursive: true });
  return fullPath;
}

/**
 * HELPER-STORE-086: Recursively cleans up a temporary directory.
 */
export function deleteTemporaryRoot(dirPath: string): void {
  try {
    if (fs.existsSync(dirPath)) {
      fs.rmSync(dirPath, { recursive: true, force: true });
    }
  } catch {
    // Ignore cleanup errors in tests
  }
}

/**
 * Controllable fake clock with microsecond resolution.
 */
export class FakePlaybackClock implements IPlaybackClock {
  private _currentTimeUs = 0;
  public readonly frequency = 1_000_000;
  public readonly Frequency = 1_000_000;

  public constructor(initialTimeUs = 0) {
    this._currentTimeUs = initialTimeUs;
  }

  public get timestamp(): number {
    return this._currentTimeUs;
  }

  public getTimestamp(): number {
    return this._currentTimeUs;
  }

  public GetTimestamp(): number {
    return this._currentTimeUs;
  }

  public advance(microseconds: number): void {
    if (microseconds > 0) {
      this._currentTimeUs += microseconds;
    }
  }

  public setTime(microseconds: number): void {
    this._currentTimeUs = microseconds;
  }
}

/**
 * Deterministic fake precision waiter that advances virtual time immediately.
 */
export class FakePrecisionWaiter implements IPrecisionWaiter {
  public readonly requestedDeadlines: number[] = [];
  private readonly _clock?: FakePlaybackClock | undefined;

  public constructor(clock?: FakePlaybackClock) {
    this._clock = clock;
  }

  public async untilAsync(
    startTimestamp: number,
    targetMicroseconds: Microseconds,
    _pausedTicks: number,
    _token?: CancellationToken | AbortSignal,
    _pauseGate?: PauseGate,
  ): Promise<void> {
    this.requestedDeadlines.push(targetMicroseconds);
    if (this._clock) {
      const targetTime = startTimestamp + targetMicroseconds;
      if (this._clock.getTimestamp() < targetTime) {
        this._clock.setTime(targetTime);
      }
    }
  }

  public async UntilAsync(
    startTimestamp: number,
    targetMicroseconds: Microseconds,
    pausedTicks: number,
    token?: CancellationToken | AbortSignal,
    pauseGate?: PauseGate,
  ): Promise<void> {
    return this.untilAsync(startTimestamp, targetMicroseconds, pausedTicks, token, pauseGate);
  }
}

/**
 * HELPER-TEST-087 & HELPER-TEST-088:
 * Fake input injector implementing IInputInjector with PascalCase and camelCase members.
 */
export class FakeInjector implements IInputInjector {
  public readonly actual: number[] = [];
  public readonly scanCodePreferences: boolean[] = [];
  public readonly targets: number[] = [];
  public readonly events: Array<{ id: string }> = [];
  public releaseAllCount = 0;
  public afterSend?: (() => void) | undefined;
  public shouldThrowOnSend = false;

  private readonly _clock: IPlaybackClock;

  public constructor(clock?: IPlaybackClock) {
    this._clock = clock ?? {
      getTimestamp: () => 0,
      frequency: 1_000_000,
    };
  }

  public get Actual(): number[] {
    return this.actual;
  }

  public get ScanCodePreferences(): boolean[] {
    return this.scanCodePreferences;
  }

  public get Targets(): number[] {
    return this.targets;
  }

  public async sendAsync(
    item: { id: string },
    scheduledMicroseconds: Microseconds,
    start: number,
    preferScanCodes: boolean,
    targetWindow: number,
    _token?: CancellationToken | AbortSignal,
  ): Promise<DispatchReceipt> {
    if (this.shouldThrowOnSend) {
      throw new Error('Simulated input injection failure');
    }

    const current = this._clock.getTimestamp();
    const actual =
      start > 0 && current >= start
        ? Math.round(((current - start) * 1_000_000) / this._clock.frequency)
        : scheduledMicroseconds;

    this.actual.push(actual);
    this.scanCodePreferences.push(preferScanCodes);
    this.targets.push(targetWindow);
    this.events.push(item);

    this.afterSend?.();

    return new DispatchReceiptModel(
      item.id,
      scheduledMicroseconds,
      actual,
      actual,
      actual,
      true,
      null,
    );
  }

  public async SendAsync(
    item: { id: string },
    scheduledMicroseconds: Microseconds,
    start: number,
    preferScanCodes: boolean,
    targetWindow: number,
    token?: CancellationToken | AbortSignal,
  ): Promise<DispatchReceipt> {
    return this.sendAsync(item, scheduledMicroseconds, start, preferScanCodes, targetWindow, token);
  }

  public releaseAll(): void {
    this.releaseAllCount++;
  }

  public ReleaseAll(): void {
    this.releaseAll();
  }
}

/**
 * HELPER-TEST-089:
 * Fake pixel color provider implementing IPixelColorProvider with request logging.
 */
export class FakePixelColorProvider implements IPixelColorProvider {
  public color = 0;
  public readonly requests: Array<[number, number]> = [];

  public get Color(): number {
    return this.color;
  }

  public set Color(val: number) {
    this.color = val;
  }

  public get Requests(): Array<[number, number]> {
    return this.requests;
  }

  public getPixelColorRgb(x: number, y: number): number {
    this.requests.push([x, y]);
    return this.color;
  }

  public GetPixelColorRgb(x: number, y: number): number {
    return this.getPixelColorRgb(x, y);
  }
}
