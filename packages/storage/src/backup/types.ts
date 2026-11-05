/**
 * Types and contracts for whole-library backup (.mrbackup) package container.
 */

import {
  BACKUP_FORMAT_ID,
  BACKUP_FORMAT_VERSION,
  LibraryBackupMode,
  MAXIMUM_BACKUP_MACROS,
  type LibraryBackupManifest,
  type LibraryBackupResult,
} from '../../../contracts/src/index.js';

export const BACKUP_EXTENSION = '.mrbackup';

export {
  BACKUP_FORMAT_ID,
  BACKUP_FORMAT_VERSION,
  MAXIMUM_BACKUP_MACROS,
  LibraryBackupMode,
  type LibraryBackupManifest,
  type LibraryBackupResult,
};

export interface ExportBackupOptions {
  /** Whether to include settings.json from settingsPath in the backup (default: false). */
  readonly includeSettings?: boolean | undefined;

  /** Absolute path to settings.json file to pack if includeSettings is true. */
  readonly settingsPath?: string | undefined;

  /** Custom created ISO timestamp (defaults to UtcNow). */
  readonly createdAtUtc?: string | undefined;

  /** Optional fixed date for deterministic ZIP archive headers. */
  readonly archiveDate?: Date | undefined;

  /** Cancellation signal. */
  readonly signal?: AbortSignal | undefined;
}

export interface ImportBackupOptions {
  /** Cancellation signal. */
  readonly signal?: AbortSignal | undefined;
}

export interface BackupMacroEntry {
  readonly name: string;
  readonly bytes: Buffer | Uint8Array;
}
