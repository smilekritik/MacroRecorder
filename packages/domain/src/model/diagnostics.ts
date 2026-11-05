/**
 * Diagnostic receipts, millisecond projections, and timing statistics.
 */

import {
  createDispatchReceipt as contractCreateReceipt,
  dispatchReceiptSchema,
  type Guid,
  type Microseconds,
  type Milliseconds,
} from '../../../contracts/src/index.js';
import { formatMilliseconds } from './display.js';
import {
  type DispatchReceipt,
  type DispatchReceiptWire,
  type TimingSummary,
  type ValidationResult,
} from './types.js';

export { formatMilliseconds } from './display.js';

export const emptyTimingSummary: TimingSummary = {
  count: 0,
  failed: 0,
  unconfirmed: 0,
  meanMs: 0,
  medianMs: 0,
  p95Ms: 0,
  p99Ms: 0,
  maxMs: 0,
};

/**
 * Creates a valid DispatchReceipt with pre-calculated jitter and confirmation milliseconds.
 */
export function createDispatchReceipt(params: {
  readonly eventId: Guid;
  readonly scheduledMicroseconds: Microseconds;
  readonly dispatchStartedMicroseconds: Microseconds;
  readonly dispatchCompletedMicroseconds: Microseconds;
  readonly hookConfirmedMicroseconds?: Microseconds | null | undefined;
  readonly success: boolean;
  readonly error?: string | null | undefined;
  readonly plannedMicroseconds?: Microseconds | null | undefined;
}): DispatchReceipt {
  return contractCreateReceipt(params);
}

/**
 * Performs deep immutable cloning of a DispatchReceipt.
 */
export function cloneDispatchReceipt(receipt: DispatchReceipt): DispatchReceipt {
  return { ...receipt };
}

/**
 * Validates a DispatchReceipt against schema.
 */
export function validateDispatchReceipt(
  input: unknown,
  path = '',
): ValidationResult<DispatchReceipt> {
  return dispatchReceiptSchema.parse(input, path);
}

/**
 * User-facing millisecond projection for ScheduledMicroseconds.
 */
export function getReceiptScheduledMilliseconds(receipt: DispatchReceipt): Milliseconds {
  return receipt.scheduledMicroseconds / 1000.0;
}

/**
 * User-facing millisecond projection for DispatchStartedMicroseconds.
 */
export function getReceiptStartedMilliseconds(receipt: DispatchReceipt): Milliseconds {
  return receipt.dispatchStartedMicroseconds / 1000.0;
}

/**
 * User-facing millisecond projection for DispatchCompletedMicroseconds.
 */
export function getReceiptCompletedMilliseconds(receipt: DispatchReceipt): Milliseconds {
  return receipt.dispatchCompletedMicroseconds / 1000.0;
}

/**
 * User-facing millisecond projection for HookConfirmedMicroseconds.
 */
export function getReceiptHookConfirmedMilliseconds(receipt: DispatchReceipt): Milliseconds | null {
  return receipt.hookConfirmedMicroseconds != null
    ? receipt.hookConfirmedMicroseconds / 1000.0
    : null;
}

/**
 * User-facing millisecond projection for PlannedMicroseconds.
 */
export function getReceiptPlannedMilliseconds(receipt: DispatchReceipt): Milliseconds | null {
  return receipt.plannedMicroseconds != null ? receipt.plannedMicroseconds / 1000.0 : null;
}

/**
 * Returns formatted scheduled time display, including parenthesized planned time if jitter was applied.
 */
export function getReceiptScheduledDisplayMilliseconds(receipt: DispatchReceipt): string {
  const scheduledMs = getReceiptScheduledMilliseconds(receipt);
  const plannedMs = getReceiptPlannedMilliseconds(receipt);
  if (plannedMs !== null) {
    return `${formatMilliseconds(scheduledMs)} (${formatMilliseconds(plannedMs)})`;
  }
  return formatMilliseconds(scheduledMs);
}

/**
 * Calculates linear percentile across sorted values.
 */
function calculatePercentile(sorted: readonly number[], p: number): number {
  if (sorted.length === 0) return 0;
  if (sorted.length === 1) return sorted[0] ?? 0;
  const position = (sorted.length - 1) * p;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  const lowerVal = sorted[lower] ?? 0;
  const upperVal = sorted[upper] ?? 0;
  return lowerVal + (upperVal - lowerVal) * (position - lower);
}

/**
 * Aggregates timing summary statistics from a collection of receipts.
 */
export function calculateTimingStatistics(receipts: readonly DispatchReceipt[]): TimingSummary {
  if (receipts.length === 0) {
    return emptyTimingSummary;
  }

  const values = receipts.map((r) => r.dispatchJitterMilliseconds).sort((a, b) => a - b);
  const failed = receipts.filter((r) => !r.success).length;
  const unconfirmed = receipts.filter((r) => r.hookConfirmedMicroseconds == null).length;
  const sum = values.reduce((acc, v) => acc + v, 0);
  const meanMs = sum / values.length;
  const medianMs = calculatePercentile(values, 0.5);
  const p95Ms = calculatePercentile(values, 0.95);
  const p99Ms = calculatePercentile(values, 0.99);
  const maxMs = values[values.length - 1] ?? 0;

  return {
    count: receipts.length,
    failed,
    unconfirmed,
    meanMs,
    medianMs,
    p95Ms,
    p99Ms,
    maxMs,
  };
}

/**
 * Object-oriented model wrapper around DispatchReceipt.
 * with DispatchReceipt record properties and millisecond getters.
 */
export class DispatchReceiptModel implements DispatchReceipt {
  public readonly eventId: Guid;
  public readonly scheduledMicroseconds: Microseconds;
  public readonly dispatchStartedMicroseconds: Microseconds;
  public readonly dispatchCompletedMicroseconds: Microseconds;
  public readonly hookConfirmedMicroseconds?: Microseconds | null | undefined;
  public readonly success: boolean;
  public readonly error?: string | null | undefined;
  public readonly plannedMicroseconds?: Microseconds | null | undefined;
  public readonly dispatchJitterMilliseconds: Milliseconds;
  public readonly confirmationMilliseconds?: Milliseconds | null | undefined;

  public constructor(
    eventIdOrObj:
      | Guid
      | (Partial<DispatchReceipt> & {
          eventId: Guid;
          scheduledMicroseconds: Microseconds;
          dispatchStartedMicroseconds: Microseconds;
          dispatchCompletedMicroseconds: Microseconds;
        })
      | DispatchReceiptWire,
    scheduledMicroseconds?: Microseconds,
    dispatchStartedMicroseconds?: Microseconds,
    dispatchCompletedMicroseconds?: Microseconds,
    hookConfirmedMicroseconds?: Microseconds | null,
    success?: boolean,
    error?: string | null,
    plannedMicroseconds?: Microseconds | null,
  ) {
    let receipt: DispatchReceipt;
    if (typeof eventIdOrObj === 'object' && eventIdOrObj !== null) {
      const obj = eventIdOrObj as Record<string, unknown>;
      receipt = createDispatchReceipt({
        eventId: (obj.eventId ?? obj.EventId ?? '') as Guid,
        scheduledMicroseconds: (obj.scheduledMicroseconds ??
          obj.ScheduledMicroseconds ??
          0) as Microseconds,
        dispatchStartedMicroseconds: (obj.dispatchStartedMicroseconds ??
          obj.DispatchStartedMicroseconds ??
          0) as Microseconds,
        dispatchCompletedMicroseconds: (obj.dispatchCompletedMicroseconds ??
          obj.DispatchCompletedMicroseconds ??
          0) as Microseconds,
        hookConfirmedMicroseconds: (obj.hookConfirmedMicroseconds ??
          obj.HookConfirmedMicroseconds ??
          null) as Microseconds | null,
        success: (obj.success ?? obj.Success ?? true) as boolean,
        error: (obj.error ?? obj.Error ?? null) as string | null,
        plannedMicroseconds: (obj.plannedMicroseconds ??
          obj.PlannedMicroseconds ??
          null) as Microseconds | null,
      });
    } else {
      receipt = createDispatchReceipt({
        eventId: eventIdOrObj,
        scheduledMicroseconds: scheduledMicroseconds ?? 0,
        dispatchStartedMicroseconds: dispatchStartedMicroseconds ?? 0,
        dispatchCompletedMicroseconds: dispatchCompletedMicroseconds ?? 0,
        hookConfirmedMicroseconds: hookConfirmedMicroseconds ?? null,
        success: success ?? true,
        error: error ?? null,
        plannedMicroseconds: plannedMicroseconds ?? null,
      });
    }

    this.eventId = receipt.eventId;
    this.scheduledMicroseconds = receipt.scheduledMicroseconds;
    this.dispatchStartedMicroseconds = receipt.dispatchStartedMicroseconds;
    this.dispatchCompletedMicroseconds = receipt.dispatchCompletedMicroseconds;
    this.hookConfirmedMicroseconds = receipt.hookConfirmedMicroseconds;
    this.success = receipt.success;
    this.error = receipt.error;
    this.plannedMicroseconds = receipt.plannedMicroseconds;
    this.dispatchJitterMilliseconds = receipt.dispatchJitterMilliseconds;
    this.confirmationMilliseconds = receipt.confirmationMilliseconds;
  }

  public get scheduledMilliseconds(): Milliseconds {
    return getReceiptScheduledMilliseconds(this);
  }
  public get ScheduledMilliseconds(): Milliseconds {
    return this.scheduledMilliseconds;
  }

  public get dispatchStartedMilliseconds(): Milliseconds {
    return getReceiptStartedMilliseconds(this);
  }
  public get DispatchStartedMilliseconds(): Milliseconds {
    return this.dispatchStartedMilliseconds;
  }

  public get dispatchCompletedMilliseconds(): Milliseconds {
    return getReceiptCompletedMilliseconds(this);
  }
  public get DispatchCompletedMilliseconds(): Milliseconds {
    return this.dispatchCompletedMilliseconds;
  }

  public get hookConfirmedMilliseconds(): Milliseconds | null {
    return getReceiptHookConfirmedMilliseconds(this);
  }
  public get HookConfirmedMilliseconds(): Milliseconds | null {
    return this.hookConfirmedMilliseconds;
  }

  public get plannedMilliseconds(): Milliseconds | null {
    return getReceiptPlannedMilliseconds(this);
  }
  public get PlannedMilliseconds(): Milliseconds | null {
    return this.plannedMilliseconds;
  }

  public get scheduledDisplayMilliseconds(): string {
    return getReceiptScheduledDisplayMilliseconds(this);
  }
  public get ScheduledDisplayMilliseconds(): string {
    return this.scheduledDisplayMilliseconds;
  }

  public toReceipt(): DispatchReceipt {
    return cloneDispatchReceipt(this);
  }
}
