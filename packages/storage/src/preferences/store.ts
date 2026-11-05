/**
 * PreferencesStore implementation for loading, saving, and managing application settings.
 * Fully compatible with ThemeManager and settings.json wire format.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  AppTheme,
  GamepadOutputType,
  type AppPreferences,
  type HotkeyBinding,
  DEFAULT_APP_PREFERENCES,
} from '../../../contracts/src/index.js';
import { atomicWriteFile, atomicWriteFileSync } from './atomic.js';
import {
  clamp,
  clampUnit,
  detectSystemLanguage,
  getDefaultMacroLibraryPath,
  getDefaultSettingsPath,
  normalizeMacroLibraryPath,
  resolveEffectiveLibraryPath,
} from './defaults.js';
import { parsePreferencesJson, serializePreferencesJson } from './serializer.js';
import type {
  HotkeyPreferences,
  OverlayPlacement,
  OverlayPreferences,
  PreferencesStoreOptions,
  WindowPlacement,
} from './types.js';

type Mutable<T> = {
  -readonly [P in keyof T]?: T[P];
};

export class PreferencesStore {
  private readonly _filePath: string;
  private readonly _autoSave: boolean;
  private _preferences: AppPreferences;
  private _isFirstRun = true;
  private _migrationExecuted = false;
  private readonly _listeners = new Set<(prefs: AppPreferences) => void>();

  constructor(options: PreferencesStoreOptions = {}) {
    if (options.filePath) {
      this._filePath = path.resolve(options.filePath);
    } else if (options.rootPath) {
      this._filePath = path.resolve(options.rootPath, 'settings.json');
    } else {
      this._filePath = getDefaultSettingsPath();
    }

    this._autoSave = options.autoSave ?? true;
    this._migrationExecuted = options.executeMigration === false;

    const defaultLang = options.defaultLanguage ?? detectSystemLanguage();
    this._preferences = {
      ...DEFAULT_APP_PREFERENCES,
      languageCode: defaultLang,
    };
  }

  /**
   * The resolved path to settings.json.
   */
  public get filePath(): string {
    return this._filePath;
  }

  /**
   * Whether this is the first run (settings file was missing or corrupt on load).
   */
  public get isFirstRun(): boolean {
    return this._isFirstRun;
  }

  /**
   * Whether legacy F12 to F11 bind map migration has executed.
   */
  public get migrationExecuted(): boolean {
    return this._migrationExecuted;
  }

  /**
   * Current snapshot of preferences.
   */
  public get preferences(): AppPreferences {
    return this._preferences;
  }

  public get theme(): AppTheme {
    return this._preferences.theme;
  }

  public get languageCode(): string {
    return this._preferences.languageCode;
  }

  public get macroLibraryPath(): string {
    return this._preferences.macroLibraryPath;
  }

  public get resolvedMacroLibraryPath(): string {
    return resolveEffectiveLibraryPath(this._preferences.macroLibraryPath);
  }

  public get startWithWindows(): boolean {
    return this._preferences.startWithWindows;
  }

  public get showMacroInformation(): boolean {
    return this._preferences.showMacroInformation;
  }

  public get gamepadDriverPromptDismissed(): boolean {
    return this._preferences.gamepadDriverPromptDismissed;
  }

  public get gamepadOutput(): GamepadOutputType {
    return this._preferences.gamepadOutput;
  }

  public get hideRealGamepad(): boolean {
    return this._preferences.hideRealGamepad;
  }

  public get overlayScalePercent(): number {
    return this._preferences.overlayScalePercent;
  }

  public get overlayInfoTransparencyPercent(): number {
    return this._preferences.overlayInfoTransparencyPercent;
  }

  public get showOverlayAnnotations(): boolean {
    return this._preferences.showOverlayAnnotations;
  }

  public get showOverlayAnnotationTiming(): boolean {
    return this._preferences.showOverlayAnnotationTiming;
  }

  public get overlayAnnotationScalePercent(): number {
    return this._preferences.overlayAnnotationScalePercent;
  }

  public get overlayAnnotationTransparencyPercent(): number {
    return this._preferences.overlayAnnotationTransparencyPercent;
  }

  public get overlayPlacement(): OverlayPlacement {
    return {
      infoX: this._preferences.overlayInfoX,
      infoY: this._preferences.overlayInfoY,
      annotationX: this._preferences.overlayAnnotationX,
      annotationY: this._preferences.overlayAnnotationY,
    };
  }

  public get recordingStartHotkey(): HotkeyBinding {
    return this._preferences.recordingStartHotkey;
  }

  public get recordingStopHotkey(): HotkeyBinding {
    return this._preferences.recordingStopHotkey;
  }

  public get playbackPauseHotkey(): HotkeyBinding {
    return this._preferences.playbackPauseHotkey;
  }

  public get emergencyStopHotkey(): HotkeyBinding {
    return this._preferences.emergencyStopHotkey;
  }

  public get pixelCaptureHotkey(): HotkeyBinding {
    return this._preferences.pixelCaptureHotkey;
  }

  public get bindMapHotkey(): HotkeyBinding {
    return this._preferences.bindMapHotkey;
  }

  /**
   * Loads preferences from disk.
   * If file is absent or corrupt, safely falls back to defaults without throwing.
   */
  public load(): AppPreferences {
    this._isFirstRun = true;

    try {
      if (fs.existsSync(this._filePath)) {
        const content = fs.readFileSync(this._filePath, 'utf8');
        const parsed = parsePreferencesJson(content, {
          executeMigration: !this._migrationExecuted,
          systemLanguageFallback: false,
        });

        this._isFirstRun = false;
        if (parsed.migrated) {
          this._migrationExecuted = true;
        }

        this._preferences = parsed.preferences;
      } else {
        this._isFirstRun = true;
        this._preferences = {
          ...DEFAULT_APP_PREFERENCES,
          languageCode: detectSystemLanguage(),
        };
      }
    } catch {
      // Corrupt file fallback: silent recovery to clean defaults
      this._isFirstRun = true;
      this._preferences = {
        ...DEFAULT_APP_PREFERENCES,
        languageCode: detectSystemLanguage(),
      };
    }

    this._notifyListeners();
    return this._preferences;
  }

  /**
   * Saves preferences atomically to settings.json.
   */
  public save(newPrefs?: AppPreferences): void {
    if (newPrefs) {
      this._preferences = newPrefs;
    }

    const serialized = serializePreferencesJson(this._preferences, { pretty: true });
    atomicWriteFileSync(this._filePath, serialized);
    this._notifyListeners();
  }

  /**
   * Asynchronously saves preferences atomically to settings.json.
   */
  public async saveAsync(newPrefs?: AppPreferences): Promise<void> {
    if (newPrefs) {
      this._preferences = newPrefs;
    }

    const serialized = serializePreferencesJson(this._preferences, { pretty: true });
    await atomicWriteFile(this._filePath, serialized);
    this._notifyListeners();
  }

  /**
   * Updates partial preferences and optionally saves.
   */
  public updatePreferences(
    partial: Partial<AppPreferences>,
    save = this._autoSave,
  ): AppPreferences {
    this._preferences = {
      ...this._preferences,
      ...partial,
      ...(partial.unknownFields !== undefined
        ? {
            unknownFields: {
              ...(this._preferences.unknownFields ?? {}),
              ...partial.unknownFields,
            },
          }
        : {}),
    };

    if (save) {
      this.save();
    } else {
      this._notifyListeners();
    }
    return this._preferences;
  }

  /**
   * Returns current preferences.
   */
  public getPreferences(): AppPreferences {
    return this._preferences;
  }

  /**
   * Deletes settings file from disk and resets state to clean initial defaults.
   * Matches ThemeManager.DeleteSettingsFile.
   */
  public deleteSettingsFile(): void {
    try {
      if (fs.existsSync(this._filePath)) {
        fs.unlinkSync(this._filePath);
      }
    } catch {
      // ignore
    }
    this._isFirstRun = true;
  }

  /**
   * Complete application reset: deletes settings.json and reverts to defaults.
   */
  public reset(): void {
    this.deleteSettingsFile();
    this._preferences = {
      ...DEFAULT_APP_PREFERENCES,
      languageCode: detectSystemLanguage(),
    };
    this._isFirstRun = true;
    this._migrationExecuted = false;
    this._notifyListeners();
  }

  public applyTheme(theme: AppTheme, save = this._autoSave): void {
    this.updatePreferences({ theme }, save);
  }

  public applyLanguage(languageCode: string, save = this._autoSave): void {
    this.updatePreferences({ languageCode }, save);
  }

  public completeInitialSetup(theme: AppTheme, languageCode: string): AppPreferences {
    this._preferences = {
      ...this._preferences,
      theme,
      languageCode,
    };
    this._isFirstRun = false;
    this.save();
    return this._preferences;
  }

  public dismissGamepadDriverPrompt(save = this._autoSave): void {
    if (this._preferences.gamepadDriverPromptDismissed) return;
    this.updatePreferences({ gamepadDriverPromptDismissed: true }, save);
  }

  public setGamepadOutput(type: GamepadOutputType, save = this._autoSave): void {
    if (this._preferences.gamepadOutput === type) return;
    this.updatePreferences({ gamepadOutput: type }, save);
  }

  public setHideRealGamepad(hide: boolean, save = this._autoSave): void {
    if (this._preferences.hideRealGamepad === hide) return;
    this.updatePreferences({ hideRealGamepad: hide }, save);
  }

  public applyOverlayPreferences(
    overlayPrefs: Partial<OverlayPreferences>,
    save = this._autoSave,
  ): void {
    const current = this._preferences;
    const updated: Mutable<AppPreferences> = {};

    if (overlayPrefs.scalePercent !== undefined) {
      updated.overlayScalePercent = clamp(overlayPrefs.scalePercent, 25, 200);
    }
    if (overlayPrefs.annotationScalePercent !== undefined) {
      updated.overlayAnnotationScalePercent = clamp(overlayPrefs.annotationScalePercent, 25, 200);
    }
    if (overlayPrefs.infoTransparencyPercent !== undefined) {
      updated.overlayInfoTransparencyPercent = clamp(overlayPrefs.infoTransparencyPercent, 0, 100);
    }
    if (overlayPrefs.annotationTransparencyPercent !== undefined) {
      updated.overlayAnnotationTransparencyPercent = clamp(
        overlayPrefs.annotationTransparencyPercent,
        0,
        100,
      );
    }
    if (overlayPrefs.showInformation !== undefined) {
      updated.showMacroInformation = overlayPrefs.showInformation;
    }
    if (overlayPrefs.showAnnotations !== undefined) {
      updated.showOverlayAnnotations = overlayPrefs.showAnnotations;
    }
    if (overlayPrefs.showAnnotationTiming !== undefined) {
      updated.showOverlayAnnotationTiming = overlayPrefs.showAnnotationTiming;
    }
    if (overlayPrefs.showState !== undefined) {
      updated.showOverlayState = overlayPrefs.showState;
    }
    if (overlayPrefs.showMacroName !== undefined) {
      updated.showOverlayMacroName = overlayPrefs.showMacroName;
    }
    if (overlayPrefs.showCurrentAction !== undefined) {
      updated.showOverlayCurrentAction = overlayPrefs.showCurrentAction;
    }
    if (overlayPrefs.showSchedule !== undefined) {
      updated.showOverlaySchedule = overlayPrefs.showSchedule;
    }
    if (overlayPrefs.showLatency !== undefined) {
      updated.showOverlayLatency = overlayPrefs.showLatency;
    }
    if (overlayPrefs.infoX !== undefined) {
      updated.overlayInfoX = clampUnit(overlayPrefs.infoX);
    }
    if (overlayPrefs.infoY !== undefined) {
      updated.overlayInfoY = clampUnit(overlayPrefs.infoY);
    }
    if (overlayPrefs.annotationX !== undefined) {
      updated.overlayAnnotationX = clampUnit(overlayPrefs.annotationX);
    }
    if (overlayPrefs.annotationY !== undefined) {
      updated.overlayAnnotationY = clampUnit(overlayPrefs.annotationY);
    }

    this.updatePreferences({ ...current, ...updated }, save);
  }

  public setOverlayPlacement(
    infoX: number,
    infoY: number,
    annotationX: number,
    annotationY: number,
    save = this._autoSave,
  ): void {
    this.updatePreferences(
      {
        overlayInfoX: clampUnit(infoX),
        overlayInfoY: clampUnit(infoY),
        overlayAnnotationX: clampUnit(annotationX),
        overlayAnnotationY: clampUnit(annotationY),
      },
      save,
    );
  }

  public resetOverlayPlacement(save = this._autoSave): void {
    this.setOverlayPlacement(1.0, 0.0, 1.0, 1.0, save);
  }

  public applyHotkeyPreferences(hotkeys: Partial<HotkeyPreferences>, save = this._autoSave): void {
    const updated: Mutable<AppPreferences> = {};
    if (hotkeys.recordingStart) updated.recordingStartHotkey = hotkeys.recordingStart;
    if (hotkeys.recordingStop) updated.recordingStopHotkey = hotkeys.recordingStop;
    if (hotkeys.playbackPause) updated.playbackPauseHotkey = hotkeys.playbackPause;
    if (hotkeys.emergencyStop) updated.emergencyStopHotkey = hotkeys.emergencyStop;
    if (hotkeys.pixelCapture) updated.pixelCaptureHotkey = hotkeys.pixelCapture;
    if (hotkeys.bindMap) updated.bindMapHotkey = hotkeys.bindMap;

    this.updatePreferences(updated, save);
  }

  public applyStartWithWindows(enabled: boolean, save = this._autoSave): void {
    this.updatePreferences({ startWithWindows: enabled }, save);
  }

  public applyMacroLibraryPath(pathInput: string | null | undefined, save = this._autoSave): void {
    const normalized = normalizeMacroLibraryPath(pathInput, getDefaultMacroLibraryPath());
    this.updatePreferences({ macroLibraryPath: normalized }, save);
  }

  /**
   * Sets window placement (bounds / position / maximized state) in preferences unknownFields.
   */
  public setWindowPlacement(
    placement: WindowPlacement,
    windowName = 'mainWindow',
    save = this._autoSave,
  ): void {
    const key = `WindowPlacement_${windowName}`;
    const unknown = { ...(this._preferences.unknownFields ?? {}) };
    unknown[key] = {
      x: placement.x,
      y: placement.y,
      width: placement.width,
      height: placement.height,
      ...(placement.isMaximized !== undefined ? { isMaximized: placement.isMaximized } : {}),
    };
    this.updatePreferences({ unknownFields: unknown }, save);
  }

  /**
   * Retrieves stored window placement if present.
   */
  public getWindowPlacement(windowName = 'mainWindow'): WindowPlacement | undefined {
    const unknown = this._preferences.unknownFields;
    if (!unknown) return undefined;
    const raw = (unknown[`WindowPlacement_${windowName}`] ??
      unknown['WindowPlacement'] ??
      unknown['windowPlacement']) as Record<string, unknown> | undefined;
    if (!raw || typeof raw !== 'object') return undefined;

    const x = typeof raw['x'] === 'number' ? raw['x'] : 0;
    const y = typeof raw['y'] === 'number' ? raw['y'] : 0;
    const width = typeof raw['width'] === 'number' ? raw['width'] : 800;
    const height = typeof raw['height'] === 'number' ? raw['height'] : 600;
    const isMaximized = typeof raw['isMaximized'] === 'boolean' ? raw['isMaximized'] : undefined;

    return {
      x,
      y,
      width,
      height,
      ...(isMaximized !== undefined ? { isMaximized } : {}),
    };
  }

  /**
   * Subscribes to preference changes.
   */
  public subscribe(listener: (prefs: AppPreferences) => void): () => void {
    this._listeners.add(listener);
    return () => {
      this._listeners.delete(listener);
    };
  }

  private _notifyListeners(): void {
    for (const listener of this._listeners) {
      try {
        listener(this._preferences);
      } catch {
        // ignore listener errors
      }
    }
  }
}
