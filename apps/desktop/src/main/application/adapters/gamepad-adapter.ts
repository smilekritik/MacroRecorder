/**
 * Gamepad Capture and Virtual Controller Emulation Adapter.
 * Bridges physical controller readings (XInput / WGI), virtual ViGEmBus controller injection,
 * and HidHide physical controller hiding.
 */

import type { IGamepadAdapter } from '../types.js';
import type { GamepadPadReading } from '../../ipc/types.js';

export class NativeGamepadAdapter implements IGamepadAdapter {
  private nativeModule: any = null;
  private nativeModuleLoaded = false;

  constructor(nativeModule?: unknown) {
    if (nativeModule) {
      this.nativeModule = nativeModule;
      this.nativeModuleLoaded = true;
    } else {
      this.tryLoadNative();
    }
  }

  private tryLoadNative(): void {
    if (this.nativeModuleLoaded) return;
    try {
      const addon = (process as unknown as { addon?: unknown }).addon;
      if (addon) {
        this.nativeModule = addon;
        this.nativeModuleLoaded = true;
      }
    } catch {
      // Best-effort
    }
  }

  public getReadings(): readonly GamepadPadReading[] {
    if (this.nativeModule?.getGamepadReadings) {
      try {
        const readings = this.nativeModule.getGamepadReadings();
        return readings.map((r: any, idx: number) => ({
          slot: idx,
          connected: Boolean(r.connected ?? (r.pressed && r.pressed.length > 0)),
          buttons: typeof r.buttons === 'number' ? r.buttons : 0,
          leftStickX: typeof r.leftX === 'number' ? r.leftX : 0,
          leftStickY: typeof r.leftY === 'number' ? r.leftY : 0,
          rightStickX: typeof r.rightX === 'number' ? r.rightX : 0,
          rightStickY: typeof r.rightY === 'number' ? r.rightY : 0,
          leftTrigger: typeof r.leftTrigger === 'number' ? r.leftTrigger : 0,
          rightTrigger: typeof r.rightTrigger === 'number' ? r.rightTrigger : 0,
        }));
      } catch {
        return [];
      }
    }
    return [];
  }

  public updateVirtualGamepad(outputType: string, snapshot: unknown): void {
    if (this.nativeModule?.updateVirtualGamepad) {
      try {
        this.nativeModule.updateVirtualGamepad({
          outputType,
          snapshot,
        });
      } catch (err) {
        console.warn('[NativeGamepadAdapter] Virtual gamepad injection failed:', err);
      }
    }
  }

  public setHidHideState(hide: boolean): boolean {
    if (this.nativeModule?.setHidhideState) {
      try {
        return Boolean(this.nativeModule.setHidhideState({ hide }));
      } catch {
        return false;
      }
    }
    return false;
  }

  public isVigemAvailable(): boolean {
    if (this.nativeModule?.isVigemDriverAvailable) {
      try {
        return Boolean(this.nativeModule.isVigemDriverAvailable());
      } catch {
        return false;
      }
    }
    return false;
  }

  public isHidhideAvailable(): boolean {
    if (this.nativeModule?.isHidhideDriverAvailable) {
      try {
        return Boolean(this.nativeModule.isHidhideDriverAvailable());
      } catch {
        return false;
      }
    }
    return false;
  }
}

/**
 * Deterministic Fake Gamepad Adapter for Testing.
 */
export class FakeGamepadAdapter implements IGamepadAdapter {
  public readings: GamepadPadReading[] = [];
  public virtualUpdates: Array<{ outputType: string; snapshot: unknown }> = [];
  public isHidingActive = false;
  public vigemAvailable = true;
  public hidhideAvailable = true;

  public getReadings(): readonly GamepadPadReading[] {
    return this.readings;
  }

  public updateVirtualGamepad(outputType: string, snapshot: unknown): void {
    this.virtualUpdates.push({ outputType, snapshot });
  }

  public setHidHideState(hide: boolean): boolean {
    this.isHidingActive = hide;
    return true;
  }

  public isVigemAvailable(): boolean {
    return this.vigemAvailable;
  }

  public isHidhideAvailable(): boolean {
    return this.hidhideAvailable;
  }
}
