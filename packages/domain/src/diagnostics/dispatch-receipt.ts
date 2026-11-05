/**
 * DispatchReceipt factory, model, validation, and serialization.
 */

import {
  createDispatchReceipt as contractCreateReceipt,
  dispatchReceiptSchema,
  type DispatchReceipt,
  type DispatchReceiptWire,
  type Guid,
  type Microseconds,
  type Milliseconds,
  type ValidationResult,
} from '../../../contracts/src/index.js';
import {
  createTimeProjection,
  getReceiptCompletedMilliseconds,
  getReceiptDurationMilliseconds,
  getReceiptDurationMicroseconds,
  getReceiptHookConfirmedMilliseconds,
  getReceiptPlannedMilliseconds,
  getReceiptScheduledDisplayMilliseconds,
  getReceiptScheduledMilliseconds,
  getReceiptStartedMilliseconds,
  isHookConfirmed,
} from './projections.js';
import { type TimeProjection } from './types.js';

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
 * Serializes a DispatchReceipt to its wire-compatible representation.
 */
export function dispatchReceiptToWire(receipt: DispatchReceipt): DispatchReceiptWire {
  return {
    EventId: receipt.eventId,
    ScheduledMicroseconds: receipt.scheduledMicroseconds,
    PlannedMicroseconds: receipt.plannedMicroseconds,
    DispatchStartedMicroseconds: receipt.dispatchStartedMicroseconds,
    DispatchCompletedMicroseconds: receipt.dispatchCompletedMicroseconds,
    HookConfirmedMicroseconds: receipt.hookConfirmedMicroseconds,
    DispatchJitterMilliseconds: receipt.dispatchJitterMilliseconds,
    ConfirmationMilliseconds: receipt.confirmationMilliseconds,
    Success: receipt.success,
    Error: receipt.error,
  };
}

/**
 * Deserializes a DispatchReceipt from wire representation.
 */
export function dispatchReceiptFromWire(wire: DispatchReceiptWire): DispatchReceipt {
  const eventId = (wire.eventId ?? wire.EventId ?? '') as Guid;
  const scheduledUs = (wire.scheduledMicroseconds ??
    wire.ScheduledMicroseconds ??
    0) as Microseconds;
  const startedUs = (wire.dispatchStartedMicroseconds ??
    wire.DispatchStartedMicroseconds ??
    0) as Microseconds;
  const completedUs = (wire.dispatchCompletedMicroseconds ??
    wire.DispatchCompletedMicroseconds ??
    0) as Microseconds;
  const hookUs = (wire.hookConfirmedMicroseconds ??
    wire.HookConfirmedMicroseconds ??
    null) as Microseconds | null;
  const success = (wire.success ?? wire.Success ?? true) as boolean;
  const error = (wire.error ?? wire.Error ?? null) as string | null;
  const plannedUs = (wire.plannedMicroseconds ??
    wire.PlannedMicroseconds ??
    null) as Microseconds | null;

  return createDispatchReceipt({
    eventId,
    scheduledMicroseconds: scheduledUs,
    dispatchStartedMicroseconds: startedUs,
    dispatchCompletedMicroseconds: completedUs,
    hookConfirmedMicroseconds: hookUs,
    success,
    error,
    plannedMicroseconds: plannedUs,
  });
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
        eventId: (obj['eventId'] ?? obj['EventId'] ?? '') as Guid,
        scheduledMicroseconds: (obj['scheduledMicroseconds'] ??
          obj['ScheduledMicroseconds'] ??
          0) as Microseconds,
        dispatchStartedMicroseconds: (obj['dispatchStartedMicroseconds'] ??
          obj['DispatchStartedMicroseconds'] ??
          0) as Microseconds,
        dispatchCompletedMicroseconds: (obj['dispatchCompletedMicroseconds'] ??
          obj['DispatchCompletedMicroseconds'] ??
          0) as Microseconds,
        hookConfirmedMicroseconds: (obj['hookConfirmedMicroseconds'] ??
          obj['HookConfirmedMicroseconds'] ??
          null) as Microseconds | null,
        success: (obj['success'] ?? obj['Success'] ?? true) as boolean,
        error: (obj['error'] ?? obj['Error'] ?? null) as string | null,
        plannedMicroseconds: (obj['plannedMicroseconds'] ??
          obj['PlannedMicroseconds'] ??
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

  public get durationMicroseconds(): Microseconds {
    return getReceiptDurationMicroseconds(this);
  }

  public get durationMilliseconds(): Milliseconds {
    return getReceiptDurationMilliseconds(this);
  }

  public get isConfirmed(): boolean {
    return isHookConfirmed(this);
  }

  public get isFailed(): boolean {
    return !this.success;
  }

  public toProjection(authoredMicroseconds?: Microseconds): TimeProjection {
    return createTimeProjection(this, authoredMicroseconds);
  }

  public toReceipt(): DispatchReceipt {
    return cloneDispatchReceipt(this);
  }

  public toWire(): DispatchReceiptWire {
    return dispatchReceiptToWire(this);
  }

  public static fromWire(wire: DispatchReceiptWire): DispatchReceiptModel {
    return new DispatchReceiptModel(dispatchReceiptFromWire(wire));
  }
}
