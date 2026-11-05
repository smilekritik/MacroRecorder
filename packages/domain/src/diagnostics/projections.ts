/**
 * Time projections and millisecond conversions for action dispatches.
 */

import {
  type DispatchReceipt,
  type HookConfirmationState,
  type Microseconds,
  type Milliseconds,
  type TimeProjection,
} from './types.js';

/**
 * Formats a number with up to 3 decimal places without trailing zeroes, matching "0.###".
 */
export function formatMilliseconds(ms: number): string {
  const rounded = Math.round(ms * 1000) / 1000;
  return rounded.toString();
}

/**
 * User-facing millisecond projection for ScheduledMicroseconds.
 */
export function getReceiptScheduledMilliseconds(receipt: DispatchReceipt): Milliseconds {
  return receipt.scheduledMicroseconds / 1000.0;
}

/**
 * User-facing millisecond projection for PlannedMicroseconds (null if no randomization applied).
 */
export function getReceiptPlannedMilliseconds(receipt: DispatchReceipt): Milliseconds | null {
  return receipt.plannedMicroseconds != null ? receipt.plannedMicroseconds / 1000.0 : null;
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
 * User-facing millisecond projection for HookConfirmedMicroseconds (null if unconfirmed).
 */
export function getReceiptHookConfirmedMilliseconds(receipt: DispatchReceipt): Milliseconds | null {
  return receipt.hookConfirmedMicroseconds != null
    ? receipt.hookConfirmedMicroseconds / 1000.0
    : null;
}

/**
 * Duration in microseconds between dispatch start and completion.
 */
export function getReceiptDurationMicroseconds(receipt: DispatchReceipt): Microseconds {
  return Math.max(0, receipt.dispatchCompletedMicroseconds - receipt.dispatchStartedMicroseconds);
}

/**
 * Duration in milliseconds between dispatch start and completion.
 */
export function getReceiptDurationMilliseconds(receipt: DispatchReceipt): Milliseconds {
  return getReceiptDurationMicroseconds(receipt) / 1000.0;
}

/**
 * Hook confirmation latency in milliseconds (null if unconfirmed).
 */
export function getReceiptConfirmationMilliseconds(receipt: DispatchReceipt): Milliseconds | null {
  if (receipt.confirmationMilliseconds !== undefined) {
    return receipt.confirmationMilliseconds;
  }
  return receipt.hookConfirmedMicroseconds != null
    ? (receipt.hookConfirmedMicroseconds - receipt.dispatchStartedMicroseconds) / 1000.0
    : null;
}

/**
 * Dispatch jitter in milliseconds measured against planned (or scheduled) target.
 */
export function getReceiptJitterMilliseconds(receipt: DispatchReceipt): Milliseconds {
  return receipt.dispatchJitterMilliseconds;
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
 * Returns true if the receipt received low-level hook confirmation.
 */
export function isHookConfirmed(receipt: DispatchReceipt): boolean {
  return receipt.hookConfirmedMicroseconds != null;
}

/**
 * Returns hook confirmation latency in milliseconds, or null if unconfirmed.
 */
export function getHookConfirmationLatencyMs(receipt: DispatchReceipt): Milliseconds | null {
  return getReceiptConfirmationMilliseconds(receipt);
}

/**
 * Categorizes hook confirmation state as 'confirmed', 'unconfirmed', or 'failed'.
 */
export function getHookConfirmationState(receipt: DispatchReceipt): HookConfirmationState {
  if (!receipt.success) {
    return 'failed';
  }
  return isHookConfirmed(receipt) ? 'confirmed' : 'unconfirmed';
}

/**
 * Builds a complete TimeProjection object from a DispatchReceipt,
 * retaining microsecond stored precision while providing all millisecond projections.
 */
export function createTimeProjection(
  receipt: DispatchReceipt,
  authoredMicroseconds?: Microseconds,
): TimeProjection {
  const authoredUs = authoredMicroseconds ?? receipt.scheduledMicroseconds;
  const plannedUs = receipt.plannedMicroseconds ?? receipt.scheduledMicroseconds;
  const scheduledUs = receipt.scheduledMicroseconds;
  const startedUs = receipt.dispatchStartedMicroseconds;
  const completedUs = receipt.dispatchCompletedMicroseconds;
  const confirmedUs = receipt.hookConfirmedMicroseconds ?? null;

  const durationUs = Math.max(0, completedUs - startedUs);
  const jitterUs = startedUs - plannedUs;
  const latencyUs = confirmedUs !== null ? confirmedUs - startedUs : null;

  return {
    eventId: receipt.eventId,
    authoredMicroseconds: authoredUs,
    authoredMilliseconds: authoredUs / 1000.0,
    plannedMicroseconds: plannedUs,
    plannedMilliseconds: plannedUs / 1000.0,
    scheduledMicroseconds: scheduledUs,
    scheduledMilliseconds: scheduledUs / 1000.0,
    actualStartMicroseconds: startedUs,
    actualStartMilliseconds: startedUs / 1000.0,
    actualEndMicroseconds: completedUs,
    actualEndMilliseconds: completedUs / 1000.0,
    hookConfirmedMicroseconds: confirmedUs,
    hookConfirmedMilliseconds: confirmedUs !== null ? confirmedUs / 1000.0 : null,
    dispatchDurationMicroseconds: durationUs,
    dispatchDurationMilliseconds: durationUs / 1000.0,
    jitterMicroseconds: jitterUs,
    jitterMilliseconds: jitterUs / 1000.0,
    confirmationLatencyMicroseconds: latencyUs,
    confirmationLatencyMilliseconds: latencyUs !== null ? latencyUs / 1000.0 : null,
    scheduledDisplayMilliseconds: getReceiptScheduledDisplayMilliseconds(receipt),
    confirmationState: getHookConfirmationState(receipt),
    isConfirmed: confirmedUs !== null,
    isSuccess: receipt.success,
    error: receipt.error ?? null,
  };
}

/**
 * Formats jitter display with fixed decimal places or '-' if not applicable.
 */
export function formatJitterMilliseconds(jitterMs: Milliseconds, decimals = 3): string {
  return jitterMs.toFixed(decimals);
}

/**
 * Formats confirmation latency display with fixed decimal places or '—' if unconfirmed.
 */
export function formatConfirmationMilliseconds(
  confirmationMs: Milliseconds | null | undefined,
  decimals = 3,
): string {
  return confirmationMs != null ? confirmationMs.toFixed(decimals) : '—';
}
