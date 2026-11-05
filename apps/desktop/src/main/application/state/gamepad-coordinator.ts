/**
 * Gamepad Lifetime and Emulation Coordinator.
 * Coordinates physical controller capture, ViGEmBus virtual controller emulation,
 * and HidHide device isolation.
 */

import type { IGamepadAdapter } from '../types.js';
import type { GamepadPadReading } from '../../ipc/types.js';

export class GamepadCoordinator {
  private readonly gamepadAdapter: IGamepadAdapter;
  private isHidingEnabled = false;
  private driverPromptDismissed = false;

  constructor(gamepadAdapter: IGamepadAdapter) {
    this.gamepadAdapter = gamepadAdapter;
  }

  public getReadings(): readonly GamepadPadReading[] {
    return this.gamepadAdapter.getReadings();
  }

  public updateVirtualGamepad(outputType: string, snapshot: unknown): void {
    this.gamepadAdapter.updateVirtualGamepad(outputType, snapshot);
  }

  public setHiding(enabled: boolean): boolean {
    const changed = this.gamepadAdapter.setHidHideState(enabled);
    if (changed) {
      this.isHidingEnabled = enabled;
    }
    return changed;
  }

  public emergencyNeutralize(outputType = 'Xbox360'): void {
    this.gamepadAdapter.updateVirtualGamepad(outputType, {
      connected: true,
      buttons: 0,
      leftX: 0,
      leftY: 0,
      rightX: 0,
      rightY: 0,
      leftTrigger: 0,
      rightTrigger: 0,
    });
    if (this.isHidingEnabled) {
      this.setHiding(false);
    }
  }

  public get isHidingActive(): boolean {
    return this.isHidingEnabled;
  }

  public get isVigemAvailable(): boolean {
    return this.gamepadAdapter.isVigemAvailable();
  }

  public get isHidhideAvailable(): boolean {
    return this.gamepadAdapter.isHidhideAvailable();
  }

  public setDriverPromptDismissed(dismissed: boolean): void {
    this.driverPromptDismissed = dismissed;
  }

  public get isDriverPromptDismissed(): boolean {
    return this.driverPromptDismissed;
  }

  public async installDriver(driver: 'ViGEmBus' | 'HidHide'): Promise<{ success: boolean; rebootRequired: boolean }> {
    try {
      const { GamepadDriverInstaller } = await import('../../windows-integration/driver-installer.js');
      const res = await GamepadDriverInstaller.tryExtractAndRun(driver);
      return { success: res.success, rebootRequired: false };
    } catch {
      return { success: false, rebootRequired: false };
    }
  }

  private readonly stateListeners = new Set<(readings: readonly GamepadPadReading[]) => void>();

  public onStateChanged(listener: (readings: readonly GamepadPadReading[]) => void): () => void {
    this.stateListeners.add(listener);
    return () => {
      this.stateListeners.delete(listener);
    };
  }

  public notifyStateChanged(readings: readonly GamepadPadReading[]): void {
    for (const listener of this.stateListeners) {
      try {
        listener(readings);
      } catch {
        // Ignore listener error
      }
    }
  }

  public dispose(): void {
    if (this.isHidingEnabled) {
      try {
        this.gamepadAdapter.setHidHideState(false);
      } catch {
        // Best-effort cleanup
      }
      this.isHidingEnabled = false;
    }
    this.stateListeners.clear();
  }
}
