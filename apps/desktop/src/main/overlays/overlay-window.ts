/**
 * @macro-recorder/desktop - Desktop Overlay Window
 * Transparent, non-activating, click-through Electron window presenting
 * status cards, custom text annotations, and recording countdowns.
 *
 * Strictly guarantees no focus theft and zero click interception.
 */

import { BrowserWindow, type BrowserWindowConstructorOptions } from 'electron';
import { getPrimaryWorkArea, observeDisplayChanges } from './display-bounds.js';
import type { DisplayWorkArea, IOverlayWindowAdapter, OverlayFullState } from './types.js';

export interface OverlayWindowOptions {
  readonly windowFactory?: (options: BrowserWindowConstructorOptions) => BrowserWindow;
  readonly preloadPath?: string | undefined;
  readonly htmlPath?: string | undefined;
  readonly devTools?: boolean | undefined;
}

export class OverlayWindowManager implements IOverlayWindowAdapter {
  private window: BrowserWindow | null = null;
  private readonly windowFactory: (options: BrowserWindowConstructorOptions) => BrowserWindow;
  private readonly preloadPath?: string | undefined;
  private readonly htmlPath?: string | undefined;
  private displayCleanup: (() => void) | null = null;
  private lastState: OverlayFullState | null = null;

  constructor(options: OverlayWindowOptions = {}) {
    this.windowFactory = options.windowFactory ?? ((opts) => new BrowserWindow(opts));
    this.preloadPath = options.preloadPath;
    this.htmlPath = options.htmlPath;
  }

  public get underlyingWindow(): BrowserWindow | null {
    return this.window;
  }

  public isDestroyed(): boolean {
    return !this.window || this.window.isDestroyed();
  }

  public isVisible(): boolean {
    return Boolean(this.window && !this.window.isDestroyed() && this.window.isVisible());
  }

  /**
   * Initializes and creates the transparent, always-on-top, non-activating, click-through overlay window.
   */
  public initialize(): void {
    if (this.window && !this.window.isDestroyed()) {
      return;
    }

    const workArea = getPrimaryWorkArea();

    const windowOptions: BrowserWindowConstructorOptions = {
      title: 'Macro Recorder Overlay',
      x: workArea.x,
      y: workArea.y,
      width: workArea.width,
      height: workArea.height,
      transparent: true,
      frame: false,
      hasShadow: false,
      backgroundColor: '#00000000',
      alwaysOnTop: true,
      focusable: false,
      skipTaskbar: true,
      resizable: false,
      movable: false,
      show: false,
      webPreferences: {
        ...(this.preloadPath ? { preload: this.preloadPath } : {}),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    };

    try {
      this.window = this.windowFactory(windowOptions);

      // Enforce highest always-on-top level
      this.window.setAlwaysOnTop(true, 'screen-saver');

      // Enforce click-through: all clicks pass through to background applications without interception
      this.window.setIgnoreMouseEvents(true);

      // Handle window closure
      this.window.once('closed', () => {
        this.window = null;
        if (this.displayCleanup) {
          this.displayCleanup();
          this.displayCleanup = null;
        }
      });

      // Load URL or file if configured
      if (this.htmlPath && this.window.loadURL) {
        if (this.htmlPath.startsWith('http://') || this.htmlPath.startsWith('https://')) {
          void this.window.loadURL(this.htmlPath);
        } else {
          void this.window.loadFile(this.htmlPath);
        }
      }

      // Automatically handle screen resolution and monitor topology updates
      this.displayCleanup = observeDisplayChanges(() => {
        this.handleDisplayTopologyChange();
      });
    } catch (err) {
      console.warn('[OverlayWindow] Failed initializing overlay BrowserWindow:', err);
    }
  }

  /**
   * Shows the overlay without stealing focus from the active foreground window.
   */
  public showInactive(): void {
    if (!this.window || this.window.isDestroyed()) {
      this.initialize();
    }
    if (this.window && !this.window.isDestroyed()) {
      try {
        this.window.setAlwaysOnTop(true, 'screen-saver');
        this.window.setIgnoreMouseEvents(true);
        this.window.showInactive();
      } catch (err) {
        console.warn('[OverlayWindow] showInactive error:', err);
      }
    }
  }

  public hide(): void {
    if (this.window && !this.window.isDestroyed()) {
      try {
        this.window.hide();
      } catch {
        // Ignored
      }
    }
  }

  public close(): void {
    if (this.displayCleanup) {
      this.displayCleanup();
      this.displayCleanup = null;
    }
    if (this.window && !this.window.isDestroyed()) {
      try {
        this.window.close();
      } catch {
        // Ignored
      }
      this.window = null;
    }
  }

  public setBounds(bounds: { x: number; y: number; width: number; height: number }): void {
    if (this.window && !this.window.isDestroyed()) {
      try {
        this.window.setBounds(bounds);
      } catch {
        // Ignored
      }
    }
  }

  public getBounds(): { x: number; y: number; width: number; height: number } {
    if (this.window && !this.window.isDestroyed()) {
      try {
        return this.window.getBounds();
      } catch {
        // Fallback
      }
    }
    const workArea = getPrimaryWorkArea();
    return { x: workArea.x, y: workArea.y, width: workArea.width, height: workArea.height };
  }

  public setIgnoreMouseEvents(ignore: boolean, options?: { forward: boolean }): void {
    if (this.window && !this.window.isDestroyed()) {
      try {
        this.window.setIgnoreMouseEvents(ignore, options);
      } catch {
        // Ignored
      }
    }
  }

  public setAlwaysOnTop(flag: boolean, level = 'screen-saver'): void {
    if (this.window && !this.window.isDestroyed()) {
      try {
        this.window.setAlwaysOnTop(flag, level as Parameters<BrowserWindow['setAlwaysOnTop']>[1]);
      } catch {
        // Ignored
      }
    }
  }

  public send(channel: string, payload: unknown): void {
    if (this.window && !this.window.isDestroyed()) {
      try {
        this.window.webContents.send(channel, payload);
      } catch {
        // Best effort send
      }
    }
  }

  /**
   * Broadcasts overlay state to renderer and updates window visibility.
   */
  public updateState(state: OverlayFullState): void {
    this.lastState = state;
    const hasVisibleContent =
      state.isCountdownVisible ||
      state.macros.some((m) => m.visible) ||
      state.annotations.some((a) => a.visible);

    if (hasVisibleContent) {
      this.showInactive();
    } else {
      this.hide();
    }

    this.send('overlay:state', state);
    this.send('overlay:changed', state);
  }

  /**
   * Adjusts the overlay window size and position when monitors change.
   */
  private handleDisplayTopologyChange(): void {
    const workArea: DisplayWorkArea = getPrimaryWorkArea();
    this.setBounds({
      x: workArea.x,
      y: workArea.y,
      width: workArea.width,
      height: workArea.height,
    });
    if (this.lastState) {
      this.send('overlay:display-changed', { workArea });
    }
  }
}
