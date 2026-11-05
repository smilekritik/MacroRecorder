/**
 * Types and constants for portable macro (.mrmacro) package exchange.
 */

import type { MacroDefinition } from '../../../contracts/src/index.js';
import type { MacroLibraryStore } from '../library/library-store.js';

export const PORTABLE_EXTENSION = '.mrmacro';

export {
  PORTABLE_FORMAT_ID,
  PORTABLE_FORMAT_VERSION,
  MAXIMUM_PORTABLE_JSON_BYTES,
  MAXIMUM_MANIFEST_BYTES,
  MAXIMUM_EVENT_COUNT,
  type PortableMacroManifest,
} from '../../../contracts/src/index.js';

export interface ExportPortableOptions {
  /** Effective display DPI at export time (default: 96). */
  readonly currentDisplayDpi?: number | undefined;

  /** Creation timestamp in ISO format (defaults to UtcNow). */
  readonly createdAtUtc?: string | undefined;

  /** Whether to serialize the inner macro.json with PascalCase wire keys (default: false for camelCase per MRMACRO_FORMAT). */
  readonly pascalCase?: boolean | undefined;

  /** Optional fixed date for deterministic ZIP headers. */
  readonly archiveDate?: Date | undefined;

  /** Cancellation signal. */
  readonly signal?: AbortSignal | undefined;
}

export interface ImportPortableOptions {
  /** Optional library store to persist the imported macro into. */
  readonly store?: MacroLibraryStore | undefined;

  /** Target relative folder inside the library store (default: ''). */
  readonly targetFolder?: string | undefined;

  /** Current display DPI of the target system (defaults to store.currentDisplayDpi or 96). */
  readonly currentDisplayDpi?: number | undefined;

  /** Cancellation signal. */
  readonly signal?: AbortSignal | undefined;
}

export interface RescaleDpiResult {
  readonly rescaled: boolean;
  readonly macro: MacroDefinition;
}
