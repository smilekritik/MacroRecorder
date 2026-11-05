/**
 * Exporter types, format options, and contracts.
 */

import {
  type Guid,
  type ISODateTimeString,
  type Microseconds,
  type Milliseconds,
  type DispatchReceipt,
  type DispatchReceiptWire,
  type TimingSummary,
  type MacroDefinition,
  type MacroEvent,
  type HotkeyBinding,
  MacroExportFormat,
  MouseButton,
  WheelDirection,
  MacroEventType,
} from '../../../contracts/src/index.js';

import { type ResourcePeak } from '../../../domain/src/diagnostics/index.js';

export {
  MacroExportFormat,
  MouseButton,
  WheelDirection,
  MacroEventType,
  type Guid,
  type ISODateTimeString,
  type Microseconds,
  type Milliseconds,
  type DispatchReceipt,
  type DispatchReceiptWire,
  type TimingSummary,
  type MacroDefinition,
  type MacroEvent,
  type HotkeyBinding,
  type ResourcePeak,
};

/**
 * Options for exporting a macro to an AutoHotkey v2 script.
 */
export interface AutoHotkeyExportOptions {
  /** Line ending format for the script. Defaults to '\n' matching legacy exporter. */
  readonly lineEnding?: '\n' | '\r\n' | undefined;
  /** Custom application header comment. Defaults to 'Exported from Macro Recorder'. */
  readonly headerPrefix?: string | undefined;
}

/**
 * Options for exporting dispatch receipts to CSV.
 */
export interface DiagnosticsCsvExportOptions {
  /** Whether to prepend UTF-8 Byte Order Mark (BOM). Defaults to false. */
  readonly includeBom?: boolean | undefined;
  /** Line ending format. Defaults to '\r\n'. */
  readonly lineEnding?: '\r\n' | '\n' | undefined;
}

/**
 * Options for exporting dispatch receipts to JSON.
 */
export interface DiagnosticsJsonExportOptions {
  /** Number of indentation spaces. Defaults to 2. */
  readonly indent?: number | undefined;
  /** Whether to append a trailing newline. Defaults to true. */
  readonly trailingNewline?: boolean | undefined;
}

/**
 * Options for generating privacy-safe diagnostic bundles (.zip).
 */
export interface DiagnosticBundleOptions {
  /** Application version string. Defaults to '1.0.0.0'. */
  readonly appVersion?: string | undefined;
  /** Operating system description. */
  readonly os?: string | undefined;
  /** Runtime description (e.g. '.NET 10.0.0' or 'Node.js'). */
  readonly runtime?: string | undefined;
  /** Architecture string (e.g. 'X64', 'ARM64'). */
  readonly architecture?: string | undefined;
  /** ISO timestamp for summary generation. Defaults to current ISO date. */
  readonly generatedAt?: string | undefined;
  /** Custom privacy notice text. */
  readonly privacyDisclaimer?: string | undefined;
  /** Optional peak resource statistics sampled during playback. */
  readonly peak?: ResourcePeak | undefined;
  /** Deterministic fixed timestamp for ZIP archive entries (for bit-for-bit test repeatability). */
  readonly fixedDate?: Date | undefined;
}

/**
 * Options for exporting single macro to .mrmacro container.
 */
export interface MacroPackageExportOptions {
  /** Format version number. Defaults to 1. */
  readonly formatVersion?: number | undefined;
  /** Schema version number. Defaults to 12. */
  readonly macroSchemaVersion?: number | undefined;
  /** ISO creation timestamp. Defaults to current ISO date. */
  readonly createdAtUtc?: string | undefined;
  /** Source display DPI. Defaults to 96. */
  readonly sourceDpi?: number | undefined;
  /** Fixed timestamp for ZIP archive entries. */
  readonly fixedDate?: Date | undefined;
}

/**
 * Wire-compatible PascalCase timing summary.
 */
export interface TimingSummaryWire {
  readonly Count: number;
  readonly Failed: number;
  readonly Unconfirmed: number;
  readonly MeanMs: number;
  readonly MedianMs: number;
  readonly P95Ms: number;
  readonly P99Ms: number;
  readonly MaxMs: number;
}
