import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WindowsAutostartManager, AUTOSTART_RUN_KEY, AUTOSTART_VALUE_NAME } from '../autostart.js';
import { GamepadDriverInstaller } from '../driver-installer.js';
import { FileAssociationManager, FILE_ASSOCIATIONS } from '../file-associations.js';

describe('Windows Integration — Autostart, File Associations & Drivers', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = path.join(
      os.tmpdir(),
      `mr-test-win-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );
    fs.mkdirSync(testDir, { recursive: true });
  });

  describe('Windows Autostart (Registry Run key)', () => {
    it('checks whether autostart is enabled via reg.exe query', async () => {
      const mockExecutor = vi.fn(async (cmd: string, args: readonly string[]) => {
        expect(cmd).toBe('reg.exe');
        expect(args).toEqual(['query', AUTOSTART_RUN_KEY, '/v', AUTOSTART_VALUE_NAME]);
        return {
          stdout: `${AUTOSTART_VALUE_NAME}    REG_SZ    "C:\\App.exe" --minimized`,
          stderr: '',
        };
      });

      const autostart = new WindowsAutostartManager(
        AUTOSTART_RUN_KEY,
        AUTOSTART_VALUE_NAME,
        mockExecutor,
      );
      const isEnabled = await autostart.isEnabled();

      expect(isEnabled).toBe(true);
      expect(mockExecutor).toHaveBeenCalledTimes(1);
    });

    it('returns false when reg.exe query fails or value is missing', async () => {
      const mockExecutor = vi.fn(async () => {
        throw new Error(
          'ERROR: The system was unable to find the specified registry key or value.',
        );
      });

      const autostart = new WindowsAutostartManager(
        AUTOSTART_RUN_KEY,
        AUTOSTART_VALUE_NAME,
        mockExecutor,
      );
      const isEnabled = await autostart.isEnabled();

      expect(isEnabled).toBe(false);
    });

    it('registers autostart command with --minimized flag in registry', async () => {
      const recordedCommands: Array<{ cmd: string; args: readonly string[] }> = [];
      const mockExecutor = vi.fn(async (cmd: string, args: readonly string[]) => {
        recordedCommands.push({ cmd, args });
        return { stdout: 'The operation completed successfully.', stderr: '' };
      });

      const autostart = new WindowsAutostartManager(
        AUTOSTART_RUN_KEY,
        AUTOSTART_VALUE_NAME,
        mockExecutor,
      );
      const success = await autostart.setEnabled(
        true,
        'C:\\Program Files\\MacroRecorder\\MacroRecorder.exe',
      );

      expect(success).toBe(true);
      expect(recordedCommands).toHaveLength(1);
      expect(recordedCommands[0]?.cmd).toBe('reg.exe');
      expect(recordedCommands[0]?.args).toEqual([
        'add',
        AUTOSTART_RUN_KEY,
        '/v',
        AUTOSTART_VALUE_NAME,
        '/t',
        'REG_SZ',
        '/d',
        '"C:\\Program Files\\MacroRecorder\\MacroRecorder.exe" --minimized',
        '/f',
      ]);
    });

    it('removes autostart entry on disable', async () => {
      const recordedCommands: Array<{ cmd: string; args: readonly string[] }> = [];
      const mockExecutor = vi.fn(async (cmd: string, args: readonly string[]) => {
        recordedCommands.push({ cmd, args });
        return { stdout: '', stderr: '' };
      });

      const autostart = new WindowsAutostartManager(
        AUTOSTART_RUN_KEY,
        AUTOSTART_VALUE_NAME,
        mockExecutor,
      );
      const success = await autostart.setEnabled(false);

      expect(success).toBe(true);
      expect(recordedCommands).toHaveLength(1);
      expect(recordedCommands[0]?.args).toEqual([
        'delete',
        AUTOSTART_RUN_KEY,
        '/v',
        AUTOSTART_VALUE_NAME,
        '/f',
      ]);
    });
  });

  describe('File Associations (.mrmacro and .mrbackup)', () => {
    it('registers both .mrmacro and .mrbackup with DefaultIcon and open command', async () => {
      const executed: Array<{ cmd: string; args: readonly string[] }> = [];
      const mockExecutor = vi.fn(async (cmd: string, args: readonly string[]) => {
        executed.push({ cmd, args });
        return { stdout: '', stderr: '' };
      });

      const manager = new FileAssociationManager(mockExecutor);
      const fakeExe = 'C:\\MacroRecorder\\MacroRecorder.exe';

      const success = await manager.registerAll(fakeExe);
      expect(success).toBe(true);

      // Verify .mrmacro registered
      const mrmacroExt = executed.find((e) => e.args.includes('HKCU\\Software\\Classes\\.mrmacro'));
      expect(mrmacroExt).toBeDefined();

      const mrmacroProgId = executed.find((e) =>
        e.args.includes('HKCU\\Software\\Classes\\MacroRecorder.MacroPackage'),
      );
      expect(mrmacroProgId).toBeDefined();

      const mrmacroIcon = executed.find((e) =>
        e.args.includes('HKCU\\Software\\Classes\\MacroRecorder.MacroPackage\\DefaultIcon'),
      );
      expect(mrmacroIcon).toBeDefined();
      expect(mrmacroIcon?.args).toContain(`"${fakeExe}",0`);

      const mrmacroCmd = executed.find((e) =>
        e.args.includes(
          'HKCU\\Software\\Classes\\MacroRecorder.MacroPackage\\shell\\open\\command',
        ),
      );
      expect(mrmacroCmd).toBeDefined();
      expect(mrmacroCmd?.args).toContain(`"${fakeExe}" "%1"`);

      // Verify .mrbackup registered
      const mrbackupExt = executed.find((e) =>
        e.args.includes('HKCU\\Software\\Classes\\.mrbackup'),
      );
      expect(mrbackupExt).toBeDefined();

      const mrbackupProgId = executed.find((e) =>
        e.args.includes('HKCU\\Software\\Classes\\MacroRecorder.LibraryBackup'),
      );
      expect(mrbackupProgId).toBeDefined();

      const mrbackupIcon = executed.find((e) =>
        e.args.includes('HKCU\\Software\\Classes\\MacroRecorder.LibraryBackup\\DefaultIcon'),
      );
      expect(mrbackupIcon).toBeDefined();
      expect(mrbackupIcon?.args).toContain(`"${fakeExe}",0`);

      // Verify shell change notification triggered
      const shellNotify = executed.find(
        (e) => e.cmd === 'powershell.exe' && e.args.some((a) => a.includes('SHChangeNotify')),
      );
      expect(shellNotify).toBeDefined();
    });

    it('unregisters file association keys on cleanup', async () => {
      const executed: Array<{ cmd: string; args: readonly string[] }> = [];
      const mockExecutor = vi.fn(async (cmd: string, args: readonly string[]) => {
        executed.push({ cmd, args });
        return { stdout: '', stderr: '' };
      });

      const manager = new FileAssociationManager(mockExecutor);
      const success = await manager.unregisterAll();
      expect(success).toBe(true);

      for (const entry of FILE_ASSOCIATIONS) {
        expect(
          executed.some((e) => e.args.includes(`HKCU\\Software\\Classes\\${entry.extension}`)),
        ).toBe(true);
        expect(
          executed.some((e) => e.args.includes(`HKCU\\Software\\Classes\\${entry.progId}`)),
        ).toBe(true);
      }
    });
  });

  describe('Gamepad Driver Installer (Extraction, Non-Silent Elevation, Decline Policy)', () => {
    it('discovers ViGEmBus and HidHide setup binaries', () => {
      const driversDir = path.join(testDir, 'drivers');
      fs.mkdirSync(driversDir, { recursive: true });

      const vigemPath = path.join(driversDir, 'ViGEmBus_1.22.0_x64_x86_arm64.exe');
      const hidhidePath = path.join(driversDir, 'HidHide_1.5.230_x64.exe');

      fs.writeFileSync(vigemPath, 'fake vigem setup');
      fs.writeFileSync(hidhidePath, 'fake hidhide setup');

      expect(GamepadDriverInstaller.hasInstaller('ViGEmBus', [driversDir])).toBe(true);
      expect(GamepadDriverInstaller.hasInstaller('HidHide', [driversDir])).toBe(true);

      const foundVigem = GamepadDriverInstaller.findInstallerFile('ViGEmBus', [driversDir]);
      expect(foundVigem).toBe(vigemPath);

      const foundHidHide = GamepadDriverInstaller.findInstallerFile('HidHide', [driversDir]);
      expect(foundHidHide).toBe(hidhidePath);
    });

    it('extracts to temp folder and runs interactive elevated installation (never silent)', async () => {
      const driversDir = path.join(testDir, 'drivers');
      fs.mkdirSync(driversDir, { recursive: true });
      const vigemPath = path.join(driversDir, 'ViGEmBus_1.22.0_x64_x86_arm64.exe');
      fs.writeFileSync(vigemPath, 'binary data');

      let spawnedCmd: string | null = null;
      let spawnedArgs: readonly string[] = [];

      const mockSpawner = vi.fn(async (cmd: string, args: readonly string[]) => {
        spawnedCmd = cmd;
        spawnedArgs = args;
      });

      const result = await GamepadDriverInstaller.tryExtractAndRun(
        'ViGEmBus',
        [driversDir],
        mockSpawner,
      );

      expect(result.success).toBe(true);
      expect(result.processStarted).toBe(true);
      expect(result.elevated).toBe(true);

      const tempTarget = path.join(os.tmpdir(), 'MacroRecorder-ViGEmBus-Setup.exe');
      expect(fs.existsSync(tempTarget)).toBe(true);
      expect(fs.readFileSync(tempTarget, 'utf-8')).toBe('binary data');

      expect(mockSpawner).toHaveBeenCalled();
      expect(spawnedCmd).toBe(tempTarget);
      // Critical requirement: NEVER silent (no /quiet or /s flags)
      expect(spawnedArgs).not.toContain('/quiet');
      expect(spawnedArgs).not.toContain('/s');
      expect(spawnedArgs).not.toContain('/qn');
    });

    it('returns error when installer file is missing', async () => {
      const emptyDir = path.join(testDir, 'empty-drivers');
      fs.mkdirSync(emptyDir, { recursive: true });

      const result = await GamepadDriverInstaller.tryExtractAndRun('ViGEmBus', [emptyDir]);
      expect(result.success).toBe(false);
      expect(result.error).toContain('driver installer was not found');
    });

    it('enforces driver prompt decline and availability rules', () => {
      // 1. Driver already installed -> never prompt
      expect(GamepadDriverInstaller.shouldPromptUser(true, false, true)).toBe(false);

      // 2. User declined (prompt dismissed) -> never prompt
      expect(GamepadDriverInstaller.shouldPromptUser(false, true, true)).toBe(false);

      // 3. Installer missing -> cannot prompt
      expect(GamepadDriverInstaller.shouldPromptUser(false, false, false)).toBe(false);

      // 4. Driver not installed, prompt not dismissed, installer present -> PROMPT
      expect(GamepadDriverInstaller.shouldPromptUser(false, false, true)).toBe(true);
    });
  });
});
