/**
 * @macro-recorder/desktop - Development Fake Harness Bundler
 * Compiles source modules with deterministic adapters. Output from this helper is never
 * evidence that the packaged portable executable passed release acceptance.
 */

import fs from 'node:fs';
import path from 'node:path';
import esbuild from 'esbuild';

export interface BundleResult {
  readonly outDir: string;
  readonly mainPath: string;
  readonly preloadPath: string;
  readonly rendererPath: string;
  readonly htmlPath: string;
}

let cachedBundle: BundleResult | null = null;

export async function ensureE2EBundle(workspaceRoot: string, forceRebuild = false): Promise<BundleResult> {
  if (cachedBundle && !forceRebuild) {
    return cachedBundle;
  }

  const outDir = path.resolve(workspaceRoot, 'tests/e2e/.dist');
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  const mainOut = path.join(outDir, 'main.cjs');
  const preloadOut = path.join(outDir, 'preload.cjs');
  const rendererOut = path.join(outDir, 'renderer.js');
  const htmlOut = path.join(outDir, 'index.html');

  if (
    !forceRebuild &&
    fs.existsSync(mainOut) &&
    fs.existsSync(preloadOut) &&
    fs.existsSync(rendererOut) &&
    fs.existsSync(htmlOut)
  ) {
    cachedBundle = {
      outDir,
      mainPath: mainOut,
      preloadPath: preloadOut,
      rendererPath: rendererOut,
      htmlPath: htmlOut,
    };
    return cachedBundle;
  }

  // 1. Bundle Preload Script
  await esbuild.build({
    entryPoints: [path.join(workspaceRoot, 'apps/desktop/src/preload/index.ts')],
    bundle: true,
    outfile: preloadOut,
    format: 'cjs',
    platform: 'node',
    external: ['electron'],
    loader: { '.ts': 'ts' },
  });

  // 2. Generate and Bundle Electron Main Script
  const mainEntrySource = `
    const { app, BrowserWindow, ipcMain, screen, Tray, Menu } = require('electron');
    const path = require('path');
    const fs = require('fs');
    const os = require('os');

    const { ApplicationRoot } = require('${path.join(workspaceRoot, 'apps/desktop/src/main/application/composition-root.ts').replace(/\\/g, '/')}');
    const { WindowManager } = require('${path.join(workspaceRoot, 'apps/desktop/src/main/windows/window-manager.ts').replace(/\\/g, '/')}');
    const { StartupCoordinator } = require('${path.join(workspaceRoot, 'apps/desktop/src/main/lifecycle/startup.ts').replace(/\\/g, '/')}');

    let root;
    let windowManager;
    let tray = null;
    const isMinimizedLaunch = process.argv.some(a => a.toLowerCase() === '--minimized');
    const startupFiles = process.argv.filter(a => a.endsWith('.mrmacro') || a.endsWith('.macro.json'));

    app.whenReady().then(async () => {
      const preloadPath = path.join(__dirname, 'preload.cjs');
      const rendererHtmlPath = path.join(__dirname, 'index.html');

      windowManager = new WindowManager({
        preloadPath,
        rendererHtmlPath,
        onEmergencyStop: () => {
          if (root) root.emergencyStop('Emergency stop via crash guard');
        },
      });

      const origOpenWindow = windowManager.openWindow.bind(windowManager);
      windowManager.openWindow = (windowId, params) => {
        const res = origOpenWindow(windowId, params);
        const win = windowManager.getWindow(windowId);
        if (win && !win._mrClosedHookAttached) {
          win._mrClosedHookAttached = true;
          win.once('closed', () => {
            windowManager.auxiliaryWindows.delete(windowId);
            try {
              windowManager.focusManager?.removeWindow?.(win);
              windowManager.getMainWindow()?.focus?.();
            } catch {}
          });
        }
        return res;
      };

      root = ApplicationRoot.createWithFakes({
        adapters: {
          orchestrator: windowManager,
        },
      });
      await root.initialize();

      // Setup Tray if requested
      ipcMain.handle('test:createTray', async () => {
        if (!tray) {
          tray = {
            isDestroyed: () => false,
            destroy: () => { tray = null; },
          };
        }
        return true;
      });

      // Query root application state
      ipcMain.handle('test:getRootState', async () => {
        return {
          isRecording: root.coordinators.recording.isRecording,
          isPlaying: root.coordinators.playback.getStatus().state === 'Playing',
          macrosCount: root.coordinators.library.getMacros().length,
          macros: root.coordinators.library.getMacros(),
          heldKeys: root.adapters.input.getHeldKeys?.() ?? [],
          openWindows: windowManager.getOpenWindowIds(),
          isMainWindowMinimized: windowManager.isMainWindowMinimized(),
        };
      });

      // Open any surface by id
      ipcMain.handle('test:openSurface', async (_event, windowId, params) => {
        const success = windowManager.openWindow(windowId, params);
        const win = windowManager.getWindow(windowId);
        return { success, id: win ? win.id : null };
      });

      // Close a surface by id
      ipcMain.handle('test:closeSurface', async (_event, windowId) => {
        return windowManager.closeWindow(windowId);
      });

      // Emergency stop execution
      ipcMain.handle('test:triggerEmergencyStop', async (_event, reason) => {
        return root.emergencyStop(reason || 'Manual test emergency stop');
      });

      // Release all held inputs
      ipcMain.handle('test:releaseAll', async () => {
        return root.adapters.input.releaseAll();
      });

      // Simulate system sleep
      ipcMain.handle('test:simulateSleep', async () => {
        return root.coordinators.shutdown.triggerEmergencyRelease('power_suspend');
      });

      // Simulate renderer crash
      ipcMain.handle('test:simulateRendererCrash', async () => {
        const mainWin = windowManager.getMainWindow();
        if (mainWin) {
          mainWin.webContents.forcefullyCrashRenderer();
          return true;
        }
        return false;
      });

      // Simulate reload renderer
      ipcMain.handle('test:reloadRenderer', async () => {
        const mainWin = windowManager.getMainWindow();
        if (mainWin) {
          mainWin.webContents.reload();
          return true;
        }
        return false;
      });

      // Minimize main window
      ipcMain.handle('test:minimizeMain', async () => {
        windowManager.minimizeMainWindow();
        return true;
      });

      // Restore main window
      ipcMain.handle('test:restoreMain', async () => {
        windowManager.restoreMainWindow();
        return true;
      });

      // Save a macro directly into library coordinator
      ipcMain.handle('test:seedMacro', async (_event, macro) => {
        await root.coordinators.library.saveMacro(macro);
        root.coordinators.globalControl.refreshMacroHotkeys(root.coordinators.library.getMacros());
        return true;
      });

      // First run library seed helper
      ipcMain.handle('test:seedFirstRun', async (_event, targetPath) => {
        return StartupCoordinator.seedFirstRunLibrary({ libraryPath: targetPath });
      });

      // Forward file / second instance simulation
      ipcMain.handle('test:forwardFile', async (_event, filePath) => {
        windowManager.restoreMainWindow();
        return true;
      });

      // Create MainWindow
      const mainWin = windowManager.createMainWindow({
        minimized: isMinimizedLaunch,
        startHidden: isMinimizedLaunch,
      });

      // Expose globally for evaluate calls
      globalThis.__MR_APP_ROOT__ = root;
      globalThis.__MR_WINDOW_MANAGER__ = windowManager;
      globalThis.__MR_STARTUP__ = StartupCoordinator;
      globalThis.__MR_ELECTRON__ = { app, BrowserWindow, ipcMain, screen, Tray, Menu };
      globalThis.__MR_NODE__ = { fs, path, os };
    });
  `;

  const mainEntryFile = path.join(outDir, 'main-entry.cjs');
  fs.writeFileSync(mainEntryFile, mainEntrySource);

  await esbuild.build({
    entryPoints: [mainEntryFile],
    bundle: true,
    outfile: mainOut,
    format: 'cjs',
    platform: 'node',
    external: ['electron'],
    loader: { '.ts': 'ts', '.cjs': 'js' },
  });

  // 3. Generate and Bundle React Renderer Entry Script
  const rendererEntrySource = `
    import React from 'react';
    import { createRoot } from 'react-dom/client';
    import { App } from '${path.join(workspaceRoot, 'apps/desktop/src/renderer/app/App.tsx').replace(/\\/g, '/')}';

    const params = new URLSearchParams(window.location.search);
    const windowId = params.get('windowId') || 'MainWindow';
    const theme = (params.get('theme') || 'dark');
    const lang = (params.get('lang') || 'en');

    // Parse extra params
    const paramsOverride = {};
    for (const [k, v] of params.entries()) {
      if (k !== 'windowId' && k !== 'theme' && k !== 'lang') {
        paramsOverride[k] = v;
      }
    }

    const container = document.getElementById('root');
    if (container) {
      const root = createRoot(container);
      root.render(
        React.createElement(App, {
          initialLanguage: lang,
          initialTheme: theme,
          routeOverride: windowId,
          paramsOverride: Object.keys(paramsOverride).length > 0 ? paramsOverride : undefined,
        })
      );
    }
  `;
  const rendererEntryFile = path.join(outDir, 'renderer-entry.tsx');
  fs.writeFileSync(rendererEntryFile, rendererEntrySource);

  const nodeBuiltinShimPlugin = {
    name: 'node-builtins-shim',
    setup(build: esbuild.PluginBuild) {
      build.onResolve({ filter: /^(fs|path|node:fs|node:path)$/ }, (args) => {
        return { path: args.path, namespace: 'node-shim' };
      });
      build.onLoad({ filter: /.*/, namespace: 'node-shim' }, () => {
        return {
          contents: 'export default {}; export const join = (...args) => args.join("/"); export const resolve = (...args) => args.join("/");',
          loader: 'js',
        };
      });
    },
  };

  await esbuild.build({
    entryPoints: [rendererEntryFile],
    bundle: true,
    outfile: rendererOut,
    format: 'esm',
    platform: 'browser',
    plugins: [nodeBuiltinShimPlugin],
    alias: {
      'react': path.join(workspaceRoot, 'apps/desktop/node_modules/react'),
      'react-dom': path.join(workspaceRoot, 'apps/desktop/node_modules/react-dom'),
      'react/jsx-runtime': path.join(workspaceRoot, 'apps/desktop/node_modules/react/jsx-runtime'),
    },
    define: {
      'process.env.NODE_ENV': '"development"',
      'process.env': '{}',
      'process.argv': '[]',
      'process.platform': '"win32"',
      'process': '{"env":{},"argv":[],"platform":"win32"}',
      'global': 'window',
    },
    loader: { '.tsx': 'tsx', '.ts': 'ts', '.css': 'css' },
  });

  // 4. Generate HTML shell
  const themeCss = fs.readFileSync(
    path.join(workspaceRoot, 'apps/desktop/src/renderer/design-system/theme.css'),
    'utf-8',
  );

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Macro Recorder</title>
  <style>
    ${themeCss}
    * {
      box-sizing: border-box;
    }
    body {
      margin: 0;
      padding: 0;
      background: var(--color-window-bg, #1E1E1E);
      color: var(--color-text-primary, #ffffff);
      font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      overflow: hidden;
      user-select: none;
      width: 100vw;
      height: 100vh;
    }
    #root {
      width: 100%;
      height: 100%;
      display: flex;
      flex-direction: column;
    }
  </style>
</head>
<body>
  <div id="root"></div>
  <script type="module" src="./renderer.js"></script>
</body>
</html>`;

  fs.writeFileSync(htmlOut, html);

  cachedBundle = {
    outDir,
    mainPath: mainOut,
    preloadPath: preloadOut,
    rendererPath: rendererOut,
    htmlPath: htmlOut,
  };

  return cachedBundle;
}
