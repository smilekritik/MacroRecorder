/**
 * Application preferences contract and wire model matching settings.json.
 */

import {
  boolean,
  integer,
  number,
  object,
  string,
  type Schema,
  type ValidationResult,
} from '../common/validation.js';
import {
  AppTheme,
  appThemeSchema,
  GamepadOutputType,
  gamepadOutputTypeSchema,
} from '../domain/enums.js';
import {
  DEFAULT_HOTKEY_BINDING,
  type HotkeyBinding,
  type HotkeyBindingWire,
  hotkeyBindingSchema,
  parseHotkeyBindingWire,
  sameGesture,
} from '../domain/hotkey.js';
import { VirtualKeyCodes } from '../domain/key-constants.js';

export const DEFAULT_RECORDING_START_VK = VirtualKeyCodes.VK_F7; // 0x76
export const DEFAULT_RECORDING_STOP_VK = VirtualKeyCodes.VK_F8; // 0x77
export const DEFAULT_PLAYBACK_PAUSE_VK = VirtualKeyCodes.VK_F9; // 0x78
export const DEFAULT_EMERGENCY_STOP_VK = VirtualKeyCodes.VK_F10; // 0x79
export const DEFAULT_PIXEL_CAPTURE_VK = VirtualKeyCodes.VK_F5; // 0x74
export const DEFAULT_BIND_MAP_VK = VirtualKeyCodes.VK_F11; // 0x7a
export const LEGACY_BIND_MAP_VK = VirtualKeyCodes.VK_F12; // 0x7b

export interface AppPreferences {
  readonly theme: AppTheme;
  readonly languageCode: string;
  readonly macroLibraryPath: string;
  readonly startWithWindows: boolean;
  readonly showMacroInformation: boolean;
  readonly gamepadDriverPromptDismissed: boolean;
  readonly gamepadOutput: GamepadOutputType;
  readonly hideRealGamepad: boolean;
  readonly overlayScalePercent: number;
  readonly overlayInfoTransparencyPercent: number;
  readonly showOverlayAnnotations: boolean;
  readonly showOverlayAnnotationTiming: boolean;
  readonly overlayAnnotationScalePercent: number;
  readonly overlayAnnotationTransparencyPercent: number;
  readonly overlayInfoX: number;
  readonly overlayInfoY: number;
  readonly overlayAnnotationX: number;
  readonly overlayAnnotationY: number;
  readonly showOverlayState: boolean;
  readonly showOverlayMacroName: boolean;
  readonly showOverlayCurrentAction: boolean;
  readonly showOverlaySchedule: boolean;
  readonly showOverlayLatency: boolean;
  readonly recordingStartHotkey: HotkeyBinding;
  readonly recordingStopHotkey: HotkeyBinding;
  readonly playbackPauseHotkey: HotkeyBinding;
  readonly emergencyStopHotkey: HotkeyBinding;
  readonly pixelCaptureHotkey: HotkeyBinding;
  readonly bindMapHotkey: HotkeyBinding;
  readonly unknownFields?: Readonly<Record<string, unknown>> | undefined;
}

export interface AppPreferencesWire {
  readonly Theme?: string | undefined;
  readonly theme?: string | undefined;
  readonly LanguageCode?: string | undefined;
  readonly languageCode?: string | undefined;
  readonly MacroLibraryPath?: string | undefined;
  readonly macroLibraryPath?: string | undefined;
  readonly StartWithWindows?: boolean | undefined;
  readonly startWithWindows?: boolean | undefined;
  readonly ShowMacroInformation?: boolean | undefined;
  readonly showMacroInformation?: boolean | undefined;
  readonly GamepadDriverPromptDismissed?: boolean | undefined;
  readonly gamepadDriverPromptDismissed?: boolean | undefined;
  readonly GamepadOutput?: string | undefined;
  readonly gamepadOutput?: string | undefined;
  readonly HideRealGamepad?: boolean | undefined;
  readonly hideRealGamepad?: boolean | undefined;
  readonly OverlayScalePercent?: number | undefined;
  readonly overlayScalePercent?: number | undefined;
  readonly OverlayInfoTransparencyPercent?: number | undefined;
  readonly overlayInfoTransparencyPercent?: number | undefined;
  readonly ShowOverlayAnnotations?: boolean | undefined;
  readonly showOverlayAnnotations?: boolean | undefined;
  readonly ShowOverlayAnnotationTiming?: boolean | undefined;
  readonly showOverlayAnnotationTiming?: boolean | undefined;
  readonly OverlayAnnotationScalePercent?: number | undefined;
  readonly overlayAnnotationScalePercent?: number | undefined;
  readonly OverlayAnnotationTransparencyPercent?: number | undefined;
  readonly overlayAnnotationTransparencyPercent?: number | undefined;
  readonly OverlayInfoX?: number | undefined;
  readonly overlayInfoX?: number | undefined;
  readonly OverlayInfoY?: number | undefined;
  readonly overlayInfoY?: number | undefined;
  readonly OverlayAnnotationX?: number | undefined;
  readonly overlayAnnotationX?: number | undefined;
  readonly OverlayAnnotationY?: number | undefined;
  readonly overlayAnnotationY?: number | undefined;
  readonly ShowOverlayState?: boolean | undefined;
  readonly showOverlayState?: boolean | undefined;
  readonly ShowOverlayMacroName?: boolean | undefined;
  readonly showOverlayMacroName?: boolean | undefined;
  readonly ShowOverlayCurrentAction?: boolean | undefined;
  readonly showOverlayCurrentAction?: boolean | undefined;
  readonly ShowOverlaySchedule?: boolean | undefined;
  readonly showOverlaySchedule?: boolean | undefined;
  readonly ShowOverlayLatency?: boolean | undefined;
  readonly showOverlayLatency?: boolean | undefined;
  readonly RecordingStartHotkey?: HotkeyBindingWire | undefined;
  readonly recordingStartHotkey?: HotkeyBindingWire | undefined;
  readonly RecordingStopHotkey?: HotkeyBindingWire | undefined;
  readonly recordingStopHotkey?: HotkeyBindingWire | undefined;
  readonly PlaybackPauseHotkey?: HotkeyBindingWire | undefined;
  readonly playbackPauseHotkey?: HotkeyBindingWire | undefined;
  readonly EmergencyStopHotkey?: HotkeyBindingWire | undefined;
  readonly emergencyStopHotkey?: HotkeyBindingWire | undefined;
  readonly PixelCaptureHotkey?: HotkeyBindingWire | undefined;
  readonly pixelCaptureHotkey?: HotkeyBindingWire | undefined;
  readonly BindMapHotkey?: HotkeyBindingWire | undefined;
  readonly bindMapHotkey?: HotkeyBindingWire | undefined;
  readonly [unknownKey: string]: unknown;
}

export const DEFAULT_APP_PREFERENCES: AppPreferences = {
  theme: AppTheme.Dark,
  languageCode: 'ru',
  macroLibraryPath: '',
  startWithWindows: true,
  showMacroInformation: true,
  gamepadDriverPromptDismissed: false,
  gamepadOutput: GamepadOutputType.Xbox360,
  hideRealGamepad: false,
  overlayScalePercent: 100,
  overlayInfoTransparencyPercent: 0,
  showOverlayAnnotations: true,
  showOverlayAnnotationTiming: true,
  overlayAnnotationScalePercent: 100,
  overlayAnnotationTransparencyPercent: 0,
  overlayInfoX: 1,
  overlayInfoY: 0,
  overlayAnnotationX: 1,
  overlayAnnotationY: 1,
  showOverlayState: true,
  showOverlayMacroName: true,
  showOverlayCurrentAction: true,
  showOverlaySchedule: true,
  showOverlayLatency: true,
  recordingStartHotkey: { ...DEFAULT_HOTKEY_BINDING, virtualKey: DEFAULT_RECORDING_START_VK },
  recordingStopHotkey: { ...DEFAULT_HOTKEY_BINDING, virtualKey: DEFAULT_RECORDING_STOP_VK },
  playbackPauseHotkey: { ...DEFAULT_HOTKEY_BINDING, virtualKey: DEFAULT_PLAYBACK_PAUSE_VK },
  emergencyStopHotkey: { ...DEFAULT_HOTKEY_BINDING, virtualKey: DEFAULT_EMERGENCY_STOP_VK },
  pixelCaptureHotkey: { ...DEFAULT_HOTKEY_BINDING, virtualKey: DEFAULT_PIXEL_CAPTURE_VK },
  bindMapHotkey: { ...DEFAULT_HOTKEY_BINDING, virtualKey: DEFAULT_BIND_MAP_VK },
};

export const appPreferencesSchema: Schema<AppPreferences> = object({
  theme: appThemeSchema,
  languageCode: string({ min: 2, max: 10 }),
  macroLibraryPath: string(),
  startWithWindows: boolean(),
  showMacroInformation: boolean(),
  gamepadDriverPromptDismissed: boolean(),
  gamepadOutput: gamepadOutputTypeSchema,
  hideRealGamepad: boolean(),
  overlayScalePercent: integer({ min: 25, max: 200 }),
  overlayInfoTransparencyPercent: integer({ min: 0, max: 100 }),
  showOverlayAnnotations: boolean(),
  showOverlayAnnotationTiming: boolean(),
  overlayAnnotationScalePercent: integer({ min: 25, max: 200 }),
  overlayAnnotationTransparencyPercent: integer({ min: 0, max: 100 }),
  overlayInfoX: number({ min: 0, max: 1 }),
  overlayInfoY: number({ min: 0, max: 1 }),
  overlayAnnotationX: number({ min: 0, max: 1 }),
  overlayAnnotationY: number({ min: 0, max: 1 }),
  showOverlayState: boolean(),
  showOverlayMacroName: boolean(),
  showOverlayCurrentAction: boolean(),
  showOverlaySchedule: boolean(),
  showOverlayLatency: boolean(),
  recordingStartHotkey: hotkeyBindingSchema,
  recordingStopHotkey: hotkeyBindingSchema,
  playbackPauseHotkey: hotkeyBindingSchema,
  emergencyStopHotkey: hotkeyBindingSchema,
  pixelCaptureHotkey: hotkeyBindingSchema,
  bindMapHotkey: hotkeyBindingSchema,
});

/**
 * Migrates legacy F12 default bind map shortcut to F11 if user hadn't customized it.
 */
export function migrateBindMapHotkey(binding: HotkeyBinding): HotkeyBinding {
  const legacyDefault = { ...DEFAULT_HOTKEY_BINDING, virtualKey: LEGACY_BIND_MAP_VK };
  if (sameGesture(binding, legacyDefault)) {
    return { ...DEFAULT_HOTKEY_BINDING, virtualKey: DEFAULT_BIND_MAP_VK };
  }
  return binding;
}

const KNOWN_PREF_KEYS = new Set([
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

export function parseAppPreferences(raw: unknown, path = ''): ValidationResult<AppPreferences> {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return {
      success: false,
      errors: [{ path, message: 'Expected object for AppPreferences', received: raw }],
    };
  }

  const obj = raw as Record<string, unknown>;

  const themeRaw = String(obj['theme'] ?? obj['Theme'] ?? AppTheme.Dark);
  const theme = themeRaw.toLowerCase() === 'light' ? AppTheme.Light : AppTheme.Dark;

  const languageCode = String(obj['languageCode'] ?? obj['LanguageCode'] ?? 'ru');
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

  const clamp = (val: number, min: number, max: number) => Math.max(min, Math.min(max, val));
  const clamp01 = (val: number) => (Number.isFinite(val) ? clamp(val, 0, 1) : 0);

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
  const overlayInfoX = clamp01(Number(obj['overlayInfoX'] ?? obj['OverlayInfoX'] ?? 1));
  const overlayInfoY = clamp01(Number(obj['overlayInfoY'] ?? obj['OverlayInfoY'] ?? 0));
  const overlayAnnotationX = clamp01(
    Number(obj['overlayAnnotationX'] ?? obj['OverlayAnnotationX'] ?? 1),
  );
  const overlayAnnotationY = clamp01(
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

  const parseHotkey = (
    fieldCamel: string,
    fieldPascal: string,
    fallbackVk: number,
  ): HotkeyBinding => {
    const rawVal = obj[fieldCamel] ?? obj[fieldPascal];
    if (!rawVal) return { ...DEFAULT_HOTKEY_BINDING, virtualKey: fallbackVk };
    const parsed = parseHotkeyBindingWire(rawVal);
    return parsed.success ? parsed.data : { ...DEFAULT_HOTKEY_BINDING, virtualKey: fallbackVk };
  };

  const recordingStartHotkey = parseHotkey(
    'recordingStartHotkey',
    'RecordingStartHotkey',
    DEFAULT_RECORDING_START_VK,
  );
  const recordingStopHotkey = parseHotkey(
    'recordingStopHotkey',
    'RecordingStopHotkey',
    DEFAULT_RECORDING_STOP_VK,
  );
  const playbackPauseHotkey = parseHotkey(
    'playbackPauseHotkey',
    'PlaybackPauseHotkey',
    DEFAULT_PLAYBACK_PAUSE_VK,
  );
  const emergencyStopHotkey = parseHotkey(
    'emergencyStopHotkey',
    'EmergencyStopHotkey',
    DEFAULT_EMERGENCY_STOP_VK,
  );
  const pixelCaptureHotkey = parseHotkey(
    'pixelCaptureHotkey',
    'PixelCaptureHotkey',
    DEFAULT_PIXEL_CAPTURE_VK,
  );
  const rawBindMapHotkey = parseHotkey('bindMapHotkey', 'BindMapHotkey', DEFAULT_BIND_MAP_VK);
  const bindMapHotkey = migrateBindMapHotkey(rawBindMapHotkey);

  const unknownFields: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (!KNOWN_PREF_KEYS.has(key)) {
      unknownFields[key] = value;
    }
  }

  const prefs: AppPreferences = {
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

  return { success: true, data: prefs };
}

export function toWireAppPreferences(
  prefs: AppPreferences,
  pascalCase = true,
): Record<string, unknown> {
  const result: Record<string, unknown> = pascalCase
    ? {
        Theme: prefs.theme,
        LanguageCode: prefs.languageCode,
        MacroLibraryPath: prefs.macroLibraryPath,
        StartWithWindows: prefs.startWithWindows,
        ShowMacroInformation: prefs.showMacroInformation,
        GamepadDriverPromptDismissed: prefs.gamepadDriverPromptDismissed,
        GamepadOutput: prefs.gamepadOutput,
        HideRealGamepad: prefs.hideRealGamepad,
        OverlayScalePercent: prefs.overlayScalePercent,
        OverlayInfoTransparencyPercent: prefs.overlayInfoTransparencyPercent,
        ShowOverlayAnnotations: prefs.showOverlayAnnotations,
        ShowOverlayAnnotationTiming: prefs.showOverlayAnnotationTiming,
        OverlayAnnotationScalePercent: prefs.overlayAnnotationScalePercent,
        OverlayAnnotationTransparencyPercent: prefs.overlayAnnotationTransparencyPercent,
        OverlayInfoX: prefs.overlayInfoX,
        OverlayInfoY: prefs.overlayInfoY,
        OverlayAnnotationX: prefs.overlayAnnotationX,
        OverlayAnnotationY: prefs.overlayAnnotationY,
        ShowOverlayState: prefs.showOverlayState,
        ShowOverlayMacroName: prefs.showOverlayMacroName,
        ShowOverlayCurrentAction: prefs.showOverlayCurrentAction,
        ShowOverlaySchedule: prefs.showOverlaySchedule,
        ShowOverlayLatency: prefs.showOverlayLatency,
        RecordingStartHotkey: {
          VirtualKey: prefs.recordingStartHotkey.virtualKey,
          MouseButton: prefs.recordingStartHotkey.mouseButton,
          Wheel: prefs.recordingStartHotkey.wheel,
          Control: prefs.recordingStartHotkey.control,
          Alt: prefs.recordingStartHotkey.alt,
          Shift: prefs.recordingStartHotkey.shift,
          Windows: prefs.recordingStartHotkey.windows,
        },
        RecordingStopHotkey: {
          VirtualKey: prefs.recordingStopHotkey.virtualKey,
          MouseButton: prefs.recordingStopHotkey.mouseButton,
          Wheel: prefs.recordingStopHotkey.wheel,
          Control: prefs.recordingStopHotkey.control,
          Alt: prefs.recordingStopHotkey.alt,
          Shift: prefs.recordingStopHotkey.shift,
          Windows: prefs.recordingStopHotkey.windows,
        },
        PlaybackPauseHotkey: {
          VirtualKey: prefs.playbackPauseHotkey.virtualKey,
          MouseButton: prefs.playbackPauseHotkey.mouseButton,
          Wheel: prefs.playbackPauseHotkey.wheel,
          Control: prefs.playbackPauseHotkey.control,
          Alt: prefs.playbackPauseHotkey.alt,
          Shift: prefs.playbackPauseHotkey.shift,
          Windows: prefs.playbackPauseHotkey.windows,
        },
        EmergencyStopHotkey: {
          VirtualKey: prefs.emergencyStopHotkey.virtualKey,
          MouseButton: prefs.emergencyStopHotkey.mouseButton,
          Wheel: prefs.emergencyStopHotkey.wheel,
          Control: prefs.emergencyStopHotkey.control,
          Alt: prefs.emergencyStopHotkey.alt,
          Shift: prefs.emergencyStopHotkey.shift,
          Windows: prefs.emergencyStopHotkey.windows,
        },
        PixelCaptureHotkey: {
          VirtualKey: prefs.pixelCaptureHotkey.virtualKey,
          MouseButton: prefs.pixelCaptureHotkey.mouseButton,
          Wheel: prefs.pixelCaptureHotkey.wheel,
          Control: prefs.pixelCaptureHotkey.control,
          Alt: prefs.pixelCaptureHotkey.alt,
          Shift: prefs.pixelCaptureHotkey.shift,
          Windows: prefs.pixelCaptureHotkey.windows,
        },
        BindMapHotkey: {
          VirtualKey: prefs.bindMapHotkey.virtualKey,
          MouseButton: prefs.bindMapHotkey.mouseButton,
          Wheel: prefs.bindMapHotkey.wheel,
          Control: prefs.bindMapHotkey.control,
          Alt: prefs.bindMapHotkey.alt,
          Shift: prefs.bindMapHotkey.shift,
          Windows: prefs.bindMapHotkey.windows,
        },
        ...(prefs.unknownFields ?? {}),
      }
    : {
        ...prefs,
        ...(prefs.unknownFields ?? {}),
      };

  return result;
}
