/**
 * @macro-recorder/desktop - Windows DWM Chrome Theming Manager
 * Configures title bars, system theme attribute, and dark/light mode palette.
 */

import { nativeTheme, type BrowserWindow } from 'electron';

export type AppTheme = 'dark' | 'light' | 'system';

export class DwmThemingManager {
  private currentTheme: AppTheme = 'dark';

  constructor(initialTheme: AppTheme = 'dark') {
    this.currentTheme = initialTheme;
    this.applySystemThemeSource(initialTheme);
  }

  /**
   * Applies the theme to Electron nativeTheme and all active windows.
   */
  public setTheme(theme: AppTheme, windows: readonly BrowserWindow[]): void {
    this.currentTheme = theme;
    this.applySystemThemeSource(theme);

    const isDark = this.isDark();
    const bgColor = isDark ? '#1E1E1E' : '#FFFFFF';

    for (const win of windows) {
      if (win && !win.isDestroyed()) {
        try {
          win.setBackgroundColor(bgColor);
          if (typeof win.setTitleBarOverlay === 'function') {
            win.setTitleBarOverlay({
              color: isDark ? '#1E1E1E' : '#F3F3F3',
              symbolColor: isDark ? '#FFFFFF' : '#000000',
            });
          }
        } catch {
          // Best effort
        }
      }
    }
  }

  public getTheme(): AppTheme {
    return this.currentTheme;
  }

  public isDark(): boolean {
    if (this.currentTheme === 'system') {
      return nativeTheme?.shouldUseDarkColors ?? true;
    }
    return this.currentTheme === 'dark';
  }

  /**
   * Configures new window with current theme attributes.
   */
  public configureWindow(window: BrowserWindow): void {
    if (!window || window.isDestroyed()) return;

    try {
      const isDark = this.isDark();
      window.setBackgroundColor(isDark ? '#1E1E1E' : '#FFFFFF');

      if (typeof window.setTitleBarOverlay === 'function') {
        window.setTitleBarOverlay({
          color: isDark ? '#1E1E1E' : '#F3F3F3',
          symbolColor: isDark ? '#FFFFFF' : '#000000',
        });
      }
    } catch {
      // Best effort
    }
  }

  private applySystemThemeSource(theme: AppTheme): void {
    try {
      if (nativeTheme) {
        nativeTheme.themeSource = theme;
      }
    } catch {
      // Native theme not available in mock/test
    }
  }
}
