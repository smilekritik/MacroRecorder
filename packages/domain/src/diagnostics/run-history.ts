/**
 * Run history aggregation and summary formatting.
 */

import {
  type Guid,
  type Milliseconds,
  type RunHistoryEntry,
  type RunHistoryEntryWire,
} from '../../../contracts/src/index.js';
import { format, t } from '../../../localization/src/index.js';
import { calculateTimingStatistics } from './timing-statistics.js';
import {
  type RunHistoryRecordParams,
  type RunHistorySummaryFormatOptions,
  type RunResult,
} from './types.js';

/**
 * Calculates average duration in milliseconds per run.
 */
export function getAverageDurationMs(entry: RunHistoryEntry): Milliseconds {
  return entry.runCount > 0 ? entry.totalDurationMs / entry.runCount : 0;
}

/**
 * Aggregates a new execution run into an existing RunHistoryEntry (or creates a new one).
 * Computes running mean of jitter, maximum jitter peak, accumulated durations, and failure counts.
 */
export function aggregateRunResult(
  existing: RunHistoryEntry | null | undefined,
  run: RunResult | RunHistoryRecordParams,
): RunHistoryEntry {
  const summary = calculateTimingStatistics(run.receipts);
  const prevCount = existing ? existing.runCount : 0;
  const n = prevCount + 1;

  const prevDuration = existing ? existing.totalDurationMs : 0;
  const prevAverageJitter = existing ? existing.averageJitterMs : 0;
  const prevMaxJitter = existing ? existing.maxJitterMs : 0;
  const prevDispatched = existing ? existing.totalDispatched : 0;
  const prevFailed = existing ? existing.totalFailed : 0;
  const prevUnconfirmed = existing ? existing.totalUnconfirmed : 0;

  const lastRunAt =
    'runAt' in run && run.runAt
      ? run.runAt
      : 'completedAt' in run && run.completedAt
        ? run.completedAt
        : new Date().toISOString();

  const macroName = run.macroName || (existing ? existing.macroName : '');

  return {
    macroId: run.macroId,
    macroName,
    runCount: n,
    lastRunAt,
    lastActivation: run.activation,
    totalDurationMs: prevDuration + run.durationMs,
    // Average jitter is a running mean over runs; empty runs (0 actions) do not skew it.
    averageJitterMs: (prevAverageJitter * (n - 1) + summary.meanMs) / n,
    maxJitterMs: Math.max(prevMaxJitter, summary.maxMs),
    totalDispatched: prevDispatched + summary.count,
    totalFailed: prevFailed + summary.failed,
    totalUnconfirmed: prevUnconfirmed + summary.unconfirmed,
  };
}

/**
 * Formats a date to short general date/time format matching ToString("g").
 */
export function formatRunDateShort(isoDate: string, locale?: string): string {
  try {
    const d = new Date(isoDate);
    if (isNaN(d.getTime())) {
      return isoDate;
    }
    return d.toLocaleString(locale, {
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
    });
  } catch {
    return isoDate;
  }
}

/**
 * Formats a one-line run-history summary for the diagnostics tab.
 * Covers:
 * "Runs: {0} · last: {1} · avg duration: {2} ms · avg jitter: {3} ms · max jitter: {4} ms"
 * or "No runs yet."
 */
export function formatRunHistorySummary(
  entry: RunHistoryEntry | null | undefined,
  options?: RunHistorySummaryFormatOptions,
): string {
  if (!entry || entry.runCount === 0) {
    return t('No runs yet.');
  }

  const formattedDate = formatRunDateShort(entry.lastRunAt, options?.locale);
  const avgDurationStr = Math.round(getAverageDurationMs(entry)).toString();
  const avgJitterStr = entry.averageJitterMs.toFixed(3);
  const maxJitterStr = entry.maxJitterMs.toFixed(3);

  const template = t(
    'Runs: {0} · last: {1} · avg duration: {2} ms · avg jitter: {3} ms · max jitter: {4} ms',
  );
  return format(
    template,
    entry.runCount,
    formattedDate,
    avgDurationStr,
    avgJitterStr,
    maxJitterStr,
  );
}

/**
 * Serializes a RunHistoryEntry to wire-compatible shape.
 */
export function runHistoryEntryToWire(entry: RunHistoryEntry): RunHistoryEntryWire {
  return {
    MacroId: entry.macroId,
    MacroName: entry.macroName,
    RunCount: entry.runCount,
    LastRunAt: entry.lastRunAt,
    LastActivation: entry.lastActivation,
    TotalDurationMs: entry.totalDurationMs,
    AverageJitterMs: entry.averageJitterMs,
    MaxJitterMs: entry.maxJitterMs,
    TotalDispatched: entry.totalDispatched,
    TotalFailed: entry.totalFailed,
    TotalUnconfirmed: entry.totalUnconfirmed,
  };
}

/**
 * Deserializes a RunHistoryEntry from wire-compatible shape.
 */
export function runHistoryEntryFromWire(wire: RunHistoryEntryWire): RunHistoryEntry {
  return {
    macroId: (wire.macroId ?? wire.MacroId ?? '') as Guid,
    macroName: wire.macroName ?? wire.MacroName ?? '',
    runCount: wire.runCount ?? wire.RunCount ?? 0,
    lastRunAt: wire.lastRunAt ?? wire.LastRunAt ?? new Date().toISOString(),
    lastActivation: wire.lastActivation ?? wire.LastActivation ?? '',
    totalDurationMs: wire.totalDurationMs ?? wire.TotalDurationMs ?? 0,
    averageJitterMs: wire.averageJitterMs ?? wire.AverageJitterMs ?? 0,
    maxJitterMs: wire.maxJitterMs ?? wire.MaxJitterMs ?? 0,
    totalDispatched: wire.totalDispatched ?? wire.TotalDispatched ?? 0,
    totalFailed: wire.totalFailed ?? wire.TotalFailed ?? 0,
    totalUnconfirmed: wire.totalUnconfirmed ?? wire.TotalUnconfirmed ?? 0,
  };
}

/**
 * Object-oriented model wrapper for RunHistoryEntry.
 */
export class RunHistoryEntryModel implements RunHistoryEntry {
  public readonly macroId: Guid;
  public readonly macroName: string;
  public readonly runCount: number;
  public readonly lastRunAt: string;
  public readonly lastActivation: string;
  public readonly totalDurationMs: Milliseconds;
  public readonly averageJitterMs: Milliseconds;
  public readonly maxJitterMs: Milliseconds;
  public readonly totalDispatched: number;
  public readonly totalFailed: number;
  public readonly totalUnconfirmed: number;

  public constructor(entry: RunHistoryEntry | RunHistoryEntryWire) {
    const isWire = 'MacroId' in entry || 'TotalDurationMs' in entry;
    const resolved = isWire
      ? runHistoryEntryFromWire(entry as RunHistoryEntryWire)
      : (entry as RunHistoryEntry);

    this.macroId = resolved.macroId;
    this.macroName = resolved.macroName;
    this.runCount = resolved.runCount;
    this.lastRunAt = resolved.lastRunAt;
    this.lastActivation = resolved.lastActivation;
    this.totalDurationMs = resolved.totalDurationMs;
    this.averageJitterMs = resolved.averageJitterMs;
    this.maxJitterMs = resolved.maxJitterMs;
    this.totalDispatched = resolved.totalDispatched;
    this.totalFailed = resolved.totalFailed;
    this.totalUnconfirmed = resolved.totalUnconfirmed;
  }

  public get averageDurationMs(): Milliseconds {
    return getAverageDurationMs(this);
  }
  public get AverageDurationMs(): Milliseconds {
    return this.averageDurationMs;
  }

  public get summaryText(): string {
    return formatRunHistorySummary(this);
  }

  public toWire(): RunHistoryEntryWire {
    return runHistoryEntryToWire(this);
  }

  public clone(): RunHistoryEntryModel {
    return new RunHistoryEntryModel(this);
  }
}

/**
 * In-memory accumulator that maintains cumulative run history aggregates across runs.
 */
export class RunHistoryAggregator {
  private readonly _entries = new Map<Guid, RunHistoryEntry>();

  public record(run: RunResult | RunHistoryRecordParams): RunHistoryEntry {
    const existing = this._entries.get(run.macroId);
    const updated = aggregateRunResult(existing, run);
    this._entries.set(run.macroId, updated);
    return updated;
  }

  public get(macroId: Guid): RunHistoryEntry | null {
    return this._entries.get(macroId) ?? null;
  }

  public getAll(): readonly RunHistoryEntry[] {
    const array = Array.from(this._entries.values());
    return array.sort((a, b) => {
      const timeA = new Date(a.lastRunAt).getTime();
      const timeB = new Date(b.lastRunAt).getTime();
      return timeB - timeA;
    });
  }

  public getSummary(macroId: Guid, options?: RunHistorySummaryFormatOptions): string {
    const entry = this.get(macroId);
    return formatRunHistorySummary(entry, options);
  }

  public clear(): void {
    this._entries.clear();
  }
}
