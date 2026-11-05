/**
 * @macro-recorder/desktop - Main Process Window Management Types
 * Strongly typed window IDs, specifications, and options.
 */

import type { BrowserWindow, BrowserWindowConstructorOptions } from 'electron';

export type WindowId =
  | 'MainWindow'
  | 'BindMapWindow'
  | 'SettingsWindow'
  | 'FloatingToolbarWindow'
  | 'GamepadTesterWindow'
  | 'KeyCodeInspectorWindow'
  | 'PixelInspectorWindow'
  | 'PixelPickerWindow'
  | 'WindowInspectorWindow'
  | 'OverlayWindow'
  | 'OverlayPlacementWindow'
  | 'AddActionWindow'
  | 'AlreadyRunningWindow'
  | 'ChoiceWindow'
  | 'ConfirmDeleteWindow'
  | 'ConfirmImportWindow'
  | 'FirstRunWindow'
  | 'ImportReportWindow'
  | 'TextPromptWindow'
  | 'WelcomeWindow';

export type WindowCategory =
  | 'primary'
  | 'auxiliary'
  | 'inspector'
  | 'overlay'
  | 'dialog';

export interface WindowSpecification {
  readonly id: WindowId;
  readonly legacyId: string;
  readonly title: string;
  readonly category: WindowCategory;
  readonly width: number;
  readonly height: number;
  readonly minWidth?: number | undefined;
  readonly minHeight?: number | undefined;
  readonly maxWidth?: number | undefined;
  readonly maxHeight?: number | undefined;
  readonly resizable: boolean;
  readonly minimizable?: boolean | undefined;
  readonly maximizable?: boolean | undefined;
  readonly topmost: boolean;
  readonly topmostLevel?: 'normal' | 'floating' | 'screen-saver' | undefined;
  readonly showInTaskbar: boolean;
  readonly frame: boolean;
  readonly transparent: boolean;
  readonly backgroundColor: string;
  readonly focusable: boolean;
  readonly startupLocation: 'center-screen' | 'center-owner' | 'manual';
  readonly isModal?: boolean | undefined;
  readonly clickThrough?: boolean | undefined;
  readonly defaultRoute: string;
}

export interface WindowBoundsState {
  readonly x?: number | undefined;
  readonly y?: number | undefined;
  readonly width: number;
  readonly height: number;
  readonly isMaximized?: boolean | undefined;
}

export interface WindowManagerOptions {
  readonly iconPath?: string | undefined;
  readonly windowFactory?: ((options: BrowserWindowConstructorOptions) => BrowserWindow) | undefined;
  readonly preloadPath?: string | undefined;
  readonly rendererUrl?: string | undefined;
  readonly rendererHtmlPath?: string | undefined;
  readonly devTools?: boolean | undefined;
  readonly onEmergencyStop?: ((reason: string) => void) | undefined;
  readonly onDisposeSubscription?: ((webContentsId: number) => void) | undefined;
}

export interface WindowOpenParams {
  readonly [key: string]: unknown;
}

export interface WindowStateEvent {
  readonly windowId: WindowId | string;
  readonly state: 'opened' | 'closed' | 'minimized' | 'restored' | 'focused' | 'blurred' | 'crashed';
}

export interface CrossWindowBroadcastMessage<T = unknown> {
  readonly type: string;
  readonly payload: T;
  readonly sourceWindowId?: string | undefined;
}
