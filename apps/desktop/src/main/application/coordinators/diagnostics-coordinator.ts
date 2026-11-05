/**
 * Diagnostics Coordinator.
 * Gathers timing statistics, dispatch jitter metrics, peak resources,
 * quiet run history aggregation, and privacy-safe diagnostic bundles.
 */

import { exportDiagnosticsCsvToFile } from '../../../../../../packages/import-export/src/export/diagnostics-csv.js';
import { exportDiagnosticsJsonToFile } from '../../../../../../packages/import-export/src/export/diagnostics-json.js';
import type { DispatchReceipt, IRunHistoryStore, ProgressCallback } from '../types.js';
import type { MacroExportFormat, RunHistoryEntry } from '../../ipc/types.js';
import * as fs from 'node:fs';

export interface DiagnosticsSummary {
  readonly totalRuns: number;
  readonly meanDurationMs: number;
  readonly averageJitterMs: number;
  readonly maxJitterMs: number;
  readonly totalDispatched: number;
  readonly totalFailed: number;
}

const MAX_REMEMBERED_RUNS = 32;

export interface RunLoadPeaks {
  readonly peakCpuPercent?: number | null | undefined;
  readonly peakGpuPercent?: number | null | undefined;
  readonly peakMemoryPercent?: number | null | undefined;
}

export class DiagnosticsCoordinator {
  private readonly peaks = new Map<string, RunLoadPeaks>();

  public rememberLoadPeaks(macroId: string, peaks: RunLoadPeaks): void {
    this.peaks.set(macroId, peaks);
  }

  public getLastRun(macroId: string): ({ receipts: readonly DispatchReceipt[] } & RunLoadPeaks) | null {
    const run = this.recordedRuns.find((item) => item.macroId === macroId);
    return run ? { receipts: run.receipts, ...this.peaks.get(macroId) } : null;
  }

  private readonly historyStore: IRunHistoryStore;
  private recordedRuns: Array<{
    macroId: string;
    receipts: readonly DispatchReceipt[];
    durationMs: number;
  }> = [];

  constructor(historyStore: IRunHistoryStore) {
    this.historyStore = historyStore;
  }

  public get store(): IRunHistoryStore {
    return this.historyStore;
  }

  public recordRun(
    macro: { id: string; name?: string } | string,
    receipts: readonly DispatchReceipt[],
    activation: string,
    durationMs: number,
  ): RunHistoryEntry {
    const macroId = typeof macro === 'string' ? macro : macro.id;
    // One run per macro is enough for the diagnostics tab, and keeps memory bounded.
    this.recordedRuns = this.recordedRuns.filter((run) => run.macroId !== macroId);
    this.recordedRuns.push({ macroId, receipts, durationMs });
    if (this.recordedRuns.length > MAX_REMEMBERED_RUNS) this.recordedRuns.shift();
    return this.historyStore.record(macro, receipts, activation, durationMs);
  }

  public getRunHistory(): RunHistoryEntry[] {
    return this.historyStore.loadAll();
  }

  public getMacroHistory(macroId: string): RunHistoryEntry | null {
    return this.historyStore.get(macroId);
  }

  public clearRunHistory(): { cleared: boolean } {
    this.recordedRuns = [];
    this.historyStore.clear();
    return { cleared: true };
  }

  public loadRunHistory(): RunHistoryEntry[] {
    return this.getRunHistory();
  }

  public getSummaryStatistics(): DiagnosticsSummary {
    const entries = this.historyStore.loadAll();
    const totalRuns = entries.length;
    let totalDispatched = 0;
    let totalFailed = 0;
    let totalDurationMs = 0;
    let totalJitterUs = 0;
    let maxJitterUs = 0;
    let receiptCount = 0;

    for (const run of this.recordedRuns) {
      totalDurationMs += run.durationMs;
      for (const r of run.receipts) {
        receiptCount++;
        totalDispatched++;
        if (!r.success) {
          totalFailed++;
        }
        const scheduled = r.plannedMicroseconds ?? r.scheduledMicroseconds ?? 0;
        const actual = r.startedMicroseconds ?? 0;
        const jitterUs = Math.abs(actual - scheduled);
        totalJitterUs += jitterUs;
        if (jitterUs > maxJitterUs) {
          maxJitterUs = jitterUs;
        }
      }
    }

    const meanDurationMs = totalRuns > 0 ? totalDurationMs / totalRuns : 0;
    const averageJitterMs =
      receiptCount > 0 ? Number((totalJitterUs / receiptCount / 1000).toFixed(2)) : 0;
    const maxJitterMs = Number((maxJitterUs / 1000).toFixed(2));

    return {
      totalRuns,
      meanDurationMs,
      averageJitterMs,
      maxJitterMs,
      totalDispatched,
      totalFailed,
    };
  }

  public async exportDiagnostics(
    _format: MacroExportFormat,
    destinationPath: string,
    signal?: AbortSignal,
    progress?: ProgressCallback,
    macroId?: string,
  ): Promise<{ exportedPath: string }> {
    if (signal?.aborted) throw new Error('Export diagnostics was cancelled');
    const run = macroId ? this.recordedRuns.find((item) => item.macroId === macroId) : undefined;
    if (run && String(_format) === 'csv') {
      await exportDiagnosticsCsvToFile(run.receipts as never, destinationPath);
      return { exportedPath: destinationPath };
    }
    if (run && String(_format) === 'json') {
      await exportDiagnosticsJsonToFile(run.receipts as never, destinationPath);
      return { exportedPath: destinationPath };
    }
    progress?.({ current: 1, total: 2, percentage: 50, message: 'Creating privacy-safe bundle...' });
    const payload = this.createPrivacySafeBundlePayload();
    await fs.promises.writeFile(destinationPath, JSON.stringify(payload, null, 2), 'utf8');
    progress?.({ current: 2, total: 2, percentage: 100, message: 'Export complete.' });
    return { exportedPath: destinationPath };
  }

  /**
   * Computes jitter percentiles, failures, and latency statistics from receipts.
   */
  public calculateTimingStatistics(receipts: readonly DispatchReceipt[]): {
    count: number;
    meanJitterMs: number;
    maxJitterMs: number;
    failedCount: number;
    unconfirmedCount: number;
  } {
    if (receipts.length === 0) {
      return {
        count: 0,
        meanJitterMs: 0,
        maxJitterMs: 0,
        failedCount: 0,
        unconfirmedCount: 0,
      };
    }

    let totalJitterUs = 0;
    let maxJitterUs = 0;
    let failedCount = 0;
    let unconfirmedCount = 0;

    for (const r of receipts) {
      if (!r.success) {
        failedCount++;
      }
      if (r.confirmedMicroseconds === null || r.confirmedMicroseconds === undefined) {
        unconfirmedCount++;
      }

      const scheduled = r.plannedMicroseconds ?? r.scheduledMicroseconds;
      const actual = r.startedMicroseconds;
      const jitterUs = Math.abs(actual - scheduled);
      totalJitterUs += jitterUs;
      if (jitterUs > maxJitterUs) {
        maxJitterUs = jitterUs;
      }
    }

    return {
      count: receipts.length,
      meanJitterMs: Number((totalJitterUs / receipts.length / 1000).toFixed(2)),
      maxJitterMs: Number((maxJitterUs / 1000).toFixed(2)),
      failedCount,
      unconfirmedCount,
    };
  }

  /**
   * Generates privacy-safe diagnostic bundle metadata that omits all user keystrokes,
   * VirtualKey tokens, and raw macro event data.
   */
  public createPrivacySafeBundlePayload(): {
    timestamp: string;
    osVersion: string;
    architecture: string;
    totalRunsRecorded: number;
    privacyNotice: string;
  } {
    const entries = this.historyStore.loadAll();
    return {
      timestamp: new Date().toISOString(),
      osVersion: process.platform,
      architecture: process.arch,
      totalRunsRecorded: entries.length,
      privacyNotice: 'Zero macro keystrokes, event values, or sensitive input data included.',
    };
  }
}

/**
 * In-Memory Deterministic Fake Run History Store.
 */
export class FakeRunHistoryStore implements IRunHistoryStore {
  private readonly entries = new Map<string, RunHistoryEntry>();

  public record(
    macro: { id: string; name?: string } | string,
    receipts: readonly DispatchReceipt[],
    activation: string,
    durationMs: number,
    runAt = new Date().toISOString(),
  ): RunHistoryEntry {
    const macroId = typeof macro === 'string' ? macro : macro.id;
    const macroName = typeof macro === 'string' ? '' : (macro.name ?? '');
    const existing = this.entries.get(macroId);
    const runCount = (existing?.runCount ?? 0) + 1;
    const jittersMs = receipts.map((receipt) => {
      const planned = receipt.plannedMicroseconds ?? receipt.scheduledMicroseconds;
      return Math.abs(receipt.startedMicroseconds - planned) / 1000;
    });
    const runAverageJitter = jittersMs.length > 0
      ? jittersMs.reduce((sum, value) => sum + value, 0) / jittersMs.length
      : 0;
    const runMaxJitter = jittersMs.length > 0 ? Math.max(...jittersMs) : 0;

    const entry: RunHistoryEntry = {
      macroId,
      macroName: macroName || existing?.macroName || '',
      runCount,
      lastRunAt: runAt,
      lastActivation: activation,
      totalDurationMs: (existing?.totalDurationMs ?? 0) + durationMs,
      averageJitterMs:
        ((existing?.averageJitterMs ?? 0) * (runCount - 1) + runAverageJitter) / runCount,
      maxJitterMs: Math.max(existing?.maxJitterMs ?? 0, runMaxJitter),
      totalDispatched: (existing?.totalDispatched ?? 0) + receipts.length,
      totalFailed: (existing?.totalFailed ?? 0) + receipts.filter((receipt) => !receipt.success).length,
      totalUnconfirmed:
        (existing?.totalUnconfirmed ?? 0) +
        receipts.filter((receipt) => receipt.confirmedMicroseconds == null).length,
    };

    this.entries.set(macroId, entry);
    return entry;
  }

  public loadAll(): RunHistoryEntry[] {
    return Array.from(this.entries.values()).sort((a, b) => {
      const timeA = new Date(a.lastRunAt).getTime();
      const timeB = new Date(b.lastRunAt).getTime();
      return timeB - timeA;
    });
  }

  public clear(): void {
    this.entries.clear();
  }

  public get(macroId: string): RunHistoryEntry | null {
    return this.entries.get(macroId) ?? null;
  }
}
