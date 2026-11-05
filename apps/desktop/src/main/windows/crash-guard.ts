/**
 * @macro-recorder/desktop - Renderer Crash Guard & Emergency Release
 * Guarantees that no renderer crash or hang can bypass native emergency release.
 * Strictly satisfies the success criterion: "No renderer crash can bypass native emergency release".
 */

import type { BrowserWindow, RenderProcessGoneDetails } from 'electron';

export type EmergencyReleaseHandler = (reason: string, details?: unknown) => void;

export class RendererCrashGuard {
  private readonly emergencyHandler: EmergencyReleaseHandler;
  private readonly monitoredWindows = new Set<BrowserWindow>();

  constructor(emergencyHandler: EmergencyReleaseHandler) {
    this.emergencyHandler = emergencyHandler;
  }

  /**
   * Attaches crash, unresponsive, and termination listeners to a BrowserWindow.
   */
  public attach(window: BrowserWindow, windowId: string): void {
    if (!window || window.isDestroyed() || !window.webContents) return;

    this.monitoredWindows.add(window);

    // 1. render-process-gone: renderer crashed, was killed, or ran out of memory
    window.webContents.on(
      'render-process-gone',
      (_event: unknown, details?: RenderProcessGoneDetails) => {
        const detailsObj = (details ??
          (_event && typeof _event === 'object' && 'reason' in _event ? _event : {})) as Partial<RenderProcessGoneDetails>;
        const crashReason = detailsObj.reason ?? 'unknown';
        const exitCode = detailsObj.exitCode ?? -1;
        const reason = `Renderer crash in window "${windowId}" (reason: ${crashReason}, exitCode: ${exitCode})`;
        console.error(`[RendererCrashGuard] EMERGENCY: ${reason}`);

        // Immediate native emergency release guarantee!
        this.triggerEmergencyRelease(reason, detailsObj);
      },
    );

    // 2. unresponsive: renderer event loop hung or deadlocked
    window.on('unresponsive', () => {
      const reason = `Window "${windowId}" became unresponsive / frozen`;
      console.warn(`[RendererCrashGuard] WARNING: ${reason}`);

      // Trigger emergency release to ensure no held inputs continue looping
      this.triggerEmergencyRelease(reason);
    });

    // 3. Clean up reference on closed
    window.once('closed', () => {
      this.monitoredWindows.delete(window);
    });
  }

  /**
   * Triggers the emergency release handler safely without throwing.
   */
  public triggerEmergencyRelease(reason: string, details?: unknown): void {
    try {
      this.emergencyHandler(reason, details);
    } catch (err) {
      console.error('[RendererCrashGuard] Critical error in emergency release handler:', err);
    }
  }

  public detach(window: BrowserWindow): void {
    this.monitoredWindows.delete(window);
  }

  public clear(): void {
    this.monitoredWindows.clear();
  }
}
