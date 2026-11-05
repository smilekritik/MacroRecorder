/**
 * Gamepad Driver Installer Extraction and Elevation Flow.
 *
 * Guarantees:
 * - Driver installation is NEVER silent (no /quiet or /s flags; UAC prompt and installer wizard always shown)
 * - Preserves decline / ask-later behavior with gamepadDriverPromptDismissed preference
 * - Extracts to temp directory and launches with RunAs elevation
 */

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { AppLog } from '../lifecycle/logging.js';
import type { DriverElevationResult, GamepadDriverType } from './types.js';

export interface DriverDiscoveryPath {
  readonly dir: string;
}

export class GamepadDriverInstaller {
  private static readonly DRIVER_FILES: Record<
    GamepadDriverType,
    { basePattern: string; tempName: string }
  > = {
    ViGEmBus: {
      basePattern: 'ViGEmBus',
      tempName: 'MacroRecorder-ViGEmBus-Setup.exe',
    },
    HidHide: {
      basePattern: 'HidHide',
      tempName: 'MacroRecorder-HidHide-Setup.exe',
    },
  };

  /**
   * Searches for a driver setup binary in adjacent directories, resources, or project root.
   */
  public static findInstallerFile(
    driver: GamepadDriverType,
    candidateDirs?: readonly string[],
  ): string | null {
    const info = this.DRIVER_FILES[driver];
    const searchDirs =
      candidateDirs && candidateDirs.length > 0
        ? candidateDirs
        : [
            path.join(process.cwd(), 'drivers'),
            path.join(process.cwd(), '..', 'drivers'),
            path.join(os.homedir(), '.macro-recorder', 'drivers'),
            ...(process.resourcesPath ? [path.join(process.resourcesPath, 'drivers')] : []),
          ];

    for (const dir of searchDirs) {
      if (!fs.existsSync(dir)) continue;

      try {
        const files = fs.readdirSync(dir);
        const match = files.find(
          (f) =>
            f.toLowerCase().startsWith(info.basePattern.toLowerCase()) &&
            f.toLowerCase().endsWith('.exe'),
        );
        if (match) {
          return path.join(dir, match);
        }
      } catch {
        // Directory read error ignored
      }
    }

    return null;
  }

  /**
   * True if an installer executable is found for the specified driver.
   */
  public static hasInstaller(
    driver: GamepadDriverType,
    candidateDirs?: readonly string[],
  ): boolean {
    return this.findInstallerFile(driver, candidateDirs) !== null;
  }

  /**
   * Extracts the installer executable to the OS temporary directory and launches it elevated.
   * NEVER silent: uses 'Verb RunAs' to trigger Windows UAC, and runs interactive installer.
   */
  public static async tryExtractAndRun(
    driver: GamepadDriverType,
    candidateDirs?: readonly string[],
    spawner?: (cmd: string, args: readonly string[]) => Promise<void>,
  ): Promise<DriverElevationResult> {
    const sourcePath = this.findInstallerFile(driver, candidateDirs);
    if (!sourcePath) {
      const errorMsg = 'The driver installer was not found next to the app (drivers folder).';
      AppLog.warn(errorMsg);
      return {
        success: false,
        processStarted: false,
        elevated: false,
        error: errorMsg,
      };
    }

    const info = this.DRIVER_FILES[driver];
    const tempDir = os.tmpdir();
    const tempTarget = path.join(tempDir, info.tempName);

    try {
      // 1. Copy to temp folder
      fs.copyFileSync(sourcePath, tempTarget);

      // 2. Launch elevated via PowerShell Start-Process -Verb RunAs (interactive, never silent)
      if (spawner) {
        await spawner(tempTarget, []);
      } else if (process.platform === 'win32') {
        const psCommand = `Start-Process -FilePath "${tempTarget}" -Verb RunAs`;
        const child = spawn(
          'powershell.exe',
          ['-NoProfile', '-NonInteractive', '-Command', psCommand],
          {
            detached: true,
            stdio: 'ignore',
          },
        );
        child.unref();
      }

      AppLog.info(`Driver installer launched with elevation: ${info.tempName}`);
      return {
        success: true,
        processStarted: true,
        elevated: true,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      AppLog.error(`Failed to launch driver installer: ${message}`);
      return {
        success: false,
        processStarted: false,
        elevated: false,
        error: message,
      };
    }
  }

  /**
   * Evaluates whether the proactive gamepad driver installation prompt should be shown.
   */
  public static shouldPromptUser(
    isDriverAvailable: boolean,
    isPromptDismissed: boolean,
    hasInstallerAvailable: boolean,
  ): boolean {
    // If the driver is already installed — nothing to offer
    if (isDriverAvailable) return false;
    // If user previously declined — do not ask again
    if (isPromptDismissed) return false;
    // If installer file is missing — cannot offer
    if (!hasInstallerAvailable) return false;

    return true;
  }
}
