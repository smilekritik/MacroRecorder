/**
 * Types and interfaces for run history storage.
 */

import {
  type DispatchReceipt,
  type Guid,
  type ISODateTimeString,
  type Milliseconds,
  type RunHistoryEntry,
  type RunHistoryEntryWire,
  type TimingSummary,
} from '../../../contracts/src/index.js';

export {
  type DispatchReceipt,
  type Guid,
  type ISODateTimeString,
  type Milliseconds,
  type RunHistoryEntry,
  type RunHistoryEntryWire,
  type TimingSummary,
};

export interface RunHistoryRecordParams {
  readonly macroId: Guid;
  readonly macroName: string;
  readonly receipts: readonly DispatchReceipt[];
  readonly activation: string;
  readonly durationMs: Milliseconds;
  readonly runAt?: ISODateTimeString | undefined;
}

export interface RunHistoryStoreOptions {
  readonly rootPath?: string | undefined;
  readonly filePath?: string | undefined;
}

/**
 * Calculates average duration in milliseconds for a run history entry.
 */
export function getAverageDurationMs(entry: RunHistoryEntry): Milliseconds {
  return entry.runCount > 0 ? entry.totalDurationMs / entry.runCount : 0;
}
