/**
 * TrayManager manages the life cycle of the system tray icon,
 * tooltip, context menu, and click/double-click event routing.
 */

import { Menu, Tray, nativeImage, type NativeImage } from 'electron';
import { AppLog } from '../lifecycle/logging.js';
import { buildTrayMenuItems, getTrayString } from './tray-menu.js';
import type { TrayCallbacks, TrayConfig } from './types.js';

export interface TrayManagerOptions extends TrayConfig {
  readonly trayFactory?: (image: NativeImage | string) => Tray;
  readonly menuBuilder?: typeof Menu.buildFromTemplate;
}

export class TrayManager {
  private tray: Tray | null = null;
  private readonly callbacks: TrayCallbacks;
  private emergencyStopHotkey: string;
  private language: string;
  private readonly iconPath?: string | undefined;
  private readonly trayFactory: (image: NativeImage | string) => Tray;
  private readonly menuBuilder: typeof Menu.buildFromTemplate;

  constructor(options: TrayManagerOptions) {
    this.callbacks = options.callbacks;
    this.emergencyStopHotkey = options.emergencyStopHotkey ?? 'F10';
    this.language = options.language ?? 'en';
    this.iconPath = options.iconPath;
    this.trayFactory = options.trayFactory ?? ((img) => new Tray(img));
    this.menuBuilder = options.menuBuilder ?? Menu.buildFromTemplate;
  }

  /**
   * Initializes the tray icon, tooltip, and context menu.
   */
  public initialize(): void {
    if (this.tray) return;

    try {
      const image = this.resolveIcon();
      this.tray = this.trayFactory(image);

      this.updateTooltip();
      this.updateContextMenu();

      this.tray.on('double-click', () => {
        this.callbacks.onOpenMainWindow();
      });

      this.tray.on('click', () => {
        // Single click on Windows can also restore main window
        this.callbacks.onOpenMainWindow();
      });
    } catch (err) {
      AppLog.warn(
        `Tray initialization failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  /**
   * Resolves the icon to display: either custom file, or a generated 16x16 transparent image.
   */
  private resolveIcon(): NativeImage | string {
    if (this.iconPath) {
      try {
        if (typeof nativeImage !== 'undefined' && nativeImage.createFromPath) {
          const img = nativeImage.createFromPath(this.iconPath);
          if (img && !img.isEmpty()) return img;
        }
      } catch {
        // Fallback to empty icon
      }
    }

    try {
      if (typeof nativeImage !== 'undefined' && nativeImage.createEmpty) {
        return nativeImage.createEmpty();
      }
    } catch {
      // Ignored
    }

    return '';
  }

  /**
   * Updates the localized tray tooltip.
   */
  public updateTooltip(): void {
    if (!this.tray) return;
    const tooltip = getTrayString('tooltip', this.language);
    this.tray.setToolTip(tooltip);
  }

  /**
   * Reconstructs and sets the tray context menu.
   */
  public updateContextMenu(): void {
    if (!this.tray) return;
    const items = buildTrayMenuItems(this.callbacks, this.emergencyStopHotkey, this.language);
    const menu = this.menuBuilder(items);
    this.tray.setContextMenu(menu);
  }

  /**
   * Updates the emergency stop hotkey displayed in the context menu.
   */
  public updateEmergencyHotkey(hotkey: string): void {
    this.emergencyStopHotkey = hotkey;
    this.updateContextMenu();
  }

  /**
   * Updates the application language for the tray menu and tooltip.
   */
  public updateLanguage(language: string): void {
    this.language = language;
    this.updateTooltip();
    this.updateContextMenu();
  }

  /**
   * Returns the underlying Electron Tray instance.
   */
  public getTray(): Tray | null {
    return this.tray;
  }

  /**
   * Destroys the tray icon and releases resources.
   */
  public destroy(): void {
    if (this.tray) {
      try {
        this.tray.destroy();
      } catch {
        // Ignored on teardown
      }
      this.tray = null;
    }
  }
}
