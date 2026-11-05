/**
 * Settings and Preferences Coordinator.
 * Coordinates preferences loading, atomic persistence to settings.json,
 * one-time F12 to F11 bind map hotkey migration, clearable hotkey intent,
 * and clean factory application reset.
 */

import type { IPreferencesStore } from '../types.js';
import type { AppPreferences } from '../../ipc/types.js';

export interface SettingsCoordinatorOptions {
  readonly store: IPreferencesStore;
  readonly onPreferencesChanged?: ((prefs: AppPreferences) => void) | undefined;
}

export class SettingsCoordinator {
  private readonly store: IPreferencesStore;
  private currentPreferences: AppPreferences;
  private readonly changeListeners = new Set<(prefs: AppPreferences) => void>();

  constructor(options: SettingsCoordinatorOptions) {
    this.store = options.store;
    this.currentPreferences = this.store.load();

    // Migrate legacy F12 to F11 if needed
    this.migrateBindMapHotkey();

    this.store.subscribe((prefs) => {
      this.currentPreferences = prefs;
      this.notifyListeners(prefs);
    });

    if (options.onPreferencesChanged) {
      this.changeListeners.add(options.onPreferencesChanged);
    }
  }

  public get preferences(): AppPreferences {
    return this.currentPreferences;
  }

  public getPreferences(): AppPreferences {
    return this.currentPreferences;
  }

  public load(): AppPreferences {
    return this.loadPreferences();
  }

  public save(partial: Partial<AppPreferences>): AppPreferences {
    return this.savePreferences(partial);
  }

  public reset(): boolean {
    return this.resetPreferences();
  }

  public loadPreferences(): AppPreferences {
    this.currentPreferences = this.store.load();
    this.migrateBindMapHotkey();
    return this.currentPreferences;
  }

  public savePreferences(partial: Partial<AppPreferences>): AppPreferences {
    this.currentPreferences = this.store.updatePreferences(partial, true);
    return this.currentPreferences;
  }

  /**
   * Migrates legacy default F12 bind map hotkey to F11.
   * Customized hotkeys remain untouched.
   */
  public migrateBindMapHotkey(): boolean {
    const bindMap = this.currentPreferences['bindMapHotkey'] as Record<string, unknown> | undefined;
    if (bindMap && typeof bindMap === 'object') {
      const vk = bindMap['virtualKey'];
      const mod = Number(bindMap['modifiers'] ?? 0);
      // If legacy F12 (0x7B / 123) without modifiers, migrate to F11 (0x7A / 122)
      if ((vk === 0x7b || vk === 123 || bindMap['key'] === 'F12') && mod === 0) {
        this.savePreferences({
          bindMapHotkey: {
            key: 'F11',
            virtualKey: 0x7a,
            modifiers: 0,
          },
        });
        return true;
      }
    }
    return false;
  }

  /**
   * Clean Factory Application Reset.
   * Deletes settings.json, reverts to clean defaults, and notifies listeners.
   */
  public resetPreferences(): boolean {
    this.store.reset();
    this.currentPreferences = this.store.getPreferences();
    return true;
  }

  public onPreferencesChanged(listener: (prefs: AppPreferences) => void): () => void {
    this.changeListeners.add(listener);
    return () => {
      this.changeListeners.delete(listener);
    };
  }

  private notifyListeners(prefs: AppPreferences): void {
    for (const listener of this.changeListeners) {
      try {
        listener(prefs);
      } catch (err) {
        console.warn('[SettingsCoordinator] Listener error:', err);
      }
    }
  }
}

/**
 * Deterministic In-Memory Fake Preferences Store for Testing.
 */
export class FakePreferencesStore implements IPreferencesStore {
  private prefs: AppPreferences;
  private readonly listeners = new Set<(prefs: AppPreferences) => void>();

  constructor(initialPrefs: Partial<AppPreferences> = {}) {
    this.prefs = {
      theme: 'Dark',
      languageCode: 'en',
      startWithWindows: false,
      showMacroInformation: true,
      overlayScalePercent: 100,
      overlayInfoTransparencyPercent: 0,
      overlayInfoX: 1.0,
      overlayInfoY: 0.0,
      overlayAnnotationX: 1.0,
      overlayAnnotationY: 1.0,
      recordingStartHotkey: { virtualKey: 0x78, modifiers: 0 },
      recordingStopHotkey: { virtualKey: 0x77, modifiers: 0 },
      playbackPauseHotkey: { virtualKey: 0x13, modifiers: 0 },
      emergencyStopHotkey: { virtualKey: 0x79, modifiers: 0 },
      pixelCaptureHotkey: { virtualKey: 0x74, modifiers: 0 },
      bindMapHotkey: { virtualKey: 0x7a, modifiers: 0 },
      ...initialPrefs,
    };
  }

  public load(): AppPreferences {
    return { ...this.prefs };
  }

  public save(newPrefs?: AppPreferences): void {
    if (newPrefs) this.prefs = { ...newPrefs };
    this.notify();
  }

  public async saveAsync(newPrefs?: AppPreferences): Promise<void> {
    this.save(newPrefs);
  }

  public reset(): void {
    this.prefs = {
      theme: 'Dark',
      languageCode: 'en',
      startWithWindows: false,
      showMacroInformation: true,
      overlayScalePercent: 100,
      overlayInfoTransparencyPercent: 0,
      overlayInfoX: 1.0,
      overlayInfoY: 0.0,
      overlayAnnotationX: 1.0,
      overlayAnnotationY: 1.0,
      recordingStartHotkey: { virtualKey: 0x78, modifiers: 0 },
      recordingStopHotkey: { virtualKey: 0x77, modifiers: 0 },
      playbackPauseHotkey: { virtualKey: 0x13, modifiers: 0 },
      emergencyStopHotkey: { virtualKey: 0x79, modifiers: 0 },
      pixelCaptureHotkey: { virtualKey: 0x74, modifiers: 0 },
      bindMapHotkey: { virtualKey: 0x7a, modifiers: 0 },
    };
    this.notify();
  }

  public getPreferences(): AppPreferences {
    return { ...this.prefs };
  }

  public updatePreferences(partial: Partial<AppPreferences>, save = true): AppPreferences {
    this.prefs = { ...this.prefs, ...partial };
    if (save) this.notify();
    return { ...this.prefs };
  }

  public subscribe(listener: (prefs: AppPreferences) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify(): void {
    for (const listener of this.listeners) {
      try {
        listener({ ...this.prefs });
      } catch {
        // Ignore listener errors
      }
    }
  }
}
