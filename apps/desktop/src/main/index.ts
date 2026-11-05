/**
 * Production Main-Process Entry Point for Macro Recorder (Electron + Rust).
 *
 * Boots the application in production:
 * 1. Enforces single-instance lock and forwards command-line file activations.
 * 2. Initializes logging and sets up crash recovery.
 * 3. Dynamically loads the unpacked native Rust addon (macro_recorder_native.node).
 * 4. Determines storage mode (portable directory vs %LocalAppData%\MacroRecorder).
 * 5. Wires ApplicationRoot, WindowManager, TrayManager, and StartupCoordinator.
 * 6. Guarantees universal input release on normal exit, window closure, or crash.
 */

import { randomUUID } from 'node:crypto';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { app, dialog, Menu, nativeTheme, shell } from 'electron';

import { ApplicationRoot } from './application/composition-root.js';
import { WindowManager } from './windows/window-manager.js';
import { AppLog, StartupCoordinator, extractExternalFiles } from './lifecycle/index.js';
import { WindowsAutostart, WindowsFileAssociations } from './windows-integration/index.js';
import { configureWebContentsSecurity } from './ipc/security.js';
import { createSystemCommands } from './system-commands.js';
import { TrayManager } from './tray/tray-manager.js';
import { PreferencesStore } from '../../../../packages/storage/src/preferences/store.js';

interface NativeRuntimeModule {
  initializeNativeRuntime(callback: (payload: Record<string, unknown>) => void): void;
  shutdownNativeRuntime(): void;
  isNativeRuntimeRunning(): boolean;
}

let appRoot: ApplicationRoot | null = null;
let windowManager: WindowManager | null = null;
let tray: TrayManager | null = null;
let nativeRuntime: NativeRuntimeModule | null = null;
let isQuitting = false;

// The interface is plain 2D, so the GPU process would only cost memory (about 90 MB measured).
app.disableHardwareAcceleration();

// Pages stay inside the app; the footer's GitHub links open in the default browser.
app.on('web-contents-created', (_event, contents) => {
  configureWebContentsSecurity(contents, {
    allowDevServer: false,
    openExternal: (url) => void shell.openExternal(url),
  });
});

// 1. Single-instance enforcement
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  AppLog.info('Another instance of Macro Recorder is already running. Forwarding arguments and quitting.');
  app.quit();
} else {
  app.on('second-instance', async (_event, commandLine) => {
    AppLog.info(`Second instance triggered with args: ${commandLine.join(' ')}`);
    if (windowManager) {
      windowManager.restoreMainWindow();
      const files = extractExternalFiles(commandLine);
      if (files.length > 0 && appRoot) {
        for (const file of files) {
          try {
            AppLog.info(`Importing file from second instance activation: ${file}`);
            await appRoot.coordinators.importExport.importFile(file);
            appRoot.coordinators.globalControl.refreshMacroHotkeys(appRoot.coordinators.library.getMacros());
            appRoot.ipc.subscriptions.broadcast('library:changed', {});
          } catch (err) {
            AppLog.error(`Failed to import file ${file}: ${err}`);
          }
        }
      } else {
        windowManager.openWindow('AlreadyRunningWindow');
      }
    }
  });

  // 2. Addon Discovery & Loading
  function loadNativeAddon(): NativeRuntimeModule | null {
    const candidates = [
      process.resourcesPath ? path.join(process.resourcesPath, 'app.asar.unpacked', 'macro_recorder_native.node') : null,
      process.resourcesPath ? path.join(process.resourcesPath, 'macro_recorder_native.node') : null,
      path.join(__dirname, '..', 'app.asar.unpacked', 'macro_recorder_native.node'),
      path.join(__dirname, 'macro_recorder_native.node'),
      path.resolve(__dirname, '../../artifacts/native/target/release/macro_recorder_native.dll'),
      path.resolve(__dirname, '../../artifacts/native/macro_recorder_native.node'),
      path.resolve(process.cwd(), 'artifacts/native/target/release/macro_recorder_native.dll'),
      path.resolve(process.cwd(), 'artifacts/native/macro_recorder_native.node'),
    ].filter(Boolean) as string[];

    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) {
        try {
          // The addon's path is only known at run time, so it cannot be a static import.
          // eslint-disable-next-line @typescript-eslint/no-require-imports
          const addon = require(candidate) as NativeRuntimeModule;
          if (
            typeof addon.initializeNativeRuntime !== 'function' ||
            typeof addon.shutdownNativeRuntime !== 'function' ||
            typeof addon.isNativeRuntimeRunning !== 'function'
          ) {
            throw new Error('Native addon does not expose the required runtime lifecycle');
          }
          (process as unknown as { addon?: unknown }).addon = addon;
          AppLog.info(`Successfully loaded native Rust addon from: ${candidate}`);
          return addon;
        } catch (err) {
          AppLog.warn(`Candidate addon at ${candidate} failed to load: ${err}`);
        }
      }
    }

    AppLog.error('Native addon not found in standard paths. Production startup cannot continue.');
    return null;
  }

  function routeNativeEvent(payload: Record<string, unknown>): void {
    const root = appRoot;
    if (!root || payload['isInjected'] === true) return;

    const timestamp = typeof payload['timestampMicroseconds'] === 'number'
      ? payload['timestampMicroseconds']
      : undefined;
    const kind = String(payload['kind'] ?? '');

    // Binds, the emergency stop, and gamepad input arrive through the engine's own channel.
    if (kind === 'keyboardHook') {
      const eventType = String(payload['eventType'] ?? '');
      if (eventType === 'KeyDown' || eventType === 'KeyUp') {
        root.coordinators.recording.addEvent({
          id: randomUUID(),
          type: eventType,
          eventType,
          device: 'Keyboard',
          comment: '',
          timeMicroseconds: 0,
          virtualKey: Number(payload['virtualKey'] ?? 0),
          scanCode: Number(payload['scanCode'] ?? 0),
          extended: Boolean(payload['extended']),
        }, timestamp);
      }
      return;
    }

    if (kind === 'mouseHook') {
      const eventType = String(payload['eventType'] ?? '');
      root.coordinators.recording.addEvent({
        id: randomUUID(),
        type: eventType,
        eventType,
        device: 'Mouse',
        comment: '',
        timeMicroseconds: 0,
        button: String(payload['button'] ?? 'None'),
        wheelDelta: Number(payload['wheelDelta'] ?? 0),
      }, timestamp);
      return;
    }

    if (kind === 'rawInput') {
      const deltaX = Number(payload['deltaX'] ?? 0);
      const deltaY = Number(payload['deltaY'] ?? 0);
      // Raw Input also reports button-only packets, which carry no motion.
      if (deltaX === 0 && deltaY === 0) return;
      root.coordinators.recording.addEvent({
        id: randomUUID(),
        type: 'MouseMove',
        eventType: 'MouseMove',
        device: 'Mouse',
        comment: '',
        timeMicroseconds: 0,
        deltaX,
        deltaY,
        absoluteMove: false,
      }, timestamp);
    }
  }

  // 3. Application Lifecycle
  app.whenReady().then(async () => {
    AppLog.info('Macro Recorder starting up (Electron 34 + Rust Native Addon)...');

    nativeRuntime = loadNativeAddon();
    if (!nativeRuntime) {
      throw new Error('The required Macro Recorder native runtime is unavailable.');
    }

    // Storage path detection (Portable mode vs LocalAppData)
    const isPortableFlag = process.argv.some(arg => arg.toLowerCase() === '--portable');
    const portableMarker = path.join(path.dirname(process.execPath), 'portable.dat');
    const isPortable = isPortableFlag || fs.existsSync(portableMarker);

    const baseLibraryDir = isPortable
      ? path.join(path.dirname(process.execPath), 'Data')
      : path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'MacroRecorder');

    if (!fs.existsSync(baseLibraryDir)) {
      fs.mkdirSync(baseLibraryDir, { recursive: true });
    }

    const installedDataRoot = path.join(
      process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'),
      'MacroRecorder',
    );
    if (isPortable) {
      const migration = StartupCoordinator.migrateLegacyData({
        sourceRoot: installedDataRoot,
        targetRoot: baseLibraryDir,
      });
      AppLog.info(
        `Legacy data migration: copied=${migration.copiedFiles}, skipped=${migration.skippedFiles}, alreadyCompleted=${migration.alreadyCompleted}`,
      );
    }

    AppLog.configure(baseLibraryDir);
    Menu.setApplicationMenu(null);

    // A chosen library folder applies from startup, before anything reads the library.
    const isFirstRun = !fs.existsSync(path.join(baseLibraryDir, 'settings.json'));
    const startupPreferences = new PreferencesStore({ rootPath: baseLibraryDir }).load() as unknown as Record<string, unknown>;
    const configuredLibrary = String(startupPreferences['macroLibraryPath'] ?? '').trim();
    const libraryRoot = configuredLibrary || baseLibraryDir;
    fs.mkdirSync(libraryRoot, { recursive: true });

    // Seed the same two safe disabled examples as the application, but only
    // after migration and only when no user library exists.
    StartupCoordinator.seedFirstRunLibrary({
      libraryPath: libraryRoot,
      defaultMacros: StartupCoordinator.createDefaultSampleMacros(),
    });

    // Preload & Renderer resolution
    const preloadPath = path.join(__dirname, 'preload.cjs');
    const rendererHtmlPath = path.join(__dirname, 'index.html');

    // Window Manager
    windowManager = new WindowManager({
      preloadPath,
      rendererHtmlPath,
      iconPath: [
        path.join(process.resourcesPath || '', 'icon.ico'),
        path.join(__dirname, 'icon.ico'),
      ].find((candidate) => fs.existsSync(candidate)),
      onEmergencyStop: () => {
        if (appRoot) {
          appRoot.emergencyStop('Emergency stop via crash guard');
        }
      },
    });

    // Create the production composition. Tests use createWithFakes explicitly;
    // packaged builds never degrade into deterministic adapters or volatile stores.
    appRoot = ApplicationRoot.createDefault({
      appPath: baseLibraryDir,
      libraryPath: libraryRoot,
      adapters: {
        orchestrator: windowManager,
      },
      systemCommands: createSystemCommands({
        dataRoot: baseLibraryDir,
        libraryRoot,
        logFilePath: path.join(baseLibraryDir, 'macro-recorder.log'),
        savePreference: (partial) => {
          const settings = appRoot?.coordinators.settings;
          if (settings) settings.save({ ...settings.preferences, ...partial });
        },
        fitWindow: (windowId, height) => windowManager?.fitWindowToContent(windowId, height) ?? false,
        setMouseThrough: (windowId, ignore) => windowManager?.setWindowMouseThrough(windowId, ignore) ?? false,
        overlayReady: () => windowManager?.sendOverlayState(),
        openFirstRunWelcome: () => {
          windowManager?.closeWindow('FirstRunWindow');
          windowManager?.openWindow('WelcomeWindow');
        },
        keyInfo: (virtualKey) => {
          const addon = (process as unknown as { addon?: { getKeyScanInfo?: (vk: number) => { scanCode: number; extended: boolean } } }).addon;
          return addon?.getKeyScanInfo?.(virtualKey) ?? {};
        },
        probeHotkeys: (gestures) => {
          const addon = (process as unknown as { addon?: { probeHotkeyAvailability?: (list: readonly unknown[]) => boolean[] } }).addon;
          return addon?.probeHotkeyAvailability?.(gestures) ?? gestures.map(() => true);
        },
      }),
    });

    nativeRuntime.initializeNativeRuntime(routeNativeEvent);
    if (!nativeRuntime.isNativeRuntimeRunning()) {
      throw new Error('Native runtime initialization returned without an active runtime.');
    }

    await appRoot.initialize();

    // Interface preferences reach new windows before their first paint.
    const applyInterface = (preferences: Record<string, unknown>): void => {
      windowManager?.setInterfacePreferences(preferences);
      nativeTheme.themeSource = preferences['theme'] === 'Light' ? 'light' : 'dark';
      tray?.updateLanguage(String(preferences['languageCode'] ?? 'en'));
    };
    const settings = appRoot.coordinators.settings;
    applyInterface(settings.preferences);

    // Shell integration writes to the registry, so test copies of the app opt out.
    const integrateWithShell = !process.env['MACRO_RECORDER_NO_SHELL_INTEGRATION'];
    let appliedAutostart: boolean | null = null;
    const syncAutostart = (preferences: Record<string, unknown>): void => {
      const wanted = Boolean(preferences['startWithWindows']);
      if (!integrateWithShell || wanted === appliedAutostart) return;
      appliedAutostart = wanted;
      void WindowsAutostart.setEnabled(wanted).catch((err) => AppLog.warn(`Autostart update failed: ${err}`));
    };
    // A portable copy registers only on an explicit change, never just by being launched.
    if (isPortable) appliedAutostart = Boolean(settings.preferences['startWithWindows']);
    syncAutostart(settings.preferences);
    settings.onPreferencesChanged((preferences) => {
      applyInterface(preferences);
      syncAutostart(preferences);
    });
    if (integrateWithShell && !isPortable) {
      void WindowsFileAssociations.registerAll().catch((err) => AppLog.warn(`File association failed: ${err}`));
    }

    // The toolbar exists only during a recording, when the main window is out of the way.
    appRoot.coordinators.recording.onStateChange((status) => {
      if (status.isRecording || status.isPaused) windowManager?.openWindow('FloatingToolbarWindow');
      else windowManager?.closeWindow('FloatingToolbarWindow');
    });

    tray = new TrayManager({
      iconPath: [
        path.join(process.resourcesPath || '', 'icon.png'),
        path.join(__dirname, 'icon.png'),
        path.join(process.resourcesPath || '', 'icon.ico'),
        path.join(__dirname, 'icon.ico'),
      ].find((candidate) => fs.existsSync(candidate)),
      language: String(settings.preferences['languageCode'] ?? 'en'),
      callbacks: {
        onOpenMainWindow: () => windowManager?.restoreMainWindow(),
        onDisableAllMacros: async () => {
          const root = appRoot;
          if (!root) return;
          for (const macro of root.coordinators.library.getMacros()) {
            if (macro.isEnabled) await root.coordinators.library.saveMacro({ ...macro, isEnabled: false });
          }
          root.coordinators.globalControl.refreshMacroHotkeys(root.coordinators.library.getMacros());
          root.ipc.subscriptions.broadcast('library:changed', {});
        },
        onEmergencyStop: () => appRoot?.emergencyStop('Emergency stop via tray context menu'),
        // Through the window, so that unsaved edits can still cancel the exit.
        onExit: () => {
          windowManager?.restoreMainWindow();
          windowManager?.closeWindow('MainWindow');
        },
      },
    });
    tray.initialize();

    // Startup window creation
    const isMinimizedLaunch = process.argv.some(a => a.toLowerCase() === '--minimized');
    const mainWindow = windowManager.createMainWindow({
      minimized: isMinimizedLaunch,
      startHidden: isMinimizedLaunch,
    });
    // Minimizing goes to the tray, closing exits.
    mainWindow.on('minimize', () => {
      AppLog.info('Main window minimized; hiding it to the tray.');
      mainWindow.hide();
    });
    if (!isMinimizedLaunch) {
      // A launcher can ask for a minimized start, which would otherwise go straight to the tray.
      mainWindow.webContents.once('did-finish-load', () => {
        if (mainWindow.isDestroyed()) return;
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.show();
        mainWindow.focus();
        AppLog.info(`Main window shown (visible=${mainWindow.isVisible()}).`);
      });
    }
    // Unsaved edits make the page refuse to unload, which Electron does silently: without
    // this question the close button would simply appear to do nothing.
    mainWindow.webContents.on('will-prevent-unload', (event) => {
      if (process.env['MACRO_RECORDER_NO_SHELL_INTEGRATION']) {
        event.preventDefault();
        return;
      }
      const russian = settings.preferences['languageCode'] === 'ru';
      const choice = dialog.showMessageBoxSync(mainWindow, {
        type: 'warning',
        title: 'Macro Recorder',
        message: russian ? 'Есть несохранённые изменения' : 'You have unsaved changes',
        detail: russian
          ? 'Если закрыть сейчас, правки текущего макроса будут потеряны.'
          : 'Closing now discards the edits to the current macro.',
        buttons: russian ? ['Вернуться к редактированию', 'Закрыть без сохранения'] : ['Keep editing', 'Close without saving'],
        defaultId: 0,
        cancelId: 0,
        noLink: true,
      });
      if (choice === 1) event.preventDefault();
    });
    mainWindow.on('closed', () => {
      AppLog.info('Main window closed; exiting.');
      isQuitting = true;
      app.quit();
    });

    if (isFirstRun && !isMinimizedLaunch) {
      windowManager.openWindow('FirstRunWindow');
    }

    // Handle initial file arguments if provided
    const startupFiles = extractExternalFiles(process.argv);
    for (const f of startupFiles) {
      try {
        await appRoot.coordinators.importExport.importFile(f);
        appRoot.coordinators.globalControl.refreshMacroHotkeys(appRoot.coordinators.library.getMacros());
      } catch (err) {
        AppLog.error(`Failed to import startup file ${f}: ${err}`);
      }
    }

    AppLog.info('Macro Recorder initialization complete.');
  }).catch((error) => {
    AppLog.error(`Macro Recorder startup failed: ${String(error)}`);
    isQuitting = true;
    app.quit();
  });

  // Universal input release on quit
  app.on('before-quit', async () => {
    if (!isQuitting) {
      isQuitting = true;
      if (appRoot) {
        try {
          await appRoot.shutdown('user_exit');
        } catch (err) {
          AppLog.error(`Error during orderly shutdown: ${err}`);
        }
      }
      if (nativeRuntime?.isNativeRuntimeRunning()) {
        try {
          nativeRuntime.shutdownNativeRuntime();
        } catch (err) {
          AppLog.error(`Native runtime shutdown failed: ${String(err)}`);
        }
      }
      tray?.destroy();
      tray = null;
    }
  });

  app.on('window-all-closed', () => {
    // On Windows, closing the main window quits unless minimized to tray
    if (isQuitting || process.platform !== 'win32') {
      app.quit();
    }
  });
}
