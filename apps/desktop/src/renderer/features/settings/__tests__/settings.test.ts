/**
 * @macro-recorder/desktop - Settings Feature Tests
 * Tests for:
 * - SectionNavigation (Reset deliberately excluded)
 * - InterfaceSettingsCard
 * - StartupSettingsCard
 * - StorageSettingsCard
 * - ControlsSettingsCard (clearable hotkeys, focusHotkeyTag)
 * - OverlaySettingsCard
 * - ResetSettingsCard
 * - SettingsView (Full integration)
 */

import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { ThemeProvider } from '../../../state/ThemeContext.js';
import {
  SectionNavigation,
  SETTINGS_SECTIONS,
  resolveActiveSection,
  InterfaceSettingsCard,
  StartupSettingsCard,
  StorageSettingsCard,
  ControlsSettingsCard,
  OverlaySettingsCard,
  ResetSettingsCard,
  SettingsView,
} from '../index.js';
import { AppTheme, GamepadOutputType } from '../../../../../../../packages/contracts/src/domain/enums.js';
import { DEFAULT_HOTKEY_BINDING } from '../../../../../../../packages/contracts/src/domain/hotkey.js';
import { DEFAULT_APP_PREFERENCES } from '../../../../../../../packages/contracts/src/preferences/preferences.js';

// Mock design-system Modal
vi.mock('../../../design-system/Modal.js', () => ({
  Modal: ({ isOpen, children, title }: any) => {
    if (!isOpen) return null;
    return React.createElement(
      'div',
      { 'data-modal-open': 'true', 'data-modal-title': typeof title === 'string' ? title : 'modal' },
      children,
    );
  },
}));

// Mock useApi
vi.mock('../../../hooks/useApi.js', () => ({
  useApi: () => ({
    invoke: vi.fn().mockResolvedValue({ success: true, data: null }),
    on: vi.fn().mockReturnValue(() => {}),
  }),
}));

// Mock usePreferences
vi.mock('../../../hooks/usePreferences.js', () => ({
  usePreferences: () => ({
    preferences: {
      ...DEFAULT_APP_PREFERENCES,
      languageCode: 'en',
      theme: AppTheme.Dark,
      startWithWindows: false,
      macroLibraryPath: 'C:\\Users\\Test\\Documents\\MacroRecorder',
    },
    updatePreferences: vi.fn(),
    setLanguage: vi.fn(),
    setTheme: vi.fn(),
    reloadPreferences: vi.fn(),
  }),
}));

describe('Settings Feature', () => {
  describe('SectionNavigation', () => {
    it('selects the last section that reached the top of the scroll viewport', () => {
      const tops: Record<string, number> = { interface: -900, startup: -600, storage: -300, controls: 0, overlay: 400 };
      expect(resolveActiveSection((id) => tops[id] ?? null)).toBe('controls');
    });

    it('counts a section as current just before it reaches the top', () => {
      const tops: Record<string, number> = { interface: -900, startup: -600, storage: -300, controls: -60, overlay: 60 };
      expect(resolveActiveSection((id) => tops[id] ?? null)).toBe('overlay');
    });

    it('skips sections that are not rendered', () => {
      expect(resolveActiveSection((id) => (id === 'interface' ? 0 : null))).toBe('interface');
      expect(resolveActiveSection(() => null)).toBeNull();
    });

    it('contains valid sections and deliberately excludes Reset', () => {
      const sectionIds = SETTINGS_SECTIONS.map((s) => s.id);
      expect(sectionIds).toEqual(['interface', 'startup', 'storage', 'controls', 'overlay']);
      expect(sectionIds).not.toContain('reset');

      const html = renderToString(
        React.createElement(SectionNavigation, {
          activeSection: 'interface',
          onSelectSection: () => {},
        }),
      );

      expect(html).toContain('Interface');
      expect(html).toContain('Application startup');
      expect(html).toContain('Macro storage');
      expect(html).toContain('Controls');
      expect(html).toContain('Overlay');
      expect(html).not.toContain('Application reset');
    });
  });

  describe('InterfaceSettingsCard', () => {
    it('renders language and theme selectors', () => {
      const html = renderToString(
        React.createElement(InterfaceSettingsCard, {
          currentLanguage: 'en',
          currentTheme: AppTheme.Dark,
          onLanguageChange: () => {},
          onThemeChange: () => {},
        }),
      );

      expect(html).toContain('Interface');
      expect(html).toContain('Application language');
      expect(html).toContain('The interface changes immediately, without restarting.');
      expect(html).toContain('Dark');
      expect(html).toContain('Light');
    });
  });

  describe('StartupSettingsCard', () => {
    it('renders Windows autostart toggle and explanation', () => {
      const html = renderToString(
        React.createElement(StartupSettingsCard, {
          startWithWindows: false,
          onChangeStartWithWindows: () => {},
        }),
      );

      expect(html).toContain('Application startup');
      expect(html).toContain('Start with Windows');
      expect(html).toContain('The application starts minimized. All enabled macros start automatically');
    });
  });

  describe('StorageSettingsCard', () => {
    it('renders custom library path and backup actions', () => {
      const html = renderToString(
        React.createElement(StorageSettingsCard, {
          currentLibraryPath: 'C:\\Users\\Test\\Macros',
          onLibraryPathChange: () => {},
        }),
      );

      expect(html).toContain('Macro storage');
      expect(html).toContain('Library folder');
      expect(html).toContain('C:\\Users\\Test\\Macros');
      expect(html).toContain('Choose folder');
      expect(html).toContain('Default');
      expect(html).toContain('Library backup');
    });
  });

  describe('ControlsSettingsCard', () => {
    const defaultHotkeys = {
      start: { ...DEFAULT_HOTKEY_BINDING, virtualKey: 0x76 }, // F7
      stop: { ...DEFAULT_HOTKEY_BINDING, virtualKey: 0x77 }, // F8
      pause: { ...DEFAULT_HOTKEY_BINDING, virtualKey: 0x78 }, // F9
      emergency: { ...DEFAULT_HOTKEY_BINDING, virtualKey: 0x79 }, // F10
      pixel: { ...DEFAULT_HOTKEY_BINDING, virtualKey: 0x75 }, // F6
      bindmap: { ...DEFAULT_HOTKEY_BINDING, virtualKey: 0x7a }, // F11
    };

    it('renders 6 global hotkeys with clear intent and virtual gamepad config', () => {
      const html = renderToString(
        React.createElement(ControlsSettingsCard, {
          hotkeys: defaultHotkeys,
          onChangeHotkeys: () => {},
          gamepadOutput: GamepadOutputType.Xbox360,
          onChangeGamepadOutput: () => {},
          hideRealGamepad: false,
          onChangeHideRealGamepad: () => {},
        }),
      );

      expect(html).toContain('Controls');
      expect(html).toContain('Start recording');
      expect(html).toContain('Stop recording');
      expect(html).toContain('Pause / resume playback');
      expect(html).toContain('Emergency stop');
      expect(html).toContain('Capture pixel color');
      expect(html).toContain('Bind map');
      expect(html).toContain('Output pad type');
      expect(html).toContain('Xbox 360');
      expect(html).toContain('DualShock 4');
      expect(html).toContain('Hide the physical pad during playback');
      expect(html).toContain('aria-label="Clear Start recording"');
    });
  });

  describe('OverlaySettingsCard', () => {
    it('renders overlay position and size controls', () => {
      const html = renderToString(
        React.createElement(OverlaySettingsCard, {
          showMacroInformation: true,
          onChangeShowMacroInformation: () => {},
          overlayScalePercent: 100,
          onChangeOverlayScalePercent: () => {},
          overlayInfoTransparencyPercent: 0,
          onChangeOverlayInfoTransparencyPercent: () => {},
          showOverlayState: true,
          onChangeShowOverlayState: () => {},
          showOverlayMacroName: true,
          onChangeShowOverlayMacroName: () => {},
          showOverlayCurrentAction: true,
          onChangeShowOverlayCurrentAction: () => {},
          showOverlaySchedule: true,
          onChangeShowOverlaySchedule: () => {},
          showOverlayLatency: true,
          onChangeShowOverlayLatency: () => {},
          showOverlayAnnotations: true,
          onChangeShowOverlayAnnotations: () => {},
          overlayAnnotationScalePercent: 100,
          onChangeOverlayAnnotationScalePercent: () => {},
          overlayAnnotationTransparencyPercent: 0,
          onChangeOverlayAnnotationTransparencyPercent: () => {},
          showOverlayAnnotationTiming: true,
          onChangeShowOverlayAnnotationTiming: () => {},
          onResetPlacements: () => {},
        }),
      );

      expect(html).toContain('Overlay');
      expect(html).toContain('Macro information');
      expect(html).toContain('Card size');
      expect(html).toContain('Background transparency');
      expect(html).toContain('Visible fields');
      expect(html).toContain('Custom text');
      expect(html).toContain('Prompt size');
    });
  });

  describe('ResetSettingsCard', () => {
    it('renders factory reset danger section separated from navigation', () => {
      const html = renderToString(
        React.createElement(ResetSettingsCard, {
          libraryPath: 'C:\\Users\\Test\\Macros',
          onResetConfirmed: () => {},
        }),
      );

      expect(html).toContain('Application reset');
      expect(html).toContain('Delete all macros and settings');
      expect(html).toContain('The macro library and every setting will be deleted permanently');
      expect(html).toContain('Reset to the first-run state');
    });
  });

  describe('SettingsView', () => {
    it('renders full settings window with sidebar and all cards', () => {
      const html = renderToString(
        React.createElement(
          ThemeProvider,
          null,
          React.createElement(SettingsView, {
            isOpen: true,
            onClose: () => {},
          }),
        ),
      );

      expect(html).toContain('Settings');
      expect(html).toContain('Interface');
      expect(html).toContain('Application startup');
      expect(html).toContain('Macro storage');
      expect(html).toContain('Controls');
      expect(html).toContain('Overlay');
      expect(html).toContain('Application reset');
      expect(html).toContain('Done');
    });
  });
});
