/**
 * Timing statistics, percentiles, jitter aggregation, and failure counts.
 */

import {
  type DispatchReceipt,
  type ExtendedTimingStatistics,
  type TimingSummary,
} from './types.js';

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
 * Counts actions that failed execution (!success).
 */
export function countFailedActions(receipts: readonly DispatchReceipt[]): number {
  return receipts.filter((r) => !r.success).length;
}

/**
 * Counts actions where low-level hook confirmation was missing (null).
 */
export function countUnconfirmedActions(receipts: readonly DispatchReceipt[]): number {
  return receipts.filter((r) => r.hookConfirmedMicroseconds == null).length;
}

/**
 * Calculates linear percentile across sorted values.
 */
export function calculatePercentile(sorted: readonly number[], p: number): number {
  if (sorted.length === 0) return 0;
  if (sorted.length === 1) return sorted[0] ?? 0;
  const clampedP = Math.max(0, Math.min(1, p));
  const position = (sorted.length - 1) * clampedP;
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
  const failed = countFailedActions(receipts);
  const unconfirmed = countUnconfirmedActions(receipts);
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
 * Calculates extended timing statistics including intermediate percentiles and standard deviation.
 */
export function calculateExtendedTimingStatistics(
  receipts: readonly DispatchReceipt[],
): ExtendedTimingStatistics {
  if (receipts.length === 0) {
    return {
      ...emptyTimingSummary,
      minMs: 0,
      p50Ms: 0,
      p75Ms: 0,
      p90Ms: 0,
      varianceMs: 0,
      standardDeviationMs: 0,
    };
  }

  const baseSummary = calculateTimingStatistics(receipts);
  const values = receipts.map((r) => r.dispatchJitterMilliseconds).sort((a, b) => a - b);
  const minMs = values[0] ?? 0;
  const p50Ms = baseSummary.medianMs;
  const p75Ms = calculatePercentile(values, 0.75);
  const p90Ms = calculatePercentile(values, 0.9);

  const sumSquaredDiff = values.reduce((acc, v) => acc + Math.pow(v - baseSummary.meanMs, 2), 0);
  const varianceMs = sumSquaredDiff / values.length;
  const standardDeviationMs = Math.sqrt(varianceMs);

  return {
    ...baseSummary,
    minMs,
    p50Ms,
    p75Ms,
    p90Ms,
    varianceMs,
    standardDeviationMs,
  };
}

/**
 * TimingStatistics class
 * MacroRecorder.Core.TimingStatistics.
 */
export class TimingStatistics {
  public static get Empty(): TimingSummary {
    return emptyTimingSummary;
  }

  public static Calculate(receipts: readonly DispatchReceipt[]): TimingSummary {
    return calculateTimingStatistics(receipts);
  }

  public static Percentile(sorted: readonly number[], p: number): number {
    return calculatePercentile(sorted, p);
  }
}
