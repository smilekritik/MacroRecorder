/**
 * Timing statistics calculations for dispatch receipts.
 */

import { type DispatchReceipt, type TimingSummary } from '../../../contracts/src/index.js';

export const EMPTY_TIMING_SUMMARY: TimingSummary = {
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
 * Calculates linear percentile matching TimingStatistics.Percentile.
 */
export function calculatePercentile(sorted: readonly number[], p: number): number {
  if (sorted.length === 0) return 0;
  if (sorted.length === 1) return sorted[0]!;
  const position = (sorted.length - 1) * p;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  const lowerVal = sorted[lower] ?? 0;
  const upperVal = sorted[upper] ?? 0;
  return lowerVal + (upperVal - lowerVal) * (position - lower);
}

/**
 * Calculates TimingSummary from a collection of DispatchReceipts.
 */
export function calculateTimingSummary(receipts: Iterable<DispatchReceipt>): TimingSummary {
  const all = Array.isArray(receipts) ? receipts : Array.from(receipts);
  if (all.length === 0) {
    return EMPTY_TIMING_SUMMARY;
  }

  const failed = all.filter((r) => !r.success).length;
  const unconfirmed = all.filter(
    (r) => r.hookConfirmedMicroseconds === null || r.hookConfirmedMicroseconds === undefined,
  ).length;

  const values = all.map((r) => r.dispatchJitterMilliseconds).sort((a, b) => a - b);

  const sum = values.reduce((acc, v) => acc + v, 0);
  const meanMs = sum / values.length;
  const maxMs = values[values.length - 1] ?? 0;
  const medianMs = calculatePercentile(values, 0.5);
  const p95Ms = calculatePercentile(values, 0.95);
  const p99Ms = calculatePercentile(values, 0.99);

  return {
    count: all.length,
    failed,
    unconfirmed,
    meanMs,
    medianMs,
    p95Ms,
    p99Ms,
    maxMs,
  };
}
