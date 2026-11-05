import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WindowManager } from '../window-manager.js';
import { WINDOW_DEFINITIONS, getWindowDefinition, isKnownWindowId } from '../window-definitions.js';
import { DpiManager } from '../dpi-manager.js';
import { FocusManager } from '../focus-manager.js';
import { DwmThemingManager } from '../dwm-theming.js';
import type { WindowId } from '../types.js';

vi.mock('electron', () => ({
  BrowserWindow: vi.fn(),
  screen: {
    getPrimaryDisplay: () => ({ workArea: { x: 0, y: 0, width: 1920, height: 1080 } }),
    on: vi.fn(),
    removeListener: vi.fn(),
  },
}));

interface MockWebContents {
  readonly id: number;
  send: (channel: string, ...args: unknown[]) => void;
  on: (event: string, handler: (...args: any[]) => void) => void;
  once: (event: string, handler: (...args: any[]) => void) => void;
  emit: (event: string, ...args: unknown[]) => void;
  isDestroyed: () => boolean;
}

interface MockBrowserWindow {
  webContents: MockWebContents;
  isDestroyed: () => boolean;
  isVisible: () => boolean;
  isFocused: () => boolean;
  isMinimized: () => boolean;
  show: () => void;
  showInactive: () => void;
  hide: () => void;
  focus: () => void;
  minimize: () => void;
  restore: () => void;
  close: () => void;
  setSkipTaskbar: (skip: boolean) => void;
  setAlwaysOnTop: (top: boolean, level?: string) => void;
  setIgnoreMouseEvents: (ignore: boolean, options?: unknown) => void;
  setBackgroundColor: (color: string) => void;
  setTitleBarOverlay: (options: unknown) => void;
  getBounds: () => { x: number; y: number; width: number; height: number };
  setBounds: (bounds: { x: number; y: number; width: number; height: number }) => void;
  setPosition: (x: number, y: number, animate?: boolean) => void;
  loadURL: (url: string) => Promise<void>;
  loadFile: (path: string, options?: unknown) => Promise<void>;
  on: (event: string, handler: (...args: any[]) => void) => void;
  once: (event: string, handler: (...args: any[]) => void) => void;
  emit: (event: string, ...args: unknown[]) => void;
}

function createMockBrowserWindow(options: any = {}, id = 1): MockBrowserWindow {
  let destroyed = false;
  let visible = options.show !== false;
  let minimized = false;
  let bounds = {
    x: options.x ?? 0,
    y: options.y ?? 0,
    width: options.width ?? 800,
    height: options.height ?? 600,
  };
  const eventListeners = new Map<string, Array<(...args: any[]) => void>>();
  const webContentsListeners = new Map<string, Array<(...args: any[]) => void>>();

  const webContents: MockWebContents = {
    id,
    send: vi.fn(),
    on: (event, handler) => {
      const list = webContentsListeners.get(event) ?? [];
      list.push(handler);
      webContentsListeners.set(event, list);
    },
    once: (event, handler) => {
      const onceHandler = (...args: any[]) => {
        const list = webContentsListeners.get(event);
        if (list) {
          const idx = list.indexOf(onceHandler);
          if (idx !== -1) list.splice(idx, 1);
        }
        handler(...args);
      };
      const list = webContentsListeners.get(event) ?? [];
      list.push(onceHandler);
      webContentsListeners.set(event, list);
    },
    emit: (event, ...args) => {
      const list = webContentsListeners.get(event) ?? [];
      for (const h of [...list]) h(...args);
    },
    isDestroyed: () => destroyed,
  };

  const win: MockBrowserWindow = {
    webContents,
    isDestroyed: () => destroyed,
    isVisible: () => visible && !destroyed,
    isFocused: () => !destroyed,
    isMinimized: () => minimized && !destroyed,
    show: () => {
      visible = true;
      minimized = false;
      win.emit('show');
    },
    showInactive: () => {
      visible = true;
      win.emit('show');
    },
    hide: () => {
      visible = false;
      win.emit('hide');
    },
    focus: () => {
      win.emit('focus');
    },
    minimize: () => {
      minimized = true;
      win.emit('minimize');
    },
    restore: () => {
      minimized = false;
      win.emit('restore');
    },
    close: () => {
      destroyed = true;
      visible = false;
      win.emit('closed');
    },
    setSkipTaskbar: vi.fn(),
    setAlwaysOnTop: vi.fn(),
    setIgnoreMouseEvents: vi.fn(),
    setBackgroundColor: vi.fn(),
    setTitleBarOverlay: vi.fn(),
    getBounds: () => ({ ...bounds }),
    setBounds: (nextBounds) => {
      bounds = { ...nextBounds };
    },
    setPosition: (x, y) => {
      bounds = { ...bounds, x, y };
    },
    loadURL: vi.fn().mockResolvedValue(undefined),
    loadFile: vi.fn().mockResolvedValue(undefined),
    on: (event, handler) => {
      const list = eventListeners.get(event) ?? [];
      list.push(handler);
      eventListeners.set(event, list);
    },
    once: (event, handler) => {
      const onceHandler = (...args: any[]) => {
        const list = eventListeners.get(event);
        if (list) {
          const idx = list.indexOf(onceHandler);
          if (idx !== -1) list.splice(idx, 1);
        }
        handler(...args);
      };
      const list = eventListeners.get(event) ?? [];
      list.push(onceHandler);
      eventListeners.set(event, list);
    },
    emit: (event, ...args) => {
      const list = eventListeners.get(event) ?? [];
      for (const h of [...list]) h(...args);
    },
  };

  return win;
}

describe('WindowManager and Windows Subsystem', () => {
  let nextId = 1;
  let emergencyStopCount = 0;
  let lastEmergencyReason = '';
  let disposedSubscriptions: number[] = [];

  beforeEach(() => {
    nextId = 1;
    emergencyStopCount = 0;
    lastEmergencyReason = '';
    disposedSubscriptions = [];
  });

  function createTestManager(rendererUrl = 'http://localhost:5173') {
    return new WindowManager({
      windowFactory: (opts) => createMockBrowserWindow(opts, nextId++) as any,
      rendererUrl,
      onEmergencyStop: (reason) => {
        emergencyStopCount++;
        lastEmergencyReason = reason;
      },
      onDisposeSubscription: (id) => {
        disposedSubscriptions.push(id);
      },
    });
  }

  describe('Window Surfaces & Specifications', () => {
    it('defines all 20 legacy surfaces matching legacy_ui_catalog.json', () => {
      const surfaceKeys = Object.keys(WINDOW_DEFINITIONS);
      expect(surfaceKeys.length).toBe(20);

      const expectedSurfaces: WindowId[] = [
        'MainWindow',
        'BindMapWindow',
        'SettingsWindow',
        'FloatingToolbarWindow',
        'GamepadTesterWindow',
        'KeyCodeInspectorWindow',
        'PixelInspectorWindow',
        'PixelPickerWindow',
        'WindowInspectorWindow',
        'OverlayWindow',
        'OverlayPlacementWindow',
        'AddActionWindow',
        'AlreadyRunningWindow',
        'ChoiceWindow',
        'ConfirmDeleteWindow',
        'ConfirmImportWindow',
        'FirstRunWindow',
        'ImportReportWindow',
        'TextPromptWindow',
        'WelcomeWindow',
      ];

      for (const id of expectedSurfaces) {
        expect(isKnownWindowId(id)).toBe(true);
        const spec = getWindowDefinition(id);
        expect(spec).toBeDefined();
        expect(spec!.id).toBe(id);
        expect(spec!.width).toBeGreaterThan(0);
        expect(spec!.height).toBeGreaterThan(0);
        expect(spec!.legacyId).toMatch(/^UI-WIN-/);
      }
    });

    it('specifies exact geometry constraints for critical windows', () => {
      const mainSpec = WINDOW_DEFINITIONS.MainWindow;
      expect(mainSpec.width).toBe(1400);
      expect(mainSpec.height).toBe(900);
      expect(mainSpec.minWidth).toBe(1120);
      expect(mainSpec.minHeight).toBe(700);
      expect(mainSpec.resizable).toBe(true);

      const bindMapSpec = WINDOW_DEFINITIONS.BindMapWindow;
      expect(bindMapSpec.width).toBe(1480);
      expect(bindMapSpec.height).toBe(900);
      expect(bindMapSpec.topmost).toBe(true);

      const settingsSpec = WINDOW_DEFINITIONS.SettingsWindow;
      expect(settingsSpec.width).toBe(1010);
      expect(settingsSpec.height).toBe(900);

      const overlaySpec = WINDOW_DEFINITIONS.OverlayWindow;
      expect(overlaySpec.transparent).toBe(true);
      expect(overlaySpec.frame).toBe(false);
      expect(overlaySpec.clickThrough).toBe(true);
      expect(overlaySpec.focusable).toBe(false);
    });
  });

  describe('MainWindow Orchestration & Lifecycle', () => {
    it('creates MainWindow and centers on screen', () => {
      const manager = createTestManager();
      const mainWin = manager.createMainWindow();

      expect(mainWin).toBeDefined();
      expect(manager.getMainWindow()).toBe(mainWin);
      expect(manager.isWindowOpen('MainWindow')).toBe(true);
      expect(manager.isMainWindowMinimized()).toBe(false);

      expect((mainWin as any).loadURL).toHaveBeenCalledWith(
        expect.stringContaining('windowId=MainWindow'),
      );
    });

    it('handles --minimized startup flag without window flash', () => {
      const manager = createTestManager();
      const mainWin = manager.createMainWindow({ minimized: true }) as any;

      expect(manager.isMainWindowMinimized()).toBe(true);
      expect(mainWin.setSkipTaskbar).toHaveBeenCalledWith(true);
    });

    it('minimizes and restores main window properly', () => {
      const manager = createTestManager();
      const mainWin = manager.createMainWindow() as any;

      manager.minimizeMainWindow();
      expect(manager.isMainWindowMinimized()).toBe(true);

      manager.restoreMainWindow();
      expect(manager.isMainWindowMinimized()).toBe(false);
      expect(mainWin.isVisible()).toBe(true);
    });
  });

  describe('Auxiliary Windows & Singleton Policy', () => {
    it('opens auxiliary window and loads route with query parameters', () => {
      const manager = createTestManager();
      manager.createMainWindow();

      const opened = manager.openWindow('SettingsWindow', { section: 'Interface' });
      expect(opened).toBe(true);
      expect(manager.isWindowOpen('SettingsWindow')).toBe(true);

      const settingsWin = manager.getWindow('SettingsWindow') as any;
      expect(settingsWin).toBeDefined();
      expect(settingsWin.loadURL).toHaveBeenCalledWith(
        expect.stringMatching(/windowId=SettingsWindow.*section=Interface/),
      );
    });

    it('enforces singleton behavior: refocuses existing window rather than creating duplicate', () => {
      const manager = createTestManager();
      manager.createMainWindow();

      manager.openWindow('BindMapWindow');
      const firstWin = manager.getWindow('BindMapWindow') as any;
      const focusSpy = vi.spyOn(firstWin, 'focus');

      // Second open call
      manager.openWindow('BindMapWindow');
      expect(focusSpy).toHaveBeenCalled();
      expect(manager.getOpenWindowIds()).toContain('BindMapWindow');
      expect(manager.getOpenWindowIds().filter((id) => id === 'BindMapWindow').length).toBe(1);
    });

    it('closes window and removes from tracked list', () => {
      const manager = createTestManager();
      manager.createMainWindow();
      manager.openWindow('GamepadTesterWindow');

      expect(manager.isWindowOpen('GamepadTesterWindow')).toBe(true);
      const closed = manager.closeWindow('GamepadTesterWindow');
      expect(closed).toBe(true);
      expect(manager.isWindowOpen('GamepadTesterWindow')).toBe(false);
    });
  });

  describe('Overlay cards during playback', () => {
    it('does not bring a hidden main window back when the overlay closes', () => {
      const manager = createTestManager();
      const main = manager.createMainWindow() as any;
      main.hide();
      const showSpy = vi.spyOn(main, 'show');
      const card = {
        macroId: 'playing',
        macroName: 'Playing macro',
        state: 'Playing',
        visible: true,
        infoX: 1,
        infoY: 0,
        scalePercent: 100,
        transparencyPercent: 0,
      };

      manager.updateOverlay(card as any);
      const overlay = manager.getWindow('OverlayWindow') as any;
      expect(overlay.isVisible()).toBe(false);
      overlay.emit('ready-to-show');
      expect(overlay.isVisible()).toBe(true);
      overlay.close();

      expect(showSpy).not.toHaveBeenCalled();
      expect(main.isVisible()).toBe(false);
    });
  });

  describe('Settings overlay preview lifetime', () => {
    it('opens the preview with settings without waiting for renderer IPC', () => {
      const manager = createTestManager();

      manager.openWindow('SettingsWindow');
      (manager.getWindow('OverlayPlacementWindow') as any).emit('ready-to-show');

      expect(manager.isWindowOpen('OverlayPlacementWindow')).toBe(true);
    });

    it('stays hidden until the transparent page has painted', () => {
      const manager = createTestManager();

      manager.openWindow('SettingsWindow');

      const preview = manager.getWindow('OverlayPlacementWindow') as any;
      expect(preview.isVisible()).toBe(false);
      preview.emit('ready-to-show');
      expect(preview.isVisible()).toBe(true);
    });

    it('hides the preview while settings are not in use, without closing either', () => {
      const manager = createTestManager();
      manager.openWindow('SettingsWindow');
      const preview = manager.getWindow('OverlayPlacementWindow') as any;
      const settings = manager.getWindow('SettingsWindow') as any;
      preview.emit('ready-to-show');

      settings.emit('blur');
      expect(preview.isVisible()).toBe(false);
      expect(manager.getWindow('OverlayPlacementWindow')).toBe(preview);

      settings.emit('focus');
      expect(preview.isVisible()).toBe(true);
    });

    it('does not show the preview when settings lost focus before it loaded', () => {
      const manager = createTestManager();
      manager.openWindow('SettingsWindow');
      const preview = manager.getWindow('OverlayPlacementWindow') as any;
      const settings = manager.getWindow('SettingsWindow') as any;

      settings.isFocused = () => false;
      preview.emit('ready-to-show');

      expect(preview.isVisible()).toBe(false);
    });

    it.each(['native', 'ipc'] as const)(
      'closes the preview on %s settings closure while preserving playback',
      (source) => {
        const manager = createTestManager();
        manager.openWindow('SettingsWindow');
        manager.openWindow('OverlayPlacementWindow');
        manager.updateOverlay({
          macroId: 'playing',
          macroName: 'Playing macro',
          state: 'Playing',
          visible: true,
          infoX: 1,
          infoY: 0,
          scalePercent: 100,
          transparencyPercent: 0,
        });
        const playbackOverlay = manager.getWindow('OverlayWindow');
        const settings = manager.getWindow('SettingsWindow');

        if (source === 'native') settings?.close();
        else manager.closeWindow('SettingsWindow');

        expect([
          manager.getWindow('OverlayPlacementWindow'),
          manager.getWindow('OverlayWindow'),
        ]).toEqual([null, playbackOverlay]);
      },
    );

    it('rejects a delayed preview open request after settings have closed', () => {
      const manager = createTestManager();
      manager.openWindow('SettingsWindow');
      manager.closeWindow('SettingsWindow');

      expect(manager.openWindow('OverlayPlacementWindow')).toBe(false);
    });
  });

  describe('Focus Restoration Policy', () => {
    it('restores focus to previous window when auxiliary window closes', () => {
      const focusManager = new FocusManager();
      const win1 = createMockBrowserWindow({}, 1) as any;
      const win2 = createMockBrowserWindow({}, 2) as any;

      focusManager.recordFocus(win1);
      win1.focus();

      focusManager.recordFocus(win2);
      win2.focus();

      const focusSpy = vi.spyOn(win1, 'focus');
      focusManager.restoreFocusAfterClose(win2, null);

      expect(focusSpy).toHaveBeenCalled();
    });

    it('leaves a window hidden in the tray where it is', () => {
      const focusManager = new FocusManager();
      const hidden = createMockBrowserWindow({}, 1) as any;
      const closing = createMockBrowserWindow({}, 2) as any;
      focusManager.recordFocus(hidden);
      focusManager.recordFocus(closing);
      hidden.hide();

      const showSpy = vi.spyOn(hidden, 'show');
      focusManager.restoreFocusAfterClose(closing, null);

      expect(showSpy).not.toHaveBeenCalled();
    });

    it('prioritizes owner window if specified', () => {
      const focusManager = new FocusManager();
      const ownerWin = createMockBrowserWindow({}, 1) as any;
      const modalWin = createMockBrowserWindow({}, 2) as any;

      const ownerFocusSpy = vi.spyOn(ownerWin, 'focus');
      focusManager.restoreFocusAfterClose(modalWin, ownerWin);

      expect(ownerFocusSpy).toHaveBeenCalled();
    });
  });

  describe('Subscription Cleanup on Auxiliary Window Close', () => {
    it('disposes all registered subscriptions when a window closes', () => {
      const manager = createTestManager();
      manager.createMainWindow();
      manager.openWindow('KeyCodeInspectorWindow');

      const win = manager.getWindow('KeyCodeInspectorWindow') as any;
      const webContentsId = win.webContents.id;

      let disposedA = false;
      let disposedB = false;

      manager.subscriptionCleanup.registerDisposer(webContentsId, () => {
        disposedA = true;
      });
      manager.subscriptionCleanup.registerDisposer(webContentsId, () => {
        disposedB = true;
      });

      expect(manager.subscriptionCleanup.getActiveSubscriptionCount(webContentsId)).toBe(2);

      // Close window
      win.close();

      expect(disposedA).toBe(true);
      expect(disposedB).toBe(true);
      expect(manager.subscriptionCleanup.getActiveSubscriptionCount(webContentsId)).toBe(0);
      expect(disposedSubscriptions).toContain(webContentsId);
    });
  });

  describe('Renderer Crash Guard & Emergency Stop Guarantee', () => {
    it('triggers emergency release when renderer process crashes', () => {
      const manager = createTestManager();
      manager.createMainWindow();
      manager.openWindow('PixelInspectorWindow');

      const win = manager.getWindow('PixelInspectorWindow') as any;

      // Simulate renderer crash event
      win.webContents.emit('render-process-gone', {
        reason: 'crashed',
        exitCode: 139,
      });

      expect(emergencyStopCount).toBe(1);
      expect(lastEmergencyReason).toContain('crashed');
      expect(lastEmergencyReason).toContain('PixelInspectorWindow');
    });

    it('triggers emergency release when window hangs or becomes unresponsive', () => {
      const manager = createTestManager();
      const mainWin = manager.createMainWindow() as any;

      mainWin.emit('unresponsive');

      expect(emergencyStopCount).toBe(1);
      expect(lastEmergencyReason).toContain('unresponsive');
    });
  });

  describe('Cross-Window State Synchronization Broadcaster', () => {
    it('propagates theme, language, library, macro state, and hotkeys across all windows', () => {
      const manager = createTestManager();
      const mainWin = manager.createMainWindow() as any;
      manager.openWindow('SettingsWindow');
      const settingsWin = manager.getWindow('SettingsWindow') as any;

      // 1. Theme
      manager.broadcaster.broadcastTheme('dark');
      expect(mainWin.webContents.send).toHaveBeenCalledWith('theme:changed', { theme: 'dark' });
      expect(settingsWin.webContents.send).toHaveBeenCalledWith('theme:changed', { theme: 'dark' });

      // 2. Localization
      manager.broadcaster.broadcastLocalization('ru');
      expect(mainWin.webContents.send).toHaveBeenCalledWith('localization:changed', {
        language: 'ru',
      });
      expect(settingsWin.webContents.send).toHaveBeenCalledWith('localization:changed', {
        language: 'ru',
      });

      // 3. Library
      manager.broadcaster.broadcastLibraryUpdate('saved', 'macro-123');
      expect(mainWin.webContents.send).toHaveBeenCalledWith('library:updated', {
        reason: 'saved',
        macroId: 'macro-123',
      });

      // 4. Macro state
      manager.broadcaster.broadcastMacroState('Playing', 'macro-123', 'My Macro');
      expect(mainWin.webContents.send).toHaveBeenCalledWith('macro:state-changed', {
        engineState: 'Playing',
        macroId: 'macro-123',
        macroName: 'My Macro',
      });

      // 5. Hotkeys
      manager.broadcaster.broadcastHotkeys([{ id: 1, key: 'F5' }]);
      expect(mainWin.webContents.send).toHaveBeenCalledWith('hotkeys:updated', {
        hotkeys: [{ id: 1, key: 'F5' }],
      });
    });
  });

  describe('DPI Bounds Management', () => {
    it('clamps coordinates safely within work area boundaries', () => {
      const workArea = { x: 0, y: 0, width: 1920, height: 1080 };

      const inBounds = DpiManager.clampToBounds(100, 100, 500, 400, workArea);
      expect(inBounds).toEqual({ x: 100, y: 100 });

      // Off right / bottom
      const offRight = DpiManager.clampToBounds(2000, 1200, 500, 400, workArea);
      expect(offRight.x).toBe(1920 - 500);
      expect(offRight.y).toBe(1080 - 400);

      // Negative coordinates
      const negative = DpiManager.clampToBounds(-100, -50, 500, 400, workArea);
      expect(negative.x).toBe(0);
      expect(negative.y).toBe(0);
    });

    it('calculates center-screen coordinates correctly', () => {
      const coords = DpiManager.calculateCenterScreen(1000, 600, {
        workArea: { x: 0, y: 0, width: 1920, height: 1080 },
      } as any);

      expect(coords.x).toBe((1920 - 1000) / 2);
      expect(coords.y).toBe((1080 - 600) / 2);
    });
  });

  describe('DWM Theming Manager', () => {
    it('applies dark and light themes to windows', () => {
      const theming = new DwmThemingManager('dark');
      const win = createMockBrowserWindow({}, 1) as any;

      theming.setTheme('dark', [win]);
      expect(theming.getTheme()).toBe('dark');
      expect(win.setBackgroundColor).toHaveBeenCalledWith('#1E1E1E');

      theming.setTheme('light', [win]);
      expect(theming.getTheme()).toBe('light');
      expect(win.setBackgroundColor).toHaveBeenCalledWith('#FFFFFF');
    });
  });
});
