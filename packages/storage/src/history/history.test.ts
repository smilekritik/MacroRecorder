/**
 * Tests for RunHistoryStore and Stats/run-history.json.
 * Covers, and golden fixtures.
 */

import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createDispatchReceipt, type DispatchReceipt } from '../../../contracts/src/index.js';
import {
  HISTORY_FIXTURES,
  loadFixtureJson,
  loadFixtureText,
} from '../../../../tests/fixtures/index.js';
import {
  calculatePercentile,
  calculateTimingSummary,
  getAverageDurationMs,
  parseRunHistoryJson,
  RunHistoryStore,
  serializeRunHistoryJson,
} from './index.js';

function createTempDir(prefix: string): string {
  const dir = path.join(
    os.tmpdir(),
    `mr-hist-test-${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function cleanTempDir(dir: string): void {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    // ignore
  }
}

describe('Run History Storage (Stats/run-history.json)', () => {
  describe('Aggregates Across Runs and Persists', () => {
    it('matches RunHistory_AggregatesAcrossRunsAndPersists exactly', () => {
      const tempDir = createTempDir('unit-diag-003');
      try {
        const store = new RunHistoryStore(tempDir);
        const macro = { id: crypto.randomUUID(), name: 'm' };

        // Receipts matching legacy test:
        // Receipt 1: scheduled 0, started 2_000 -> jitter 2 ms, hook confirmed
        // Receipt 2: scheduled 0, started 4_000 -> jitter 4 ms, no confirmation
        const receipts: DispatchReceipt[] = [
          createDispatchReceipt({
            eventId: crypto.randomUUID(),
            scheduledMicroseconds: 0,
            dispatchStartedMicroseconds: 2000,
            dispatchCompletedMicroseconds: 2000,
            hookConfirmedMicroseconds: 2000,
            success: true,
          }),
          createDispatchReceipt({
            eventId: crypto.randomUUID(),
            scheduledMicroseconds: 0,
            dispatchStartedMicroseconds: 4000,
            dispatchCompletedMicroseconds: 4000,
            hookConfirmedMicroseconds: null,
            success: true,
          }),
        ];

        store.record(macro, receipts, 'manual', 100);
        store.record(macro, receipts, 'while-held', 200);

        // A new instance reads the same thing from disk — verify aggregates and persistence
        const entry = new RunHistoryStore(tempDir).get(macro.id);
        expect(entry).not.toBeNull();
        expect(entry!.runCount).toBe(2);
        expect(getAverageDurationMs(entry!)).toBe(150);
        expect(entry!.lastActivation).toBe('while-held');
        expect(entry!.totalDispatched).toBe(4);
        expect(entry!.totalUnconfirmed).toBe(2);
        expect(entry!.maxJitterMs).toBe(4);
        expect(entry!.averageJitterMs).toBe(3);
      } finally {
        cleanTempDir(tempDir);
      }
    });
  });

  describe('Timing Summary Calculations', () => {
    it('calculates correct summary for empty receipts list', () => {
      const summary = calculateTimingSummary([]);
      expect(summary).toEqual({
        count: 0,
        failed: 0,
        unconfirmed: 0,
        meanMs: 0,
        medianMs: 0,
        p95Ms: 0,
        p99Ms: 0,
        maxMs: 0,
      });
    });

    it('calculates percentiles matching linear interpolation algorithm', () => {
      const values = [1, 2, 3, 4, 5];
      expect(calculatePercentile(values, 0.5)).toBe(3);
      expect(calculatePercentile(values, 0)).toBe(1);
      expect(calculatePercentile(values, 1)).toBe(5);

      const even = [10, 20, 30, 40];
      expect(calculatePercentile(even, 0.5)).toBe(25);
    });

    it('computes summary with failures, unconfirmed, and jitter metrics', () => {
      const receipts: DispatchReceipt[] = [
        createDispatchReceipt({
          eventId: crypto.randomUUID(),
          scheduledMicroseconds: 1000,
          dispatchStartedMicroseconds: 2000, // 1 ms jitter
          dispatchCompletedMicroseconds: 2500,
          hookConfirmedMicroseconds: 3000,
          success: true,
        }),
        createDispatchReceipt({
          eventId: crypto.randomUUID(),
          scheduledMicroseconds: 1000,
          dispatchStartedMicroseconds: 4000, // 3 ms jitter
          dispatchCompletedMicroseconds: 4500,
          hookConfirmedMicroseconds: null, // unconfirmed
          success: true,
        }),
        createDispatchReceipt({
          eventId: crypto.randomUUID(),
          scheduledMicroseconds: 1000,
          dispatchStartedMicroseconds: 6000, // 5 ms jitter
          dispatchCompletedMicroseconds: 6500,
          hookConfirmedMicroseconds: 7000,
          success: false, // failed
        }),
      ];

      const summary = calculateTimingSummary(receipts);
      expect(summary.count).toBe(3);
      expect(summary.failed).toBe(1);
      expect(summary.unconfirmed).toBe(1);
      expect(summary.meanMs).toBeCloseTo(3, 5);
      expect(summary.medianMs).toBe(3);
      expect(summary.maxMs).toBe(5);
    });
  });

  describe('Fixtures and Serialization Round-Trip', () => {
    it('loads and validates valid-run-history.json against valid-run-history.expected.json', () => {
      const fixtureText = loadFixtureText(HISTORY_FIXTURES.VALID_HISTORY);
      const expectedJson = loadFixtureJson(HISTORY_FIXTURES.VALID_HISTORY_EXPECTED);

      const map = parseRunHistoryJson(fixtureText);
      expect(map.size).toBe(2);

      const entry1 = map.get('77777777-7777-7777-7777-777777777771');
      expect(entry1).toBeDefined();
      expect(entry1?.macroName).toBe('Production Build Runner');
      expect(entry1?.runCount).toBe(24);
      expect(entry1?.lastActivation).toBe('manual');
      expect(entry1?.totalDurationMs).toBe(144000);
      expect(entry1?.averageJitterMs).toBe(1.15);
      expect(entry1?.maxJitterMs).toBe(3.8);
      expect(entry1?.totalDispatched).toBe(1200);
      expect(entry1?.totalFailed).toBe(0);
      expect(entry1?.totalUnconfirmed).toBe(12);

      const serialized = serializeRunHistoryJson(map.values());
      expect(JSON.parse(serialized)).toEqual(expectedJson);
    });

    it('silently recovers from corrupted-run-history.json and starts over', () => {
      const tempDir = createTempDir('corrupt-hist');
      try {
        const statsDir = path.join(tempDir, 'Stats');
        fs.mkdirSync(statsDir, { recursive: true });
        const filePath = path.join(statsDir, 'run-history.json');
        fs.writeFileSync(filePath, loadFixtureText(HISTORY_FIXTURES.CORRUPTED_HISTORY), 'utf8');

        // Loading should NOT crash or throw: silent recovery
        const store = new RunHistoryStore(tempDir);
        const all = store.loadAll();
        expect(all).toEqual([]);
        expect(store.get('any-id')).toBeNull();

        // Recording a run against the corrupted file rewrites cleanly
        const macro = { id: crypto.randomUUID(), name: 'Recovered' };
        store.record(macro, [], 'manual', 50);

        const loaded = store.get(macro.id);
        expect(loaded).not.toBeNull();
        expect(loaded?.macroName).toBe('Recovered');
        expect(loaded?.runCount).toBe(1);
        expect(loaded?.totalDurationMs).toBe(50);
      } finally {
        cleanTempDir(tempDir);
      }
    });

    it('sorts entries by LastRunAt descending', () => {
      const tempDir = createTempDir('sort-hist');
      try {
        const store = new RunHistoryStore(tempDir);
        const m1 = { id: crypto.randomUUID(), name: 'Older' };
        const m2 = { id: crypto.randomUUID(), name: 'Newer' };

        store.record(m1, [], 'manual', 10, '2026-01-01T00:00:00.000Z');
        store.record(m2, [], 'manual', 20, '2026-06-01T00:00:00.000Z');

        const all = store.loadAll();
        expect(all).toHaveLength(2);
        expect(all[0]?.macroId).toBe(m2.id); // Newer first
        expect(all[1]?.macroId).toBe(m1.id);
      } finally {
        cleanTempDir(tempDir);
      }
    });
  });

  describe('Store Operations: Clear and Delete', () => {
    it('clears run history and deletes file cleanly', () => {
      const tempDir = createTempDir('ops-hist');
      try {
        const store = new RunHistoryStore(tempDir);
        const macro = { id: crypto.randomUUID(), name: 'Test' };
        store.record(macro, [], 'manual', 100);

        expect(store.loadAll()).toHaveLength(1);
        expect(fs.existsSync(store.filePath)).toBe(true);

        store.clear();
        expect(store.loadAll()).toHaveLength(0);

        store.deleteFile();
        expect(fs.existsSync(store.filePath)).toBe(false);
      } finally {
        cleanTempDir(tempDir);
      }
    });
  });
});
