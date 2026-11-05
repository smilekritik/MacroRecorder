/**
 * Type definitions for atomic file write and recovery operations.
 */

export interface AtomicWriteOptions {
  /**
   * File encoding (default: 'utf-8').
   */
  readonly encoding?: BufferEncoding | undefined;

  /**
   * File mode/permissions.
   */
  readonly mode?: number | undefined;

  /**
   * Whether to maintain a recovery backup file (.bak) alongside the target file.
   * Default: true.
   */
  readonly backup?: boolean | undefined;

  /**
   * Whether to fsync the file before replacing target (default: true).
   */
  readonly fsync?: boolean | undefined;

  /**
   * Maximum number of retry attempts on Windows transient file lock errors (EBUSY/EPERM/EACCES).
   * Default: 5.
   */
  readonly maxRetries?: number | undefined;

  /**
   * Retry delay in milliseconds. Default: 20.
   */
  readonly retryDelayMs?: number | undefined;
}

export interface AtomicWriteJsonOptions extends AtomicWriteOptions {
  /**
   * Space indentation for JSON formatting (default: 2).
   */
  readonly spaces?: number | undefined;
}

export interface RecoveryResult {
  readonly recovered: boolean;
  readonly source?: 'backup' | 'temp' | undefined;
  readonly path: string;
  readonly error?: Error | undefined;
}
