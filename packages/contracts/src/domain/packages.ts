/**
 * Portable exchange (.mrmacro) and whole-library backup (.mrbackup) packages.
 */

import { type ISODateTimeString } from '../common/types.js';
import {
  boolean,
  integer,
  literal,
  object,
  optional,
  string,
  type Schema,
} from '../common/validation.js';

export const PORTABLE_FORMAT_ID = 'macro-recorder/macro-package';
export const PORTABLE_FORMAT_VERSION = 1;
export const MAXIMUM_PORTABLE_JSON_BYTES = 50 * 1024 * 1024; // 50 MiB
export const MAXIMUM_MANIFEST_BYTES = 1024 * 1024; // 1 MiB
export const MAXIMUM_EVENT_COUNT = 1_000_000;

export interface PortableMacroManifest {
  readonly format: typeof PORTABLE_FORMAT_ID;
  readonly formatVersion: number;
  readonly macroSchemaVersion: number;
  readonly createdAtUtc: ISODateTimeString;
  readonly macroEntry: string;
  readonly macroSha256: string;
  readonly sourceDpi?: number | undefined;
}

export const portableMacroManifestSchema: Schema<PortableMacroManifest> = object({
  format: literal(PORTABLE_FORMAT_ID),
  formatVersion: integer({ min: 1, max: PORTABLE_FORMAT_VERSION }),
  macroSchemaVersion: integer({ min: 1, max: 12 }),
  createdAtUtc: string({ min: 1 }),
  macroEntry: string({ min: 1 }),
  macroSha256: string({ pattern: /^[0-9a-f]{64}$/ }),
  sourceDpi: optional(integer({ min: 48, max: 960 })),
});

export const BACKUP_FORMAT_ID = 'macro-recorder/library-backup';
export const BACKUP_FORMAT_VERSION = 1;
export const MAXIMUM_BACKUP_MACROS = 100_000;

export interface LibraryBackupManifest {
  readonly format: typeof BACKUP_FORMAT_ID;
  readonly formatVersion: number;
  readonly createdAtUtc: ISODateTimeString;
  readonly macroCount: number;
  readonly sha256: string;
  readonly includesSettings: boolean;
}

export const libraryBackupManifestSchema: Schema<LibraryBackupManifest> = object({
  format: literal(BACKUP_FORMAT_ID),
  formatVersion: integer({ min: 1, max: BACKUP_FORMAT_VERSION }),
  createdAtUtc: string({ min: 1 }),
  macroCount: integer({ min: 0, max: MAXIMUM_BACKUP_MACROS }),
  sha256: string({ min: 1 }),
  includesSettings: boolean(),
});

export interface LibraryBackupResult {
  readonly imported: number;
  readonly total: number;
}

export const libraryBackupResultSchema: Schema<LibraryBackupResult> = object({
  imported: integer({ min: 0 }),
  total: integer({ min: 0 }),
});
