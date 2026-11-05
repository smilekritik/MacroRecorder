/**
 * Tests for PreferencesStore and settings.json persistence.
 * Covers (clearable hotkeys) (F12 to F11 migration),
 * 011 (atomic write & corrupt recovery), and full roundtrip.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  AppTheme,
  DEFAULT_HOTKEY_BINDING,
  GamepadOutputType,
  isEmptyHotkey,
} from '../../../contracts/src/index.js';
import {
  SETTINGS_FIXTURES,
  loadFixtureJson,
  loadFixtureText,
} from '../../../../tests/fixtures/index.js';
import {
  DEFAULT_BIND_MAP_VK,
  DEFAULT_EMERGENCY_STOP_VK,
  DEFAULT_PLAYBACK_PAUSE_VK,
  DEFAULT_RECORDING_START_VK,
  DEFAULT_RECORDING_STOP_VK,
  LEGACY_BIND_MAP_VK,
  PreferencesStore,
  atomicWriteFileSync,
  isLegacyBindMapDefault,
  migrateBindMapHotkey,
  normalizeMacroLibraryPath,
  parsePreferencesJson,
  resolveEffectiveLibraryPath,
  serializePreferencesJson,
} from './index.js';

function createTempDir(prefix: string): string {
  const dir = path.join(
    os.tmpdir(),
    `mr-test-${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function cleanTempDir(dir: string): void {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    // ignore
  }
}

describe('Preferences Storage (settings.json)', () => {
  describe('Clearable Intent Hotkeys', () => {
    it('preserves empty hotkeys without reverting to defaults', () => {
      const fixtureText = loadFixtureText(SETTINGS_FIXTURES.CLEARABLE_INTENT_SETTINGS);
      const { preferences } = parsePreferencesJson(fixtureText);

      // Cleared hotkeys in fixture: RecordingStartHotkey, EmergencyStopHotkey, PixelCaptureHotkey
      expect(preferences.recordingStartHotkey.virtualKey).toBe(0);
      expect(isEmptyHotkey(preferences.recordingStartHotkey)).toBe(true);

      expect(preferences.emergencyStopHotkey.virtualKey).toBe(0);
      expect(isEmptyHotkey(preferences.emergencyStopHotkey)).toBe(true);

      expect(preferences.pixelCaptureHotkey.virtualKey).toBe(0);
      expect(isEmptyHotkey(preferences.pixelCaptureHotkey)).toBe(true);

      // Non-cleared hotkeys remain their set values
      expect(preferences.recordingStopHotkey.virtualKey).toBe(DEFAULT_RECORDING_STOP_VK);
      expect(preferences.playbackPauseHotkey.virtualKey).toBe(DEFAULT_PLAYBACK_PAUSE_VK);
      expect(preferences.bindMapHotkey.virtualKey).toBe(DEFAULT_BIND_MAP_VK);

      // Serializing back produces exact match to expected fixture
      const serialized = serializePreferencesJson(preferences);
      const expectedJson = loadFixtureJson(SETTINGS_FIXTURES.CLEARABLE_INTENT_EXPECTED);
      expect(JSON.parse(serialized)).toEqual(expectedJson);
    });

    it('falls back to default hotkey only when property is absent or null', () => {
      const jsonWithMissing = JSON.stringify({
        Theme: 'Dark',
        LanguageCode: 'ru',
        // RecordingStartHotkey is omitted
        // EmergencyStopHotkey is null
        EmergencyStopHotkey: null,
        // RecordingStopHotkey is explicitly empty
        RecordingStopHotkey: {
          VirtualKey: 0,
          MouseButton: 'None',
          Wheel: 'None',
          Control: false,
          Alt: false,
          Shift: false,
          Windows: false,
        },
      });

      const { preferences } = parsePreferencesJson(jsonWithMissing);
      // Omitted -> default
      expect(preferences.recordingStartHotkey.virtualKey).toBe(DEFAULT_RECORDING_START_VK);
      // Null -> default
      expect(preferences.emergencyStopHotkey.virtualKey).toBe(DEFAULT_EMERGENCY_STOP_VK);
      // Explicitly cleared -> preserved as 0
      expect(preferences.recordingStopHotkey.virtualKey).toBe(0);
      expect(isEmptyHotkey(preferences.recordingStopHotkey)).toBe(true);
    });
  });

  describe('One-Time F12 to F11 Bind Map Migration', () => {
    it('migrates uncustomized legacy F12 default to F11', () => {
      const fixtureText = loadFixtureText(SETTINGS_FIXTURES.MIGRATED_F12_SETTINGS);
      const { preferences, migrated } = parsePreferencesJson(fixtureText, {
        executeMigration: true,
      });

      expect(migrated).toBe(true);
      expect(preferences.bindMapHotkey.virtualKey).toBe(DEFAULT_BIND_MAP_VK); // 122 (F11)

      const serialized = serializePreferencesJson(preferences);
      const expectedJson = loadFixtureJson(SETTINGS_FIXTURES.MIGRATED_F12_EXPECTED);
      expect(JSON.parse(serialized)).toEqual(expectedJson);
    });

    it('does not migrate customized hotkeys using F12 with modifiers or other keys', () => {
      const customCtrlF12 = {
        ...DEFAULT_HOTKEY_BINDING,
        virtualKey: LEGACY_BIND_MAP_VK,
        control: true,
      };
      expect(isLegacyBindMapDefault(customCtrlF12)).toBe(false);
      const result1 = migrateBindMapHotkey(customCtrlF12, false);
      expect(result1.migrated).toBe(false);
      expect(result1.binding.virtualKey).toBe(LEGACY_BIND_MAP_VK);
      expect(result1.binding.control).toBe(true);

      const customF10 = {
        ...DEFAULT_HOTKEY_BINDING,
        virtualKey: 121,
      };
      const result2 = migrateBindMapHotkey(customF10, false);
      expect(result2.migrated).toBe(false);
      expect(result2.binding.virtualKey).toBe(121);
    });

    it('executes legacy migration at most once across the lifecycle of a store', () => {
      const tempDir = createTempDir('migration');
      try {
        const filePath = path.join(tempDir, 'settings.json');
        fs.writeFileSync(
          filePath,
          loadFixtureText(SETTINGS_FIXTURES.MIGRATED_F12_SETTINGS),
          'utf8',
        );

        const store = new PreferencesStore({ filePath });
        const loaded = store.load();
        expect(store.migrationExecuted).toBe(true);
        expect(loaded.bindMapHotkey.virtualKey).toBe(DEFAULT_BIND_MAP_VK); // Migrated to F11

        // User now explicitly reassigns F12
        store.applyHotkeyPreferences({
          bindMap: {
            ...DEFAULT_HOTKEY_BINDING,
            virtualKey: LEGACY_BIND_MAP_VK,
          },
        });
        expect(store.bindMapHotkey.virtualKey).toBe(LEGACY_BIND_MAP_VK);

        // Subsequent load within this store does not re-migrate because migration already executed
        store.load();
        expect(store.bindMapHotkey.virtualKey).toBe(LEGACY_BIND_MAP_VK);
      } finally {
        cleanTempDir(tempDir);
      }
    });
  });

  describe('Round-Trip Fidelity and Fixture Verification', () => {
    it('round-trips default-settings.json without data loss', () => {
      const originalText = loadFixtureText(SETTINGS_FIXTURES.DEFAULT_SETTINGS);
      const expectedJson = loadFixtureJson(SETTINGS_FIXTURES.DEFAULT_SETTINGS);

      const { preferences } = parsePreferencesJson(originalText);
      expect(preferences.theme).toBe(AppTheme.Dark);
      expect(preferences.languageCode).toBe('ru');
      expect(preferences.macroLibraryPath).toBe('');
      expect(preferences.startWithWindows).toBe(true);
      expect(preferences.gamepadOutput).toBe(GamepadOutputType.Xbox360);

      const serialized = serializePreferencesJson(preferences);
      expect(JSON.parse(serialized)).toEqual(expectedJson);
    });

    it('round-trips custom-options-settings.json faithfully', () => {
      const originalText = loadFixtureText(SETTINGS_FIXTURES.CUSTOM_OPTIONS_SETTINGS);
      const expectedJson = loadFixtureJson(SETTINGS_FIXTURES.CUSTOM_OPTIONS_SETTINGS);

      const { preferences } = parsePreferencesJson(originalText);
      expect(preferences.theme).toBe(AppTheme.Light);
      expect(preferences.languageCode).toBe('en');
      expect(preferences.macroLibraryPath).toBe('C:\\SharedMacros\\CustomLibrary');
      expect(preferences.startWithWindows).toBe(false);
      expect(preferences.gamepadOutput).toBe(GamepadOutputType.DualShock4);
      expect(preferences.hideRealGamepad).toBe(true);
      expect(preferences.overlayScalePercent).toBe(150);
      expect(preferences.overlayInfoTransparencyPercent).toBe(20);
      expect(preferences.overlayInfoX).toBe(0.5);
      expect(preferences.overlayInfoY).toBe(0.8);

      const serialized = serializePreferencesJson(preferences);
      expect(JSON.parse(serialized)).toEqual(expectedJson);
    });

    it('preserves unknown forward-compatible fields across load and save', () => {
      const customPayload = {
        ...loadFixtureJson<Record<string, unknown>>(SETTINGS_FIXTURES.DEFAULT_SETTINGS),
        FutureFeatureEnabled: true,
        CustomPluginConfig: { version: '2.0.0', channel: 'beta' },
      };

      const { preferences } = parsePreferencesJson(JSON.stringify(customPayload));
      expect(preferences.unknownFields).toBeDefined();
      expect(preferences.unknownFields?.['FutureFeatureEnabled']).toBe(true);
      expect(preferences.unknownFields?.['CustomPluginConfig']).toEqual({
        version: '2.0.0',
        channel: 'beta',
      });

      const serialized = serializePreferencesJson(preferences);
      const parsedAgain = JSON.parse(serialized);
      expect(parsedAgain.FutureFeatureEnabled).toBe(true);
      expect(parsedAgain.CustomPluginConfig).toEqual({ version: '2.0.0', channel: 'beta' });
    });
  });

  describe('Library Root Normalization and Resolution', () => {
    it('normalizes empty string, whitespace, or default library folder to empty string', () => {
      const defaultFolder = 'C:\\Users\\user\\AppData\\Local\\MacroRecorder';

      expect(normalizeMacroLibraryPath('', defaultFolder)).toBe('');
      expect(normalizeMacroLibraryPath('   ', defaultFolder)).toBe('');
      expect(normalizeMacroLibraryPath(null, defaultFolder)).toBe('');
      expect(
        normalizeMacroLibraryPath('C:\\Users\\user\\AppData\\Local\\MacroRecorder', defaultFolder),
      ).toBe('');
      expect(
        normalizeMacroLibraryPath('C:/Users/user/AppData/Local/MacroRecorder/', defaultFolder),
      ).toBe('');
      expect(
        normalizeMacroLibraryPath(
          'C:\\Users\\user\\AppData\\Local\\MacroRecorder\\',
          defaultFolder,
        ),
      ).toBe('');

      // Custom path is preserved trimmed
      expect(normalizeMacroLibraryPath(' D:\\MyMacros ', defaultFolder)).toBe('D:\\MyMacros');
    });

    it('resolves effective macro library path correctly', () => {
      const defaultFolder = 'C:\\Users\\user\\AppData\\Local\\MacroRecorder';
      expect(resolveEffectiveLibraryPath('', defaultFolder)).toBe(defaultFolder);
      expect(resolveEffectiveLibraryPath('   ', defaultFolder)).toBe(defaultFolder);
      expect(resolveEffectiveLibraryPath('D:\\CustomMacros', defaultFolder)).toBe(
        'D:\\CustomMacros',
      );
    });
  });

  describe('Overlay and Window Placement', () => {
    it('clamps overlay coordinates to [0, 1] and scales to [25, 200]', () => {
      const tempDir = createTempDir('overlay');
      try {
        const filePath = path.join(tempDir, 'settings.json');
        const store = new PreferencesStore({ filePath });

        store.applyOverlayPreferences({
          scalePercent: 999, // Should clamp to 200
          annotationScalePercent: 5, // Should clamp to 25
          infoTransparencyPercent: 150, // Should clamp to 100
          annotationTransparencyPercent: -50, // Should clamp to 0
          infoX: 2.5, // Should clamp to 1.0
          infoY: -0.5, // Should clamp to 0.0
          annotationX: 0.75,
          annotationY: 0.25,
        });

        expect(store.overlayScalePercent).toBe(200);
        expect(store.overlayAnnotationScalePercent).toBe(25);
        expect(store.overlayInfoTransparencyPercent).toBe(100);
        expect(store.overlayAnnotationTransparencyPercent).toBe(0);
        expect(store.overlayPlacement).toEqual({
          infoX: 1,
          infoY: 0,
          annotationX: 0.75,
          annotationY: 0.25,
        });

        store.resetOverlayPlacement();
        expect(store.overlayPlacement).toEqual({
          infoX: 1,
          infoY: 0,
          annotationX: 1,
          annotationY: 1,
        });
      } finally {
        cleanTempDir(tempDir);
      }
    });

    it('stores and retrieves window placement in unknownFields', () => {
      const tempDir = createTempDir('win-placement');
      try {
        const filePath = path.join(tempDir, 'settings.json');
        const store = new PreferencesStore({ filePath });

        store.setWindowPlacement({
          x: 150,
          y: 200,
          width: 1024,
          height: 768,
          isMaximized: false,
        });

        const retrieved = store.getWindowPlacement();
        expect(retrieved).toEqual({
          x: 150,
          y: 200,
          width: 1024,
          height: 768,
          isMaximized: false,
        });

        // Roundtrip through load
        const reloadedStore = new PreferencesStore({ filePath });
        reloadedStore.load();
        expect(reloadedStore.getWindowPlacement()).toEqual({
          x: 150,
          y: 200,
          width: 1024,
          height: 768,
          isMaximized: false,
        });
      } finally {
        cleanTempDir(tempDir);
      }
    });
  });

  describe('Gamepad Driver Decisions', () => {
    it('records prompt dismissal, gamepad output, and hidhide preference', () => {
      const tempDir = createTempDir('gamepad');
      try {
        const filePath = path.join(tempDir, 'settings.json');
        const store = new PreferencesStore({ filePath });

        expect(store.gamepadDriverPromptDismissed).toBe(false);
        expect(store.gamepadOutput).toBe(GamepadOutputType.Xbox360);
        expect(store.hideRealGamepad).toBe(false);

        store.dismissGamepadDriverPrompt();
        store.setGamepadOutput(GamepadOutputType.DualShock4);
        store.setHideRealGamepad(true);

        expect(store.gamepadDriverPromptDismissed).toBe(true);
        expect(store.gamepadOutput).toBe(GamepadOutputType.DualShock4);
        expect(store.hideRealGamepad).toBe(true);

        // Verify persisted to disk
        const freshStore = new PreferencesStore({ filePath });
        freshStore.load();
        expect(freshStore.gamepadDriverPromptDismissed).toBe(true);
        expect(freshStore.gamepadOutput).toBe(GamepadOutputType.DualShock4);
        expect(freshStore.hideRealGamepad).toBe(true);
      } finally {
        cleanTempDir(tempDir);
      }
    });
  });

  describe('Atomic Writes and Corrupted File Fallback', () => {
    it('silently recovers to defaults on corrupted settings file without crashing', () => {
      const tempDir = createTempDir('corrupt');
      try {
        const filePath = path.join(tempDir, 'settings.json');
        fs.writeFileSync(filePath, '{ "Theme": "Dark", INVALID_JSON', 'utf8');

        const store = new PreferencesStore({ filePath });
        const prefs = store.load();

        expect(store.isFirstRun).toBe(true);
        expect(prefs.theme).toBe(AppTheme.Dark);
        expect(prefs.recordingStartHotkey.virtualKey).toBe(DEFAULT_RECORDING_START_VK);

        // Saving now replaces the corrupted file with a valid one atomically
        store.save();
        expect(fs.existsSync(filePath)).toBe(true);
        const validJson = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        expect(validJson.Theme).toBe('Dark');
      } finally {
        cleanTempDir(tempDir);
      }
    });

    it('performs atomic write with temporary file replacement', () => {
      const tempDir = createTempDir('atomic');
      try {
        const filePath = path.join(tempDir, 'settings.json');
        atomicWriteFileSync(filePath, '{"Initial": true}\n');
        expect(fs.readFileSync(filePath, 'utf8')).toBe('{"Initial": true}\n');

        atomicWriteFileSync(filePath, '{"Updated": true}\n');
        expect(fs.readFileSync(filePath, 'utf8')).toBe('{"Updated": true}\n');

        // Verify no leftover .tmp files
        const files = fs.readdirSync(tempDir);
        expect(files.filter((f) => f.endsWith('.tmp'))).toHaveLength(0);
      } finally {
        cleanTempDir(tempDir);
      }
    });

    it('resets cleanly via reset() deleting settings file and reverting state', () => {
      const tempDir = createTempDir('reset');
      try {
        const filePath = path.join(tempDir, 'settings.json');
        const store = new PreferencesStore({ filePath });
        store.applyTheme(AppTheme.Light);
        store.save();

        expect(fs.existsSync(filePath)).toBe(true);
        expect(store.theme).toBe(AppTheme.Light);

        store.reset();
        expect(fs.existsSync(filePath)).toBe(false);
        expect(store.isFirstRun).toBe(true);
        expect(store.theme).toBe(AppTheme.Dark);
      } finally {
        cleanTempDir(tempDir);
      }
    });
  });

  describe('Listeners and Change Notifications', () => {
    it('notifies subscribers on preferences updates', () => {
      const tempDir = createTempDir('events');
      try {
        const filePath = path.join(tempDir, 'settings.json');
        const store = new PreferencesStore({ filePath });

        let notifiedCount = 0;
        const unsubscribe = store.subscribe((prefs) => {
          notifiedCount++;
          expect(prefs.theme).toBe(AppTheme.Light);
        });

        store.applyTheme(AppTheme.Light);
        expect(notifiedCount).toBe(1);

        unsubscribe();
        store.applyTheme(AppTheme.Dark);
        expect(notifiedCount).toBe(1);
      } finally {
        cleanTempDir(tempDir);
      }
    });
  });
});
