/**
 * Application reset and restart orchestration.
 * Strict rules:
 * - Requires explicit confirmation
 * - Removes ONLY resolved MacroRecorder-owned targets (the 'Macros/' subfolder, autostart registry, and settings.json)
 * - Releases the instance lock and spawns a delayed restart process after exiting
 */

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import type { App } from 'electron';
import { AppLog } from './logging.js';
import type { AppResetOptions, AppResetResult } from './types.js';

export class AppResetManager {
  /**
   * Performs the application reset operations.
   */
  public static async executeReset(options: AppResetOptions): Promise<AppResetResult> {
    // 1. Explicit confirmation requirement
    if (!options.confirmed) {
      return {
        success: false,
        autostartRemoved: false,
        error: 'Reset aborted: explicit confirmation required.',
      };
    }

    let deletedMacrosDir: string | undefined;
    let deletedPreferencesFile: string | undefined;
    let autostartRemoved = false;

    try {
      // 2. Remove ONLY resolved MacroRecorder-owned 'Macros/' directory
      const macrosDir = path.join(options.libraryPath, 'Macros');
      if (fs.existsSync(macrosDir)) {
        fs.rmSync(macrosDir, { recursive: true, force: true });
        deletedMacrosDir = macrosDir;
      }

      // 3. Remove Windows autostart entry if callback provided
      if (options.removeAutostart) {
        try {
          await options.removeAutostart();
          autostartRemoved = true;
        } catch (ex) {
          AppLog.warn(
            `Reset: autostart cleanup failed: ${ex instanceof Error ? ex.message : String(ex)}`,
          );
        }
      }

      // 4. Delete preferences file (settings.json)
      if (options.preferencesPath && fs.existsSync(options.preferencesPath)) {
        fs.unlinkSync(options.preferencesPath);
        deletedPreferencesFile = options.preferencesPath;
      }

      AppLog.info('Application data reset by user');
      return {
        success: true,
        deletedMacrosDir,
        deletedPreferencesFile,
        autostartRemoved,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      AppLog.error(`Application reset failed: ${message}`);
      return {
        success: false,
        autostartRemoved,
        error: message,
      };
    }
  }

  /**
   * Initiates delayed restart after releasing single-instance lock and terminating.
   * On Windows, launches cmd.exe with a 2-second timeout to allow the current process
   * to exit and release its instance mutex/lock before the new process starts.
   */
  public static restartAsFirstRun(
    appInstance?: App,
    executablePath?: string,
    releaseLockFn?: () => void,
  ): void {
    AppLog.info('Application reset to first run; restarting');

    // 1. Release instance lock if callback provided
    if (releaseLockFn) {
      try {
        releaseLockFn();
      } catch {
        // Ignored on restart
      }
    }

    const execPath =
      executablePath ?? (appInstance ? appInstance.getPath('exe') : process.execPath);

    // 2. Delayed start to let existing process fully release lock
    if (process.platform === 'win32' && execPath) {
      try {
        const cmdArgs = [
          '/c',
          'timeout',
          '/t',
          '2',
          '/nobreak',
          '>',
          'nul',
          '&',
          'start',
          '""',
          `"${execPath}"`,
        ];
        const child = spawn('cmd.exe', cmdArgs, {
          shell: true,
          detached: true,
          stdio: 'ignore',
          windowsHide: true,
        });
        child.unref();
      } catch (err) {
        AppLog.error(`Restart failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    } else if (appInstance) {
      try {
        appInstance.relaunch();
      } catch (err) {
        AppLog.error(`App relaunch failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    // 3. Exit current process
    if (appInstance) {
      appInstance.exit(0);
    }
  }
}
