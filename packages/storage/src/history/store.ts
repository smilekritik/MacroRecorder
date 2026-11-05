/**
 * RunHistoryStore for persisting and aggregating macro execution statistics.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  type DispatchReceipt,
  type Guid,
  type RunHistoryEntry,
} from '../../../contracts/src/index.js';
import { atomicWriteFileSync } from '../preferences/atomic.js';
import { calculateTimingSummary } from './timing.js';
import { parseRunHistoryJson, serializeRunHistoryJson } from './serializer.js';
import type { RunHistoryRecordParams, RunHistoryStoreOptions } from './types.js';

export class RunHistoryStore {
  private readonly _filePath: string;

  constructor(rootPathOrOptions: string | RunHistoryStoreOptions) {
    if (typeof rootPathOrOptions === 'string') {
      if (rootPathOrOptions.toLowerCase().endsWith('.json')) {
        this._filePath = path.resolve(rootPathOrOptions);
      } else {
        this._filePath = path.resolve(rootPathOrOptions, 'Stats', 'run-history.json');
      }
    } else {
      if (rootPathOrOptions.filePath) {
        this._filePath = path.resolve(rootPathOrOptions.filePath);
      } else if (rootPathOrOptions.rootPath) {
        this._filePath = path.resolve(rootPathOrOptions.rootPath, 'Stats', 'run-history.json');
      } else {
        this._filePath = path.resolve('.', 'Stats', 'run-history.json');
      }
    }
  }

  /**
   * Absolute file path to Stats/run-history.json.
   */
  public get filePath(): string {
    return this._filePath;
  }

  /**
   * Records a macro execution run, computes running statistics, and persists atomically.
   */
  public record(
    macro: { id: Guid; name?: string } | Guid,
    receipts: readonly DispatchReceipt[],
    activation: string,
    durationMs: number,
    runAt?: string,
  ): RunHistoryEntry {
    const macroId = typeof macro === 'string' ? macro : macro.id;
    const macroName = typeof macro === 'string' ? '' : (macro.name ?? '');

    return this.recordParams({
      macroId,
      macroName,
      receipts,
      activation,
      durationMs,
      runAt,
    });
  }

  /**
   * Records a macro execution run using structured parameters.
   */
  public recordParams(params: RunHistoryRecordParams): RunHistoryEntry {
    const summary = calculateTimingSummary(params.receipts);
    const map = this._loadMap();

    const existing = map.get(params.macroId);
    const prevCount = existing ? existing.runCount : 0;
    const n = prevCount + 1;

    const prevDuration = existing ? existing.totalDurationMs : 0;
    const prevAverageJitter = existing ? existing.averageJitterMs : 0;
    const prevMaxJitter = existing ? existing.maxJitterMs : 0;
    const prevDispatched = existing ? existing.totalDispatched : 0;
    const prevFailed = existing ? existing.totalFailed : 0;
    const prevUnconfirmed = existing ? existing.totalUnconfirmed : 0;

    const lastRunAt = params.runAt ?? new Date().toISOString();

    const updated: RunHistoryEntry = {
      macroId: params.macroId,
      macroName: params.macroName || (existing ? existing.macroName : ''),
      runCount: n,
      lastRunAt,
      lastActivation: params.activation,
      totalDurationMs: prevDuration + params.durationMs,
      averageJitterMs: (prevAverageJitter * (n - 1) + summary.meanMs) / n,
      maxJitterMs: Math.max(prevMaxJitter, summary.maxMs),
      totalDispatched: prevDispatched + summary.count,
      totalFailed: prevFailed + summary.failed,
      totalUnconfirmed: prevUnconfirmed + summary.unconfirmed,
    };

    map.set(params.macroId, updated);
    this._saveMap(map);
    return updated;
  }

  /**
   * Gets accumulated run statistics for a single macro.
   */
  public get(macroId: Guid): RunHistoryEntry | null {
    const map = this._loadMap();
    return map.get(macroId) ?? null;
  }

  /**
   * Loads all run history entries, sorted by LastRunAt descending.
   */
  public loadAll(): RunHistoryEntry[] {
    const map = this._loadMap();
    const array = Array.from(map.values());
    array.sort((a, b) => {
      const timeA = new Date(a.lastRunAt).getTime();
      const timeB = new Date(b.lastRunAt).getTime();
      return timeB - timeA;
    });
    return array;
  }

  /**
   * Clears all run history and saves empty file.
   */
  public clear(): void {
    this._saveMap(new Map<string, RunHistoryEntry>());
  }

  /**
   * Deletes the run-history.json file from disk if it exists.
   */
  public deleteFile(): void {
    try {
      if (fs.existsSync(this._filePath)) {
        fs.unlinkSync(this._filePath);
      }
    } catch {
      // ignore
    }
  }

  private _loadMap(): Map<string, RunHistoryEntry> {
    try {
      if (!fs.existsSync(this._filePath)) {
        return new Map<string, RunHistoryEntry>();
      }
      const text = fs.readFileSync(this._filePath, 'utf8');
      return parseRunHistoryJson(text);
    } catch {
      // Corrupted file silently starts over
      return new Map<string, RunHistoryEntry>();
    }
  }

  private _saveMap(map: Map<string, RunHistoryEntry>): void {
    try {
      const content = serializeRunHistoryJson(map.values(), { pretty: true });
      atomicWriteFileSync(this._filePath, content);
    } catch {
      // Match legacy silent catch for IO errors
    }
  }
}
