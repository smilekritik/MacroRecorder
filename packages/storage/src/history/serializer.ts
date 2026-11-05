/**
 * Serializer for Stats/run-history.json.
 * Preserves PascalCase keys, descending LastRunAt ordering, and aggregate precision.
 */

import { type RunHistoryEntry, type RunHistoryEntryWire } from '../../../contracts/src/index.js';

export interface SerializeRunHistoryOptions {
  readonly pretty?: boolean | undefined;
}

/**
 * Parses JSON text of run-history.json into a Map of MacroId -> RunHistoryEntry.
 * Throws on syntax errors or invalid top-level shape, allowing caller to recover silently.
 */
export function parseRunHistoryJson(jsonText: string): Map<string, RunHistoryEntry> {
  const trimmed = jsonText.trim();
  if (trimmed.length === 0) {
    return new Map<string, RunHistoryEntry>();
  }

  const raw = JSON.parse(trimmed);
  if (!Array.isArray(raw)) {
    throw new Error('Expected JSON array for run history');
  }

  const map = new Map<string, RunHistoryEntry>();

  for (const item of raw) {
    if (typeof item !== 'object' || item === null) continue;

    const wire = item as RunHistoryEntryWire;
    const macroId = String(wire.MacroId ?? wire.macroId ?? '').trim();
    if (macroId.length === 0) continue;

    const macroName = String(wire.MacroName ?? wire.macroName ?? '');
    const runCount = Math.max(0, Number(wire.RunCount ?? wire.runCount ?? 0));
    const lastRunAt = String(wire.LastRunAt ?? wire.lastRunAt ?? new Date(0).toISOString());
    const lastActivation = String(wire.LastActivation ?? wire.lastActivation ?? '');
    const totalDurationMs = Math.max(0, Number(wire.TotalDurationMs ?? wire.totalDurationMs ?? 0));
    const averageJitterMs = Number(wire.AverageJitterMs ?? wire.averageJitterMs ?? 0);
    const maxJitterMs = Number(wire.MaxJitterMs ?? wire.maxJitterMs ?? 0);
    const totalDispatched = Math.max(0, Number(wire.TotalDispatched ?? wire.totalDispatched ?? 0));
    const totalFailed = Math.max(0, Number(wire.TotalFailed ?? wire.totalFailed ?? 0));
    const totalUnconfirmed = Math.max(
      0,
      Number(wire.TotalUnconfirmed ?? wire.totalUnconfirmed ?? 0),
    );

    const entry: RunHistoryEntry = {
      macroId,
      macroName,
      runCount,
      lastRunAt,
      lastActivation,
      totalDurationMs,
      averageJitterMs,
      maxJitterMs,
      totalDispatched,
      totalFailed,
      totalUnconfirmed,
    };

    map.set(macroId, entry);
  }

  return map;
}

/**
 * Serializes run history entries into wire format JSON.
 * Entries are sorted by LastRunAt descending.
 */
export function serializeRunHistoryJson(
  entries: Iterable<RunHistoryEntry>,
  options: SerializeRunHistoryOptions = {},
): string {
  const array = Array.isArray(entries) ? [...entries] : Array.from(entries);

  // Order descending by LastRunAt
  array.sort((a, b) => {
    const timeA = new Date(a.lastRunAt).getTime();
    const timeB = new Date(b.lastRunAt).getTime();
    return timeB - timeA;
  });

  const wireList = array.map((entry) => ({
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
  }));

  const indent = options.pretty !== false ? 2 : undefined;
  return JSON.stringify(wireList, null, indent) + '\n';
}
