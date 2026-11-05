/**
 * Diagnostics CSV exporter.
 *
 * Exports per-action dispatch receipts, timing, jitter, and hook confirmations to CSV.
 * Uses CRLF line endings and fixed 6-decimal-place float formatting.
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import { type DispatchReceipt, type DispatchReceiptWire } from '../../../contracts/src/index.js';

import { type DiagnosticsCsvExportOptions } from './types.js';

/**
 * Escapes a text string for CSV field output.
 * If null or empty, returns empty string. Otherwise surrounds with quotes and escapes inner quotes.
 */
export function escapeCsvField(text: string | null | undefined): string {
  if (text === null || text === undefined || text === '') {
    return '';
  }
  return `"${String(text).replaceAll('"', '""')}"`;
}

/**
 * Formats a number to 6 decimal places (matching F6 culture invariant).
 */
export function formatFloatF6(val: number | null | undefined): string {
  if (val === null || val === undefined || Number.isNaN(val)) {
    return '';
  }
  return val.toFixed(6);
}

/**
 * Exports dispatch receipts to CSV text.
 */
export function exportDiagnosticsCsv(
  receipts: readonly (DispatchReceipt | DispatchReceiptWire | Record<string, unknown>)[],
  options?: DiagnosticsCsvExportOptions,
): string {
  const lineEnding = options?.lineEnding ?? '\r\n';
  let output = `event_id,scheduled_us,planned_us,dispatch_start_us,dispatch_end_us,hook_confirmed_us,jitter_ms,confirmation_ms,success,error${lineEnding}`;

  for (const r of receipts) {
    const rec = r as Record<string, unknown>;
    const eventId = String(rec['eventId'] ?? rec['EventId'] ?? '');
    const scheduledUs = (rec['scheduledMicroseconds'] ??
      rec['ScheduledMicroseconds'] ??
      0) as number;
    const plannedUs = rec['plannedMicroseconds'] ?? rec['PlannedMicroseconds'];
    const startedUs = (rec['dispatchStartedMicroseconds'] ??
      rec['DispatchStartedMicroseconds'] ??
      0) as number;
    const completedUs = (rec['dispatchCompletedMicroseconds'] ??
      rec['DispatchCompletedMicroseconds'] ??
      0) as number;
    const hookUs = rec['hookConfirmedMicroseconds'] ?? rec['HookConfirmedMicroseconds'];
    const jitterMs = Number(
      rec['dispatchJitterMilliseconds'] ?? rec['DispatchJitterMilliseconds'] ?? 0,
    );
    const confMs = rec['confirmationMilliseconds'] ?? rec['ConfirmationMilliseconds'];
    const success = Boolean(rec['success'] ?? rec['Success'] ?? false);
    const error = (rec['error'] ?? rec['Error'] ?? null) as string | null;

    const plannedStr = plannedUs !== null && plannedUs !== undefined ? String(plannedUs) : '';
    const hookStr = hookUs !== null && hookUs !== undefined ? String(hookUs) : '';
    const jitterStr = formatFloatF6(jitterMs);
    const confStr = confMs !== null && confMs !== undefined ? formatFloatF6(Number(confMs)) : '';
    const successStr = success ? 'true' : 'false';
    const errorStr = escapeCsvField(error);

    output += `${eventId},${scheduledUs},${plannedStr},${startedUs},${completedUs},${hookStr},${jitterStr},${confStr},${successStr},${errorStr}${lineEnding}`;
  }

  return output;
}

/**
 * Writes exported diagnostics CSV to disk.
 */
export async function exportDiagnosticsCsvToFile(
  receipts: readonly (DispatchReceipt | DispatchReceiptWire | Record<string, unknown>)[],
  filePath: string,
  options?: DiagnosticsCsvExportOptions,
): Promise<void> {
  let content = exportDiagnosticsCsv(receipts, options);
  if (options?.includeBom) {
    content = '\uFEFF' + content;
  }
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, content, 'utf8');
}

export class DiagnosticsCsvExporter {
  public static export(
    receipts: readonly (DispatchReceipt | DispatchReceiptWire | Record<string, unknown>)[],
    options?: DiagnosticsCsvExportOptions,
  ): string {
    return exportDiagnosticsCsv(receipts, options);
  }

  public static async exportToFile(
    receipts: readonly (DispatchReceipt | DispatchReceiptWire | Record<string, unknown>)[],
    filePath: string,
    options?: DiagnosticsCsvExportOptions,
  ): Promise<void> {
    return exportDiagnosticsCsvToFile(receipts, filePath, options);
  }
}
