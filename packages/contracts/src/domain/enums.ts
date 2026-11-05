/**
 * Versioned domain enums for Macro Recorder schema 12 and application runtime.
 */

import { enumValues, type Schema } from '../common/validation.js';

export const InputDevice = {
  Keyboard: 'Keyboard',
  Mouse: 'Mouse',
  Gamepad: 'Gamepad',
} as const;
export type InputDevice = (typeof InputDevice)[keyof typeof InputDevice];
export const inputDeviceSchema: Schema<InputDevice> = enumValues(Object.values(InputDevice));

/**
 * All 19 supported macro action types.
 */
export const MacroEventType = {
  KeyDown: 'KeyDown',
  KeyUp: 'KeyUp',
  MouseMove: 'MouseMove',
  MouseButtonDown: 'MouseButtonDown',
  MouseButtonUp: 'MouseButtonUp',
  Wheel: 'Wheel',
  HorizontalWheel: 'HorizontalWheel',
  Delay: 'Delay',
  OverlayText: 'OverlayText',
  PixelColorTrigger: 'PixelColorTrigger',
  Comment: 'Comment',
  GamepadButtonDown: 'GamepadButtonDown',
  GamepadButtonUp: 'GamepadButtonUp',
  GamepadAxis: 'GamepadAxis',
  TypeText: 'TypeText',
  WaitForPixelGone: 'WaitForPixelGone',
  WaitForWindow: 'WaitForWindow',
  WaitForKey: 'WaitForKey',
  RunMacro: 'RunMacro',
} as const;
export type MacroEventType = (typeof MacroEventType)[keyof typeof MacroEventType];
export const macroEventTypeSchema: Schema<MacroEventType> = enumValues(
  Object.values(MacroEventType),
);

export const MouseButton = {
  None: 'None',
  Left: 'Left',
  Right: 'Right',
  Middle: 'Middle',
  X1: 'X1',
  X2: 'X2',
} as const;
export type MouseButton = (typeof MouseButton)[keyof typeof MouseButton];
export const mouseButtonSchema: Schema<MouseButton> = enumValues(Object.values(MouseButton));

export const GamepadButton = {
  None: 'None',
  A: 'A',
  B: 'B',
  X: 'X',
  Y: 'Y',
  LeftBumper: 'LeftBumper',
  RightBumper: 'RightBumper',
  Back: 'Back',
  Start: 'Start',
  Guide: 'Guide',
  LeftStick: 'LeftStick',
  RightStick: 'RightStick',
  DPadUp: 'DPadUp',
  DPadDown: 'DPadDown',
  DPadLeft: 'DPadLeft',
  DPadRight: 'DPadRight',
} as const;
export type GamepadButton = (typeof GamepadButton)[keyof typeof GamepadButton];
export const gamepadButtonSchema: Schema<GamepadButton> = enumValues(Object.values(GamepadButton));

export const GamepadAxis = {
  None: 'None',
  LeftStickX: 'LeftStickX',
  LeftStickY: 'LeftStickY',
  RightStickX: 'RightStickX',
  RightStickY: 'RightStickY',
  LeftTrigger: 'LeftTrigger',
  RightTrigger: 'RightTrigger',
} as const;
export type GamepadAxis = (typeof GamepadAxis)[keyof typeof GamepadAxis];
export const gamepadAxisSchema: Schema<GamepadAxis> = enumValues(Object.values(GamepadAxis));

export const GamepadOutputType = {
  Xbox360: 'Xbox360',
  DualShock4: 'DualShock4',
} as const;
export type GamepadOutputType = (typeof GamepadOutputType)[keyof typeof GamepadOutputType];
export const gamepadOutputTypeSchema: Schema<GamepadOutputType> = enumValues(
  Object.values(GamepadOutputType),
);

export const ActivationMode = {
  Once: 'Once',
  WhileHeld: 'WhileHeld',
  ToggleStop: 'ToggleStop',
  Restart: 'Restart',
  /** Schema 4/5 compatibility alias for ToggleStop */
  ToggleRepeat: 'ToggleRepeat',
} as const;
export type ActivationMode = (typeof ActivationMode)[keyof typeof ActivationMode];
export const activationModeSchema: Schema<ActivationMode> = enumValues(
  Object.values(ActivationMode),
);

export const TargetMode = {
  ForegroundAtStart: 'ForegroundAtStart',
  SpecificWindow: 'SpecificWindow',
} as const;
export type TargetMode = (typeof TargetMode)[keyof typeof TargetMode];
export const targetModeSchema: Schema<TargetMode> = enumValues(Object.values(TargetMode));

export const OverlayCardOverride = {
  Inherit: 'Inherit',
  ForceShow: 'ForceShow',
  ForceHide: 'ForceHide',
} as const;
export type OverlayCardOverride = (typeof OverlayCardOverride)[keyof typeof OverlayCardOverride];
export const overlayCardOverrideSchema: Schema<OverlayCardOverride> = enumValues(
  Object.values(OverlayCardOverride),
);

export function resolveOverlayCardOverride(
  override: OverlayCardOverride,
  appDefault: boolean,
): boolean {
  switch (override) {
    case OverlayCardOverride.ForceShow:
      return true;
    case OverlayCardOverride.ForceHide:
      return false;
    default:
      return appDefault;
  }
}

export const FocusLossBehavior = {
  Stop: 'Stop',
  Pause: 'Pause',
  Continue: 'Continue',
} as const;
export type FocusLossBehavior = (typeof FocusLossBehavior)[keyof typeof FocusLossBehavior];
export const focusLossBehaviorSchema: Schema<FocusLossBehavior> = enumValues(
  Object.values(FocusLossBehavior),
);

export const EngineState = {
  Idle: 'Idle',
  Countdown: 'Countdown',
  Recording: 'Recording',
  Saving: 'Saving',
  Playing: 'Playing',
  Paused: 'Paused',
  Stopping: 'Stopping',
} as const;
export type EngineState = (typeof EngineState)[keyof typeof EngineState];
export const engineStateSchema: Schema<EngineState> = enumValues(Object.values(EngineState));

export const WheelDirection = {
  None: 'None',
  Up: 'Up',
  Down: 'Down',
} as const;
export type WheelDirection = (typeof WheelDirection)[keyof typeof WheelDirection];
export const wheelDirectionSchema: Schema<WheelDirection> = enumValues(
  Object.values(WheelDirection),
);

export const AppTheme = {
  Dark: 'Dark',
  Light: 'Light',
} as const;
export type AppTheme = (typeof AppTheme)[keyof typeof AppTheme];
export const appThemeSchema: Schema<AppTheme> = enumValues(Object.values(AppTheme));

export const OverlayPosition = {
  TopRight: 'TopRight',
  TopLeft: 'TopLeft',
  BottomRight: 'BottomRight',
  BottomLeft: 'BottomLeft',
} as const;
export type OverlayPosition = (typeof OverlayPosition)[keyof typeof OverlayPosition];
export const overlayPositionSchema: Schema<OverlayPosition> = enumValues(
  Object.values(OverlayPosition),
);

export const LibraryBackupMode = {
  Merge: 'Merge',
  Replace: 'Replace',
} as const;
export type LibraryBackupMode = (typeof LibraryBackupMode)[keyof typeof LibraryBackupMode];
export const libraryBackupModeSchema: Schema<LibraryBackupMode> = enumValues(
  Object.values(LibraryBackupMode),
);

export const MacroImportFormat = {
  MacroPackage: 'MacroPackage',
  NativeJson: 'NativeJson',
  LegacyJson: 'LegacyJson',
  AutoHotkey: 'AutoHotkey',
  Amc: 'Amc',
  JitbitMrf: 'JitbitMrf',
  AutoIt: 'AutoIt',
  Razer: 'Razer',
  TinyTask: 'TinyTask',
} as const;
export type MacroImportFormat = (typeof MacroImportFormat)[keyof typeof MacroImportFormat];
export const macroImportFormatSchema: Schema<MacroImportFormat> = enumValues(
  Object.values(MacroImportFormat),
);

export const MacroExportFormat = {
  AutoHotkeyV2: 'AutoHotkeyV2',
  DiagnosticsCsv: 'DiagnosticsCsv',
  DiagnosticsJson: 'DiagnosticsJson',
  DiagnosticBundle: 'DiagnosticBundle',
  MacroPackage: 'MacroPackage',
  NativeJson: 'NativeJson',
  LibraryBackup: 'LibraryBackup',
} as const;
export type MacroExportFormat = (typeof MacroExportFormat)[keyof typeof MacroExportFormat];
export const macroExportFormatSchema: Schema<MacroExportFormat> = enumValues(
  Object.values(MacroExportFormat),
);

export const UnsavedDecision = {
  SaveAll: 'SaveAll',
  Discard: 'Discard',
  Cancel: 'Cancel',
} as const;
export type UnsavedDecision = (typeof UnsavedDecision)[keyof typeof UnsavedDecision];
export const unsavedDecisionSchema: Schema<UnsavedDecision> = enumValues(
  Object.values(UnsavedDecision),
);

export const RecordingChoice = {
  Overwrite: 'Overwrite',
  Continue: 'Continue',
  Append: 'Append',
} as const;
export type RecordingChoice = (typeof RecordingChoice)[keyof typeof RecordingChoice];
export const recordingChoiceSchema: Schema<RecordingChoice> = enumValues(
  Object.values(RecordingChoice),
);
