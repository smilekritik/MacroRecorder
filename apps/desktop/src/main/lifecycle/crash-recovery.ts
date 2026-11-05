/**
 * Crash recovery and unexpected renderer exit protection.
 * Enforces the universal rule: unexpected renderer exit immediately triggers
 * native input release and leaves the main process recoverable.
 */

import type { BrowserWindow, WebContents } from 'electron';
import { AppLog } from './logging.js';
import type { CrashReport } from './types.js';

export interface CrashRecoveryOptions {
  readonly releaseInputsFn?: () => void;
  readonly emergencyStopFn?: () => void;
  readonly onRendererCrashed?: (window: BrowserWindow, report: CrashReport) => void;
}

export class CrashRecoveryCoordinator {
  private readonly releaseInputs: (() => void) | undefined;
  private readonly emergencyStop: (() => void) | undefined;
  private readonly onRendererCrashed:
    | ((window: BrowserWindow, report: CrashReport) => void)
    | undefined;
  private readonly crashReports: CrashReport[] = [];
  private mainProcessListenersAttached = false;

  constructor(options: CrashRecoveryOptions = {}) {
    this.releaseInputs = options.releaseInputsFn;
    this.emergencyStop = options.emergencyStopFn;
    this.onRendererCrashed = options.onRendererCrashed;
  }

  /**
   * Attaches unhandled rejection and uncaught exception handlers to the main process.
   */
  public attachMainProcessGuards(): void {
    if (this.mainProcessListenersAttached) return;

    process.on('uncaughtException', (err: Error) => {
      this.handleMainProcessCrash(err);
    });

    process.on('unhandledRejection', (reason: unknown) => {
      const message = reason instanceof Error ? (reason.stack ?? reason.message) : String(reason);
      AppLog.error(`Unhandled Promise rejection: ${message}`);
    });

    this.mainProcessListenersAttached = true;
  }

  /**
   * Attaches crash and unresponsive monitors to a BrowserWindow's WebContents.
   */
  public monitorWindow(window: BrowserWindow): void {
    if (!window || window.isDestroyed()) return;

    const webContents: WebContents = window.webContents;

    // render-process-gone: handles crashed, killed, oom, etc.
    webContents.on('render-process-gone', (_event, details) => {
      const report: CrashReport = {
        timestamp: new Date().toISOString(),
        source: 'renderer',
        reason: details.reason,
        exitCode: details.exitCode,
        recovered: false,
      };

      AppLog.fatal(
        `Renderer process gone [reason=${details.reason}, exitCode=${details.exitCode}]`,
      );

      // Critical requirement: Unexpected renderer exit triggers native input release immediately
      this.triggerEmergencyRelease();

      this.crashReports.push(report);

      if (this.onRendererCrashed) {
        try {
          this.onRendererCrashed(window, report);
        } catch (err) {
          AppLog.warn(
            `onRendererCrashed callback error: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      } else if (!window.isDestroyed()) {
        // Default recovery behavior: reload the crashed window once
        try {
          AppLog.info('Attempting automatic reload of crashed renderer window');
          window.reload();
        } catch {
          // Recovery attempt best-effort
        }
      }
    });

    // unresponsive: renderer is hanging (e.g. infinite loop in JS)
    webContents.on('unresponsive', () => {
      AppLog.warn('Renderer became unresponsive — releasing inputs to prevent stuck keys');
      this.triggerEmergencyRelease();
    });
  }

  private handleMainProcessCrash(err: Error): void {
    const report: CrashReport = {
      timestamp: new Date().toISOString(),
      source: 'main',
      reason: err.message,
      stack: err.stack,
      recovered: false,
    };

    AppLog.fatal(`Main process uncaught exception: ${err.stack ?? err.message}`);
    this.triggerEmergencyRelease();
    this.crashReports.push(report);
  }

  /**
   * Executes emergency input release and stops any active macro engine.
   */
  public triggerEmergencyRelease(): void {
    try {
      if (this.emergencyStop) {
        this.emergencyStop();
      }
    } catch {
      // Best-effort stop
    }

    try {
      if (this.releaseInputs) {
        this.releaseInputs();
      }
    } catch {
      // Best-effort release
    }
  }

  public getReports(): readonly CrashReport[] {
    return this.crashReports;
  }
}
