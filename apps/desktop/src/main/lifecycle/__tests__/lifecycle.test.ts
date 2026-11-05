import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { App, BrowserWindow, PowerMonitor } from 'electron';
import { AppResetManager } from '../app-reset.js';
import { CrashRecoveryCoordinator } from '../crash-recovery.js';
import { AppLogManager } from '../logging.js';
import { ShutdownCoordinator } from '../shutdown.js';
import {
  extractExternalFiles,
  isSupportedImportFile,
  SingleInstanceCoordinator,
} from '../single-instance.js';
import { StartupCoordinator } from '../startup.js';

describe('Lifecycle — Process Management & Logging', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = path.join(
      os.tmpdir(),
      `mr-test-lifecycle-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );
    fs.mkdirSync(testDir, { recursive: true });
  });

  describe('AppLog Diagnostics & 1 MiB Rotation', () => {
    it('creates log file and writes sanitized entries', () => {
      const logger = new AppLogManager();
      logger.configure(testDir);

      logger.info('First message');
      logger.warn('Second\nmessage\rwith newlines');

      expect(logger.filePath).toBe(path.join(testDir, 'macro-recorder.log'));
      expect(logger.directoryPath).toBe(testDir);

      const content = fs.readFileSync(logger.filePath!, 'utf-8');
      expect(content).toContain('[INFO] First message');
      expect(content).toContain('[WARN] Second message with newlines');
      expect(content).not.toContain('\r');
      expect(content.split('\n').filter((l) => l.trim().length > 0).length).toBe(2);
    });

    it('rotates to .log.old when file size reaches or exceeds 1 MiB', () => {
      const logger = new AppLogManager();
      logger.configure(testDir);
      const logFile = logger.filePath!;

      // Simulate a file slightly larger than 1 MiB (1,048,576 bytes)
      const largeData = 'A'.repeat(1_048_580);
      fs.writeFileSync(logFile, largeData, 'utf-8');

      // Next write should trigger rotation
      logger.info('Fresh message after rotation');

      const oldFile = `${logFile}.old`;
      expect(fs.existsSync(oldFile)).toBe(true);
      expect(fs.statSync(oldFile).size).toBeGreaterThanOrEqual(1_048_576);

      const newContent = fs.readFileSync(logFile, 'utf-8');
      expect(newContent).toContain('[INFO] Fresh message after rotation');
      expect(newContent.length).toBeLessThan(500);
    });

    it('overwrites previous .log.old on repeated rotation', () => {
      const logger = new AppLogManager();
      logger.configure(testDir);
      const logFile = logger.filePath!;
      const oldFile = `${logFile}.old`;

      fs.writeFileSync(oldFile, 'Ancient log', 'utf-8');
      fs.writeFileSync(logFile, 'B'.repeat(1_048_580), 'utf-8');

      logger.warn('Trigger next rotation');

      expect(fs.existsSync(oldFile)).toBe(true);
      const oldContent = fs.readFileSync(oldFile, 'utf-8');
      expect(oldContent).toContain('BBBB');
      expect(oldContent).not.toContain('Ancient log');
    });
  });

  describe('Single Instance & File Activation', () => {
    it('identifies supported file extensions (.mrmacro, .mrbackup, etc.)', () => {
      expect(isSupportedImportFile('test.mrmacro')).toBe(true);
      expect(isSupportedImportFile('test.mrbackup')).toBe(true);
      expect(isSupportedImportFile('my_macro.macro.json')).toBe(true);
      expect(isSupportedImportFile('script.ahk')).toBe(true);
      expect(isSupportedImportFile('config.xml')).toBe(true);
      expect(isSupportedImportFile('random.txt')).toBe(false);
      expect(isSupportedImportFile('app.exe')).toBe(false);
    });

    it('extracts, validates existence, and deduplicates external file arguments', () => {
      const existingMacro = path.join(testDir, 'sample.mrmacro');
      const existingBackup = path.join(testDir, 'library.mrbackup');
      fs.writeFileSync(existingMacro, 'macro data');
      fs.writeFileSync(existingBackup, 'backup data');

      const nonExistent = path.join(testDir, 'missing.mrmacro');

      const args = [
        '--minimized',
        existingMacro,
        nonExistent,
        '--other-flag',
        existingBackup,
        existingMacro, // duplicate
      ];

      const extracted = extractExternalFiles(args);
      expect(extracted).toHaveLength(2);
      expect(extracted[0]).toBe(path.resolve(existingMacro));
      expect(extracted[1]).toBe(path.resolve(existingBackup));
    });

    it('activates main window and forwards files via coordinator', () => {
      const mockWindow = {
        isDestroyed: vi.fn(() => false),
        isVisible: vi.fn(() => false),
        show: vi.fn(),
        setSkipTaskbar: vi.fn(),
        isMinimized: vi.fn(() => true),
        restore: vi.fn(),
        setAlwaysOnTop: vi.fn(),
        focus: vi.fn(),
      } as unknown as BrowserWindow;

      const receivedFiles: string[][] = [];
      const mockApp = {
        requestSingleInstanceLock: vi.fn(() => true),
        on: vi.fn(),
        getPath: vi.fn(() => testDir),
      } as unknown as App;

      const coordinator = new SingleInstanceCoordinator({
        appInstance: mockApp,
        getMainWindow: () => mockWindow,
        onFilesReceived: (files) => receivedFiles.push(files),
      });

      const hasLock = coordinator.initializeLock();
      expect(hasLock).toBe(true);
      expect(mockApp.requestSingleInstanceLock).toHaveBeenCalled();

      const existingMacro = path.join(testDir, 'sample.mrmacro');
      fs.writeFileSync(existingMacro, 'content');

      coordinator.handleIncomingArguments(['--other', existingMacro]);

      expect(mockWindow.show).toHaveBeenCalled();
      expect(mockWindow.setSkipTaskbar).toHaveBeenCalledWith(false);
      expect(mockWindow.restore).toHaveBeenCalled();
      expect(mockWindow.setAlwaysOnTop).toHaveBeenCalledWith(true);
      expect(mockWindow.setAlwaysOnTop).toHaveBeenCalledWith(false);
      expect(mockWindow.focus).toHaveBeenCalled();
      expect(receivedFiles).toEqual([[path.resolve(existingMacro)]]);

      coordinator.dispose();
    });

    it('buffers incoming files if handler is not yet registered and flushes later', () => {
      const mockWindow = {
        isDestroyed: vi.fn(() => false),
        isVisible: vi.fn(() => true),
        show: vi.fn(),
        setSkipTaskbar: vi.fn(),
        isMinimized: vi.fn(() => false),
        setAlwaysOnTop: vi.fn(),
        focus: vi.fn(),
      } as unknown as BrowserWindow;

      const mockApp = {
        requestSingleInstanceLock: vi.fn(() => true),
        on: vi.fn(),
        getPath: vi.fn(() => testDir),
      } as unknown as App;

      const coordinator = new SingleInstanceCoordinator({
        appInstance: mockApp,
        getMainWindow: () => mockWindow,
      });

      const file1 = path.join(testDir, 'one.mrmacro');
      fs.writeFileSync(file1, '1');
      coordinator.handleIncomingArguments([file1]);

      const flushed = coordinator.flushPendingFiles();
      expect(flushed).toEqual([path.resolve(file1)]);
      expect(coordinator.flushPendingFiles()).toEqual([]);

      coordinator.dispose();
    });
  });

  describe('Startup Orchestration & Startup-to-Tray', () => {
    it('detects --minimized flag case-insensitively', () => {
      const opts1 = StartupCoordinator.parseArgs(['node.exe', 'app.js', '--MINIMIZED']);
      expect(opts1.minimized).toBe(true);

      const opts2 = StartupCoordinator.parseArgs(['node.exe', 'app.js', '--minimized']);
      expect(opts2.minimized).toBe(true);

      const opts3 = StartupCoordinator.parseArgs(['node.exe', 'app.js']);
      expect(opts3.minimized).toBe(false);
    });

    it('configures window options to prevent window flash when launched with --minimized', () => {
      const minimizedOptions = StartupCoordinator.getWindowOptions(true, {
        width: 1400,
        height: 900,
      });
      expect(minimizedOptions.show).toBe(false);
      expect(minimizedOptions.skipTaskbar).toBe(true);

      const normalOptions = StartupCoordinator.getWindowOptions(false, {
        width: 1400,
        height: 900,
      });
      expect(normalOptions.show).toBe(true);
      expect(normalOptions.skipTaskbar).toBe(false);
    });

    it('filters startup-enabled macros according to rules', () => {
      const macros = [
        {
          id: '1',
          name: 'Enabled Regular',
          isEnabled: true,
          isAutomaticTrigger: false,
          eventCount: 5,
        },
        { id: '2', name: 'Disabled', isEnabled: false, isAutomaticTrigger: false, eventCount: 10 },
        {
          id: '3',
          name: 'Automatic Trigger',
          isEnabled: true,
          isAutomaticTrigger: true,
          eventCount: 3,
        },
        { id: '4', name: 'Empty Macro', isEnabled: true, isAutomaticTrigger: false, eventCount: 0 },
      ];

      const startupMacros = StartupCoordinator.selectStartupMacros(macros);
      expect(startupMacros).toHaveLength(1);
      expect(startupMacros[0]?.name).toBe('Enabled Regular');
    });

    it('seeds default sample macros on first run if library is empty', () => {
      const seeded = StartupCoordinator.seedFirstRunLibrary({
        libraryPath: testDir,
        defaultMacros: [{ name: 'Welcome Macro', content: '{"name":"Welcome"}' }],
      });
      expect(seeded).toBe(true);

      const macroFile = path.join(testDir, 'Macros', 'Welcome Macro.macro.json');
      expect(fs.existsSync(macroFile)).toBe(true);
      expect(fs.readFileSync(macroFile, 'utf-8')).toBe('{"name":"Welcome"}');

      // Second attempt should not re-seed non-empty library
      const reseeded = StartupCoordinator.seedFirstRunLibrary({
        libraryPath: testDir,
        defaultMacros: [{ name: 'Another', content: '{}' }],
      });
      expect(reseeded).toBe(false);
    });

    it('provides the two disabled sample macros', () => {
      const samples = StartupCoordinator.createDefaultSampleMacros();
      expect(samples).toHaveLength(2);
      const parsed = samples.map((sample) => JSON.parse(sample.content) as Record<string, unknown>);
      expect(parsed.map((macro) => macro['Name'])).toEqual([
        'Example - sequence with comments',
        'Example - colour trigger',
      ]);
      expect(parsed.every((macro) => macro['IsEnabled'] === false)).toBe(true);
      expect((parsed[0]?.['Events'] as unknown[]).length).toBeGreaterThan(0);
      expect((parsed[1]?.['Events'] as unknown[]).length).toBeGreaterThan(0);
    });

    it('copies legacy data once without modifying or overwriting source files', () => {
      const sourceRoot = path.join(testDir, 'legacy');
      const targetRoot = path.join(testDir, 'portable');
      fs.mkdirSync(path.join(sourceRoot, 'Macros'), { recursive: true });
      fs.mkdirSync(path.join(sourceRoot, 'Stats'), { recursive: true });
      fs.writeFileSync(path.join(sourceRoot, 'Macros', 'Legacy.macro.json'), '{"Name":"Legacy"}', 'utf8');
      fs.writeFileSync(path.join(sourceRoot, 'settings.json'), '{"Theme":"Dark"}', 'utf8');
      fs.writeFileSync(path.join(sourceRoot, 'Stats', 'run-history.json'), '[]', 'utf8');

      const first = StartupCoordinator.migrateLegacyData({ sourceRoot, targetRoot });
      expect(first.alreadyCompleted).toBe(false);
      expect(first.copiedFiles).toBe(3);
      expect(fs.readFileSync(path.join(sourceRoot, 'Macros', 'Legacy.macro.json'), 'utf8')).toBe('{"Name":"Legacy"}');
      expect(fs.existsSync(path.join(targetRoot, 'Macros', 'Legacy.macro.json'))).toBe(true);

      fs.writeFileSync(path.join(sourceRoot, 'settings.json'), '{"Theme":"Light"}', 'utf8');
      const second = StartupCoordinator.migrateLegacyData({ sourceRoot, targetRoot });
      expect(second.alreadyCompleted).toBe(true);
      expect(fs.readFileSync(path.join(targetRoot, 'settings.json'), 'utf8')).toBe('{"Theme":"Dark"}');
    });
  });

  describe('Shutdown Release Ordering & Universal Input Release', () => {
    it('executes hooks in strict priority order and invokes native input release', async () => {
      const callLog: string[] = [];

      const mockReleaseInputs = vi.fn(() => {
        callLog.push('release-inputs');
      });

      const mockEmergencyStop = vi.fn(() => {
        callLog.push('emergency-stop');
      });

      const coordinator = new ShutdownCoordinator({
        releaseInputsFn: mockReleaseInputs,
        emergencyStopFn: mockEmergencyStop,
      });

      // Register custom hook with intermediate priority
      coordinator.registerHook({
        id: 'custom-hardware-cleanup',
        description: 'Cleanup virtual devices',
        priority: 15,
        execute: () => {
          callLog.push('virtual-devices-clean');
        },
      });

      await coordinator.executeShutdown('user_exit');

      expect(callLog).toEqual(['emergency-stop', 'virtual-devices-clean', 'release-inputs']);
      expect(mockEmergencyStop).toHaveBeenCalled();
      expect(mockReleaseInputs).toHaveBeenCalled();
      expect(coordinator.isShutdownStarted).toBe(true);
    });

    it('triggers immediate synchronous input release on power suspend notification', () => {
      const mockReleaseInputs = vi.fn();
      const mockEmergencyStop = vi.fn();

      const listeners = new Map<string, () => void>();
      const mockPowerMonitor = {
        on: vi.fn((event: string, cb: () => void) => {
          listeners.set(event, cb);
        }),
      } as unknown as PowerMonitor;

      const coordinator = new ShutdownCoordinator({
        powerMonitorInstance: mockPowerMonitor,
        releaseInputsFn: mockReleaseInputs,
        emergencyStopFn: mockEmergencyStop,
      });

      expect(coordinator.isShutdownStarted).toBe(false);
      expect(mockPowerMonitor.on).toHaveBeenCalledWith('suspend', expect.any(Function));
      expect(mockPowerMonitor.on).toHaveBeenCalledWith('shutdown', expect.any(Function));

      // Trigger suspend event
      const suspendCb = listeners.get('suspend');
      expect(suspendCb).toBeDefined();
      suspendCb!();

      expect(mockEmergencyStop).toHaveBeenCalled();
      expect(mockReleaseInputs).toHaveBeenCalled();
    });
  });

  describe('Crash Recovery & Unexpected Renderer Exit Guarantee', () => {
    it('immediately releases inputs and stops playback when renderer crashes', () => {
      const mockReleaseInputs = vi.fn();
      const mockEmergencyStop = vi.fn();
      const mockCrashedCallback = vi.fn();

      const webContentsListeners = new Map<string, (e: unknown, details?: unknown) => void>();
      const mockWebContents = {
        on: vi.fn((event: string, listener: (e: unknown, details?: unknown) => void) => {
          webContentsListeners.set(event, listener);
        }),
      };

      const mockWindow = {
        isDestroyed: vi.fn(() => false),
        webContents: mockWebContents,
        reload: vi.fn(),
      } as unknown as BrowserWindow;

      const crashCoordinator = new CrashRecoveryCoordinator({
        releaseInputsFn: mockReleaseInputs,
        emergencyStopFn: mockEmergencyStop,
        onRendererCrashed: mockCrashedCallback,
      });

      crashCoordinator.monitorWindow(mockWindow);

      expect(mockWebContents.on).toHaveBeenCalledWith('render-process-gone', expect.any(Function));
      expect(mockWebContents.on).toHaveBeenCalledWith('unresponsive', expect.any(Function));

      // Simulate renderer crash
      const renderGoneCb = webContentsListeners.get('render-process-gone');
      expect(renderGoneCb).toBeDefined();
      renderGoneCb!({}, { reason: 'crashed', exitCode: 139 });

      // Core requirement verified: input release must fire immediately
      expect(mockEmergencyStop).toHaveBeenCalledTimes(1);
      expect(mockReleaseInputs).toHaveBeenCalledTimes(1);
      expect(mockCrashedCallback).toHaveBeenCalledTimes(1);

      const reports = crashCoordinator.getReports();
      expect(reports).toHaveLength(1);
      expect(reports[0]?.source).toBe('renderer');
      expect(reports[0]?.reason).toBe('crashed');
      expect(reports[0]?.exitCode).toBe(139);
    });

    it('releases inputs when renderer becomes unresponsive', () => {
      const mockReleaseInputs = vi.fn();
      const mockEmergencyStop = vi.fn();

      const webContentsListeners = new Map<string, (e: unknown, details?: unknown) => void>();
      const mockWebContents = {
        on: vi.fn((event: string, listener: (e: unknown, details?: unknown) => void) => {
          webContentsListeners.set(event, listener);
        }),
      };

      const mockWindow = {
        isDestroyed: vi.fn(() => false),
        webContents: mockWebContents,
      } as unknown as BrowserWindow;

      const crashCoordinator = new CrashRecoveryCoordinator({
        releaseInputsFn: mockReleaseInputs,
        emergencyStopFn: mockEmergencyStop,
      });

      crashCoordinator.monitorWindow(mockWindow);

      const unresponsiveCb = webContentsListeners.get('unresponsive');
      unresponsiveCb!({}, {});

      expect(mockReleaseInputs).toHaveBeenCalled();
    });
  });

  describe('Application Reset and Restart Flow', () => {
    it('aborts without action if not explicitly confirmed', async () => {
      const macrosDir = path.join(testDir, 'Macros');
      fs.mkdirSync(macrosDir, { recursive: true });
      fs.writeFileSync(path.join(macrosDir, 'test.macro.json'), '{}');

      const result = await AppResetManager.executeReset({
        confirmed: false,
        libraryPath: testDir,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('explicit confirmation required');
      expect(fs.existsSync(macrosDir)).toBe(true);
    });

    it('removes ONLY MacroRecorder-owned targets (Macros folder, autostart, settings.json)', async () => {
      const macrosDir = path.join(testDir, 'Macros');
      const otherUserFile = path.join(testDir, 'MyImportantNotes.txt');
      const settingsFile = path.join(testDir, 'settings.json');

      fs.mkdirSync(macrosDir, { recursive: true });
      fs.writeFileSync(path.join(macrosDir, 'macro1.macro.json'), '{}');
      fs.writeFileSync(otherUserFile, 'Preserve this file!');
      fs.writeFileSync(settingsFile, '{"theme":"Dark"}');

      const mockRemoveAutostart = vi.fn(async () => {});

      const result = await AppResetManager.executeReset({
        confirmed: true,
        libraryPath: testDir,
        preferencesPath: settingsFile,
        removeAutostart: mockRemoveAutostart,
      });

      expect(result.success).toBe(true);
      expect(result.autostartRemoved).toBe(true);
      expect(mockRemoveAutostart).toHaveBeenCalled();

      // Macros directory deleted
      expect(fs.existsSync(macrosDir)).toBe(false);
      // Settings file deleted
      expect(fs.existsSync(settingsFile)).toBe(false);
      // Unrelated user files in root path PRESERVED
      expect(fs.existsSync(otherUserFile)).toBe(true);
      expect(fs.readFileSync(otherUserFile, 'utf-8')).toBe('Preserve this file!');
    });
  });
});
