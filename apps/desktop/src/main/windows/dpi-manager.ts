/**
 * @macro-recorder/desktop - DPI and Bounds Manager
 * Handles per-monitor DPI scaling, work area clamping, and multi-monitor repositioning.
 */

import { screen, type BrowserWindow, type Display, type Rectangle } from 'electron';

export class DpiManager {
  private displayChangeCleanup: (() => void) | null = null;

  /**
   * Returns the primary display work area, with a safe fallback for headless/test environments.
   */
  public static getPrimaryWorkArea(): Rectangle {
    try {
      if (screen && typeof screen.getPrimaryDisplay === 'function') {
        const primary = screen.getPrimaryDisplay();
        return primary.workArea;
      }
    } catch {
      // Screen API unavailable
    }
    return { x: 0, y: 0, width: 1920, height: 1080 };
  }

  /**
   * Returns the display containing the given point, or primary display.
   */
  public static getDisplayNearestPoint(x: number, y: number): Display | null {
    try {
      if (screen && typeof screen.getDisplayNearestPoint === 'function') {
        return screen.getDisplayNearestPoint({ x, y });
      }
    } catch {
      // Best-effort
    }
    return null;
  }

  /**
   * Calculates center-screen coordinates within the primary display or target display work area.
   */
  public static calculateCenterScreen(
    width: number,
    height: number,
    targetDisplay?: Display | null,
  ): { x: number; y: number } {
    const workArea = targetDisplay ? targetDisplay.workArea : DpiManager.getPrimaryWorkArea();
    const x = Math.round(workArea.x + Math.max(0, (workArea.width - width) / 2));
    const y = Math.round(workArea.y + Math.max(0, (workArea.height - height) / 2));
    return { x, y };
  }

  /**
   * Calculates center-owner coordinates relative to an owner window bounds.
   */
  public static calculateCenterOwner(
    width: number,
    height: number,
    ownerWindow?: BrowserWindow | null,
  ): { x: number; y: number } {
    if (ownerWindow && !ownerWindow.isDestroyed()) {
      try {
        const ownerBounds = ownerWindow.getBounds();
        const x = Math.round(ownerBounds.x + Math.max(0, (ownerBounds.width - width) / 2));
        const y = Math.round(ownerBounds.y + Math.max(0, (ownerBounds.height - height) / 2));

        // Ensure clamped within work area of the display containing owner
        const display = DpiManager.getDisplayNearestPoint(ownerBounds.x, ownerBounds.y);
        return DpiManager.clampToBounds(x, y, width, height, display?.workArea);
      } catch {
        // Fall back to center screen below
      }
    }
    return DpiManager.calculateCenterScreen(width, height);
  }

  /**
   * Clamps window position and dimensions strictly inside the display work area.
   */
  public static clampToBounds(
    x: number,
    y: number,
    width: number,
    height: number,
    workArea?: Rectangle | undefined,
  ): { x: number; y: number } {
    const area = workArea ?? DpiManager.getPrimaryWorkArea();
    const clampedX = Math.max(area.x, Math.min(x, area.x + area.width - Math.min(width, area.width)));
    const clampedY = Math.max(area.y, Math.min(y, area.y + area.height - Math.min(height, area.height)));
    return { x: clampedX, y: clampedY };
  }

  /**
   * Adjusts a window's position to ensure it remains visible on screen after display configuration changes.
   */
  public static ensureWindowOnScreen(window: BrowserWindow): void {
    if (!window || window.isDestroyed()) return;

    try {
      const bounds = window.getBounds();
      const display = DpiManager.getDisplayNearestPoint(bounds.x, bounds.y);
      const workArea = display ? display.workArea : DpiManager.getPrimaryWorkArea();

      const clamped = DpiManager.clampToBounds(
        bounds.x,
        bounds.y,
        bounds.width,
        bounds.height,
        workArea,
      );

      if (clamped.x !== bounds.x || clamped.y !== bounds.y) {
        window.setPosition(clamped.x, clamped.y, false);
      }
    } catch {
      // Best-effort
    }
  }

  /**
   * Observes display metric changes and triggers repositioning callback.
   */
  public observeDisplayChanges(callback: () => void): () => void {
    try {
      if (!screen || typeof screen.on !== 'function') {
        return () => {};
      }

      const handler = () => {
        try {
          callback();
        } catch {
          // Best effort
        }
      };

      screen.on('display-metrics-changed', handler);
      screen.on('display-added', handler);
      screen.on('display-removed', handler);

      const cleanup = () => {
        try {
          screen.removeListener('display-metrics-changed', handler);
          screen.removeListener('display-added', handler);
          screen.removeListener('display-removed', handler);
        } catch {
          // Ignore
        }
      };

      this.displayChangeCleanup = cleanup;
      return cleanup;
    } catch {
      return () => {};
    }
  }

  public dispose(): void {
    if (this.displayChangeCleanup) {
      this.displayChangeCleanup();
      this.displayChangeCleanup = null;
    }
  }
}
