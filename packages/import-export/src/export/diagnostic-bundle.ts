/**
 * Privacy-safe diagnostic bundle (.zip) exporter.
 *
 * Creates a ZIP archive containing `summary.json` with execution environment,
 * timing summary metrics, and optional resource load peaks.
 *
 * Enforces strict zero-leakage guarantee: macro names, virtual keys, keystrokes,
 * and recorded events are excluded and validated via privacy safety assertions.
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import { type TimingSummary } from '../../../contracts/src/index.js';
import { PRIVACY_DISCLAIMER, assertPrivacySafe } from '../../../domain/src/diagnostics/index.js';

import { type DiagnosticBundleOptions, type TimingSummaryWire } from './types.js';
import { createZipArchive } from './zip-writer.js';

/**
 * Converts TimingSummary to PascalCase wire format.
 */
export function normalizeTimingSummaryToWire(
  timing: TimingSummary | Record<string, unknown>,
): TimingSummaryWire {
  const t = timing as Record<string, unknown>;
  const count = Number(t['count'] ?? t['Count'] ?? 0);
  const failed = Number(t['failed'] ?? t['Failed'] ?? 0);
  const unconfirmed = Number(t['unconfirmed'] ?? t['Unconfirmed'] ?? 0);
  const meanMs = Number(t['meanMs'] ?? t['MeanMs'] ?? 0);
  const medianMs = Number(t['medianMs'] ?? t['MedianMs'] ?? 0);
  const p95Ms = Number(t['p95Ms'] ?? t['P95Ms'] ?? 0);
  const p99Ms = Number(t['p99Ms'] ?? t['P99Ms'] ?? 0);
  const maxMs = Number(t['maxMs'] ?? t['MaxMs'] ?? 0);

  return {
    Count: count,
    Failed: failed,
    Unconfirmed: unconfirmed,
    MeanMs: meanMs,
    MedianMs: medianMs,
    P95Ms: p95Ms,
    P99Ms: p99Ms,
    MaxMs: maxMs,
  };
}

/**
 * Builds the privacy-safe diagnostic summary object.
 * Asserts zero forbidden tokens or user inputs are present.
 */
export function buildDiagnosticSummary(
  timing: TimingSummary | Record<string, unknown>,
  options?: DiagnosticBundleOptions,
): Record<string, unknown> {
  const generatedAt = options?.generatedAt ?? new Date().toISOString();
  const appVersion = options?.appVersion ?? '1.0.0.0';
  const os =
    options?.os ??
    (typeof process !== 'undefined'
      ? process.platform === 'win32'
        ? 'Microsoft Windows NT 10.0.22631.0'
        : `${process.platform} ${process.arch}`
      : 'Windows');
  const runtime =
    options?.runtime ??
    (typeof process !== 'undefined' ? `Node.js ${process.version}` : '.NET 10.0.0');
  const architecture =
    options?.architecture ?? (typeof process !== 'undefined' ? process.arch.toUpperCase() : 'X64');

  const timingWire = normalizeTimingSummaryToWire(timing);
  const privacy = options?.privacyDisclaimer ?? PRIVACY_DISCLAIMER;

  const summary: Record<string, unknown> = {
    generatedAt,
    appVersion,
    os,
    runtime,
    architecture,
    timing: timingWire,
    ...(options?.peak ? { peak: options.peak } : {}),
    privacy,
  };

  // Enforce zero-leakage guarantee
  assertPrivacySafe(summary);

  return summary;
}

/**
 * Creates an in-memory ZIP archive buffer containing the diagnostic bundle.
 */
export function createDiagnosticBundle(
  timing: TimingSummary | Record<string, unknown>,
  options?: DiagnosticBundleOptions,
): Buffer {
  const summaryObj = buildDiagnosticSummary(timing, options);
  const summaryJson = JSON.stringify(summaryObj, null, 2) + '\n';

  return createZipArchive(
    [
      {
        name: 'summary.json',
        data: Buffer.from(summaryJson, 'utf8'),
      },
    ],
    {
      fixedDate: options?.fixedDate,
      compress: true,
    },
  );
}

/**
 * Creates and writes a diagnostic bundle ZIP file to disk.
 */
export async function createDiagnosticBundleFile(
  filePath: string,
  timing: TimingSummary | Record<string, unknown>,
  options?: DiagnosticBundleOptions,
): Promise<void> {
  const buffer = createDiagnosticBundle(timing, options);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, buffer);
}

export class DiagnosticBundle {
  public static async create(
    filePath: string,
    timing: TimingSummary | Record<string, unknown>,
    options?: DiagnosticBundleOptions,
  ): Promise<void> {
    return createDiagnosticBundleFile(filePath, timing, options);
  }

  public static async Create(
    filePath: string,
    timing: TimingSummary | Record<string, unknown>,
    options?: DiagnosticBundleOptions,
  ): Promise<void> {
    return createDiagnosticBundleFile(filePath, timing, options);
  }
}
