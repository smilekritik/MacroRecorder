/**
 * Coordinated application shutdown and resource release ordering.
 * Enforces strict release order:
 * 1. Suspend triggers & stop active playback/recording sessions
 * 2. Universal input release guarantee (releaseAllInputs)
 * 3. Unregister global hotkeys and hooks
 * 4. Close named pipe server and external listeners
 * 5. Destroy tray icon and overlays
 * 6. Flush diagnostic logs
 * 7. Release single-instance lock and terminate process
 */

import { type App, type PowerMonitor, powerMonitor as defaultPowerMonitor } from 'electron';
import { AppLog } from './logging.js';
import type { ShutdownHook, ShutdownReason } from './types.js';

export interface ShutdownCoordinatorOptions {
  readonly appInstance?: App | undefined;
  readonly powerMonitorInstance?: PowerMonitor | undefined;
  readonly releaseInputsFn?: () => void;
  readonly emergencyStopFn?: () => void;
}

export class ShutdownCoordinator {
  private readonly app: App | undefined;
  private readonly powerMonitor: PowerMonitor;
  private readonly releaseInputs: (() => void) | undefined;
  private readonly emergencyStop: (() => void) | undefined;
  private readonly hooks: ShutdownHook[] = [];
  private isShuttingDown = false;
  private powerListenersAttached = false;

  constructor(options: ShutdownCoordinatorOptions = {}) {
    this.app = options.appInstance;
    this.powerMonitor = options.powerMonitorInstance ?? defaultPowerMonitor;
    this.releaseInputs = options.releaseInputsFn;
    this.emergencyStop = options.emergencyStopFn;

    this.registerDefaultHooks();
    this.attachPowerAndSessionListeners();
  }

  /**
   * Registers a shutdown hook with explicit priority (lower numbers execute first).
   */
  public registerHook(hook: ShutdownHook): void {
    this.hooks.push(hook);
    this.hooks.sort((a, b) => a.priority - b.priority);
  }

  private registerDefaultHooks(): void {
    // Priority 10: Stop active playback and recording sessions
    this.registerHook({
      id: 'session-stop',
      description: 'Emergency stop active playback and recording',
      priority: 10,
      execute: () => {
        try {
          if (this.emergencyStop) {
            this.emergencyStop();
          }
        } catch (err) {
          AppLog.warn(
            `Emergency stop hook failed: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      },
    });

    // Priority 20: Universal input release guarantee
    this.registerHook({
      id: 'universal-input-release',
      description: 'Native release of all held keys, buttons, and axes',
      priority: 20,
      execute: () => {
        try {
          if (this.releaseInputs) {
            this.releaseInputs();
          }
        } catch (err) {
          AppLog.warn(
            `Input release hook failed: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      },
    });

    // Priority 90: Flush and close diagnostic log
    this.registerHook({
      id: 'flush-log',
      description: 'Flush diagnostic logs',
      priority: 90,
      execute: (reason) => {
        AppLog.info(`Process shutdown initiated with reason: ${reason}`);
      },
    });
  }

  /**
   * Connects Windows power (sleep/suspend) and session (logoff/shutdown) listeners.
   */
  private attachPowerAndSessionListeners(): void {
    if (this.powerListenersAttached || !this.powerMonitor) return;

    try {
      this.powerMonitor.on('suspend', () => {
        AppLog.info('System suspend detected — triggering immediate input release and stop');
        this.triggerEmergencyRelease('power_suspend');
      });

      this.powerMonitor.on('shutdown', () => {
        AppLog.info('System shutdown detected — triggering emergency release');
        this.triggerEmergencyRelease('os_session_ending');
      });

      this.powerListenersAttached = true;
    } catch {
      // Best-effort power monitor binding
    }
  }

  /**
   * Immediate synchronous release for emergency events (suspend, session ending).
   */
  public triggerEmergencyRelease(reason: ShutdownReason): void {
    try {
      if (this.emergencyStop) {
        this.emergencyStop();
      }
      if (this.releaseInputs) {
        this.releaseInputs();
      }
      AppLog.info(`Emergency input release executed for reason: ${reason}`);
    } catch (err) {
      AppLog.error(
        `Emergency release encountered error: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  /**
   * Executes all registered shutdown hooks in priority order.
   */
  public async executeShutdown(reason: ShutdownReason): Promise<void> {
    if (this.isShuttingDown) return;
    this.isShuttingDown = true;

    for (const hook of this.hooks) {
      try {
        await hook.execute(reason);
      } catch (err) {
        AppLog.warn(
          `Shutdown hook '${hook.id}' (${hook.description}) failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    if (this.app) {
      try {
        this.app.quit();
      } catch {
        // App quit best-effort
      }
    }
  }

  /**
   * Checks if shutdown has commenced.
   */
  public get isShutdownStarted(): boolean {
    return this.isShuttingDown;
  }
}
