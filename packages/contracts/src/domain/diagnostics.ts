/**
 * Diagnostic receipts, timing summaries, and run history contracts.
 */

import {
  type Guid,
  type ISODateTimeString,
  type Microseconds,
  type Milliseconds,
} from '../common/types.js';
import {
  boolean,
  integer,
  nullable,
  number,
  object,
  optional,
  string,
  type Schema,
} from '../common/validation.js';

export interface DispatchReceipt {
  readonly eventId: Guid;
  readonly scheduledMicroseconds: Microseconds;
  readonly dispatchStartedMicroseconds: Microseconds;
  readonly dispatchCompletedMicroseconds: Microseconds;
  readonly hookConfirmedMicroseconds?: Microseconds | null | undefined;
  readonly success: boolean;
  readonly error?: string | null | undefined;
  readonly plannedMicroseconds?: Microseconds | null | undefined;
  readonly dispatchJitterMilliseconds: Milliseconds;
  readonly confirmationMilliseconds?: Milliseconds | null | undefined;
}

export interface DispatchReceiptWire {
  readonly EventId?: string | undefined;
  readonly eventId?: string | undefined;
  readonly ScheduledMicroseconds?: number | undefined;
  readonly scheduledMicroseconds?: number | undefined;
  readonly DispatchStartedMicroseconds?: number | undefined;
  readonly dispatchStartedMicroseconds?: number | undefined;
  readonly DispatchCompletedMicroseconds?: number | undefined;
  readonly dispatchCompletedMicroseconds?: number | undefined;
  readonly HookConfirmedMicroseconds?: number | null | undefined;
  readonly hookConfirmedMicroseconds?: number | null | undefined;
  readonly Success?: boolean | undefined;
  readonly success?: boolean | undefined;
  readonly Error?: string | null | undefined;
  readonly error?: string | null | undefined;
  readonly PlannedMicroseconds?: number | null | undefined;
  readonly plannedMicroseconds?: number | null | undefined;
  readonly DispatchJitterMilliseconds?: number | undefined;
  readonly dispatchJitterMilliseconds?: number | undefined;
  readonly ConfirmationMilliseconds?: number | null | undefined;
  readonly confirmationMilliseconds?: number | null | undefined;
}

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
  const planned = params.plannedMicroseconds ?? params.scheduledMicroseconds;
  const dispatchJitterMilliseconds = (params.dispatchStartedMicroseconds - planned) / 1000.0;
  const confirmationMilliseconds =
    params.hookConfirmedMicroseconds != null
      ? (params.hookConfirmedMicroseconds - params.dispatchStartedMicroseconds) / 1000.0
      : null;

  return {
    eventId: params.eventId,
    scheduledMicroseconds: params.scheduledMicroseconds,
    dispatchStartedMicroseconds: params.dispatchStartedMicroseconds,
    dispatchCompletedMicroseconds: params.dispatchCompletedMicroseconds,
    hookConfirmedMicroseconds: params.hookConfirmedMicroseconds ?? null,
    success: params.success,
    error: params.error ?? null,
    plannedMicroseconds: params.plannedMicroseconds ?? null,
    dispatchJitterMilliseconds,
    confirmationMilliseconds,
  };
}

export const dispatchReceiptSchema: Schema<DispatchReceipt> = object({
  eventId: string({ min: 1 }),
  scheduledMicroseconds: integer({ min: 0 }),
  dispatchStartedMicroseconds: integer({ min: 0 }),
  dispatchCompletedMicroseconds: integer({ min: 0 }),
  hookConfirmedMicroseconds: optional(nullable(integer({ min: 0 }))),
  success: boolean(),
  error: optional(nullable(string())),
  plannedMicroseconds: optional(nullable(integer({ min: 0 }))),
  dispatchJitterMilliseconds: number(),
  confirmationMilliseconds: optional(nullable(number())),
});

export interface TimingSummary {
  readonly count: number;
  readonly failed: number;
  readonly unconfirmed: number;
  readonly meanMs: Milliseconds;
  readonly medianMs: Milliseconds;
  readonly p95Ms: Milliseconds;
  readonly p99Ms: Milliseconds;
  readonly maxMs: Milliseconds;
}

export const timingSummarySchema: Schema<TimingSummary> = object({
  count: integer({ min: 0 }),
  failed: integer({ min: 0 }),
  unconfirmed: integer({ min: 0 }),
  meanMs: number(),
  medianMs: number(),
  p95Ms: number(),
  p99Ms: number(),
  maxMs: number(),
});

export interface RunHistoryEntry {
  readonly macroId: Guid;
  readonly macroName: string;
  readonly runCount: number;
  readonly lastRunAt: ISODateTimeString;
  readonly lastActivation: string;
  readonly totalDurationMs: Milliseconds;
  readonly averageJitterMs: Milliseconds;
  readonly maxJitterMs: Milliseconds;
  readonly totalDispatched: number;
  readonly totalFailed: number;
  readonly totalUnconfirmed: number;
}

export interface RunHistoryEntryWire {
  readonly MacroId?: string | undefined;
  readonly macroId?: string | undefined;
  readonly MacroName?: string | undefined;
  readonly macroName?: string | undefined;
  readonly RunCount?: number | undefined;
  readonly runCount?: number | undefined;
  readonly LastRunAt?: string | undefined;
  readonly lastRunAt?: string | undefined;
  readonly LastActivation?: string | undefined;
  readonly lastActivation?: string | undefined;
  readonly TotalDurationMs?: number | undefined;
  readonly totalDurationMs?: number | undefined;
  readonly AverageJitterMs?: number | undefined;
  readonly averageJitterMs?: number | undefined;
  readonly MaxJitterMs?: number | undefined;
  readonly maxJitterMs?: number | undefined;
  readonly TotalDispatched?: number | undefined;
  readonly totalDispatched?: number | undefined;
  readonly TotalFailed?: number | undefined;
  readonly totalFailed?: number | undefined;
  readonly TotalUnconfirmed?: number | undefined;
  readonly totalUnconfirmed?: number | undefined;
}

export const runHistoryEntrySchema: Schema<RunHistoryEntry> = object({
  macroId: string({ min: 1 }),
  macroName: string(),
  runCount: integer({ min: 0 }),
  lastRunAt: string({ min: 1 }),
  lastActivation: string(),
  totalDurationMs: number({ min: 0 }),
  averageJitterMs: number(),
  maxJitterMs: number(),
  totalDispatched: integer({ min: 0 }),
  totalFailed: integer({ min: 0 }),
  totalUnconfirmed: integer({ min: 0 }),
});
