/**
 * Types and interfaces for Electron process lifecycle management.
 * Covers single-instance locking, second-instance activation, startup orchestration,
 * shutdown release ordering, crash recovery, and application reset.
 */

export interface StartupOptions {
  /** True if launched with --minimized flag */
  readonly minimized: boolean;
  /** Files passed on command line to open/import */
  readonly files: readonly string[];
  /** Whether this is detected as the first application run */
  readonly isFirstRun: boolean;
  /** Raw argv arguments */
  readonly rawArgs: readonly string[];
}

export type ShutdownReason =
  | 'user_exit'
  | 'os_session_ending'
  | 'power_suspend'
  | 'app_reset'
  | 'renderer_crash'
  | 'uncaught_fatal';

export interface ShutdownHook {
  readonly id: string;
  readonly description: string;
  readonly priority: number;
  readonly execute: (reason: ShutdownReason) => Promise<void> | void;
}

export interface CrashReport {
  readonly timestamp: string;
  readonly source: 'renderer' | 'main' | 'child_process';
  readonly reason: string;
  readonly exitCode?: number | undefined;
  readonly stack?: string | undefined;
  readonly recovered: boolean;
}

export interface AppResetOptions {
  /** Must be explicitly confirmed */
  readonly confirmed: boolean;
  /** Resolved root path to the macro library */
  readonly libraryPath: string;
  /** Path to preferences file (settings.json) */
  readonly preferencesPath?: string | undefined;
  /** Executable path for restarting */
  readonly executablePath?: string | undefined;
  /** Autostart cleaner callback */
  readonly removeAutostart?: () => Promise<void> | void;
}

export interface AppResetResult {
  readonly success: boolean;
  readonly deletedMacrosDir?: string | undefined;
  readonly deletedPreferencesFile?: string | undefined;
  readonly autostartRemoved: boolean;
  readonly error?: string | undefined;
}
