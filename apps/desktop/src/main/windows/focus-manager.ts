/**
 * @macro-recorder/desktop - Window Focus Manager
 * Tracks focus history and restores focus to owner/previous window upon auxiliary window close.
 */

import type { BrowserWindow } from 'electron';

export class FocusManager {
  private lastFocusedWindow: BrowserWindow | null = null;
  private readonly focusHistory: BrowserWindow[] = [];

  /**
   * Records window focus transition.
   */
  public recordFocus(window: BrowserWindow): void {
    if (!window || window.isDestroyed()) return;

    // Filter out destroyed windows from history
    const filtered = this.focusHistory.filter((w) => !w.isDestroyed() && w !== window);
    this.focusHistory.length = 0;
    this.focusHistory.push(...filtered, window);

    this.lastFocusedWindow = window;
  }

  /**
   * Retrieves the previously focused window (skipping the current window).
   */
  public getPreviousFocusedWindow(currentWindow?: BrowserWindow | null): BrowserWindow | null {
    for (let i = this.focusHistory.length - 1; i >= 0; i--) {
      const win = this.focusHistory[i];
      if (win && !win.isDestroyed() && win !== currentWindow) {
        return win;
      }
    }
    return null;
  }

  /**
   * Restores focus to the owner window or previously active window when an auxiliary window closes.
   */
  public restoreFocusAfterClose(
    closedWindow: BrowserWindow,
    ownerWindow?: BrowserWindow | null,
  ): boolean {
    // 1. If an owner window is specified and still alive, focus it
    if (ownerWindow && !ownerWindow.isDestroyed()) {
      try {
        if (ownerWindow.isMinimized()) {
          ownerWindow.restore();
        }
        ownerWindow.show();
        ownerWindow.focus();
        return true;
      } catch {
        // Fall back below
      }
    }

    // 2. Otherwise focus previous window from history
    const candidate = this.getPreviousFocusedWindow(closedWindow);
    // A window the user hid or sent to the tray stays there.
    if (candidate && !candidate.isDestroyed() && candidate.isVisible() && !candidate.isMinimized()) {
      try {
        candidate.focus();
        return true;
      } catch {
        // Best effort
      }
    }

    return false;
  }

  /**
   * Removes a window from tracking when closed.
   */
  public removeWindow(window: BrowserWindow): void {
    const idx = this.focusHistory.indexOf(window);
    if (idx !== -1) {
      this.focusHistory.splice(idx, 1);
    }
    if (this.lastFocusedWindow === window) {
      this.lastFocusedWindow = this.getPreviousFocusedWindow(window);
    }
  }

  public clear(): void {
    this.focusHistory.length = 0;
    this.lastFocusedWindow = null;
  }
}
