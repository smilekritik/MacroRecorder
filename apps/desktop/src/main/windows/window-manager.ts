/**
 * @macro-recorder/desktop - Main Window Orchestrator & Manager
 * Implements IWindowOrchestratorAdapter with full BrowserWindow creation policies,
 * multi-window lifecycle, DPI positioning, subscription disposal, crash protection,
 * and cross-window state synchronization.
 */

import { BrowserWindow, type BrowserWindowConstructorOptions, screen } from 'electron';
import type { IWindowOrchestratorAdapter, OverlayCardState } from '../application/types.js';
import { CrossWindowBroadcaster } from './cross-window-broadcaster.js';
import { RendererCrashGuard } from './crash-guard.js';
import { DpiManager } from './dpi-manager.js';
import { DwmThemingManager } from './dwm-theming.js';
import { FocusManager } from './focus-manager.js';
import { SubscriptionCleanupManager } from './subscription-cleanup.js';
import {
  type WindowManagerOptions,
  type WindowSpecification,
} from './types.js';
import { getWindowDefinition, WINDOW_DEFINITIONS } from './window-definitions.js';

export class WindowManager implements IWindowOrchestratorAdapter {
  private readonly overlayCards = new Map<string, OverlayCardState>();
  private readonly iconPath: string | undefined;
  private interfacePreferences: Readonly<Record<string, unknown>> = {};
  private mainWindow: BrowserWindow | null = null;
  private readonly auxiliaryWindows = new Map<string, BrowserWindow>();

  private readonly windowFactory: (options: BrowserWindowConstructorOptions) => BrowserWindow;
  private readonly preloadPath?: string | undefined;
  private readonly rendererUrl?: string | undefined;
  private readonly rendererHtmlPath?: string | undefined;

  public readonly dpiManager: DpiManager;
  public readonly focusManager: FocusManager;
  public readonly subscriptionCleanup: SubscriptionCleanupManager;
  public readonly crashGuard: RendererCrashGuard;
  public readonly themingManager: DwmThemingManager;
  public readonly broadcaster: CrossWindowBroadcaster;

  private isMainWindowMin = false;

  constructor(options: WindowManagerOptions = {}) {
    this.windowFactory = options.windowFactory ?? ((opts) => new BrowserWindow(opts));
    this.preloadPath = options.preloadPath;
    this.rendererUrl = options.rendererUrl;
    this.rendererHtmlPath = options.rendererHtmlPath;
    this.iconPath = options.iconPath;

    this.dpiManager = new DpiManager();
    this.focusManager = new FocusManager();
    this.subscriptionCleanup = new SubscriptionCleanupManager(options.onDisposeSubscription);
    this.crashGuard = new RendererCrashGuard(options.onEmergencyStop ?? (() => {}));
    this.themingManager = new DwmThemingManager('dark');

    this.broadcaster = new CrossWindowBroadcaster(() => this.getAllWindows());

    // Observe display resolution and monitor topology updates
    this.dpiManager.observeDisplayChanges(() => {
      this.realignAllWindowsOnScreen();
    });
  }

  // --- Main Window Lifecycle ---

  /**
   * Creates or initializes the primary MainWindow.
   * Respects --minimized launch without visible window flash.
   */
  public createMainWindow(options: { minimized?: boolean; startHidden?: boolean } = {}): BrowserWindow {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      return this.mainWindow;
    }

    const spec = WINDOW_DEFINITIONS.MainWindow;
    const { x, y } = DpiManager.calculateCenterScreen(spec.width, spec.height);

    const isMinimized = Boolean(options.minimized);
    const startHidden = Boolean(options.startHidden || isMinimized);

    const windowOptions: BrowserWindowConstructorOptions = {
      title: spec.title,
      ...(this.iconPath ? { icon: this.iconPath } : {}),
      width: spec.width,
      height: spec.height,
      ...(spec.minWidth !== undefined ? { minWidth: spec.minWidth } : {}),
      ...(spec.minHeight !== undefined ? { minHeight: spec.minHeight } : {}),
      x,
      y,
      show: !startHidden,
      skipTaskbar: isMinimized,
      resizable: spec.resizable,
      ...(spec.minimizable !== undefined ? { minimizable: spec.minimizable } : {}),
      ...(spec.maximizable !== undefined ? { maximizable: spec.maximizable } : {}),
      alwaysOnTop: spec.topmost,
      frame: spec.frame,
      backgroundColor: spec.backgroundColor,
      webPreferences: {
        ...(this.preloadPath ? { preload: this.preloadPath } : {}),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        webSecurity: true,
      },
    };

    const win = this.windowFactory(windowOptions);
    this.mainWindow = win;
    this.isMainWindowMin = isMinimized;

    this.configureCommonWindow(win, 'MainWindow');

    if (isMinimized) {
      win.hide();
      win.setSkipTaskbar(true);
      win.minimize();
    }

    win.on('minimize', () => {
      this.isMainWindowMin = true;
      this.broadcaster.broadcastWindowState('MainWindow', 'minimized');
    });

    win.on('restore', () => {
      this.isMainWindowMin = false;
      this.broadcaster.broadcastWindowState('MainWindow', 'restored');
    });

    win.once('closed', () => {
      this.mainWindow = null;
      this.isMainWindowMin = false;
      this.broadcaster.broadcastWindowState('MainWindow', 'closed');
    });

    this.loadWindowContent(win, 'MainWindow');
    return win;
  }

  public getMainWindow(): BrowserWindow | null {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      return this.mainWindow;
    }
    return null;
  }

  public minimizeMainWindow(): void {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      try {
        this.mainWindow.minimize();
        this.isMainWindowMin = true;
      } catch (err) {
        console.warn('[WindowManager] minimizeMainWindow error:', err);
      }
    }
  }

  public restoreMainWindow(): void {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      try {
        if (this.mainWindow.isMinimized()) {
          this.mainWindow.restore();
        }
        this.mainWindow.show();
        this.mainWindow.setSkipTaskbar(false);
        this.mainWindow.focus();
        this.isMainWindowMin = false;
      } catch (err) {
        console.warn('[WindowManager] restoreMainWindow error:', err);
      }
    }
  }

  public isMainWindowMinimized(): boolean {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      try {
        return this.mainWindow.isMinimized() || this.isMainWindowMin;
      } catch {
        return this.isMainWindowMin;
      }
    }
    return false;
  }

  // --- Auxiliary Windows Orchestration ---

  /**
   * Opens or activates an auxiliary window or modal dialog.
   * If already open, brings it to front and restores focus (singleton per window ID).
   */
  public openWindow(windowId: string, params?: Readonly<Record<string, unknown>>): boolean {
    if (windowId === 'OverlayPlacementWindow' && !this.isWindowOpen('SettingsWindow')) {
      return false;
    }
    const existing = this.auxiliaryWindows.get(windowId);
    if (existing && !existing.isDestroyed()) {
      try {
        if (existing.isMinimized()) {
          existing.restore();
        }
        existing.show();
        existing.focus();
        if (windowId === 'SettingsWindow') this.openWindow('OverlayPlacementWindow');
        return true;
      } catch {
        // Recreate below if failed
      }
    }

    try {
      const spec = getWindowDefinition(windowId);
      if (!spec) {
        console.warn(`[WindowManager] Refusing unknown window ID: ${windowId}`);
        return false;
      }
      const ownerWindow = this.resolveOwnerWindow(spec);

      const { x, y } =
        spec.startupLocation === 'center-owner' && ownerWindow
          ? DpiManager.calculateCenterOwner(spec.width, spec.height, ownerWindow)
          : DpiManager.calculateCenterScreen(spec.width, spec.height);

      const windowOptions: BrowserWindowConstructorOptions = {
        title: spec.title,
        ...(this.iconPath ? { icon: this.iconPath } : {}),
        width: spec.width,
        height: spec.height,
        ...(spec.minWidth !== undefined ? { minWidth: spec.minWidth } : {}),
        ...(spec.minHeight !== undefined ? { minHeight: spec.minHeight } : {}),
        ...(spec.maxWidth !== undefined ? { maxWidth: spec.maxWidth } : {}),
        ...(spec.maxHeight !== undefined ? { maxHeight: spec.maxHeight } : {}),
        x,
        y,
        resizable: spec.resizable,
        minimizable: spec.minimizable ?? false,
        maximizable: spec.maximizable ?? false,
        alwaysOnTop: spec.topmost,
        show: false,
        skipTaskbar: !spec.showInTaskbar,
        frame: spec.frame,
        transparent: spec.transparent,
        backgroundColor: spec.backgroundColor,
        focusable: spec.focusable,
        ...(spec.isModal && ownerWindow ? { parent: ownerWindow, modal: true } : {}),
        webPreferences: {
          ...(this.preloadPath ? { preload: this.preloadPath } : {}),
          contextIsolation: true,
          nodeIntegration: false,
          sandbox: true,
          webSecurity: true,
        },
      };

      const win = this.windowFactory(windowOptions);
      this.auxiliaryWindows.set(windowId, win);

      // These windows draw freely across the desktop, positioned by normalized coordinates.
      if (windowId === 'OverlayWindow' || windowId === 'OverlayPlacementWindow') {
        const area = screen.getPrimaryDisplay().workArea;
        win.setBounds(area);
        // Forwarding runs a global mouse hook on the main thread, so only the page that hit-tests its
        // cards gets it. The overlay itself never takes the mouse.
        if (windowId === 'OverlayWindow') win.setIgnoreMouseEvents(true);
        else win.setIgnoreMouseEvents(true, { forward: true });
      }

      if (spec.topmost && spec.topmostLevel) {
        try {
          win.setAlwaysOnTop(true, spec.topmostLevel);
        } catch {
          // Ignore
        }
      }

      if (spec.clickThrough) {
        try {
          win.setIgnoreMouseEvents(true);
        } catch {
          // Ignore
        }
      }

      this.configureCommonWindow(win, windowId, ownerWindow);

      win.once('closed', () => {
        this.auxiliaryWindows.delete(windowId);
        // Native window destruction does not guarantee React effect cleanup.
        if (windowId === 'SettingsWindow') this.closeWindow('OverlayPlacementWindow');
        // An overlay never had focus, so closing it must not pull another window over a game.
        if (spec.focusable !== false) this.focusManager.restoreFocusAfterClose(win, ownerWindow);
        this.broadcaster.broadcastWindowState(windowId, 'closed');
      });

      this.loadWindowContent(win, windowId, params);

      if (windowId === 'SettingsWindow') {
        // The sample cards float above everything, so they are only up while settings are in
        // use. Settings can end up behind another window without being closed.
        win.on('focus', () => this.setPlacementPreviewVisible(true));
        win.on('blur', () => this.setPlacementPreviewVisible(false));
      }

      const reveal = (): void => {
        if (win.isDestroyed()) return;
        if (windowId === 'OverlayPlacementWindow' && !this.getWindow('SettingsWindow')?.isFocused()) return;
        if (spec.focusable !== false) {
          win.show();
          win.focus();
        } else {
          win.showInactive();
        }
      };
      // A transparent window stays hidden until its page has painted, so it cannot flash.
      if (spec.transparent) win.once('ready-to-show', reveal);
      else reveal();

      this.broadcaster.broadcastWindowState(windowId, 'opened');
      if (windowId === 'SettingsWindow') this.openWindow('OverlayPlacementWindow');
      return true;
    } catch (err) {
      console.error(`[WindowManager] Failed opening window "${windowId}":`, err);
      return false;
    }
  }

  private setPlacementPreviewVisible(visible: boolean): void {
    const preview = this.getWindow('OverlayPlacementWindow');
    if (!preview) return;
    if (visible) preview.showInactive();
    else preview.hide();
  }

  public closeWindow(windowId: string): boolean {
    if (windowId === 'MainWindow') {
      if (this.mainWindow && !this.mainWindow.isDestroyed()) {
        this.mainWindow.close();
        return true;
      }
      return false;
    }

    const existing = this.auxiliaryWindows.get(windowId);
    if (existing && !existing.isDestroyed()) {
      existing.close();
      this.auxiliaryWindows.delete(windowId);
      return true;
    }
    return false;
  }

  public isWindowOpen(windowId: string): boolean {
    if (windowId === 'MainWindow') {
      return Boolean(this.mainWindow && !this.mainWindow.isDestroyed() && this.mainWindow.isVisible());
    }
    const existing = this.auxiliaryWindows.get(windowId);
    return Boolean(existing && !existing.isDestroyed() && existing.isVisible());
  }

  public getWindow(windowId: string): BrowserWindow | null {
    if (windowId === 'MainWindow') {
      return this.getMainWindow();
    }
    const existing = this.auxiliaryWindows.get(windowId);
    if (existing && !existing.isDestroyed()) {
      return existing;
    }
    return null;
  }

  public getOpenWindowIds(): string[] {
    const ids: string[] = [];
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      ids.push('MainWindow');
    }
    for (const [id, win] of this.auxiliaryWindows.entries()) {
      if (win && !win.isDestroyed()) {
        ids.push(id);
      }
    }
    return ids;
  }

  public getAllWindows(): readonly BrowserWindow[] {
    const list: BrowserWindow[] = [];
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      list.push(this.mainWindow);
    }
    for (const win of this.auxiliaryWindows.values()) {
      if (win && !win.isDestroyed()) {
        list.push(win);
      }
    }
    return list;
  }

  public closeAllWindows(): void {
    for (const [id, win] of this.auxiliaryWindows.entries()) {
      if (win && !win.isDestroyed()) {
        try {
          win.close();
        } catch {
          // Best effort
        }
      }
      this.auxiliaryWindows.delete(id);
    }
  }

  // --- Overlay Updates ---

  public updateOverlay(state: OverlayCardState): void {
    if (state.visible) this.overlayCards.set(state.macroId, state);
    else this.overlayCards.delete(state.macroId);
    this.pushOverlayState();
  }

  public clearOverlay(): void {
    this.overlayCards.clear();
    this.pushOverlayState();
  }

  /** Values new windows need before their first paint, and the overlay needs for its cards. */
  public setInterfacePreferences(preferences: Readonly<Record<string, unknown>>): void {
    this.interfacePreferences = preferences;
    if (this.overlayCards.size > 0) this.pushOverlayState();
    this.sendPlacementPreviewState();
  }

  /** The overlay window exists only while it has something to show, so idle costs nothing. */
  private pushOverlayState(): void {
    if (this.overlayCards.size === 0) {
      this.closeWindow('OverlayWindow');
      return;
    }
    if (!this.getWindow('OverlayWindow')) {
      this.openWindow('OverlayWindow');
    }
    this.sendOverlayState();
  }

  private overlayLayoutState(): { placement: Record<string, number>; appearance: Readonly<Record<string, unknown>> } {
    const prefs = this.interfacePreferences;
    const number = (name: string, fallback: number) => (typeof prefs[name] === 'number' ? (prefs[name] as number) : fallback);
    return {
      placement: {
        infoX: number('overlayInfoX', 1),
        infoY: number('overlayInfoY', 0),
        annotationX: number('overlayAnnotationX', 1),
        annotationY: number('overlayAnnotationY', 1),
      },
      appearance: prefs,
    };
  }

  /** The sample cards follow the settings as they change. */
  private sendPlacementPreviewState(): void {
    const preview = this.getWindow('OverlayPlacementWindow');
    if (!preview || preview.isDestroyed()) return;
    try {
      preview.webContents.send('overlay:state', this.overlayLayoutState());
    } catch {
      // A closing preview window has nothing left to show.
    }
  }

  /** Called by the overlay page once it listens, since anything sent earlier is lost. */
  public sendOverlayState(): void {
    this.sendPlacementPreviewState();
    const overlay = this.getWindow('OverlayWindow');
    if (!overlay || overlay.isDestroyed()) return;
    const cards = [...this.overlayCards.values()];
    try {
      overlay.webContents.send('overlay:state', {
        macros: cards.filter((card) => card.countdownSeconds === undefined).map((card) => ({
          macroId: card.macroId,
          macroName: card.macroName,
          state: card.state,
          actionText: card.activeActionText,
          visible: true,
        })),
        annotations: cards.filter((card) => card.countdownSeconds !== undefined).map((card) => ({
          annotationId: card.macroId,
          macroId: card.macroId,
          macroName: card.macroName,
          text: card.activeActionText ?? '',
          remainingSeconds: card.countdownSeconds ?? 0,
          visible: true,
        })),
        ...this.overlayLayoutState(),
      });
    } catch {
      // A closing overlay window cannot receive the update, and has nothing left to show.
    }
  }

  /** Resizes a window so its client area matches its content. */
  public fitWindowToContent(windowId: string, contentHeight: number): boolean {
    const window = this.getWindow(windowId);
    if (!window || window.isDestroyed() || contentHeight <= 0) return false;
    const [width] = window.getContentSize();
    const display = screen.getDisplayMatching(window.getBounds());
    window.setContentSize(width ?? 0, Math.min(contentHeight, display.workArea.height - 40));
    return true;
  }

  public setWindowMouseThrough(windowId: string, ignore: boolean): boolean {
    const window = this.getWindow(windowId);
    if (!window || window.isDestroyed()) return false;
    window.setIgnoreMouseEvents(ignore, { forward: true });
    return true;
  }

  // --- Common Configuration & Disposal Helpers ---

  private configureCommonWindow(
    window: BrowserWindow,
    windowId: string,
    _owner?: BrowserWindow | null,
  ): void {
    // 1. Focus Tracking
    window.on('focus', () => {
      this.focusManager.recordFocus(window);
    });

    // 2. Subscription Cleanup
    this.subscriptionCleanup.attachToWindow(window);

    // 3. Renderer Crash Guard
    this.crashGuard.attach(window, windowId);

    // 4. DWM Chrome Theming. It sets an opaque background, which would fill a transparent window.
    if (!getWindowDefinition(windowId)?.transparent) {
      this.themingManager.configureWindow(window);
    }
  }

  private resolveOwnerWindow(spec: WindowSpecification): BrowserWindow | null {
    if (spec.startupLocation === 'center-owner' || spec.isModal) {
      const activeWindow = this.focusManager.getPreviousFocusedWindow() ?? this.getMainWindow();
      return activeWindow;
    }
    return null;
  }

  private loadWindowContent(
    window: BrowserWindow,
    windowId: string,
    params?: Readonly<Record<string, unknown>>,
  ): void {
    const query = new URLSearchParams();
    query.set('windowId', windowId);
    query.set('theme', this.interfacePreferences['theme'] === 'Light' ? 'light' : 'dark');
    query.set('lang', this.interfacePreferences['languageCode'] === 'ru' ? 'ru' : 'en');
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        if (v !== undefined && v !== null) {
          query.set(k, typeof v === 'object' ? JSON.stringify(v) : String(v));
        }
      }
    }
    const queryString = query.toString();

    if (this.rendererUrl) {
      const url = `${this.rendererUrl}?${queryString}`;
      if (typeof window.loadURL === 'function') {
        void window.loadURL(url);
      }
    } else if (this.rendererHtmlPath) {
      if (typeof window.loadFile === 'function') {
        void window.loadFile(this.rendererHtmlPath, { search: queryString });
      } else if (typeof window.loadURL === 'function') {
        void window.loadURL(`file://${this.rendererHtmlPath}?${queryString}`);
      }
    }
  }

  private realignAllWindowsOnScreen(): void {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      DpiManager.ensureWindowOnScreen(this.mainWindow);
    }
    for (const win of this.auxiliaryWindows.values()) {
      if (win && !win.isDestroyed()) {
        DpiManager.ensureWindowOnScreen(win);
      }
    }
  }

  public dispose(): void {
    this.closeAllWindows();
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      try {
        this.mainWindow.close();
      } catch {
        // Best effort
      }
      this.mainWindow = null;
    }
    this.dpiManager.dispose();
    this.focusManager.clear();
    this.subscriptionCleanup.disposeAll();
    this.crashGuard.clear();
  }
}
