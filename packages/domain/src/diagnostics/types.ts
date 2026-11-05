/**
 * Diagnostic domain contracts, time projection types, resource peaks,
 * run result aggregation, and privacy classifications.
 */

import {
  type Guid,
  type ISODateTimeString,
  type Microseconds,
  type Milliseconds,
  type DispatchReceipt,
  type DispatchReceiptWire,
  type TimingSummary,
  type RunHistoryEntry,
  type RunHistoryEntryWire,
} from '../../../contracts/src/index.js';

export type {
  Guid,
  ISODateTimeString,
  Microseconds,
  Milliseconds,
  DispatchReceipt,
  DispatchReceiptWire,
  TimingSummary,
  RunHistoryEntry,
  RunHistoryEntryWire,
};

/**
 * Status of hook confirmation for an injected dispatch action.
 */
export type HookConfirmationState = 'confirmed' | 'unconfirmed' | 'failed';

/**
 * Complete time projections for an action dispatch receipt.
 * Retains microsecond stored precision while exposing user-facing millisecond projections.
 */
export interface TimeProjection {
  readonly eventId: Guid;
  readonly authoredMicroseconds: Microseconds;
  readonly authoredMilliseconds: Milliseconds;
  readonly plannedMicroseconds: Microseconds;
  readonly plannedMilliseconds: Milliseconds;
  readonly scheduledMicroseconds: Microseconds;
  readonly scheduledMilliseconds: Milliseconds;
  readonly actualStartMicroseconds: Microseconds;
  readonly actualStartMilliseconds: Milliseconds;
  readonly actualEndMicroseconds: Microseconds;
  readonly actualEndMilliseconds: Milliseconds;
  readonly hookConfirmedMicroseconds: Microseconds | null;
  readonly hookConfirmedMilliseconds: Milliseconds | null;
  readonly dispatchDurationMicroseconds: Microseconds;
  readonly dispatchDurationMilliseconds: Milliseconds;
  readonly jitterMicroseconds: Microseconds;
  readonly jitterMilliseconds: Milliseconds;
  readonly confirmationLatencyMicroseconds: Microseconds | null;
  readonly confirmationLatencyMilliseconds: Milliseconds | null;
  readonly scheduledDisplayMilliseconds: string;
  readonly confirmationState: HookConfirmationState;
  readonly isConfirmed: boolean;
  readonly isSuccess: boolean;
  readonly error: string | null;
}

/**
 * Extended timing statistics including intermediate percentiles and standard deviation.
 */
export interface ExtendedTimingStatistics extends TimingSummary {
  readonly minMs: Milliseconds;
  readonly p50Ms: Milliseconds;
  readonly p75Ms: Milliseconds;
  readonly p90Ms: Milliseconds;
  readonly varianceMs: number;
  readonly standardDeviationMs: Milliseconds;
}

/**
 * Peak system and process resource load sampled during a macro execution.
 */
export interface ResourcePeak {
  readonly cpuPercent: number | null;
  readonly gpuPercent: number | null;
  readonly memoryPercent: number;
  readonly processMemoryMegabytes: number;
}

/**
 * Legacy type alias for ResourcePeak.
 */
export type LoadPeak = ResourcePeak;

/**
 * Wire-compatible serialization shape for ResourcePeak.
 */
export interface ResourcePeakWire {
  readonly CpuPercent?: number | null | undefined;
  readonly cpuPercent?: number | null | undefined;
  readonly GpuPercent?: number | null | undefined;
  readonly gpuPercent?: number | null | undefined;
  readonly MemoryPercent?: number | undefined;
  readonly memoryPercent?: number | undefined;
  readonly ProcessMemoryMegabytes?: number | undefined;
  readonly processMemoryMegabytes?: number | undefined;
}

/**
 * Single load sample captured at runtime.
 */
export interface SystemLoadSample {
  readonly cpuPercent: number | null;
  readonly gpuPercent: number | null;
  readonly memoryPercent: number;
  readonly processMemoryMegabytes: number;
  readonly timestamp?: number | undefined;
}

/**
 * Source of system performance counters; returns null if unavailable.
 */
export interface SystemLoadProbe {
  readonly cpuPercent: number | null;
  readonly gpuPercent: number | null;
  refresh(): void;
}

/**
 * Parameters for recording a single macro execution run in history.
 */
export interface RunHistoryRecordParams {
  readonly macroId: Guid;
  readonly macroName?: string | undefined;
  readonly receipts: readonly DispatchReceipt[];
  readonly activation: string;
  readonly durationMs: Milliseconds;
  readonly runAt?: ISODateTimeString | undefined;
}

/**
 * Result of an individual macro run.
 */
export interface RunResult {
  readonly macroId: Guid;
  readonly macroName?: string | undefined;
  readonly receipts: readonly DispatchReceipt[];
  readonly activation: string;
  readonly durationMs: Milliseconds;
  readonly startedAt?: ISODateTimeString | undefined;
  readonly completedAt?: ISODateTimeString | undefined;
  readonly peakLoad?: ResourcePeak | undefined;
  readonly success?: boolean | undefined;
}

/**
 * Options for formatting run history summary strings.
 */
export interface RunHistorySummaryFormatOptions {
  readonly locale?: string | undefined;
  readonly translate?: boolean | undefined;
}

/**
 * Privacy classification tiers for diagnostic and telemetry data.
 */
export type PrivacyClassification = 'safe' | 'sensitive' | 'excluded';

/**
 * Audit result verifying whether a payload complies with diagnostic privacy policies.
 */
export interface PrivacyAuditResult {
  readonly safe: boolean;
  readonly violations: readonly string[];
  readonly checkedPropertiesCount: number;
}

/**
 * Diagnostic bundle summary JSON structure.
 */
export interface DiagnosticBundleSummary {
  readonly generatedAt: ISODateTimeString;
  readonly appVersion: string;
  readonly os: string;
  readonly runtime: string;
  readonly architecture: string;
  readonly timing: TimingSummary;
  readonly peak?: ResourcePeak | undefined;
  readonly privacy: string;
}
