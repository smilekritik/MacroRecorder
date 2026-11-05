import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BrowserWindow, Menu, MenuItemConstructorOptions, Tray } from 'electron';
import { TrayManager } from '../tray-manager.js';
import { buildTrayMenuItems, getTrayString } from '../tray-menu.js';
import { WindowVisibilityManager } from '../window-visibility.js';

describe('Tray & Window Visibility Management', () => {
  describe('Tray Menu Structure & Localization', () => {
    it('returns localized strings for English and Russian', () => {
      expect(getTrayString('open', 'en')).toBe('Open Macro Recorder');
      expect(getTrayString('open', 'ru')).toBe('Открыть Macro Recorder');

      expect(getTrayString('emergencyStop', 'en', 'F10')).toBe('Emergency stop (F10)');
      expect(getTrayString('emergencyStop', 'ru', 'F10')).toBe('Аварийный стоп (F10)');

      expect(getTrayString('toolbar', 'en')).toBe('Floating toolbar');
      expect(getTrayString('toolbar', 'ru')).toBe('Плавающая панель');

      expect(getTrayString('exit', 'en')).toBe('Exit');
      expect(getTrayString('exit', 'ru')).toBe('Выход');
    });

    it('builds exact 7-item tray menu with correct click bindings', async () => {
      const onOpen = vi.fn();
      const onToggleToolbar = vi.fn();
      const onDisableAll = vi.fn(async () => {});
      const onEmergency = vi.fn();
      const onExit = vi.fn();

      const items = buildTrayMenuItems(
        {
          onOpenMainWindow: onOpen,
          onToggleFloatingToolbar: onToggleToolbar,
          onDisableAllMacros: onDisableAll,
          onEmergencyStop: onEmergency,
          onExit: onExit,
        },
        'F10',
        'en',
      );

      expect(items).toHaveLength(7);

      const dummyItem = {} as unknown as Electron.MenuItem;
      const dummyEvent = {} as unknown as Electron.KeyboardEvent;

      // Item 0: Open
      expect(items[0]?.label).toBe('Open Macro Recorder');
      items[0]?.click?.(dummyItem, undefined, dummyEvent);
      expect(onOpen).toHaveBeenCalledTimes(1);

      // Item 1: Separator
      expect(items[1]?.type).toBe('separator');

      // Item 2: Floating toolbar
      expect(items[2]?.label).toBe('Floating toolbar');
      items[2]?.click?.(dummyItem, undefined, dummyEvent);
      expect(onToggleToolbar).toHaveBeenCalledTimes(1);

      // Item 3: Disable all macros
      expect(items[3]?.label).toBe('Disable all macros');
      await items[3]?.click?.(dummyItem, undefined, dummyEvent);
      expect(onDisableAll).toHaveBeenCalledTimes(1);

      // Item 4: Emergency stop (F10)
      expect(items[4]?.label).toBe('Emergency stop (F10)');
      items[4]?.click?.(dummyItem, undefined, dummyEvent);
      expect(onEmergency).toHaveBeenCalledTimes(1);

      // Item 5: Separator
      expect(items[5]?.type).toBe('separator');

      // Item 6: Exit
      expect(items[6]?.label).toBe('Exit');
      items[6]?.click?.(dummyItem, undefined, dummyEvent);
      expect(onExit).toHaveBeenCalledTimes(1);
    });

    it('formats custom emergency stop hotkeys dynamically', () => {
      const items = buildTrayMenuItems(
        {
          onOpenMainWindow: vi.fn(),
          onEmergencyStop: vi.fn(),
          onExit: vi.fn(),
        },
        'Ctrl+Alt+F12',
        'en',
      );

      expect(items[4]?.label).toBe('Emergency stop (Ctrl+Alt+F12)');
    });
  });

  describe('TrayManager Life Cycle', () => {
    let mockTray: Tray;
    let trayListeners: Map<string, () => void>;

    beforeEach(() => {
      trayListeners = new Map();
      mockTray = {
        setToolTip: vi.fn(),
        setContextMenu: vi.fn(),
        on: vi.fn((event: string, cb: () => void) => {
          trayListeners.set(event, cb);
        }),
        destroy: vi.fn(),
      } as unknown as Tray;
    });

    it('initializes tray, sets tooltip, context menu, and click listeners', () => {
      const onOpen = vi.fn();
      const mockMenuBuilder = vi.fn(
        (items: MenuItemConstructorOptions[]) => items as unknown as Menu,
      );

      const manager = new TrayManager({
        callbacks: {
          onOpenMainWindow: onOpen,
          onEmergencyStop: vi.fn(),
          onExit: vi.fn(),
        },
        language: 'en',
        emergencyStopHotkey: 'F10',
        trayFactory: () => mockTray,
        menuBuilder: mockMenuBuilder,
      });

      manager.initialize();

      expect(mockTray.setToolTip).toHaveBeenCalledWith(
        'Macro Recorder — double-click to open the window',
      );
      expect(mockMenuBuilder).toHaveBeenCalled();
      expect(mockTray.setContextMenu).toHaveBeenCalled();

      // Double click opens main window
      const doubleClickCb = trayListeners.get('double-click');
      expect(doubleClickCb).toBeDefined();
      doubleClickCb!();
      expect(onOpen).toHaveBeenCalledTimes(1);

      // Single click also opens main window
      const clickCb = trayListeners.get('click');
      expect(clickCb).toBeDefined();
      clickCb!();
      expect(onOpen).toHaveBeenCalledTimes(2);

      manager.destroy();
      expect(mockTray.destroy).toHaveBeenCalled();
    });

    it('updates emergency hotkey and language dynamically', () => {
      const mockMenuBuilder = vi.fn(
        (items: MenuItemConstructorOptions[]) => items as unknown as Menu,
      );

      const manager = new TrayManager({
        callbacks: {
          onOpenMainWindow: vi.fn(),
          onEmergencyStop: vi.fn(),
          onExit: vi.fn(),
        },
        language: 'en',
        emergencyStopHotkey: 'F10',
        trayFactory: () => mockTray,
        menuBuilder: mockMenuBuilder,
      });

      manager.initialize();

      // Switch language to Russian
      manager.updateLanguage('ru');
      expect(mockTray.setToolTip).toHaveBeenCalledWith(
        'Macro Recorder — двойной щелчок открывает окно',
      );

      // Change emergency hotkey
      manager.updateEmergencyHotkey('F9');
      const lastCallItems = mockMenuBuilder.mock.calls[
        mockMenuBuilder.mock.calls.length - 1
      ]?.[0] as MenuItemConstructorOptions[];
      expect(lastCallItems?.[4]?.label).toBe('Аварийный стоп (F9)');
    });
  });

  describe('WindowVisibilityManager (Minimize/Close Behavior)', () => {
    let windowListeners: Map<string, (e?: unknown) => void>;
    let mockWindow: BrowserWindow;

    beforeEach(() => {
      windowListeners = new Map();
      mockWindow = {
        isDestroyed: vi.fn(() => false),
        isVisible: vi.fn(() => true),
        show: vi.fn(),
        hide: vi.fn(),
        setSkipTaskbar: vi.fn(),
        isMinimized: vi.fn(() => true),
        restore: vi.fn(),
        setAlwaysOnTop: vi.fn(),
        focus: vi.fn(),
        close: vi.fn(),
        on: vi.fn((event: string, listener: (e?: unknown) => void) => {
          windowListeners.set(event, listener);
        }),
      } as unknown as BrowserWindow;
    });

    it('hides window to tray on minimize when minimizeToTray is enabled', () => {
      const visibility = new WindowVisibilityManager({ minimizeToTray: true });
      visibility.attachToWindow(mockWindow);

      const minimizeCb = windowListeners.get('minimize');
      expect(minimizeCb).toBeDefined();
      minimizeCb!();

      expect(mockWindow.hide).toHaveBeenCalled();
    });

    it('prevents minimize and restores window if onBeforeMinimize returns false', async () => {
      const visibility = new WindowVisibilityManager({
        minimizeToTray: true,
        onBeforeMinimize: async () => false,
      });
      visibility.attachToWindow(mockWindow);

      const minimizeCb = windowListeners.get('minimize');
      minimizeCb!();

      // Allow microtask to resolve
      await new Promise((r) => setTimeout(r, 10));

      expect(mockWindow.restore).toHaveBeenCalled();
      expect(mockWindow.hide).not.toHaveBeenCalled();
    });

    it('hides to tray on close if closeToTray preference is true', () => {
      const visibility = new WindowVisibilityManager({ closeToTray: true });
      visibility.attachToWindow(mockWindow);

      const mockEvent = { preventDefault: vi.fn() };
      const closeCb = windowListeners.get('close');
      closeCb!(mockEvent);

      expect(mockEvent.preventDefault).toHaveBeenCalled();
      expect(mockWindow.hide).toHaveBeenCalled();
      expect(mockWindow.close).not.toHaveBeenCalled();
    });

    it('cancels close if onBeforeClose decision is false', async () => {
      const visibility = new WindowVisibilityManager({
        closeToTray: false,
        onBeforeClose: async () => false,
      });
      visibility.attachToWindow(mockWindow);

      const mockEvent = { preventDefault: vi.fn() };
      const closeCb = windowListeners.get('close');
      closeCb!(mockEvent);

      expect(mockEvent.preventDefault).toHaveBeenCalled();

      await new Promise((r) => setTimeout(r, 10));
      expect(mockWindow.close).not.toHaveBeenCalled();
    });

    it('proceeds with exit when onBeforeClose decision is true', async () => {
      const onExitRequested = vi.fn();
      const visibility = new WindowVisibilityManager({
        closeToTray: false,
        onBeforeClose: async () => true,
        onExitRequested,
      });
      visibility.attachToWindow(mockWindow);

      const mockEvent = { preventDefault: vi.fn() };
      const closeCb = windowListeners.get('close');
      closeCb!(mockEvent);

      await new Promise((r) => setTimeout(r, 10));
      expect(onExitRequested).toHaveBeenCalled();
      expect(mockWindow.close).toHaveBeenCalled();
    });

    it('restores window to foreground with taskbar un-skip and topmost toggle', () => {
      const visibility = new WindowVisibilityManager();
      visibility.restoreMainWindow(mockWindow);

      expect(mockWindow.show).toHaveBeenCalled();
      expect(mockWindow.setSkipTaskbar).toHaveBeenCalledWith(false);
      expect(mockWindow.restore).toHaveBeenCalled();
      expect(mockWindow.setAlwaysOnTop).toHaveBeenCalledWith(true);
      expect(mockWindow.setAlwaysOnTop).toHaveBeenCalledWith(false);
      expect(mockWindow.focus).toHaveBeenCalled();
    });
  });
});
