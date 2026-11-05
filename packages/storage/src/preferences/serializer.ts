/**
 * Serialization and deserialization for settings.json.
 * Preserves absent-versus-empty semantics, one-time migration, and unknown fields.
 */

import {
  AppTheme,
  GamepadOutputType,
  MouseButton,
  WheelDirection,
  type AppPreferences,
  type HotkeyBinding,
  type HotkeyBindingWire,
  DEFAULT_HOTKEY_BINDING,
  VirtualKeyCodes,
  toWireAppPreferences,
} from '../../../contracts/src/index.js';
import { clamp, clampUnit, detectSystemLanguage } from './defaults.js';
import { DEFAULT_BIND_MAP_VK, migrateBindMapHotkey } from './migration.js';

export const DEFAULT_RECORDING_START_VK = VirtualKeyCodes.VK_F7; // 118 (0x76)
export const DEFAULT_RECORDING_STOP_VK = VirtualKeyCodes.VK_F8; // 119 (0x77)
export const DEFAULT_PLAYBACK_PAUSE_VK = VirtualKeyCodes.VK_F9; // 120 (0x78)
export const DEFAULT_EMERGENCY_STOP_VK = VirtualKeyCodes.VK_F10; // 121 (0x79)
export const DEFAULT_PIXEL_CAPTURE_VK = VirtualKeyCodes.VK_F5; // 116 (0x74)

const KNOWN_SERIALIZER_KEYS = new Set([
  'Theme',
  'theme',
  'LanguageCode',
  'languageCode',
  'MacroLibraryPath',
  'macroLibraryPath',
  'StartWithWindows',
  'startWithWindows',
  'ShowMacroInformation',
  'showMacroInformation',
  'GamepadDriverPromptDismissed',
  'gamepadDriverPromptDismissed',
  'GamepadOutput',
  'gamepadOutput',
  'HideRealGamepad',
  'hideRealGamepad',
  'OverlayScalePercent',
  'overlayScalePercent',
  'OverlayInfoTransparencyPercent',
  'overlayInfoTransparencyPercent',
  'ShowOverlayAnnotations',
  'showOverlayAnnotations',
  'ShowOverlayAnnotationTiming',
  'showOverlayAnnotationTiming',
  'OverlayAnnotationScalePercent',
  'overlayAnnotationScalePercent',
  'OverlayAnnotationTransparencyPercent',
  'overlayAnnotationTransparencyPercent',
  'OverlayInfoX',
  'overlayInfoX',
  'OverlayInfoY',
  'overlayInfoY',
  'OverlayAnnotationX',
  'overlayAnnotationX',
  'OverlayAnnotationY',
  'overlayAnnotationY',
  'ShowOverlayState',
  'showOverlayState',
  'ShowOverlayMacroName',
  'showOverlayMacroName',
  'ShowOverlayCurrentAction',
  'showOverlayCurrentAction',
  'ShowOverlaySchedule',
  'showOverlaySchedule',
  'ShowOverlayLatency',
  'showOverlayLatency',
  'RecordingStartHotkey',
  'recordingStartHotkey',
  'RecordingStopHotkey',
  'recordingStopHotkey',
  'PlaybackPauseHotkey',
  'playbackPauseHotkey',
  'EmergencyStopHotkey',
  'emergencyStopHotkey',
  'PixelCaptureHotkey',
  'pixelCaptureHotkey',
  'BindMapHotkey',
  'bindMapHotkey',
]);

export interface ParsePreferencesOptions {
  readonly executeMigration?: boolean | undefined;
  readonly systemLanguageFallback?: boolean | undefined;
}

export interface ParsePreferencesResult {
  readonly preferences: AppPreferences;
  readonly isFirstRun: boolean;
  readonly migrated: boolean;
}

/**
 * Parses hotkey binding wire object with absent-versus-empty semantics:
 * - If rawVal is absent (undefined) or null: returns fallback default binding with fallbackVk.
 * - If rawVal is present as an object (even with virtualKey: 0): preserves cleared binding intent!
 */
export function parseHotkeyField(rawVal: unknown, fallbackVk: number): HotkeyBinding {
  if (rawVal === undefined || rawVal === null) {
    return {
      ...DEFAULT_HOTKEY_BINDING,
      virtualKey: fallbackVk,
    };
  }

  if (typeof rawVal !== 'object' || Array.isArray(rawVal)) {
    return {
      ...DEFAULT_HOTKEY_BINDING,
      virtualKey: fallbackVk,
    };
  }

  const wire = rawVal as HotkeyBindingWire;
  const rawVk = wire.VirtualKey ?? wire.virtualKey;
  const virtualKey = typeof rawVk === 'number' && Number.isInteger(rawVk) ? rawVk : 0;

  const rawMb = String(wire.MouseButton ?? wire.mouseButton ?? MouseButton.None);
  let mouseButton: MouseButton = MouseButton.None;
  if (Object.values(MouseButton).includes(rawMb as MouseButton)) {
    mouseButton = rawMb as MouseButton;
  }

  const rawWheel = String(wire.Wheel ?? wire.wheel ?? WheelDirection.None);
  let wheel: WheelDirection = WheelDirection.None;
  if (Object.values(WheelDirection).includes(rawWheel as WheelDirection)) {
    wheel = rawWheel as WheelDirection;
  }

  const control = Boolean(wire.Control ?? wire.control ?? false);
  const alt = Boolean(wire.Alt ?? wire.alt ?? false);
  const shift = Boolean(wire.Shift ?? wire.shift ?? false);
  const windows = Boolean(wire.Windows ?? wire.windows ?? false);

  const binding: HotkeyBinding = {
    virtualKey,
    mouseButton,
    wheel,
    control,
    alt,
    shift,
    windows,
  };
  return binding;
}

/**
 * Parses preferences JSON text with strict schema compatibility and absent-versus-empty preservation.
 */
export function parsePreferencesJson(
  jsonText: string,
  options: ParsePreferencesOptions = {},
): ParsePreferencesResult {
  const raw = JSON.parse(jsonText);
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new Error('Preferences JSON must be an object');
  }

  const obj = raw as Record<string, unknown>;

  // Theme
  const themeRaw = String(obj['theme'] ?? obj['Theme'] ?? AppTheme.Dark);
  const theme = themeRaw.toLowerCase() === 'light' ? AppTheme.Light : AppTheme.Dark;

  // Language
  let languageCode = String(obj['languageCode'] ?? obj['LanguageCode'] ?? '');
  if (languageCode.trim().length === 0) {
    languageCode = options.systemLanguageFallback ? detectSystemLanguage() : 'ru';
  }

  // Paths and core flags
  const macroLibraryPath = String(obj['macroLibraryPath'] ?? obj['MacroLibraryPath'] ?? '');
  const startWithWindows = Boolean(obj['startWithWindows'] ?? obj['StartWithWindows'] ?? true);
  const showMacroInformation = Boolean(
    obj['showMacroInformation'] ?? obj['ShowMacroInformation'] ?? true,
  );
  const gamepadDriverPromptDismissed = Boolean(
    obj['gamepadDriverPromptDismissed'] ?? obj['GamepadDriverPromptDismissed'] ?? false,
  );

  const gamepadOutputRaw = String(
    obj['gamepadOutput'] ?? obj['GamepadOutput'] ?? GamepadOutputType.Xbox360,
  );
  const gamepadOutput =
    gamepadOutputRaw.toLowerCase() === 'dualshock4'
      ? GamepadOutputType.DualShock4
      : GamepadOutputType.Xbox360;

  const hideRealGamepad = Boolean(obj['hideRealGamepad'] ?? obj['HideRealGamepad'] ?? false);

  // Overlays
  const overlayScalePercent = clamp(
    Number(obj['overlayScalePercent'] ?? obj['OverlayScalePercent'] ?? 100),
    25,
    200,
  );
  const overlayInfoTransparencyPercent = clamp(
    Number(obj['overlayInfoTransparencyPercent'] ?? obj['OverlayInfoTransparencyPercent'] ?? 0),
    0,
    100,
  );
  const showOverlayAnnotations = Boolean(
    obj['showOverlayAnnotations'] ?? obj['ShowOverlayAnnotations'] ?? true,
  );
  const showOverlayAnnotationTiming = Boolean(
    obj['showOverlayAnnotationTiming'] ?? obj['ShowOverlayAnnotationTiming'] ?? true,
  );
  const overlayAnnotationScalePercent = clamp(
    Number(obj['overlayAnnotationScalePercent'] ?? obj['OverlayAnnotationScalePercent'] ?? 100),
    25,
    200,
  );
  const overlayAnnotationTransparencyPercent = clamp(
    Number(
      obj['overlayAnnotationTransparencyPercent'] ??
        obj['OverlayAnnotationTransparencyPercent'] ??
        0,
    ),
    0,
    100,
  );
  const overlayInfoX = clampUnit(Number(obj['overlayInfoX'] ?? obj['OverlayInfoX'] ?? 1));
  const overlayInfoY = clampUnit(Number(obj['overlayInfoY'] ?? obj['OverlayInfoY'] ?? 0));
  const overlayAnnotationX = clampUnit(
    Number(obj['overlayAnnotationX'] ?? obj['OverlayAnnotationX'] ?? 1),
  );
  const overlayAnnotationY = clampUnit(
    Number(obj['overlayAnnotationY'] ?? obj['OverlayAnnotationY'] ?? 1),
  );

  const showOverlayState = Boolean(obj['showOverlayState'] ?? obj['ShowOverlayState'] ?? true);
  const showOverlayMacroName = Boolean(
    obj['showOverlayMacroName'] ?? obj['ShowOverlayMacroName'] ?? true,
  );
  const showOverlayCurrentAction = Boolean(
    obj['showOverlayCurrentAction'] ?? obj['ShowOverlayCurrentAction'] ?? true,
  );
  const showOverlaySchedule = Boolean(
    obj['showOverlaySchedule'] ?? obj['ShowOverlaySchedule'] ?? true,
  );
  const showOverlayLatency = Boolean(
    obj['showOverlayLatency'] ?? obj['ShowOverlayLatency'] ?? true,
  );

  // Application hotkeys with cleared-intent preservation
  const recordingStartHotkey = parseHotkeyField(
    obj['recordingStartHotkey'] ?? obj['RecordingStartHotkey'],
    DEFAULT_RECORDING_START_VK,
  );
  const recordingStopHotkey = parseHotkeyField(
    obj['recordingStopHotkey'] ?? obj['RecordingStopHotkey'],
    DEFAULT_RECORDING_STOP_VK,
  );
  const playbackPauseHotkey = parseHotkeyField(
    obj['playbackPauseHotkey'] ?? obj['PlaybackPauseHotkey'],
    DEFAULT_PLAYBACK_PAUSE_VK,
  );
  const emergencyStopHotkey = parseHotkeyField(
    obj['emergencyStopHotkey'] ?? obj['EmergencyStopHotkey'],
    DEFAULT_EMERGENCY_STOP_VK,
  );
  const pixelCaptureHotkey = parseHotkeyField(
    obj['pixelCaptureHotkey'] ?? obj['PixelCaptureHotkey'],
    DEFAULT_PIXEL_CAPTURE_VK,
  );

  // Bind map with one-time migration
  const rawBindMap = parseHotkeyField(
    obj['bindMapHotkey'] ?? obj['BindMapHotkey'],
    DEFAULT_BIND_MAP_VK,
  );

  let bindMapHotkey = rawBindMap;
  let migrated = false;
  if (options.executeMigration !== false) {
    const migrationResult = migrateBindMapHotkey(rawBindMap, false);
    bindMapHotkey = migrationResult.binding;
    migrated = migrationResult.migrated;
  }

  // Preserve unknown forward-compatible fields
  const unknownFields: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (!KNOWN_SERIALIZER_KEYS.has(key)) {
      unknownFields[key] = value;
    }
  }

  const preferences: AppPreferences = {
    theme,
    languageCode,
    macroLibraryPath,
    startWithWindows,
    showMacroInformation,
    gamepadDriverPromptDismissed,
    gamepadOutput,
    hideRealGamepad,
    overlayScalePercent,
    overlayInfoTransparencyPercent,
    showOverlayAnnotations,
    showOverlayAnnotationTiming,
    overlayAnnotationScalePercent,
    overlayAnnotationTransparencyPercent,
    overlayInfoX,
    overlayInfoY,
    overlayAnnotationX,
    overlayAnnotationY,
    showOverlayState,
    showOverlayMacroName,
    showOverlayCurrentAction,
    showOverlaySchedule,
    showOverlayLatency,
    recordingStartHotkey,
    recordingStopHotkey,
    playbackPauseHotkey,
    emergencyStopHotkey,
    pixelCaptureHotkey,
    bindMapHotkey,
    ...(Object.keys(unknownFields).length > 0 ? { unknownFields } : {}),
  };

  return {
    preferences,
    isFirstRun: false,
    migrated,
  };
}

export interface SerializePreferencesOptions {
  readonly pretty?: boolean | undefined;
}

/**
 * Serializes AppPreferences into settings.json wire format.
 */
export function serializePreferencesJson(
  prefs: AppPreferences,
  options: SerializePreferencesOptions = {},
): string {
  const wire = toWireAppPreferences(prefs, true);
  const indent = options.pretty !== false ? 2 : undefined;
  return JSON.stringify(wire, null, indent) + '\n';
}
