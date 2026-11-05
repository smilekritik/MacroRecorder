/**
 * Diagnostics domain unit test suite.
 * Validates timing statistics, percentiles, dispatch receipts, projections,
 * hook confirmation, runtime load peaks, run history aggregation, and privacy classifications.
 *
 * Covers:
 * - (TimingStatistics_CalculatesPercentilesAndFailures)
 * - (MacroAndDiagnostics_ExposeUserFacingStateInMilliseconds)
 * - (RunHistory_AggregatesAcrossRunsAndPersists)
 * - (Dispatch Jitter and Hook Confirmation Tracking)
 * - (Peak Resource and Run History Statistics)
 * - / (Privacy-Safe Diagnostic Bundle)
 */

import { describe, expect, it } from 'vitest';
import {
  aggregateRunResult,
  assertPrivacySafe,
  calculateExtendedTimingStatistics,
  calculatePercentile,
  calculateTimingStatistics,
  classifyProperty,
  cloneDispatchReceipt,
  combineResourcePeaks,
  countFailedActions,
  countUnconfirmedActions,
  createDiagnosticBundleSummary,
  createDispatchReceipt,
  createResourcePeak,
  createTimeProjection,
  DispatchReceiptModel,
  dispatchReceiptFromWire,
  dispatchReceiptToWire,
  emptyResourcePeak,
  emptyTimingSummary,
  formatConfirmationMilliseconds,
  formatCpuText,
  formatGpuText,
  formatJitterMilliseconds,
  formatMilliseconds,
  formatProcessMemoryText,
  formatResourcePercent,
  formatRunHistorySummary,
  formatSystemMemoryText,
  getAverageDurationMs,
  getHookConfirmationLatencyMs,
  getHookConfirmationState,
  getReceiptCompletedMilliseconds,
  getReceiptConfirmationMilliseconds,
  getReceiptDurationMilliseconds,
  getReceiptDurationMicroseconds,
  getReceiptHookConfirmedMilliseconds,
  getReceiptJitterMilliseconds,
  getReceiptPlannedMilliseconds,
  getReceiptScheduledDisplayMilliseconds,
  getReceiptScheduledMilliseconds,
  getReceiptStartedMilliseconds,
  isHookConfirmed,
  MockSystemLoadProbe,
  PRIVACY_DISCLAIMER,
  PrivacyViolationError,
  ResourcePeakModel,
  resourcePeakFromWire,
  resourcePeakToWire,
  RunHistoryAggregator,
  RunHistoryEntryModel,
  runHistoryEntryFromWire,
  runHistoryEntryToWire,
  RuntimeLoadMonitor,
  sanitizeForDiagnostics,
  TimingStatistics,
  validateDispatchReceipt,
  validatePrivacySafety,
  type DispatchReceipt,
  type Guid,
  type ResourcePeak,
  type RunHistoryEntry,
} from '../index.js';

describe('Diagnostics Domain Suite', () => {
  describe('Dispatch Receipts & Millisecond Projections', () => {
    it('preserves microsecond precision while exposing user-facing milliseconds', () => {
      const receipt = createDispatchReceipt({
        eventId: 'e1111111-1111-1111-1111-111111111111' as Guid,
        scheduledMicroseconds: 12_500,
        dispatchStartedMicroseconds: 13_250,
        dispatchCompletedMicroseconds: 13_300,
        hookConfirmedMicroseconds: null,
        success: true,
      });

      // Legacy ModelTests.cs:54 assertions
      expect(getReceiptScheduledMilliseconds(receipt)).toBe(12.5);
      expect(getReceiptStartedMilliseconds(receipt)).toBe(13.25);
      expect(getReceiptCompletedMilliseconds(receipt)).toBe(13.3);
      expect(getReceiptHookConfirmedMilliseconds(receipt)).toBeNull();

      // OOP model
      const model = new DispatchReceiptModel(receipt);
      expect(model.scheduledMilliseconds).toBe(12.5);
      expect(model.ScheduledMilliseconds).toBe(12.5);
      expect(model.dispatchStartedMilliseconds).toBe(13.25);
      expect(model.DispatchStartedMilliseconds).toBe(13.25);
      expect(model.dispatchCompletedMilliseconds).toBe(13.3);
      expect(model.DispatchCompletedMilliseconds).toBe(13.3);
      expect(model.hookConfirmedMilliseconds).toBeNull();
      expect(model.HookConfirmedMilliseconds).toBeNull();
      expect(getReceiptPlannedMilliseconds(receipt)).toBeNull();
      expect(getReceiptJitterMilliseconds(receipt)).toBe(0.75);
    });

    it('calculates duration in microseconds and milliseconds', () => {
      const receipt = createDispatchReceipt({
        eventId: 'e2222222-2222-2222-2222-222222222222' as Guid,
        scheduledMicroseconds: 100_000,
        dispatchStartedMicroseconds: 100_500,
        dispatchCompletedMicroseconds: 102_000,
        success: true,
      });

      expect(getReceiptDurationMicroseconds(receipt)).toBe(1500);
      expect(getReceiptDurationMilliseconds(receipt)).toBe(1.5);

      const model = new DispatchReceiptModel(receipt);
      expect(model.durationMicroseconds).toBe(1500);
      expect(model.durationMilliseconds).toBe(1.5);
    });

    it('formats ScheduledDisplayMilliseconds matching legacy "300" and "300 (304)"', () => {
      // Without planned jitter
      const receipt1 = createDispatchReceipt({
        eventId: 'e1' as Guid,
        scheduledMicroseconds: 300_000,
        dispatchStartedMicroseconds: 300_500,
        dispatchCompletedMicroseconds: 301_000,
        success: true,
      });
      expect(getReceiptScheduledDisplayMilliseconds(receipt1)).toBe('300');

      // With planned jitter
      const receipt2 = createDispatchReceipt({
        eventId: 'e2' as Guid,
        scheduledMicroseconds: 300_000,
        plannedMicroseconds: 304_000,
        dispatchStartedMicroseconds: 304_200,
        dispatchCompletedMicroseconds: 305_000,
        success: true,
      });
      expect(getReceiptScheduledDisplayMilliseconds(receipt2)).toBe('300 (304)');

      // Decimal fractions
      const receipt3 = createDispatchReceipt({
        eventId: 'e3' as Guid,
        scheduledMicroseconds: 12_500,
        plannedMicroseconds: 14_750,
        dispatchStartedMicroseconds: 14_800,
        dispatchCompletedMicroseconds: 15_000,
        success: true,
      });
      expect(getReceiptScheduledDisplayMilliseconds(receipt3)).toBe('12.5 (14.75)');
    });

    it('formats numbers matching "0.###"', () => {
      expect(formatMilliseconds(300)).toBe('300');
      expect(formatMilliseconds(12.5)).toBe('12.5');
      expect(formatMilliseconds(12.5555)).toBe('12.556');
      expect(formatMilliseconds(0)).toBe('0');
    });

    it('creates comprehensive TimeProjection with microsecond precision and millisecond units', () => {
      const receipt = createDispatchReceipt({
        eventId: 'e-proj' as Guid,
        scheduledMicroseconds: 50_000,
        plannedMicroseconds: 52_000,
        dispatchStartedMicroseconds: 52_400,
        dispatchCompletedMicroseconds: 53_100,
        hookConfirmedMicroseconds: 54_000,
        success: true,
      });

      const projection = createTimeProjection(receipt, 48_000);

      expect(projection.authoredMicroseconds).toBe(48_000);
      expect(projection.authoredMilliseconds).toBe(48);
      expect(projection.scheduledMicroseconds).toBe(50_000);
      expect(projection.scheduledMilliseconds).toBe(50);
      expect(projection.plannedMicroseconds).toBe(52_000);
      expect(projection.plannedMilliseconds).toBe(52);
      expect(projection.actualStartMicroseconds).toBe(52_400);
      expect(projection.actualStartMilliseconds).toBe(52.4);
      expect(projection.actualEndMicroseconds).toBe(53_100);
      expect(projection.actualEndMilliseconds).toBe(53.1);
      expect(projection.hookConfirmedMicroseconds).toBe(54_000);
      expect(projection.hookConfirmedMilliseconds).toBe(54);
      expect(projection.dispatchDurationMicroseconds).toBe(700);
      expect(projection.dispatchDurationMilliseconds).toBe(0.7);
      expect(projection.jitterMicroseconds).toBe(400);
      expect(projection.jitterMilliseconds).toBe(0.4);
      expect(projection.confirmationLatencyMicroseconds).toBe(1600);
      expect(projection.confirmationLatencyMilliseconds).toBe(1.6);
      expect(projection.scheduledDisplayMilliseconds).toBe('50 (52)');
      expect(projection.confirmationState).toBe('confirmed');
      expect(projection.isConfirmed).toBe(true);
      expect(projection.isSuccess).toBe(true);
      expect(projection.error).toBeNull();
    });

    it('clones and validates dispatch receipts', () => {
      const receipt = createDispatchReceipt({
        eventId: 'e-val' as Guid,
        scheduledMicroseconds: 1000,
        dispatchStartedMicroseconds: 2000,
        dispatchCompletedMicroseconds: 3000,
        hookConfirmedMicroseconds: 3500,
        success: true,
      });

      const cloned = cloneDispatchReceipt(receipt);
      expect(cloned).toEqual(receipt);
      expect(cloned).not.toBe(receipt);

      const validation = validateDispatchReceipt(receipt);
      expect(validation.success).toBe(true);
    });

    it('round-trips DispatchReceipt wire serialization', () => {
      const receipt = createDispatchReceipt({
        eventId: 'e-wire' as Guid,
        scheduledMicroseconds: 10_000,
        plannedMicroseconds: 11_000,
        dispatchStartedMicroseconds: 11_200,
        dispatchCompletedMicroseconds: 11_800,
        hookConfirmedMicroseconds: 12_500,
        success: true,
        error: null,
      });

      const wire = dispatchReceiptToWire(receipt);
      expect(wire.EventId).toBe('e-wire');
      expect(wire.ScheduledMicroseconds).toBe(10_000);
      expect(wire.PlannedMicroseconds).toBe(11_000);
      expect(wire.DispatchStartedMicroseconds).toBe(11_200);
      expect(wire.DispatchCompletedMicroseconds).toBe(11_800);
      expect(wire.HookConfirmedMicroseconds).toBe(12_500);
      expect(wire.DispatchJitterMilliseconds).toBeCloseTo(0.2);
      expect(wire.ConfirmationMilliseconds).toBeCloseTo(1.3);

      const restored = dispatchReceiptFromWire(wire);
      expect(restored.eventId).toBe(receipt.eventId);
      expect(restored.scheduledMicroseconds).toBe(receipt.scheduledMicroseconds);
      expect(restored.dispatchStartedMicroseconds).toBe(receipt.dispatchStartedMicroseconds);
      expect(restored.dispatchCompletedMicroseconds).toBe(receipt.dispatchCompletedMicroseconds);
      expect(restored.hookConfirmedMicroseconds).toBe(receipt.hookConfirmedMicroseconds);
      expect(restored.dispatchJitterMilliseconds).toBeCloseTo(receipt.dispatchJitterMilliseconds);
      expect(restored.confirmationMilliseconds).toBeCloseTo(receipt.confirmationMilliseconds!);
    });
  });

  describe('Hook Confirmation and Latency Tracking', () => {
    it('calculates confirmation latency accurately when hook confirms', () => {
      const receipt = createDispatchReceipt({
        eventId: 'e-hook-1' as Guid,
        scheduledMicroseconds: 0,
        dispatchStartedMicroseconds: 10_000,
        dispatchCompletedMicroseconds: 10_500,
        hookConfirmedMicroseconds: 12_400, // 2.4 ms latency
        success: true,
      });

      expect(isHookConfirmed(receipt)).toBe(true);
      expect(getReceiptHookConfirmedMilliseconds(receipt)).toBe(12.4);
      expect(getReceiptConfirmationMilliseconds(receipt)).toBeCloseTo(2.4);
      expect(getHookConfirmationLatencyMs(receipt)).toBeCloseTo(2.4);
      expect(getHookConfirmationState(receipt)).toBe('confirmed');
    });

    it('handles unconfirmed actions cleanly (null hook timestamp)', () => {
      const receipt = createDispatchReceipt({
        eventId: 'e-hook-2' as Guid,
        scheduledMicroseconds: 0,
        dispatchStartedMicroseconds: 10_000,
        dispatchCompletedMicroseconds: 10_500,
        hookConfirmedMicroseconds: null,
        success: true,
      });

      expect(isHookConfirmed(receipt)).toBe(false);
      expect(getReceiptHookConfirmedMilliseconds(receipt)).toBeNull();
      expect(getReceiptConfirmationMilliseconds(receipt)).toBeNull();
      expect(getHookConfirmationLatencyMs(receipt)).toBeNull();
      expect(getHookConfirmationState(receipt)).toBe('unconfirmed');
      expect(formatConfirmationMilliseconds(getReceiptConfirmationMilliseconds(receipt))).toBe('—');
    });

    it('categorizes failed dispatches as failed regardless of hook', () => {
      const receipt = createDispatchReceipt({
        eventId: 'e-hook-3' as Guid,
        scheduledMicroseconds: 0,
        dispatchStartedMicroseconds: 10_000,
        dispatchCompletedMicroseconds: 10_500,
        hookConfirmedMicroseconds: null,
        success: false,
        error: 'Target window closed',
      });

      expect(getHookConfirmationState(receipt)).toBe('failed');
    });
  });

  describe('Timing Statistics & Percentiles', () => {
    it('calculates percentiles and failure counts matching legacy golden values', () => {
      // Legacy MacroProcessingTests.cs:45 test:
      // Enumerable.Range(1, 100).Select(i => new DispatchReceipt(Guid.NewGuid, 0, i * 1000, i * 1000 + 2,
      //     i % 4 == 0 ? null : i * 1000 + 5, i != 50, i == 50 ? "fail" : null));
      const receipts: DispatchReceipt[] = [];
      for (let i = 1; i <= 100; i++) {
        receipts.push(
          createDispatchReceipt({
            eventId: `event-${i}` as Guid,
            scheduledMicroseconds: 0,
            dispatchStartedMicroseconds: i * 1000,
            dispatchCompletedMicroseconds: i * 1000 + 2,
            hookConfirmedMicroseconds: i % 4 === 0 ? null : i * 1000 + 5,
            success: i !== 50,
            error: i === 50 ? 'fail' : null,
          }),
        );
      }

      const result = TimingStatistics.Calculate(receipts);

      expect(result.count).toBe(100);
      expect(result.failed).toBe(1);
      expect(result.unconfirmed).toBe(25);
      expect(result.meanMs).toBeCloseTo(50.5, 3);
      expect(result.p95Ms).toBeCloseTo(95.05, 2);
      expect(result.maxMs).toBeCloseTo(100, 3);
      expect(result.medianMs).toBeCloseTo(50.5, 2);
    });

    it('handles empty receipts list returning all zeroes', () => {
      const summary = calculateTimingStatistics([]);
      expect(summary).toEqual(emptyTimingSummary);
      expect(summary.count).toBe(0);
      expect(summary.failed).toBe(0);
      expect(summary.unconfirmed).toBe(0);
      expect(summary.meanMs).toBe(0);
      expect(summary.medianMs).toBe(0);
      expect(summary.p95Ms).toBe(0);
      expect(summary.p99Ms).toBe(0);
      expect(summary.maxMs).toBe(0);
    });

    it('calculates linear percentiles matching legacy interpolation algorithm', () => {
      const values = [1, 2, 3, 4, 5];
      expect(calculatePercentile(values, 0)).toBe(1);
      expect(calculatePercentile(values, 0.5)).toBe(3);
      expect(calculatePercentile(values, 1.0)).toBe(5);

      const even = [10, 20, 30, 40];
      // position = (4 - 1) * 0.5 = 1.5; lower = 20, upper = 30 -> 20 + 10 * 0.5 = 25
      expect(calculatePercentile(even, 0.5)).toBe(25);

      // Single element
      expect(calculatePercentile([42], 0.5)).toBe(42);
      expect(calculatePercentile([42], 0)).toBe(42);
      expect(calculatePercentile([42], 1)).toBe(42);

      // Empty array
      expect(calculatePercentile([], 0.5)).toBe(0);
    });

    it('calculates extended timing statistics including variance and standard deviation', () => {
      const receipts: DispatchReceipt[] = [
        createDispatchReceipt({
          eventId: 'r1' as Guid,
          scheduledMicroseconds: 0,
          dispatchStartedMicroseconds: 2000,
          dispatchCompletedMicroseconds: 2500,
          success: true,
        }),
        createDispatchReceipt({
          eventId: 'r2' as Guid,
          scheduledMicroseconds: 0,
          dispatchStartedMicroseconds: 4000,
          dispatchCompletedMicroseconds: 4500,
          success: true,
        }),
        createDispatchReceipt({
          eventId: 'r3' as Guid,
          scheduledMicroseconds: 0,
          dispatchStartedMicroseconds: 6000,
          dispatchCompletedMicroseconds: 6500,
          success: true,
        }),
      ];

      const ext = calculateExtendedTimingStatistics(receipts);
      expect(ext.count).toBe(3);
      expect(ext.minMs).toBe(2);
      expect(ext.medianMs).toBe(4);
      expect(ext.p50Ms).toBe(4);
      expect(ext.maxMs).toBe(6);
      expect(ext.meanMs).toBe(4);
      // variance of [2, 4, 6] around mean 4: ((2-4)^2 + 0 + (6-4)^2) / 3 = 8/3 = 2.6666...
      expect(ext.varianceMs).toBeCloseTo(8 / 3);
      expect(ext.standardDeviationMs).toBeCloseTo(Math.sqrt(8 / 3));
    });

    it('counts failed and unconfirmed actions identically', () => {
      const receipts: DispatchReceipt[] = [
        createDispatchReceipt({
          eventId: 'r1' as Guid,
          scheduledMicroseconds: 0,
          dispatchStartedMicroseconds: 1000,
          dispatchCompletedMicroseconds: 1500,
          hookConfirmedMicroseconds: 1600,
          success: true,
        }),
        createDispatchReceipt({
          eventId: 'r2' as Guid,
          scheduledMicroseconds: 0,
          dispatchStartedMicroseconds: 1000,
          dispatchCompletedMicroseconds: 1500,
          hookConfirmedMicroseconds: null, // unconfirmed
          success: true,
        }),
        createDispatchReceipt({
          eventId: 'r3' as Guid,
          scheduledMicroseconds: 0,
          dispatchStartedMicroseconds: 1000,
          dispatchCompletedMicroseconds: 1500,
          hookConfirmedMicroseconds: null, // unconfirmed & failed
          success: false,
        }),
      ];

      expect(countFailedActions(receipts)).toBe(1);
      expect(countUnconfirmedActions(receipts)).toBe(2);

      const summary = calculateTimingStatistics(receipts);
      expect(summary.failed).toBe(1);
      expect(summary.unconfirmed).toBe(2);
    });

    it('formats jitter display strings', () => {
      expect(formatJitterMilliseconds(1.23456, 3)).toBe('1.235');
      expect(formatJitterMilliseconds(0, 3)).toBe('0.000');
    });
  });

  describe('Runtime Resource Peaks (CPU, GPU, RAM)', () => {
    it('combines resource peaks preserving maximums and handling nulls', () => {
      const peak1: ResourcePeak = {
        cpuPercent: null,
        gpuPercent: 30.5,
        memoryPercent: 45.0,
        processMemoryMegabytes: 120.0,
      };

      const peak2: ResourcePeak = {
        cpuPercent: 25.0,
        gpuPercent: null,
        memoryPercent: 55.5,
        processMemoryMegabytes: 110.0,
      };

      const combined = combineResourcePeaks(peak1, peak2);

      // CPU: null + 25.0 -> 25.0
      expect(combined.cpuPercent).toBe(25.0);
      // GPU: 30.5 + null -> 30.5
      expect(combined.gpuPercent).toBe(30.5);
      // System Memory: max(45.0, 55.5) -> 55.5
      expect(combined.memoryPercent).toBe(55.5);
      // Process Memory: max(120.0, 110.0) -> 120.0
      expect(combined.processMemoryMegabytes).toBe(120.0);
    });

    it('preserves null when both samples have unavailable counters', () => {
      const peak1 = createResourcePeak({ cpuPercent: null, gpuPercent: null });
      const peak2 = createResourcePeak({ cpuPercent: null, gpuPercent: null });
      const combined = combineResourcePeaks(peak1, peak2);

      expect(combined.cpuPercent).toBeNull();
      expect(combined.gpuPercent).toBeNull();
    });

    it('formats display strings', () => {
      const peak = createResourcePeak({
        cpuPercent: 18.5,
        gpuPercent: null,
        memoryPercent: 62.4,
        processMemoryMegabytes: 154.2,
      });

      expect(formatCpuText(peak)).toBe('18.5 %');
      expect(formatGpuText(peak)).toBe('—'); // Em-dash for unavailable GPU
      expect(formatSystemMemoryText(peak)).toBe('62.4 %');
      expect(formatProcessMemoryText(peak)).toBe('154.2 MB');
      expect(formatResourcePercent(null)).toBe('—');
      expect(formatResourcePercent(45.67)).toBe('45.7 %');
    });

    it('provides complete OOP ResourcePeakModel', () => {
      const model1 = new ResourcePeakModel({
        cpuPercent: 12.0,
        gpuPercent: 20.0,
        memoryPercent: 50.0,
        processMemoryMegabytes: 80.0,
      });

      const model2 = new ResourcePeakModel(25.0, 15.0, 60.0, 95.0);

      const combined = model1.combine(model2);
      expect(combined.CpuText).toBe('25.0 %');
      expect(combined.GpuText).toBe('20.0 %');
      expect(combined.SystemMemoryText).toBe('60.0 %');
      expect(combined.processMemoryText).toBe('95.0 MB');

      // Wire roundtrip
      const wire = combined.toWire();
      const restored = ResourcePeakModel.fromWire(wire);
      expect(restored.cpuPercent).toBe(25.0);
      expect(restored.gpuPercent).toBe(20.0);
      expect(restored.memoryPercent).toBe(60.0);
      expect(restored.processMemoryMegabytes).toBe(95.0);

      const directWire = resourcePeakToWire(combined);
      const directRestored = resourcePeakFromWire(directWire);
      expect(directRestored.cpuPercent).toBe(25.0);
      expect(emptyResourcePeak.cpuPercent).toBeNull();
      expect(emptyResourcePeak.gpuPercent).toBeNull();
    });

    it('samples resource load through RuntimeLoadMonitor and probe', () => {
      const mockProbe = new MockSystemLoadProbe(32.5, 48.0);
      const monitor = new RuntimeLoadMonitor(mockProbe);

      const sample = monitor.sample({
        memoryPercent: 70.0,
        processMemoryMegabytes: 210.5,
      });

      expect(sample.cpuPercent).toBe(32.5);
      expect(sample.gpuPercent).toBe(48.0);
      expect(sample.memoryPercent).toBe(70.0);
      expect(sample.processMemoryMegabytes).toBe(210.5);
      expect(sample.cpuText).toBe('32.5 %');
      expect(sample.gpuText).toBe('48.0 %');
    });
  });

  describe('Run History Aggregation', () => {
    it('aggregates across runs matching RunHistory_AggregatesAcrossRunsAndPersists exactly', () => {
      const macroId = 'm1111111-1111-1111-1111-111111111111' as Guid;
      const receipts: DispatchReceipt[] = [
        createDispatchReceipt({
          eventId: 'r1' as Guid,
          scheduledMicroseconds: 0,
          dispatchStartedMicroseconds: 2000,
          dispatchCompletedMicroseconds: 2000,
          hookConfirmedMicroseconds: 2000, // jitter 2 ms
          success: true,
        }),
        createDispatchReceipt({
          eventId: 'r2' as Guid,
          scheduledMicroseconds: 0,
          dispatchStartedMicroseconds: 4000,
          dispatchCompletedMicroseconds: 4000,
          hookConfirmedMicroseconds: null, // jitter 4 ms, unconfirmed
          success: true,
        }),
      ];

      // Run 1: manual, 100 ms
      const entry1 = aggregateRunResult(null, {
        macroId,
        macroName: 'm',
        receipts,
        activation: 'manual',
        durationMs: 100,
      });

      expect(entry1.runCount).toBe(1);
      expect(entry1.totalDurationMs).toBe(100);
      expect(getAverageDurationMs(entry1)).toBe(100);
      expect(entry1.averageJitterMs).toBe(3);
      expect(entry1.maxJitterMs).toBe(4);
      expect(entry1.totalDispatched).toBe(2);
      expect(entry1.totalUnconfirmed).toBe(1);
      expect(entry1.lastActivation).toBe('manual');

      // Run 2: while-held, 200 ms
      const entry2 = aggregateRunResult(entry1, {
        macroId,
        macroName: 'm',
        receipts,
        activation: 'while-held',
        durationMs: 200,
      });

      // Assertions.cs:69-76
      expect(entry2.runCount).toBe(2);
      expect(getAverageDurationMs(entry2)).toBe(150);
      expect(entry2.lastActivation).toBe('while-held');
      expect(entry2.totalDispatched).toBe(4);
      expect(entry2.totalUnconfirmed).toBe(2);
      expect(entry2.maxJitterMs).toBeCloseTo(4, 3);
      expect(entry2.averageJitterMs).toBeCloseTo(3, 3);
    });

    it('accumulates in-memory run history using RunHistoryAggregator', () => {
      const aggregator = new RunHistoryAggregator();
      const m1 = 'm1' as Guid;
      const m2 = 'm2' as Guid;

      aggregator.record({
        macroId: m1,
        macroName: 'Macro One',
        receipts: [],
        activation: 'manual',
        durationMs: 50,
        runAt: '2026-01-01T00:00:00.000Z',
      });

      aggregator.record({
        macroId: m2,
        macroName: 'Macro Two',
        receipts: [],
        activation: 'auto-trigger',
        durationMs: 120,
        runAt: '2026-06-01T00:00:00.000Z',
      });

      const all = aggregator.getAll();
      expect(all).toHaveLength(2);
      // Sorted descending by lastRunAt
      expect(all[0]?.macroId).toBe(m2);
      expect(all[1]?.macroId).toBe(m1);

      const entry1 = aggregator.get(m1);
      expect(entry1).not.toBeNull();
      expect(entry1?.macroName).toBe('Macro One');
    });

    it('formats summary strings for diagnostics tab', () => {
      expect(formatRunHistorySummary(null)).toBe('No runs yet.');

      const entry: RunHistoryEntry = {
        macroId: 'm-summary' as Guid,
        macroName: 'Build Runner',
        runCount: 5,
        lastRunAt: '2026-09-11T05:00:00.000Z',
        lastActivation: 'manual',
        totalDurationMs: 1500,
        averageJitterMs: 1.25,
        maxJitterMs: 3.5,
        totalDispatched: 50,
        totalFailed: 0,
        totalUnconfirmed: 2,
      };

      const summary = formatRunHistorySummary(entry);
      expect(summary).toContain('Runs: 5');
      expect(summary).toContain('avg duration: 300 ms');
      expect(summary).toContain('avg jitter: 1.250 ms');
      expect(summary).toContain('max jitter: 3.500 ms');
    });

    it('provides complete OOP RunHistoryEntryModel', () => {
      const entry: RunHistoryEntry = {
        macroId: 'm-oop' as Guid,
        macroName: 'Test Macro',
        runCount: 3,
        lastRunAt: '2026-09-11T05:00:00.000Z',
        lastActivation: 'manual',
        totalDurationMs: 600,
        averageJitterMs: 2.0,
        maxJitterMs: 4.5,
        totalDispatched: 30,
        totalFailed: 1,
        totalUnconfirmed: 3,
      };

      const model = new RunHistoryEntryModel(entry);
      expect(model.averageDurationMs).toBe(200);
      expect(model.AverageDurationMs).toBe(200);
      expect(model.summaryText).toContain('Runs: 3');

      const wire = model.toWire();
      expect(wire.RunCount).toBe(3);
      expect(wire.TotalDurationMs).toBe(600);

      const restored = new RunHistoryEntryModel(wire);
      expect(restored.macroId).toBe(model.macroId);
      expect(restored.runCount).toBe(3);
      expect(restored.averageDurationMs).toBe(200);
    });

    it('round-trips run history wire serialization', () => {
      const entry: RunHistoryEntry = {
        macroId: 'm-wire' as Guid,
        macroName: 'Wire Macro',
        runCount: 10,
        lastRunAt: '2026-09-11T05:00:00.000Z',
        lastActivation: 'while-held',
        totalDurationMs: 2000,
        averageJitterMs: 1.5,
        maxJitterMs: 3.0,
        totalDispatched: 100,
        totalFailed: 2,
        totalUnconfirmed: 5,
      };

      const wire = runHistoryEntryToWire(entry);
      const restored = runHistoryEntryFromWire(wire);
      expect(restored).toEqual(entry);
    });
  });

  describe('Privacy Classifications & Diagnostic Bundle Safety', () => {
    it('classifies properties according to privacy tier', () => {
      // Excluded: raw keystrokes, input payloads, virtual keys
      expect(classifyProperty('VirtualKey')).toBe('excluded');
      expect(classifyProperty('virtualKey')).toBe('excluded');
      expect(classifyProperty('scanCode')).toBe('excluded');
      expect(classifyProperty('events')).toBe('excluded');
      expect(classifyProperty('macroEvents')).toBe('excluded');
      expect(classifyProperty('text')).toBe('excluded');
      expect(classifyProperty('pixelColor')).toBe('excluded');
      expect(classifyProperty('deltaX')).toBe('excluded');
      expect(classifyProperty('button')).toBe('excluded');

      // Sensitive: macro names, paths
      expect(classifyProperty('macroName')).toBe('sensitive');
      expect(classifyProperty('filePath')).toBe('sensitive');
      expect(classifyProperty('windowTitle')).toBe('sensitive');

      // Safe: timing, metrics, counters
      expect(classifyProperty('count')).toBe('safe');
      expect(classifyProperty('meanMs')).toBe('safe');
      expect(classifyProperty('medianMs')).toBe('safe');
      expect(classifyProperty('maxMs')).toBe('safe');
      expect(classifyProperty('runCount')).toBe('safe');
      expect(classifyProperty('cpuPercent')).toBe('safe');
      expect(classifyProperty('os')).toBe('safe');
      expect(classifyProperty('architecture')).toBe('safe');
    });

    it('validates privacy safety and detects forbidden tokens', () => {
      const unsafePayload = {
        timing: { count: 10, meanMs: 1.2 },
        events: [{ VirtualKey: 65, type: 'KeyDown' }],
      };

      const audit = validatePrivacySafety(unsafePayload);
      expect(audit.safe).toBe(false);
      expect(audit.violations.length).toBeGreaterThan(0);
      expect(audit.violations.some((v) => v.includes('VirtualKey'))).toBe(true);

      expect(() => assertPrivacySafe(unsafePayload)).toThrow(PrivacyViolationError);
    });

    it('sanitizes objects by stripping excluded and sensitive properties', () => {
      const source = {
        macroName: 'My Top Secret Macro',
        events: [{ VirtualKey: 65 }],
        text: 'Secret password',
        timing: {
          count: 5,
          meanMs: 2.1,
        },
      };

      const sanitized = sanitizeForDiagnostics(source) as Record<string, unknown>;
      expect(sanitized['macroName']).toBeUndefined();
      expect(sanitized['events']).toBeUndefined();
      expect(sanitized['text']).toBeUndefined();
      expect(sanitized['timing']).toBeDefined();
      expect(validatePrivacySafety(sanitized).safe).toBe(true);
    });

    it('creates diagnostic bundle summary conforming to legacy DiagnosticBundle structure', () => {
      const summary = createDiagnosticBundleSummary({
        timing: {
          count: 2,
          failed: 0,
          unconfirmed: 1,
          meanMs: 0.2,
          medianMs: 0.2,
          p95Ms: 0.3,
          p99Ms: 0.3,
          maxMs: 0.4,
        },
        appVersion: '1.0.0.0',
        os: 'Microsoft Windows NT 10.0.22631.0',
        runtime: '.NET 10.0.0',
        architecture: 'X64',
        generatedAt: '2026-09-11T05:00:00.000Z',
      });

      // Verification matching legacy test DiagnosticBundle_DoesNotContainMacroOrInputData
      const serialized = JSON.stringify(summary, null, 2);

      // Must contain privacy notice
      expect(serialized).toContain('privacy');
      expect(summary.privacy).toBe(PRIVACY_DISCLAIMER);

      // Must NOT contain any VirtualKey or MacroEvent tokens
      expect(serialized).not.toContain('VirtualKey');
      expect(serialized).not.toContain('MacroEvent');
      expect(serialized).not.toContain('ScanCode');
      expect(serialized).not.toContain('rawPayload');

      // Validates cleanly against privacy safety auditor
      expect(validatePrivacySafety(summary).safe).toBe(true);
    });
  });
});
