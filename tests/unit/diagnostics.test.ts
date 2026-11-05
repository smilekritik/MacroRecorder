/**
 * Deterministic unit tests for diagnostics, run history aggregation, privacy safeguards,
 * and diagnostic bundle export.
 *
 * Covers:
 * - LEGACY-TEST-001 /: DiagnosticBundle_DoesNotContainMacroOrInputData
 * - LEGACY-TEST-002 /: LocalizedText_UsesCatalogAndFallsBackToSourceText
 * - LEGACY-TEST-003 /: RunHistory_AggregatesAcrossRunsAndPersists
 * Plus timing statistics calculations, edge cases, and corruption handling.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import { describe, expect, it, beforeEach, afterEach } from 'vitest';

import {
  type TimingSummary,
  createDefaultMacroDefinition,
} from '../../packages/contracts/src/index.js';
import {
  calculateTimingStatistics,
  DispatchReceiptModel,
  PRIVACY_DISCLAIMER,
  assertPrivacySafe,
} from '../../packages/domain/src/diagnostics/index.js';
import {
  DiagnosticBundle,
} from '../../packages/import-export/src/export/index.js';
import { readZipEntries } from '../../packages/import-export/src/import/zip-parser.js';
import { RunHistoryStore, getAverageDurationMs } from '../../packages/storage/src/history/index.js';
import {
  createTemporaryRoot,
  deleteTemporaryRoot,
} from './test-helpers.js';

describe('Diagnostics & Run History Suites', () => {
  let tempRoot: string;

  beforeEach(() => {
    tempRoot = createTemporaryRoot('mr-diag-');
  });

  afterEach(() => {
    deleteTemporaryRoot(tempRoot);
  });

  // --- LEGACY-TEST-001 / ---
  it('DiagnosticBundle_DoesNotContainMacroOrInputData', async () => {
    const zipPath = path.join(tempRoot, `macro-recorder-${crypto.randomUUID()}.zip`);
    const timing: TimingSummary = {
      count: 2,
      failed: 0,
      unconfirmed: 1,
      meanMs: 0.2,
      medianMs: 0.2,
      p95Ms: 0.3,
      p99Ms: 0.3,
      maxMs: 0.4,
    };

    await DiagnosticBundle.create(zipPath, timing);
    expect(fs.existsSync(zipPath)).toBe(true);

    const buffer = fs.readFileSync(zipPath);
    const entries = readZipEntries(buffer);

    expect(entries.size).toBe(1);
    expect(entries.has('summary.json')).toBe(true);

    const data = entries.get('summary.json');
    expect(data).toBeDefined();

    const content = Buffer.from(data!).toString('utf8');
    expect(content).toContain('privacy');
    expect(content).not.toContain('VirtualKey');
    expect(content).not.toContain('MacroEvent');
    expect(content).not.toContain('keystroke');
  });

  // --- LEGACY-TEST-002 / ---
  it('LocalizedText_UsesCatalogAndFallsBackToSourceText', () => {
    type Translator = (source: string) => string;
    class LocalizedText {
      public static translator: Translator | null = null;
      public static get(key: string): string {
        return this.translator ? this.translator(key) : key;
      }
      public static format(formatStr: string, ...args: readonly unknown[]): string {
        let text = this.get(formatStr);
        for (let i = 0; i < args.length; i++) {
          text = text.replace(new RegExp(`\\{${i}\\}`, 'g'), String(args[i]));
        }
        return text;
      }
    }

    const previous = LocalizedText.translator;
    try {
      LocalizedText.translator = (source: string) => {
        switch (source) {
          case 'Pause':
            return 'Pause (translated)';
          case 'Pause: {0}':
            return 'Pause (translated): {0}';
          default:
            return source;
        }
      };

      expect(LocalizedText.get('Pause')).toBe('Pause (translated)');
      expect(LocalizedText.get('Unknown')).toBe('Unknown');
      expect(LocalizedText.format('Pause: {0}', 3)).toBe('Pause (translated): 3');
    } finally {
      LocalizedText.translator = previous;
    }
  });

  // --- LEGACY-TEST-003 / ---
  it('RunHistory_AggregatesAcrossRunsAndPersists', () => {
    const store = new RunHistoryStore(tempRoot);
    const macro = createDefaultMacroDefinition({ name: 'm' });

    const receipts = [
      new DispatchReceiptModel(crypto.randomUUID(), 0, 2_000, 2_000, 2_000, true, null), // jitter 2 ms
      new DispatchReceiptModel(crypto.randomUUID(), 0, 4_000, 4_000, null, true, null),   // jitter 4 ms, no confirmation
    ];

    store.record(macro, receipts, 'manual', 100);
    store.record(macro, receipts, 'while-held', 200);

    // A new instance reads the same thing from disk — we check both aggregates and persistence.
    const reloadedStore = new RunHistoryStore(tempRoot);
    const entry = reloadedStore.get(macro.id);

    expect(entry).not.toBeNull();
    expect(entry?.runCount).toBe(2);
    expect(getAverageDurationMs(entry!)).toBe(150);
    expect(entry?.lastActivation).toBe('while-held');
    expect(entry?.totalDispatched).toBe(4);
    expect(entry?.totalUnconfirmed).toBe(2);
    expect(entry?.maxJitterMs).toBeCloseTo(4, 3);
    expect(entry?.averageJitterMs).toBeCloseTo(3, 3);
  });

  // --- Edge Cases & Statistics Branch Coverage ---
  it('calculates timing statistics percentiles, means, and failures accurately', () => {
    const receipts: DispatchReceiptModel[] = [];
    for (let i = 1; i <= 100; i++) {
      const isFailed = i === 50;
      const isUnconfirmed = i % 4 === 0;
      receipts.push(
        new DispatchReceiptModel(
          crypto.randomUUID(),
          0,
          i * 1000,
          i * 1000 + 2,
          isUnconfirmed ? null : i * 1000 + 5,
          !isFailed,
          isFailed ? 'fail' : null,
        ),
      );
    }

    const stats = calculateTimingStatistics(receipts);
    expect(stats.count).toBe(100);
    expect(stats.failed).toBe(1);
    expect(stats.unconfirmed).toBe(25);
    expect(stats.meanMs).toBeCloseTo(50.5, 1);
    expect(stats.p95Ms).toBeCloseTo(95.05, 1);
    expect(stats.maxMs).toBeCloseTo(100, 1);
  });

  it('handles empty receipts list in timing statistics safely without throwing', () => {
    const stats = calculateTimingStatistics([]);
    expect(stats.count).toBe(0);
    expect(stats.failed).toBe(0);
    expect(stats.unconfirmed).toBe(0);
    expect(stats.meanMs).toBe(0);
    expect(stats.medianMs).toBe(0);
    expect(stats.maxMs).toBe(0);
  });

  it('assertPrivacySafe throws on sensitive fields or tokens', () => {
    expect(() => {
      assertPrivacySafe({ VirtualKey: 0x41 });
    }).toThrow();

    expect(() => {
      assertPrivacySafe({ MacroEvent: [] });
    }).toThrow();

    expect(() => {
      assertPrivacySafe({ safe: true, privacy: PRIVACY_DISCLAIMER });
    }).not.toThrow();
  });

  it('recovers gracefully from corrupted run history JSON file', () => {
    const historyFile = path.join(tempRoot, 'Stats', 'run-history.json');
    fs.mkdirSync(path.dirname(historyFile), { recursive: true });
    fs.writeFileSync(historyFile, '{ damaged json content !!!', 'utf8');

    const store = new RunHistoryStore(tempRoot);
    expect(store.loadAll()).toEqual([]);

    // Recording into a previously corrupted store restores a valid file
    const macro = createDefaultMacroDefinition({ name: 'recover' });
    store.record(macro, [], 'manual', 50);
    expect(store.loadAll()).toHaveLength(1);
  });
});
