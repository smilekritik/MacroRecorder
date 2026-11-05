/**
 * Types for macro library storage operations.
 */

import type { MacroDefinition } from '../../../contracts/src/index.js';

export interface LibraryStoreOptions {
  /**
   * Root directory of the library (defaults to %LocalAppData%/MacroRecorder).
   */
  readonly rootPath?: string | undefined;

  /**
   * Current display DPI (default: 96).
   */
  readonly currentDisplayDpi?: number | undefined;
}

export interface SaveMacroOptions {
  /**
   * Whether to update ModifiedAt timestamp (default: true).
   */
  readonly touchModified?: boolean | undefined;

  /**
   * Cancellation signal.
   */
  readonly signal?: AbortSignal | undefined;
}

export interface LoadMacroOptions {
  /**
   * Cancellation signal.
   */
  readonly signal?: AbortSignal | undefined;
}

export interface MacroImportWarning {
  readonly id?: string | null | undefined;
  readonly message: string;
}

export interface MacroImportResult {
  readonly format: string;
  readonly macros: readonly MacroDefinition[];
  readonly warnings: readonly MacroImportWarning[];
}

export interface FolderTreeInfo {
  readonly folders: readonly string[];
  readonly macroCounts: Readonly<Record<string, number>>;
}
