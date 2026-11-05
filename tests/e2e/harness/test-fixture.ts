/**
 * @macro-recorder/desktop - Development Fake Playwright Fixture
 * Exercises source-built UI and deterministic adapters. This harness is intentionally
 * excluded from packaged release acceptance.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test as base, expect, type Page, type ElectronApplication } from '@playwright/test';
import { _electron as electron } from '@playwright/test';
import { ensureE2EBundle } from './bundler.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface OpenSurfaceOptions {
  readonly theme?: 'dark' | 'light' | undefined;
  readonly lang?: 'en' | 'ru' | undefined;
  readonly params?: Readonly<Record<string, unknown>> | undefined;
}

export interface RootAppState {
  readonly isRecording: boolean;
  readonly isPlaying: boolean;
  readonly macrosCount: number;
  readonly macros: readonly any[];
  readonly heldKeys: readonly any[];
  readonly openWindows: readonly string[];
  readonly isMainWindowMinimized: boolean;
}

export interface AppTestContext {
  readonly app: ElectronApplication;
  readonly mainWindow: Page;
  readonly openSurface: (windowId: string, options?: OpenSurfaceOptions) => Promise<Page>;
  readonly closeSurface: (windowId: string) => Promise<boolean>;
  readonly getRootState: () => Promise<RootAppState>;
  readonly triggerEmergencyStop: (reason?: string) => Promise<any>;
  readonly releaseAllInputs: () => Promise<any>;
  readonly seedMacro: (macro: any) => Promise<boolean>;
  readonly simulateSleep: () => Promise<any>;
  readonly simulateRendererCrash: () => Promise<boolean>;
  readonly reloadRenderer: () => Promise<boolean>;
  readonly minimizeMain: () => Promise<boolean>;
  readonly restoreMain: () => Promise<boolean>;
  readonly evaluateMain: <R>(fn: (ctx: any, arg: any) => R | Promise<R>, arg?: any) => Promise<R>;
}

export const test = base.extend<{
  appContext: AppTestContext;
}>({
  appContext: async ({}, use) => {
    const workspaceRoot = path.resolve(__dirname, '../../..');
    const bundle = await ensureE2EBundle(workspaceRoot);

    const app = await electron.launch({
      args: [bundle.mainPath],
      env: {
        ...process.env,
        NODE_PATH: path.join(workspaceRoot, 'node_modules'),
        NODE_ENV: 'test',
      },
    });

    const mainWindow = await app.firstWindow();
    await mainWindow.waitForSelector('#root', { state: 'attached' });

    const openSurface = async (windowId: string, options: OpenSurfaceOptions = {}): Promise<Page> => {
      // Ensure any existing window with this ID is closed cleanly
      await app.evaluate(async (_, id) => {
        const wm = (globalThis as any).__MR_WINDOW_MANAGER__;
        if (wm) {
          wm.closeWindow(id);
          wm.getMainWindow()?.focus();
        }
      }, windowId);

      const windowPromise = app.waitForEvent('window');
      const queryParams: Record<string, unknown> = {
        theme: options.theme ?? 'dark',
        lang: options.lang ?? 'en',
        ...(options.params ?? {}),
      };

      await app.evaluate(
        async (_, { id, p }) => {
          const wm = (globalThis as any).__MR_WINDOW_MANAGER__;
          if (wm) {
            wm.openWindow(id, p);
          }
        },
        { id: windowId, p: queryParams },
      );

      const surfacePage = await windowPromise;
      await surfacePage.waitForSelector('#root', { state: 'attached' });
      return surfacePage;
    };

    const closeSurface = async (windowId: string): Promise<boolean> => {
      return app.evaluate(async (_, id) => {
        const wm = (globalThis as any).__MR_WINDOW_MANAGER__;
        if (wm) {
          const res = wm.closeWindow(id);
          try {
            wm.getMainWindow()?.focus();
          } catch {}
          return res;
        }
        return false;
      }, windowId);
    };

    const getRootState = async (): Promise<RootAppState> => {
      return app.evaluate(async () => {
        const root = (globalThis as any).__MR_APP_ROOT__;
        const wm = (globalThis as any).__MR_WINDOW_MANAGER__;
        return {
          isRecording: root.coordinators.recording.isRecording,
          isPlaying: root.coordinators.playback.getStatus().state === 'Playing',
          macrosCount: root.coordinators.library.getMacros().length,
          macros: root.coordinators.library.getMacros(),
          heldKeys: root.adapters.input.getHeldKeys?.() ?? [],
          openWindows: wm.getOpenWindowIds(),
          isMainWindowMinimized: wm.isMainWindowMinimized(),
        };
      });
    };

    const triggerEmergencyStop = async (reason = 'Test Emergency Stop'): Promise<any> => {
      return app.evaluate(async (_, stopReason) => {
        const root = (globalThis as any).__MR_APP_ROOT__;
        return root.emergencyStop(stopReason);
      }, reason);
    };

    const releaseAllInputs = async (): Promise<any> => {
      return app.evaluate(async () => {
        const root = (globalThis as any).__MR_APP_ROOT__;
        return root.adapters.input.releaseAll();
      });
    };

    const seedMacro = async (macro: any): Promise<boolean> => {
      return app.evaluate(async (_, m) => {
        const root = (globalThis as any).__MR_APP_ROOT__;
        await root.coordinators.library.saveMacro(m);
        root.coordinators.globalControl.refreshMacroHotkeys(root.coordinators.library.getMacros());
        return true;
      }, macro);
    };

    const simulateSleep = async (): Promise<any> => {
      return app.evaluate(async () => {
        const root = (globalThis as any).__MR_APP_ROOT__;
        return root.coordinators.shutdown.triggerEmergencyRelease('power_suspend');
      });
    };

    const simulateRendererCrash = async (): Promise<boolean> => {
      return app.evaluate(async () => {
        const wm = (globalThis as any).__MR_WINDOW_MANAGER__;
        const mainWin = wm.getMainWindow();
        if (mainWin) {
          mainWin.webContents.forcefullyCrashRenderer();
          return true;
        }
        return false;
      });
    };

    const reloadRenderer = async (): Promise<boolean> => {
      return app.evaluate(async () => {
        const wm = (globalThis as any).__MR_WINDOW_MANAGER__;
        const mainWin = wm.getMainWindow();
        if (mainWin) {
          mainWin.webContents.reload();
          return true;
        }
        return false;
      });
    };

    const minimizeMain = async (): Promise<boolean> => {
      return app.evaluate(async () => {
        const wm = (globalThis as any).__MR_WINDOW_MANAGER__;
        wm.minimizeMainWindow();
        return true;
      });
    };

    const restoreMain = async (): Promise<boolean> => {
      return app.evaluate(async () => {
        const wm = (globalThis as any).__MR_WINDOW_MANAGER__;
        wm.restoreMainWindow();
        return true;
      });
    };

    const evaluateMain = async <R>(
      fn: (ctx: any, arg: any) => R | Promise<R>,
      arg?: any,
    ): Promise<R> => {
      return app.evaluate(fn, arg);
    };

    await use({
      app,
      mainWindow,
      openSurface,
      closeSurface,
      getRootState,
      triggerEmergencyStop,
      releaseAllInputs,
      seedMacro,
      simulateSleep,
      simulateRendererCrash,
      reloadRenderer,
      minimizeMain,
      restoreMain,
      evaluateMain,
    });

    await app.close();
  },
});

export { expect };
