/**
 * Windows Logon Autostart Management.
 * Configures HKCU\Software\Microsoft\Windows\CurrentVersion\Run with:
 * "executablePath" --minimized
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { AppLog } from '../lifecycle/logging.js';

const execFileAsync = promisify(execFile);

export const AUTOSTART_RUN_KEY = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run';
export const AUTOSTART_VALUE_NAME = 'MacroRecorder';

export type CommandExecutor = (
  command: string,
  args: readonly string[],
) => Promise<{ stdout: string; stderr: string }>;

export class WindowsAutostartManager {
  private readonly runKey: string;
  private readonly valueName: string;
  private readonly executor: CommandExecutor;

  constructor(
    runKey = AUTOSTART_RUN_KEY,
    valueName = AUTOSTART_VALUE_NAME,
    executor: CommandExecutor = (cmd, args) => execFileAsync(cmd, [...args]),
  ) {
    this.runKey = runKey;
    this.valueName = valueName;
    this.executor = executor;
  }

  /**
   * Checks if logon autostart is currently enabled in the registry.
   */
  public async isEnabled(): Promise<boolean> {
    if (process.platform !== 'win32') return false;

    try {
      const { stdout } = await this.executor('reg.exe', [
        'query',
        this.runKey,
        '/v',
        this.valueName,
      ]);
      return stdout.includes(this.valueName);
    } catch {
      return false;
    }
  }

  /**
   * Enables or disables logon autostart in the Windows Registry.
   * Format: "{executablePath}" --minimized
   */
  public async setEnabled(enabled: boolean, executablePath = process.execPath): Promise<boolean> {
    if (process.platform !== 'win32') return false;

    try {
      if (enabled) {
        const commandValue = `"${executablePath}" --minimized`;
        await this.executor('reg.exe', [
          'add',
          this.runKey,
          '/v',
          this.valueName,
          '/t',
          'REG_SZ',
          '/d',
          commandValue,
          '/f',
        ]);
        AppLog.info(`Autostart registered: ${commandValue}`);
        return true;
      } else {
        await this.executor('reg.exe', ['delete', this.runKey, '/v', this.valueName, '/f']);
        AppLog.info('Autostart unregistered from Run key');
        return true;
      }
    } catch (err) {
      // Deleting a non-existent key returns error code 1 in reg.exe — that is normal when disabling
      if (!enabled) {
        return true;
      }
      AppLog.warn(`Failed to set autostart: ${err instanceof Error ? err.message : String(err)}`);
      return false;
    }
  }
}

export const WindowsAutostart = new WindowsAutostartManager();
