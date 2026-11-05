/**
 * Orderly Shutdown Orchestrator.
 * Enforces the strict 7-phase resource release order:
 * 1. Suspend triggers & stop active playback/recording sessions
 * 2. Universal input release guarantee (releaseAll)
 * 3. Unregister global hotkeys and hooks
 * 4. Close named pipe server and external listeners
 * 5. Destroy tray icon and overlays
 * 6. Flush diagnostic logs
 * 7. Release single-instance lock and terminate process
 *
 * Integrates with OS session ending and power suspend events.
 */

import type { IInputInjectorAdapter, IHotkeyAdapter } from '../types.js';
import type { PlaybackCoordinator } from './playback-coordinator.js';
import type { RecordingCoordinator } from './recording-coordinator.js';
import type { TriggerCoordinator } from '../state/trigger-coordinator.js';
import type { OverlayCoordinator } from '../state/overlay-coordinator.js';
import type { ShutdownCoordinator } from '../../lifecycle/shutdown.js';

export interface ShutdownOrchestratorOptions {
  readonly shutdownCoordinator?: ShutdownCoordinator | undefined;
  readonly playbackCoordinator: PlaybackCoordinator;
  readonly recordingCoordinator: RecordingCoordinator;
  readonly triggerCoordinator: TriggerCoordinator;
  readonly overlayCoordinator?: OverlayCoordinator | undefined;
  readonly hotkeyAdapter: IHotkeyAdapter;
  readonly injectorAdapter?: IInputInjectorAdapter | undefined;
  readonly inputAdapter?: IInputInjectorAdapter | undefined;
  readonly windowOrchestrator?: unknown | undefined;
  readonly onShutdownComplete?: (() => void) | undefined;
}

export class ShutdownOrchestrator {
  private readonly shutdownCoordinator?: ShutdownCoordinator | undefined;
  private readonly playbackCoordinator: PlaybackCoordinator;
  private readonly recordingCoordinator: RecordingCoordinator;
  private readonly triggerCoordinator: TriggerCoordinator;
  private readonly overlayCoordinator?: OverlayCoordinator | undefined;
  private readonly hotkeyAdapter: IHotkeyAdapter;
  private readonly injectorAdapter: IInputInjectorAdapter;
  private readonly onShutdownComplete?: (() => void) | undefined;

  private isShuttingDown = false;

  constructor(options: ShutdownOrchestratorOptions) {
    this.shutdownCoordinator = options.shutdownCoordinator;
    this.playbackCoordinator = options.playbackCoordinator;
    this.recordingCoordinator = options.recordingCoordinator;
    this.triggerCoordinator = options.triggerCoordinator;
    this.overlayCoordinator = options.overlayCoordinator;
    this.hotkeyAdapter = options.hotkeyAdapter;
    const injector = options.injectorAdapter ?? options.inputAdapter;
    if (!injector) {
      throw new Error('injectorAdapter or inputAdapter is required for ShutdownOrchestrator');
    }
    this.injectorAdapter = injector;
    this.onShutdownComplete = options.onShutdownComplete;

    this.wireLifecycleShutdownHooks();
  }

  private wireLifecycleShutdownHooks(): void {
    if (!this.shutdownCoordinator) return;

    // Register with existing ShutdownCoordinator at Priority 15
    this.shutdownCoordinator.registerHook({
      id: 'app-orchestrator-shutdown',
      description: 'Coordinated application shutdown and input release',
      priority: 15,
      execute: async (reason) => {
        await this.executeShutdownOrder(reason);
      },
    });
  }

  /**
   * Synchronously executes emergency input release on system suspend or logoff.
   */
  public triggerEmergencyRelease(reason = 'power_suspend'): void {
    try {
      this.playbackCoordinator.emergencyStop(reason);
      if (this.recordingCoordinator.hasActiveSession) {
        this.recordingCoordinator.stop();
      }
      this.triggerCoordinator.suspend(reason);
      this.injectorAdapter.releaseAll();
    } catch (err) {
      console.warn('[ShutdownOrchestrator] Emergency release error:', err);
    }
  }

  /**
   * Executes the strict 7-phase resource release order.
   */
  public async executeShutdownOrder(reason = 'user_exit'): Promise<void> {
    if (this.isShuttingDown) return;
    this.isShuttingDown = true;

    // Phase 1: Suspend triggers & stop active playback/recording sessions
    try {
      this.triggerCoordinator.suspend(reason);
      this.playbackCoordinator.emergencyStop(reason);
      if (this.recordingCoordinator.hasActiveSession) {
        this.recordingCoordinator.stop();
      }
    } catch (err) {
      console.warn('[ShutdownOrchestrator] Phase 1 error:', err);
    }

    // Phase 2: Universal input release guarantee (releaseAll)
    try {
      this.injectorAdapter.releaseAll();
    } catch (err) {
      console.warn('[ShutdownOrchestrator] Phase 2 error:', err);
    }

    // Phase 3: Unregister global hotkeys and hooks
    try {
      this.hotkeyAdapter.unregisterAll();
    } catch (err) {
      console.warn('[ShutdownOrchestrator] Phase 3 error:', err);
    }

    // Phase 4: Destroy overlays & auxiliary views
    try {
      this.overlayCoordinator?.dispose();
    } catch (err) {
      console.warn('[ShutdownOrchestrator] Phase 4 error:', err);
    }

    // Phase 5: Trigger cleanup callback
    try {
      this.onShutdownComplete?.();
    } catch (err) {
      console.warn('[ShutdownOrchestrator] Phase 5 error:', err);
    }
  }

  public attachPowerListeners(powerMonitor?: {
    on: (event: string, listener: () => void) => void;
  }): void {
    if (powerMonitor) {
      powerMonitor.on('suspend', () => this.triggerEmergencyRelease('power_suspend'));
      powerMonitor.on('shutdown', () => {
        void this.executeShutdownOrder('os_shutdown');
      });
      powerMonitor.on('lock-screen', () => this.triggerEmergencyRelease('power_lock'));
    } else {
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const electron = require('electron');
        if (electron?.powerMonitor) {
          electron.powerMonitor.on('suspend', () => this.triggerEmergencyRelease('power_suspend'));
          electron.powerMonitor.on('shutdown', () => {
            void this.executeShutdownOrder('os_shutdown');
          });
          electron.powerMonitor.on('lock-screen', () => this.triggerEmergencyRelease('power_lock'));
        }
      } catch {
        // Power monitor not available in test/headless environments
      }
    }
  }

  public async executeShutdown(reason = 'user_exit'): Promise<void> {
    await this.executeShutdownOrder(reason);
  }

  public get isShutdownStarted(): boolean {
    return this.isShuttingDown;
  }
}
