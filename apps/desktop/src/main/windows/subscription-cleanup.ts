/**
 * @macro-recorder/desktop - Window Subscription Cleanup Manager
 * Guarantees that closing an auxiliary window disposes every native and IPC subscription.
 * Satisfies the acceptance requirement: "Closing an auxiliary window disposes every native and IPC subscription".
 */

import type { BrowserWindow } from 'electron';

export type SubscriptionDisposer = () => void;

export class SubscriptionCleanupManager {
  private readonly disposersByWebContentsId = new Map<number, Set<SubscriptionDisposer>>();
  private readonly globalDisposers = new Set<SubscriptionDisposer>();
  private readonly externalCleanupHandler?: ((webContentsId: number) => void) | undefined;

  constructor(externalCleanupHandler?: (webContentsId: number) => void) {
    this.externalCleanupHandler = externalCleanupHandler;
  }

  /**
   * Registers a cleanup disposer tied to a specific window's webContents.
   */
  public registerDisposer(webContentsId: number, disposer: SubscriptionDisposer): () => void {
    let disposers = this.disposersByWebContentsId.get(webContentsId);
    if (!disposers) {
      disposers = new Set();
      this.disposersByWebContentsId.set(webContentsId, disposers);
    }
    disposers.add(disposer);

    return () => {
      disposers?.delete(disposer);
      if (disposers?.size === 0) {
        this.disposersByWebContentsId.delete(webContentsId);
      }
    };
  }

  /**
   * Automatically attaches to a window and executes all disposers upon window closure.
   */
  public attachToWindow(window: BrowserWindow): void {
    if (!window || window.isDestroyed()) return;

    const webContentsId = window.webContents ? window.webContents.id : 0;

    window.once('closed', () => {
      this.cleanupForWebContents(webContentsId);
    });
  }

  /**
   * Executes and cleans up all disposers registered for a given webContents ID.
   */
  public cleanupForWebContents(webContentsId: number): void {
    if (!webContentsId) return;

    // 1. Run external cleanup handler (e.g. SubscriptionManager in IPC)
    if (this.externalCleanupHandler) {
      try {
        this.externalCleanupHandler(webContentsId);
      } catch (err) {
        console.warn(`[SubscriptionCleanup] External cleanup failed for webContents ${webContentsId}:`, err);
      }
    }

    // 2. Run all registered disposers
    const disposers = this.disposersByWebContentsId.get(webContentsId);
    if (disposers) {
      for (const dispose of disposers) {
        try {
          dispose();
        } catch (err) {
          console.warn(`[SubscriptionCleanup] Disposer error for webContents ${webContentsId}:`, err);
        }
      }
      disposers.clear();
      this.disposersByWebContentsId.delete(webContentsId);
    }
  }

  /**
   * Cleans up all tracked subscriptions for all windows.
   */
  public disposeAll(): void {
    for (const [webContentsId, disposers] of this.disposersByWebContentsId.entries()) {
      if (this.externalCleanupHandler) {
        try {
          this.externalCleanupHandler(webContentsId);
        } catch {
          // Ignore
        }
      }
      for (const dispose of disposers) {
        try {
          dispose();
        } catch {
          // Ignore
        }
      }
      disposers.clear();
    }
    this.disposersByWebContentsId.clear();

    for (const dispose of this.globalDisposers) {
      try {
        dispose();
      } catch {
        // Ignore
      }
    }
    this.globalDisposers.clear();
  }

  public getActiveSubscriptionCount(webContentsId?: number): number {
    if (webContentsId !== undefined) {
      return this.disposersByWebContentsId.get(webContentsId)?.size ?? 0;
    }
    let total = 0;
    for (const set of this.disposersByWebContentsId.values()) {
      total += set.size;
    }
    return total;
  }
}
