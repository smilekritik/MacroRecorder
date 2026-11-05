/**
 * Types and interfaces for application preferences storage.
 */

import {
  AppTheme,
  GamepadOutputType,
  type AppPreferences,
  type AppPreferencesWire,
  DEFAULT_APP_PREFERENCES,
  type HotkeyBinding,
  type HotkeyBindingWire,
  MouseButton,
  WheelDirection,
} from '../../../contracts/src/index.js';

export {
  AppTheme,
  GamepadOutputType,
  type AppPreferences,
  type AppPreferencesWire,
  DEFAULT_APP_PREFERENCES,
  type HotkeyBinding,
  type HotkeyBindingWire,
  MouseButton,
  WheelDirection,
};

export interface WindowPlacement {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly isMaximized?: boolean | undefined;
}

export interface PreferencesStoreOptions {
  readonly filePath?: string | undefined;
  readonly rootPath?: string | undefined;
  readonly defaultLanguage?: string | undefined;
  readonly autoSave?: boolean | undefined;
  readonly executeMigration?: boolean | undefined;
}

export interface OverlayPreferences {
  readonly scalePercent: number;
  readonly annotationScalePercent: number;
  readonly infoTransparencyPercent: number;
  readonly annotationTransparencyPercent: number;
  readonly showInformation: boolean;
  readonly showAnnotations: boolean;
  readonly showAnnotationTiming: boolean;
  readonly showState: boolean;
  readonly showMacroName: boolean;
  readonly showCurrentAction: boolean;
  readonly showSchedule: boolean;
  readonly showLatency: boolean;
  readonly infoX: number;
  readonly infoY: number;
  readonly annotationX: number;
  readonly annotationY: number;
}

export interface OverlayPlacement {
  readonly infoX: number;
  readonly infoY: number;
  readonly annotationX: number;
  readonly annotationY: number;
}

export interface HotkeyPreferences {
  readonly recordingStart: HotkeyBinding;
  readonly recordingStop: HotkeyBinding;
  readonly playbackPause: HotkeyBinding;
  readonly emergencyStop: HotkeyBinding;
  readonly pixelCapture: HotkeyBinding;
  readonly bindMap: HotkeyBinding;
}
