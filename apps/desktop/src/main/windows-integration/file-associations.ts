/**
 * Shell File Association Registration for .mrmacro and .mrbackup.
 * Registers HKCU\Software\Classes entries without requiring administrator privileges.
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { AppLog } from '../lifecycle/logging.js';
import type { CommandExecutor } from './autostart.js';
import type { FileAssociationEntry } from './types.js';

const execFileAsync = promisify(execFile);

export const FILE_ASSOCIATIONS: readonly FileAssociationEntry[] = [
  {
    extension: '.mrmacro',
    progId: 'MacroRecorder.MacroPackage',
    description: 'Macro Recorder macro',
    contentType: 'application/vnd.macrorecorder.macro',
  },
  {
    extension: '.mrbackup',
    progId: 'MacroRecorder.LibraryBackup',
    description: 'Macro Recorder library backup',
    contentType: 'application/vnd.macrorecorder.backup',
  },
];

export class FileAssociationManager {
  private readonly executor: CommandExecutor;

  constructor(executor: CommandExecutor = (cmd, args) => execFileAsync(cmd, [...args])) {
    this.executor = executor;
  }

  /**
   * Registers user-level shell associations and icon mappings for .mrmacro and .mrbackup.
   */
  public async registerAll(executablePath = process.execPath): Promise<boolean> {
    if (process.platform !== 'win32') return false;
    if (!executablePath || !executablePath.trim()) {
      throw new Error('Executable path is required for file association registration.');
    }

    try {
      for (const entry of FILE_ASSOCIATIONS) {
        await this.registerEntry(entry, executablePath);
      }

      await this.notifyShellAssociationChanged();
      AppLog.info('File associations registered for .mrmacro and .mrbackup');
      return true;
    } catch (err) {
      AppLog.warn(
        `Failed to register file associations: ${err instanceof Error ? err.message : String(err)}`,
      );
      return false;
    }
  }

  private async registerEntry(entry: FileAssociationEntry, executablePath: string): Promise<void> {
    const extKey = `HKCU\\Software\\Classes\\${entry.extension}`;
    const progKey = `HKCU\\Software\\Classes\\${entry.progId}`;

    // 1. Extension -> ProgId
    await this.executor('reg.exe', ['add', extKey, '/ve', '/d', entry.progId, '/f']);
    await this.executor('reg.exe', [
      'add',
      extKey,
      '/v',
      'Content Type',
      '/d',
      entry.contentType,
      '/f',
    ]);

    // 2. ProgId description
    await this.executor('reg.exe', ['add', progKey, '/ve', '/d', entry.description, '/f']);
    await this.executor('reg.exe', [
      'add',
      progKey,
      '/v',
      'FriendlyTypeName',
      '/d',
      entry.description,
      '/f',
    ]);

    // 3. Default icon
    await this.executor('reg.exe', [
      'add',
      `${progKey}\\DefaultIcon`,
      '/ve',
      '/d',
      `"${executablePath}",0`,
      '/f',
    ]);

    // 4. Shell open command
    await this.executor('reg.exe', [
      'add',
      `${progKey}\\shell\\open\\command`,
      '/ve',
      '/d',
      `"${executablePath}" "%1"`,
      '/f',
    ]);
  }

  /**
   * Unregisters file associations from HKCU\Software\Classes.
   */
  public async unregisterAll(): Promise<boolean> {
    if (process.platform !== 'win32') return false;

    try {
      for (const entry of FILE_ASSOCIATIONS) {
        try {
          await this.executor('reg.exe', [
            'delete',
            `HKCU\\Software\\Classes\\${entry.extension}`,
            '/f',
          ]);
        } catch {
          // Ignored if missing
        }

        try {
          await this.executor('reg.exe', [
            'delete',
            `HKCU\\Software\\Classes\\${entry.progId}`,
            '/f',
          ]);
        } catch {
          // Ignored if missing
        }
      }

      await this.notifyShellAssociationChanged();
      AppLog.info('File associations unregistered');
      return true;
    } catch (err) {
      AppLog.warn(
        `Failed to unregister file associations: ${err instanceof Error ? err.message : String(err)}`,
      );
      return false;
    }
  }

  /**
   * Triggers SHChangeNotify(SHCNE_ASSOCCHANGED = 0x08000000) to update Windows shell icons.
   */
  public async notifyShellAssociationChanged(): Promise<void> {
    if (process.platform !== 'win32') return;

    try {
      const psCommand =
        `$code = '[DllImport("shell32.dll")] public static extern void SHChangeNotify(uint id, uint flags, IntPtr item1, IntPtr item2);';` +
        `$type = Add-Type -MemberDefinition $code -Name ShellApi -Namespace Win32 -PassThru;` +
        `$type::SHChangeNotify(0x08000000, 0, [IntPtr]::Zero, [IntPtr]::Zero);`;

      await this.executor('powershell.exe', [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        psCommand,
      ]);
    } catch {
      // Best-effort cache refresh notification
    }
  }
}

export const WindowsFileAssociations = new FileAssociationManager();
