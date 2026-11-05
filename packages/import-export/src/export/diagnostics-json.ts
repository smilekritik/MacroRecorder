/**
 * Diagnostics JSON exporter.
 *
 * Exports per-action dispatch receipts, jitter, and hook confirmations to indented JSON.
 * Preserves PascalCase property names and explicit nulls.
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import { type DispatchReceipt, type DispatchReceiptWire } from '../../../contracts/src/index.js';

import { type DiagnosticsJsonExportOptions } from './types.js';

/**
 * Normalizes a receipt into wire PascalCase representation with explicit nulls.
 */
export function normalizeReceiptToWire(
  r: DispatchReceipt | DispatchReceiptWire | Record<string, unknown>,
): Record<string, unknown> {
  const rec = r as Record<string, unknown>;
  const eventId = String(rec['eventId'] ?? rec['EventId'] ?? '');
  const scheduledUs = Number(rec['scheduledMicroseconds'] ?? rec['ScheduledMicroseconds'] ?? 0);
  const plannedUs = rec['plannedMicroseconds'] ?? rec['PlannedMicroseconds'] ?? null;
  const startedUs = Number(
    rec['dispatchStartedMicroseconds'] ?? rec['DispatchStartedMicroseconds'] ?? 0,
  );
  const completedUs = Number(
    rec['dispatchCompletedMicroseconds'] ?? rec['DispatchCompletedMicroseconds'] ?? 0,
  );
  const hookUs = rec['hookConfirmedMicroseconds'] ?? rec['HookConfirmedMicroseconds'] ?? null;
  const jitterMs = Number(
    rec['dispatchJitterMilliseconds'] ?? rec['DispatchJitterMilliseconds'] ?? 0,
  );
  const confMs = rec['confirmationMilliseconds'] ?? rec['ConfirmationMilliseconds'] ?? null;
  const success = Boolean(rec['success'] ?? rec['Success'] ?? false);
  const error = (rec['error'] ?? rec['Error'] ?? null) as string | null;

  return {
    EventId: eventId,
    ScheduledMicroseconds: scheduledUs,
    PlannedMicroseconds: plannedUs !== null && plannedUs !== undefined ? Number(plannedUs) : null,
    DispatchStartedMicroseconds: startedUs,
    DispatchCompletedMicroseconds: completedUs,
    HookConfirmedMicroseconds: hookUs !== null && hookUs !== undefined ? Number(hookUs) : null,
    DispatchJitterMilliseconds: jitterMs,
    ConfirmationMilliseconds: confMs !== null && confMs !== undefined ? Number(confMs) : null,
    Success: success,
    Error: error,
  };
}

/**
 * Exports dispatch receipts to JSON string.
 */
export function exportDiagnosticsJson(
  receipts: readonly (DispatchReceipt | DispatchReceiptWire | Record<string, unknown>)[],
  options?: DiagnosticsJsonExportOptions,
): string {
  const wireReceipts = receipts.map(normalizeReceiptToWire);
  const indent = options?.indent ?? 2;
  const trailingNewline = options?.trailingNewline ?? true;

  const json = JSON.stringify(wireReceipts, null, indent);
  return trailingNewline ? json + '\n' : json;
}

/**
 * Writes exported diagnostics JSON to disk.
 */
export async function exportDiagnosticsJsonToFile(
  receipts: readonly (DispatchReceipt | DispatchReceiptWire | Record<string, unknown>)[],
  filePath: string,
  options?: DiagnosticsJsonExportOptions,
): Promise<void> {
  const content = exportDiagnosticsJson(receipts, options);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, content, 'utf8');
}

export class DiagnosticsJsonExporter {
  public static export(
    receipts: readonly (DispatchReceipt | DispatchReceiptWire | Record<string, unknown>)[],
    options?: DiagnosticsJsonExportOptions,
  ): string {
    return exportDiagnosticsJson(receipts, options);
  }

  public static async exportToFile(
    receipts: readonly (DispatchReceipt | DispatchReceiptWire | Record<string, unknown>)[],
    filePath: string,
    options?: DiagnosticsJsonExportOptions,
  ): Promise<void> {
    return exportDiagnosticsJsonToFile(receipts, filePath, options);
  }
}
