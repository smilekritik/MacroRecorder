/**
 * @macro-recorder/desktop - Floating Recording Toolbar Window
 * Compact always-on-top utility toolbar with Record, Pause, Stop, and Close controls.
 * Allows users to drive recording and playback while the main window is minimized or covered.
 *
 * Guarantees no focus stealing on clicks and clamps to display work area.
 */

import { BrowserWindow, type BrowserWindowConstructorOptions } from 'electron';
import {
  clampBoundsToWorkArea,
  getPrimaryWorkArea,
  observeDisplayChanges,
  DEFAULT_TOOLBAR_DIMENSIONS,
} from './display-bounds.js';
import type { DisplayWorkArea, IOverlayWindowAdapter, OverlayWindowCallbacks } from './types.js';

export interface FloatingToolbarOptions {
  readonly windowFactory?: (options: BrowserWindowConstructorOptions) => BrowserWindow;
  readonly preloadPath?: string | undefined;
  readonly htmlPath?: string | undefined;
  readonly callbacks?: OverlayWindowCallbacks | undefined;
  readonly initialBounds?: { x: number; y: number; width?: number; height?: number } | undefined;
}

export class FloatingToolbarWindowManager implements IOverlayWindowAdapter {
  private window: BrowserWindow | null = null;
  private readonly windowFactory: (options: BrowserWindowConstructorOptions) => BrowserWindow;
  private readonly preloadPath?: string | undefined;
  private readonly htmlPath?: string | undefined;
  private readonly callbacks: OverlayWindowCallbacks;
  private displayCleanup: (() => void) | null = null;

  private currentBounds = {
    x: 100,
    y: 100,
    width: DEFAULT_TOOLBAR_DIMENSIONS.width,
    height: DEFAULT_TOOLBAR_DIMENSIONS.height,
  };

  private engineState: string = 'Idle';

  constructor(options: FloatingToolbarOptions = {}) {
    this.windowFactory = options.windowFactory ?? ((opts) => new BrowserWindow(opts));
    this.preloadPath = options.preloadPath;
    this.htmlPath = options.htmlPath;
    this.callbacks = options.callbacks ?? {};

    if (options.initialBounds) {
      this.currentBounds = {
        x: options.initialBounds.x,
        y: options.initialBounds.y,
        width: options.initialBounds.width ?? DEFAULT_TOOLBAR_DIMENSIONS.width,
        height: options.initialBounds.height ?? DEFAULT_TOOLBAR_DIMENSIONS.height,
      };
    }
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
   * Initializes the compact floating toolbar BrowserWindow.
   */
  public initialize(): void {
    if (this.window && !this.window.isDestroyed()) {
      return;
    }

    const workArea = getPrimaryWorkArea();
    const clamped = clampBoundsToWorkArea(this.currentBounds, workArea);
    this.currentBounds = clamped;

    const windowOptions: BrowserWindowConstructorOptions = {
      title: 'Macro Recorder',
      x: clamped.x,
      y: clamped.y,
      width: clamped.width,
      height: clamped.height,
      transparent: true,
      frame: false,
      hasShadow: false,
      backgroundColor: '#00000000',
      alwaysOnTop: true,
      focusable: false,
      skipTaskbar: true,
      resizable: false,
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
      this.window.setAlwaysOnTop(true, 'floating');

      this.window.once('closed', () => {
        this.window = null;
        if (this.displayCleanup) {
          this.displayCleanup();
          this.displayCleanup = null;
        }
      });

      if (this.htmlPath && this.window.loadURL) {
        if (this.htmlPath.startsWith('http://') || this.htmlPath.startsWith('https://')) {
          void this.window.loadURL(this.htmlPath);
        } else {
          void this.window.loadFile(this.htmlPath);
        }
      }

      this.displayCleanup = observeDisplayChanges(() => {
        this.handleDisplayTopologyChange();
      });
    } catch (err) {
      console.warn('[FloatingToolbar] Failed creating toolbar window:', err);
    }
  }

  /**
   * Shows the floating toolbar without stealing focus from active application.
   */
  public showInactive(): void {
    if (!this.window || this.window.isDestroyed()) {
      this.initialize();
    }
    if (this.window && !this.window.isDestroyed()) {
      try {
        this.window.setAlwaysOnTop(true, 'floating');
        this.window.showInactive();
        this.broadcastState();
      } catch (err) {
        console.warn('[FloatingToolbar] showInactive error:', err);
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
    const workArea = getPrimaryWorkArea();
    const clamped = clampBoundsToWorkArea(bounds, workArea);
    this.currentBounds = clamped;
    if (this.window && !this.window.isDestroyed()) {
      try {
        this.window.setBounds(clamped);
      } catch {
        // Ignored
      }
    }
  }

  public getBounds(): { x: number; y: number; width: number; height: number } {
    return { ...this.currentBounds };
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

  public setAlwaysOnTop(flag: boolean, level = 'floating'): void {
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
        // Best effort
      }
    }
  }

  /**
   * Updates toolbar recording / playback engine state.
   */
  public updateEngineState(state: string): void {
    this.engineState = state;
    this.broadcastState();
  }

  /**
   * Repositions the toolbar from user drag.
   */
  public handleDragMove(deltaX: number, deltaY: number): void {
    const newBounds = {
      ...this.currentBounds,
      x: this.currentBounds.x + deltaX,
      y: this.currentBounds.y + deltaY,
    };
    this.setBounds(newBounds);
  }

  // Button actions invoked from renderer without taking window focus
  public triggerRecord(): void {
    this.callbacks.onRecordClicked?.();
  }

  public triggerPause(): void {
    this.callbacks.onPauseClicked?.();
  }

  public triggerStop(): void {
    this.callbacks.onStopClicked?.();
  }

  public triggerClose(): void {
    this.hide();
    this.callbacks.onCloseToolbarClicked?.();
  }

  private broadcastState(): void {
    this.send('toolbar:state', {
      engineState: this.engineState,
      bounds: this.currentBounds,
    });
  }

  private handleDisplayTopologyChange(): void {
    const workArea: DisplayWorkArea = getPrimaryWorkArea();
    const clamped = clampBoundsToWorkArea(this.currentBounds, workArea);
    this.setBounds(clamped);
  }
}
