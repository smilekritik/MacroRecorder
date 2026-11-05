/**
 * Importer types, interfaces, options, and results.
 */

import {
  MacroImportFormat,
  type ImportReport,
  type MacroDefinition,
  type MacroImportResult,
  type MacroImportWarning,
} from '../../../../packages/contracts/src/index.js';
import type { ImportProbe } from './probe.js';

export {
  MacroImportFormat,
  type ImportReport,
  type MacroDefinition,
  type MacroImportResult,
  type MacroImportWarning,
};

/**
 * Common importer interface for all third-party and native formats.
 */
export interface IMacroImporter {
  /** The format written into MacroImportResult.format. */
  readonly format: MacroImportFormat;

  /** Human-readable format name for open dialog and reports. */
  readonly displayName: string;

  /** Lower-case file extensions with leading dot (e.g. ['.ahk']). */
  readonly extensions: readonly string[];

  /**
   * Content-sniff priority: higher is checked earlier.
   * Specific formats (TinyTask 60, Razer 50, AMC 40) claim before greedy text sniffers.
   */
  readonly sniffPriority: number;

  /** Whether the probe looks like this format when extension gives no hint. */
  canHandle(probe: ImportProbe): boolean;

  /** Parses the probe content into one or more macros with warnings. */
  import(probe: ImportProbe, sourceName: string, options?: ImportOptions): MacroImportResult;
}

export interface ImportOptions {
  /** Target display DPI for coordinate rescaling (default 96). */
  readonly targetDpi?: number | undefined;

  /** Destination folder inside library. */
  readonly destinationFolder?: string | undefined;

  /** Whether to keep imported macros disabled (default true). */
  readonly isEnabled?: boolean | undefined;

  /** Already taken macro names in the destination library/folder. */
  readonly takenNames?: ReadonlySet<string> | undefined;
}

export interface BatchImportFileItem {
  readonly path: string;
  readonly content?: Uint8Array | string | undefined;
  readonly destinationFolder?: string | undefined;
}

export interface BatchImportOptions extends ImportOptions {
  readonly continueOnError?: boolean | undefined;
  readonly maxWarningsPerMacro?: number | undefined;
}

export interface BatchImportResult {
  readonly totalFiles: number;
  readonly successfulFiles: number;
  readonly failedFiles: number;
  readonly totalMacros: number;
  readonly totalActions: number;
  readonly results: readonly MacroImportResult[];
  readonly warnings: readonly MacroImportWarning[];
  readonly userSummary: string;
}
