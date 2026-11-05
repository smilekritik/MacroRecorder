/**
 * Types and interfaces for system tray management, tray menu items,
 * and window minimize/close behavior.
 */

export interface TrayCallbacks {
  readonly onOpenMainWindow: () => void;
  readonly onToggleFloatingToolbar?: () => void;
  readonly onDisableAllMacros?: () => Promise<void> | void;
  readonly onEmergencyStop: () => void;
  readonly onExit: () => void;
}

export interface TrayConfig {
  readonly iconPath?: string | undefined;
  readonly emergencyStopHotkey?: string | undefined;
  readonly language?: string | undefined;
  readonly theme?: 'Dark' | 'Light' | undefined;
  readonly callbacks: TrayCallbacks;
}

export interface WindowVisibilityOptions {
  /** When true, minimizing the main window hides it to the tray */
  readonly minimizeToTray?: boolean | undefined;
  /** When true, closing the main window exits the app; otherwise minimizes to tray */
  readonly closeToTray?: boolean | undefined;
  /** Callback to verify whether closing/minimizing should proceed (e.g. unsaved changes check) */
  readonly onBeforeClose?: () => Promise<boolean> | boolean;
  readonly onBeforeMinimize?: () => Promise<boolean> | boolean;
  readonly onExitRequested?: () => void;
}
