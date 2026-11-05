/**
 * Window visibility management:
 * Handles close/minimize behaviors matching user preferences (minimize to tray,
 * close to tray, unsaved changes confirmation, and foreground restoration).
 */

import type { BrowserWindow } from 'electron';
import type { WindowVisibilityOptions } from './types.js';

export class WindowVisibilityManager {
  private readonly options: WindowVisibilityOptions;
  private isQuitting = false;

  constructor(options: WindowVisibilityOptions = {}) {
    this.options = {
      minimizeToTray: true,
      closeToTray: false,
      ...options,
    };
  }

  /**
   * Sets up event listeners on the main window for minimize and close lifecycle events.
   */
  public attachToWindow(window: BrowserWindow): void {
    if (!window || window.isDestroyed()) return;

    window.on('minimize', () => {
      if (this.options.onBeforeMinimize) {
        Promise.resolve(this.options.onBeforeMinimize())
          .then((allowed) => {
            if (!allowed) {
              this.restoreMainWindow(window);
            } else if (this.options.minimizeToTray) {
              window.hide();
            }
          })
          .catch(() => {
            if (this.options.minimizeToTray) {
              window.hide();
            }
          });
        return;
      }

      if (this.options.minimizeToTray) {
        // Hide window completely so it disappears from the taskbar and lives in tray
        window.hide();
      }
    });

    window.on('close', (event: { preventDefault: () => void }) => {
      if (this.isQuitting) {
        return; // Allow native close when intentional shutdown is underway
      }

      if (this.options.closeToTray) {
        event.preventDefault();
        window.hide();
        return;
      }

      if (this.options.onBeforeClose) {
        event.preventDefault();
        Promise.resolve(this.options.onBeforeClose())
          .then((proceed) => {
            if (proceed) {
              this.isQuitting = true;
              this.options.onExitRequested?.();
              window.close();
            }
          })
          .catch(() => {
            // If beforeClose threw, stay open for safety
          });
        return;
      }

      if (this.options.onExitRequested) {
        this.isQuitting = true;
        this.options.onExitRequested();
      }
    });
  }

  /**
   * Restores, activates, and brings the main window to the foreground without stealing focus inappropriately.
   */
  public restoreMainWindow(window: BrowserWindow): void {
    if (!window || window.isDestroyed()) return;

    window.show();
    window.setSkipTaskbar(false);

    if (window.isMinimized()) {
      window.restore();
    }

    // Toggle topmost briefly to ensure the window surfaces above all background windows
    window.setAlwaysOnTop(true);
    window.setAlwaysOnTop(false);
    window.focus();
  }

  /**
   * Flags that intentional application quit is occurring, bypassing close-to-tray guards.
   */
  public prepareForExit(): void {
    this.isQuitting = true;
  }
}
