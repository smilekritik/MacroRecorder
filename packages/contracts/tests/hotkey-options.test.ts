import { describe, expect, it } from 'vitest';
import {
  AppTheme,
  clampPlaybackSpeed,
  DEFAULT_HOTKEY_BINDING,
  formatHotkeyDisplay,
  isMouseHotkey,
  migrateBindMapHotkey,
  MouseButton,
  OverlayCardOverride,
  parseAppPreferences,
  parseHotkeyBindingWire,
  parsePlaybackOptionsWire,
  parseRecordingOptionsWire,
  resolveOverlayCardOverride,
  sameGesture,
  toWireAppPreferences,
  WheelDirection,
} from '../src/index.js';

describe('Hotkeys, Options, and Preferences', () => {
  describe('HotkeyBinding', () => {
    it('formats display strings accurately', () => {
      expect(formatHotkeyDisplay(DEFAULT_HOTKEY_BINDING)).toBe('Not assigned');

      const ctrlShiftA = {
        ...DEFAULT_HOTKEY_BINDING,
        control: true,
        shift: true,
        virtualKey: 0x41, // 'A'
      };
      expect(formatHotkeyDisplay(ctrlShiftA)).toBe('Ctrl + Shift + A');

      const wheelUp = {
        ...DEFAULT_HOTKEY_BINDING,
        control: true,
        wheel: WheelDirection.Up,
      };
      expect(formatHotkeyDisplay(wheelUp)).toBe('Ctrl + Wheel up');
      expect(isMouseHotkey(wheelUp)).toBe(true);

      const mouseX1 = {
        ...DEFAULT_HOTKEY_BINDING,
        mouseButton: MouseButton.X1,
      };
      expect(formatHotkeyDisplay(mouseX1)).toBe('Mouse X1');
      expect(isMouseHotkey(mouseX1)).toBe(true);
    });

    it('identifies identical gestures', () => {
      const g1 = { ...DEFAULT_HOTKEY_BINDING, control: true, virtualKey: 112 };
      const g2 = { ...DEFAULT_HOTKEY_BINDING, control: true, virtualKey: 112 };
      const g3 = { ...DEFAULT_HOTKEY_BINDING, control: false, virtualKey: 112 };
      expect(sameGesture(g1, g2)).toBe(true);
      expect(sameGesture(g1, g3)).toBe(false);
    });

    it('parses wire format from PascalCase and camelCase', () => {
      const pascal = {
        VirtualKey: 116,
        MouseButton: 'X2',
        Wheel: 'Down',
        Control: true,
        Alt: false,
        Shift: true,
        Windows: false,
      };
      const parsed = parseHotkeyBindingWire(pascal);
      expect(parsed.success).toBe(true);
      if (!parsed.success) return;
      expect(parsed.data.virtualKey).toBe(116);
      expect(parsed.data.mouseButton).toBe('X2');
      expect(parsed.data.wheel).toBe('Down');
      expect(parsed.data.control).toBe(true);
      expect(parsed.data.shift).toBe(true);
    });
  });

  describe('PlaybackOptions', () => {
    it('clamps playback speed between 0.1 and 10.0', () => {
      expect(clampPlaybackSpeed(0.05)).toBe(0.1);
      expect(clampPlaybackSpeed(15.0)).toBe(10.0);
      expect(clampPlaybackSpeed(1.5)).toBe(1.5);
    });

    it('parses wire playback options and maps legacy ToggleRepeat to ToggleStop', () => {
      const wire = {
        ActivationMode: 'ToggleRepeat',
        Speed: 0.01, // should clamp
        RepeatCount: 10,
        InfoCardOverride: 'ForceShow',
      };
      const parsed = parsePlaybackOptionsWire(wire);
      expect(parsed.success).toBe(true);
      if (!parsed.success) return;
      expect(parsed.data.activationMode).toBe('ToggleStop');
      expect(parsed.data.speed).toBe(0.1);
      expect(parsed.data.repeatCount).toBe(10);
      expect(parsed.data.infoCardOverride).toBe('ForceShow');
    });

    it('resolves OverlayCardOverride priorities', () => {
      expect(resolveOverlayCardOverride(OverlayCardOverride.Inherit, true)).toBe(true);
      expect(resolveOverlayCardOverride(OverlayCardOverride.Inherit, false)).toBe(false);
      expect(resolveOverlayCardOverride(OverlayCardOverride.ForceShow, false)).toBe(true);
      expect(resolveOverlayCardOverride(OverlayCardOverride.ForceShow, true)).toBe(true);
      expect(resolveOverlayCardOverride(OverlayCardOverride.ForceHide, true)).toBe(false);
      expect(resolveOverlayCardOverride(OverlayCardOverride.ForceHide, false)).toBe(false);
    });
  });

  describe('RecordingOptions', () => {
    it('parses wire recording options with defaults', () => {
      const parsed = parseRecordingOptionsWire({
        Keyboard: true,
        MouseButtons: false,
        MouseMoveBucketMilliseconds: 20,
      });
      expect(parsed.success).toBe(true);
      if (!parsed.success) return;
      expect(parsed.data.keyboard).toBe(true);
      expect(parsed.data.mouseButtons).toBe(false);
      expect(parsed.data.mouseMovement).toBe(true); // default
      expect(parsed.data.mouseMoveBucketMilliseconds).toBe(20);
    });
  });

  describe('AppPreferences & Settings', () => {
    it('migrates uncustomized F12 bind map default to F11', () => {
      const legacyF12 = { ...DEFAULT_HOTKEY_BINDING, virtualKey: 0x7b }; // F12
      const migrated = migrateBindMapHotkey(legacyF12);
      expect(migrated.virtualKey).toBe(0x7a); // F11

      const customCtrlF12 = { ...DEFAULT_HOTKEY_BINDING, virtualKey: 0x7b, control: true };
      const untouched = migrateBindMapHotkey(customCtrlF12);
      expect(untouched.virtualKey).toBe(0x7b); // customized remains unchanged
      expect(untouched.control).toBe(true);
    });

    it('roundtrips settings.json wire format', () => {
      const csharpSettings = {
        Theme: 'Dark',
        LanguageCode: 'ru',
        MacroLibraryPath: 'C:\\Macros',
        StartWithWindows: false,
        ShowMacroInformation: true,
        GamepadDriverPromptDismissed: true,
        GamepadOutput: 'DualShock4',
        HideRealGamepad: true,
        OverlayScalePercent: 120,
        OverlayInfoTransparencyPercent: 30,
        ShowOverlayAnnotations: true,
        ShowOverlayAnnotationTiming: false,
        OverlayAnnotationScalePercent: 110,
        OverlayAnnotationTransparencyPercent: 20,
        OverlayInfoX: 0.8,
        OverlayInfoY: 0.2,
        OverlayAnnotationX: 0.5,
        OverlayAnnotationY: 0.9,
        ShowOverlayState: true,
        ShowOverlayMacroName: false,
        ShowOverlayCurrentAction: true,
        ShowOverlaySchedule: false,
        ShowOverlayLatency: true,
        RecordingStartHotkey: { VirtualKey: 118 },
        RecordingStopHotkey: { VirtualKey: 119 },
        PlaybackPauseHotkey: { VirtualKey: 120 },
        EmergencyStopHotkey: { VirtualKey: 121 },
        PixelCaptureHotkey: { VirtualKey: 116 },
        BindMapHotkey: { VirtualKey: 122 },
        CustomExtensionSetting: 'preserved',
      };

      const parsed = parseAppPreferences(csharpSettings);
      expect(parsed.success).toBe(true);
      if (!parsed.success) return;

      const prefs = parsed.data;
      expect(prefs.theme).toBe(AppTheme.Dark);
      expect(prefs.gamepadOutput).toBe('DualShock4');
      expect(prefs.hideRealGamepad).toBe(true);
      expect(prefs.overlayScalePercent).toBe(120);
      expect(prefs.unknownFields?.['CustomExtensionSetting']).toBe('preserved');

      const roundtripWire = toWireAppPreferences(prefs, true);
      expect(roundtripWire['Theme']).toBe('Dark');
      expect(roundtripWire['GamepadOutput']).toBe('DualShock4');
      expect(roundtripWire['CustomExtensionSetting']).toBe('preserved');
    });
  });
});
