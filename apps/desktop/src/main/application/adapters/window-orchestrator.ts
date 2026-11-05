/**
 * Electron Window Orchestration Adapter.
 * Coordinates MainWindow minimize/restore for recording,
 * BindMapWindow toggle, Inspectors, Dialogs, and Overlays.
 * Supports both actual Electron BrowserWindow instances and in-memory fakes.
 */

import type { BrowserWindow } from 'electron';
import type { IWindowOrchestratorAdapter, OverlayCardState } from '../types.js';

export interface WindowOrchestratorOptions {
  readonly mainWindow?: BrowserWindow | undefined;
  readonly overlayWindow?: BrowserWindow | undefined;
}

export class WindowOrchestratorAdapter implements IWindowOrchestratorAdapter {
  private mainWindow: BrowserWindow | undefined;
  private overlayWindow: BrowserWindow | undefined;
  private readonly auxiliaryWindows = new Map<string, BrowserWindow>();

  constructor(options: WindowOrchestratorOptions = {}) {
    this.mainWindow = options.mainWindow;
    this.overlayWindow = options.overlayWindow;
  }

  public setMainWindow(window: BrowserWindow | undefined): void {
    this.mainWindow = window;
  }

  public setOverlayWindow(window: BrowserWindow | undefined): void {
    this.overlayWindow = window;
  }

  public registerAuxiliaryWindow(windowId: string, window: BrowserWindow): void {
    this.auxiliaryWindows.set(windowId, window);
    window.once('closed', () => {
      this.auxiliaryWindows.delete(windowId);
    });
  }

  public minimizeMainWindow(): void {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      try {
        this.mainWindow.minimize();
      } catch (err) {
        console.warn('[WindowOrchestrator] minimizeMainWindow error:', err);
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
        this.mainWindow.focus();
      } catch (err) {
        console.warn('[WindowOrchestrator] restoreMainWindow error:', err);
      }
    }
  }

  public isMainWindowMinimized(): boolean {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      try {
        return this.mainWindow.isMinimized();
      } catch {
        return false;
      }
    }
    return false;
  }

  public openWindow(windowId: string, _params?: Readonly<Record<string, unknown>>): boolean {
    const existing = this.auxiliaryWindows.get(windowId);
    if (existing && !existing.isDestroyed()) {
      existing.show();
      existing.focus();
      return true;
    }
    return false;
  }

  public closeWindow(windowId: string): boolean {
    const existing = this.auxiliaryWindows.get(windowId);
    if (existing && !existing.isDestroyed()) {
      existing.close();
      this.auxiliaryWindows.delete(windowId);
      return true;
    }
    return false;
  }

  public isWindowOpen(windowId: string): boolean {
    const existing = this.auxiliaryWindows.get(windowId);
    return Boolean(existing && !existing.isDestroyed() && existing.isVisible());
  }

  public updateOverlay(state: OverlayCardState): void {
    if (this.overlayWindow && !this.overlayWindow.isDestroyed()) {
      try {
        this.overlayWindow.webContents.send('overlay:changed', state);
      } catch {
        // Overlay update best effort
      }
    }
  }

  public clearOverlay(): void {
    if (this.overlayWindow && !this.overlayWindow.isDestroyed()) {
      try {
        this.overlayWindow.webContents.send('overlay:changed', { visible: false });
      } catch {
        // Overlay clear best effort
      }
    }
  }
}

/**
 * Deterministic Fake Window Orchestrator for Unit and Integration Tests.
 */
export class FakeWindowOrchestrator implements IWindowOrchestratorAdapter {
  public isMinimized = false;
  public restoreCalledCount = 0;
  public minimizeCalledCount = 0;
  public readonly openWindows = new Set<string>();
  public lastOverlayState: OverlayCardState | null = null;
  public overlayCleared = false;

  public minimizeMainWindow(): void {
    this.isMinimized = true;
    this.minimizeCalledCount++;
  }

  public restoreMainWindow(): void {
    this.isMinimized = false;
    this.restoreCalledCount++;
  }

  public isMainWindowMinimized(): boolean {
    return this.isMinimized;
  }

  public openWindow(windowId: string): boolean {
    this.openWindows.add(windowId);
    return true;
  }

  public closeWindow(windowId: string): boolean {
    return this.openWindows.delete(windowId);
  }

  public isWindowOpen(windowId: string): boolean {
    return this.openWindows.has(windowId);
  }

  public updateOverlay(state: OverlayCardState): void {
    this.lastOverlayState = state;
    this.overlayCleared = !state.visible;
  }

  public clearOverlay(): void {
    this.overlayCleared = true;
    if (this.lastOverlayState) {
      this.lastOverlayState = { ...this.lastOverlayState, visible: false };
    }
  }
}
