/**
 * @macro-recorder/desktop - Overlay Placement Preview Window
 * Interactive positioning window shown during Settings calibration.
 * Allows users to drag sample cards to configure desktop coordinates with real-time
 * normalized clamping and preferences persistence.
 *
 * Operates without stealing focus from Settings window.
 */

import { BrowserWindow, type BrowserWindowConstructorOptions } from 'electron';
import {
  calculatePixelCoordinates,
  clampNormalized,
  getPrimaryWorkArea,
  observeDisplayChanges,
  DEFAULT_CARD_DIMENSIONS,
} from './display-bounds.js';
import type {
  DisplayWorkArea,
  IOverlayWindowAdapter,
  OverlayAppearancePreferences,
  OverlayPlacementPreferences,
} from './types.js';

export interface PlacementWindowOptions {
  readonly windowFactory?: (options: BrowserWindowConstructorOptions) => BrowserWindow;
  readonly preloadPath?: string | undefined;
  readonly htmlPath?: string | undefined;
  readonly onPlacementChanged?: (placement: OverlayPlacementPreferences) => void;
}

export class OverlayPlacementWindowManager implements IOverlayWindowAdapter {
  private window: BrowserWindow | null = null;
  private readonly windowFactory: (options: BrowserWindowConstructorOptions) => BrowserWindow;
  private readonly preloadPath?: string | undefined;
  private readonly htmlPath?: string | undefined;
  private readonly onPlacementChanged?: ((placement: OverlayPlacementPreferences) => void) | undefined;
  private displayCleanup: (() => void) | null = null;

  private currentPlacement: OverlayPlacementPreferences = {
    infoX: 1.0,
    infoY: 0.0,
    annotationX: 1.0,
    annotationY: 0.0,
  };

  private currentAppearance: Partial<OverlayAppearancePreferences> = {
    overlayScalePercent: 100,
    overlayInfoTransparencyPercent: 0,
    overlayAnnotationScalePercent: 100,
    overlayAnnotationTransparencyPercent: 0,
    showMacroInformation: true,
    showOverlayAnnotations: true,
  };

  constructor(options: PlacementWindowOptions = {}) {
    this.windowFactory = options.windowFactory ?? ((opts) => new BrowserWindow(opts));
    this.preloadPath = options.preloadPath;
    this.htmlPath = options.htmlPath;
    this.onPlacementChanged = options.onPlacementChanged;
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
   * Initializes the placement preview window covering the work area.
   */
  public initialize(): void {
    if (this.window && !this.window.isDestroyed()) {
      return;
    }

    const workArea = getPrimaryWorkArea();

    const windowOptions: BrowserWindowConstructorOptions = {
      title: 'Overlay placement preview',
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
      this.window.setAlwaysOnTop(true, 'screen-saver');

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
      console.warn('[PlacementWindow] Failed creating placement preview window:', err);
    }
  }

  /**
   * Shows the placement preview without stealing focus from Settings window.
   */
  public showInactive(): void {
    if (!this.window || this.window.isDestroyed()) {
      this.initialize();
    }
    if (this.window && !this.window.isDestroyed()) {
      try {
        this.window.setAlwaysOnTop(true, 'screen-saver');
        this.window.showInactive();
        this.broadcastPreviewState();
      } catch (err) {
        console.warn('[PlacementWindow] showInactive error:', err);
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
   * Updates preview configuration (scale, transparency, placement).
   */
  public updateConfig(
    placement: OverlayPlacementPreferences,
    appearance: Partial<OverlayAppearancePreferences>,
  ): void {
    this.currentPlacement = {
      infoX: clampNormalized(placement.infoX),
      infoY: clampNormalized(placement.infoY),
      annotationX: clampNormalized(placement.annotationX),
      annotationY: clampNormalized(placement.annotationY),
    };
    this.currentAppearance = {
      ...this.currentAppearance,
      ...appearance,
    };
    this.broadcastPreviewState();
  }

  /**
   * Applies user drag placement update from renderer and persists coordinates.
   */
  public applyPlacementFromDrag(placement: OverlayPlacementPreferences): void {
    this.currentPlacement = {
      infoX: clampNormalized(placement.infoX),
      infoY: clampNormalized(placement.infoY),
      annotationX: clampNormalized(placement.annotationX),
      annotationY: clampNormalized(placement.annotationY),
    };
    this.onPlacementChanged?.(this.currentPlacement);
    this.broadcastPreviewState();
  }

  public getPlacement(): OverlayPlacementPreferences {
    return { ...this.currentPlacement };
  }

  private broadcastPreviewState(): void {
    const workArea = getPrimaryWorkArea();
    const infoScale = (this.currentAppearance.overlayScalePercent ?? 100) / 100;
    const annotationScale = (this.currentAppearance.overlayAnnotationScalePercent ?? 100) / 100;

    const infoPixel = calculatePixelCoordinates(
      this.currentPlacement.infoX,
      this.currentPlacement.infoY,
      DEFAULT_CARD_DIMENSIONS.width,
      DEFAULT_CARD_DIMENSIONS.height,
      workArea,
      infoScale,
    );

    const annotationPixel = calculatePixelCoordinates(
      this.currentPlacement.annotationX,
      this.currentPlacement.annotationY,
      DEFAULT_CARD_DIMENSIONS.width,
      DEFAULT_CARD_DIMENSIONS.height,
      workArea,
      annotationScale,
    );

    this.send('overlay:preview-state', {
      placement: this.currentPlacement,
      appearance: this.currentAppearance,
      workArea,
      infoPixel,
      annotationPixel,
    });
  }

  private handleDisplayTopologyChange(): void {
    const workArea: DisplayWorkArea = getPrimaryWorkArea();
    this.setBounds({
      x: workArea.x,
      y: workArea.y,
      width: workArea.width,
      height: workArea.height,
    });
    this.broadcastPreviewState();
  }
}
