/**
 * Unified Exporter Registry and Dispatcher.
 *
 * Implements format dispatching, file extension resolution, and dialog filter construction.
 * Covers through.
 */

import {
  MacroExportFormat,
  type MacroDefinition,
  type DispatchReceipt,
  type DispatchReceiptWire,
  type TimingSummary,
  type AutoHotkeyExportOptions,
  type DiagnosticsCsvExportOptions,
  type DiagnosticsJsonExportOptions,
  type DiagnosticBundleOptions,
  type MacroPackageExportOptions,
} from './types.js';

import { exportAutoHotkeyV2ToFile } from './autohotkey.js';
import { exportDiagnosticsCsvToFile } from './diagnostics-csv.js';
import { exportDiagnosticsJsonToFile } from './diagnostics-json.js';
import { createDiagnosticBundleFile } from './diagnostic-bundle.js';
import { exportNativeJsonToFile } from './native-json.js';
import { exportMacroPackageToFile } from './macro-package.js';

export interface ExporterDescriptor {
  readonly id: string;
  readonly format: MacroExportFormat;
  readonly extension: string;
  readonly description: string;
  readonly defaultFileName?: string | undefined;
}

export const EXPORTER_DESCRIPTORS: readonly ExporterDescriptor[] = [
  {
    id: 'REQ-EXP-001',
    format: MacroExportFormat.AutoHotkeyV2,
    extension: '.ahk',
    description: 'AutoHotkey v2 script (*.ahk)',
  },
  {
    id: 'REQ-EXP-002',
    format: MacroExportFormat.DiagnosticsCsv,
    extension: '.csv',
    description: 'Diagnostics CSV (*.csv)',
  },
  {
    id: 'REQ-EXP-003',
    format: MacroExportFormat.DiagnosticsJson,
    extension: '.json',
    description: 'Diagnostics JSON (*.json)',
  },
  {
    id: 'REQ-EXP-004',
    format: MacroExportFormat.DiagnosticBundle,
    extension: '.zip',
    description: 'Diagnostic bundle (*.zip)',
  },
  {
    id: 'REQ-EXP-005',
    format: MacroExportFormat.MacroPackage,
    extension: '.mrmacro',
    description: 'Macro Recorder package (*.mrmacro)',
  },
  {
    id: 'REQ-EXP-006',
    format: MacroExportFormat.NativeJson,
    extension: '.macro.json',
    description: 'Macro Recorder JSON (*.macro.json)',
  },
  {
    id: 'REQ-EXP-007',
    format: MacroExportFormat.LibraryBackup,
    extension: '.mrbackup',
    description: 'Macro Recorder backup package (*.mrbackup)',
  },
] as const;

/**
 * Returns the primary file extension for a given export format.
 */
export function getExtensionForFormat(format: MacroExportFormat): string {
  const descriptor = EXPORTER_DESCRIPTORS.find((d) => d.format === format);
  if (!descriptor) {
    throw new Error(`Unsupported export format: ${format}`);
  }
  return descriptor.extension;
}

/**
 * Infers export format from destination file path extension.
 */
export function inferExportFormatFromPath(filePath: string): MacroExportFormat | null {
  const lower = filePath.toLowerCase();
  if (lower.endsWith('.macro.json')) return MacroExportFormat.NativeJson;
  if (lower.endsWith('.ahk')) return MacroExportFormat.AutoHotkeyV2;
  if (lower.endsWith('.csv')) return MacroExportFormat.DiagnosticsCsv;
  if (lower.endsWith('.mrmacro')) return MacroExportFormat.MacroPackage;
  if (lower.endsWith('.mrbackup')) return MacroExportFormat.LibraryBackup;
  if (lower.endsWith('.zip')) return MacroExportFormat.DiagnosticBundle;
  if (lower.endsWith('.json')) return MacroExportFormat.DiagnosticsJson;
  return null;
}

/**
 * Dispatches macro export to the appropriate format exporter.
 */
export async function exportMacroToFile(params: {
  readonly macro: MacroDefinition | Record<string, unknown>;
  readonly format: MacroExportFormat;
  readonly destinationPath: string;
  readonly options?: unknown;
}): Promise<void> {
  const { macro, format, destinationPath, options } = params;

  switch (format) {
    case MacroExportFormat.AutoHotkeyV2:
      await exportAutoHotkeyV2ToFile(
        macro,
        destinationPath,
        options as AutoHotkeyExportOptions | undefined,
      );
      break;

    case MacroExportFormat.NativeJson:
      await exportNativeJsonToFile(macro, destinationPath);
      break;

    case MacroExportFormat.MacroPackage:
      await exportMacroPackageToFile(
        macro,
        destinationPath,
        options as MacroPackageExportOptions | undefined,
      );
      break;

    default:
      throw new Error(`Cannot export macro definition to non-macro format: ${format}`);
  }
}

/**
 * Dispatches diagnostics export to the appropriate format exporter.
 */
export async function exportDiagnosticsToFile(params: {
  readonly receipts: readonly (DispatchReceipt | DispatchReceiptWire | Record<string, unknown>)[];
  readonly format: MacroExportFormat;
  readonly destinationPath: string;
  readonly options?: unknown;
}): Promise<void> {
  const { receipts, format, destinationPath, options } = params;

  switch (format) {
    case MacroExportFormat.DiagnosticsCsv:
      await exportDiagnosticsCsvToFile(
        receipts,
        destinationPath,
        options as DiagnosticsCsvExportOptions | undefined,
      );
      break;

    case MacroExportFormat.DiagnosticsJson:
      await exportDiagnosticsJsonToFile(
        receipts,
        destinationPath,
        options as DiagnosticsJsonExportOptions | undefined,
      );
      break;

    default:
      throw new Error(`Cannot export diagnostics receipts to non-diagnostics format: ${format}`);
  }
}

/**
 * Dispatches diagnostic bundle creation to disk.
 */
export async function exportDiagnosticBundleToFile(params: {
  readonly timing: TimingSummary | Record<string, unknown>;
  readonly destinationPath: string;
  readonly options?: DiagnosticBundleOptions | undefined;
}): Promise<void> {
  await createDiagnosticBundleFile(params.destinationPath, params.timing, params.options);
}
