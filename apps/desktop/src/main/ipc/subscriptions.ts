/**
 * Push event subscription manager for Electron Main IPC.
 * Tracks active WebContents subscriptions and automatically cleans up
 * listeners when windows or renderer processes are destroyed.
 */

import type { WebContents } from 'electron';
import { isKnownEventChannel, type IpcEventChannel } from './channels.js';
import type { IpcEventPayloadFor } from './types.js';

export class SubscriptionManager {
  // Map channel -> Set of subscribed WebContents IDs
  private readonly channelSubscribers = new Map<string, Set<number>>();
  // Map WebContents ID -> WebContents instance reference
  private readonly webContentsById = new Map<number, WebContents>();
  // Cleanup listener functions per WebContents ID
  private readonly cleanupHandlers = new Map<number, () => void>();

  /**
   * Subscribes a WebContents to push notifications on the specified event channel.
   */
  public subscribe(webContents: WebContents, channel: string): boolean {
    if (!isKnownEventChannel(channel)) {
      return false;
    }

    if (!webContents || webContents.isDestroyed()) {
      return false;
    }

    const id = webContents.id;
    this.webContentsById.set(id, webContents);

    if (!this.channelSubscribers.has(channel)) {
      this.channelSubscribers.set(channel, new Set());
    }
    this.channelSubscribers.get(channel)!.add(id);

    // Register automatic cleanup when WebContents is destroyed
    if (!this.cleanupHandlers.has(id)) {
      const onDestroyed = () => {
        this.unsubscribeAll(id);
      };
      webContents.once('destroyed', onDestroyed);
      this.cleanupHandlers.set(id, onDestroyed);
    }

    return true;
  }

  /**
   * Unsubscribes a WebContents from a specific event channel.
   */
  public unsubscribe(webContents: WebContents, channel: string): void {
    if (!webContents) return;
    const id = webContents.id;

    const subscribers = this.channelSubscribers.get(channel);
    if (subscribers) {
      subscribers.delete(id);
      if (subscribers.size === 0) {
        this.channelSubscribers.delete(channel);
      }
    }

    // If this WebContents has no remaining subscriptions across any channel, clean up its reference
    let hasAnyRemaining = false;
    for (const subs of this.channelSubscribers.values()) {
      if (subs.has(id)) {
        hasAnyRemaining = true;
        break;
      }
    }

    if (!hasAnyRemaining) {
      this.webContentsById.delete(id);
      this.cleanupHandlers.delete(id);
    }
  }

  /**
   * Removes all subscriptions for a specific WebContents ID (e.g. on window close).
   */
  public unsubscribeAll(webContentsId: number): void {
    for (const [channel, subs] of this.channelSubscribers.entries()) {
      subs.delete(webContentsId);
      if (subs.size === 0) {
        this.channelSubscribers.delete(channel);
      }
    }

    this.webContentsById.delete(webContentsId);
    this.cleanupHandlers.delete(webContentsId);
  }

  /**
   * Broadcasts a push event to all currently subscribed WebContents.
   */
  public broadcast<C extends IpcEventChannel>(channel: C, payload: IpcEventPayloadFor<C>): void {
    const subscribers = this.channelSubscribers.get(channel);
    if (!subscribers || subscribers.size === 0) {
      return;
    }

    for (const id of subscribers) {
      const wc = this.webContentsById.get(id);
      if (!wc || wc.isDestroyed()) {
        this.unsubscribeAll(id);
        continue;
      }

      try {
        wc.send(channel, payload);
      } catch (err) {
        console.warn(`[SubscriptionManager] Failed sending event to WebContents ${id}:`, err);
      }
    }
  }

  /**
   * Sends a push event to a specific WebContents directly.
   */
  public sendTo<C extends IpcEventChannel>(
    webContents: WebContents,
    channel: C,
    payload: IpcEventPayloadFor<C>,
  ): boolean {
    if (!webContents || webContents.isDestroyed()) {
      return false;
    }

    try {
      webContents.send(channel, payload);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Gets the number of active subscribers for a channel.
   */
  public getSubscriberCount(channel: string): number {
    return this.channelSubscribers.get(channel)?.size ?? 0;
  }

  /**
   * Cleans up all tracked subscriptions (shutdown / test teardown).
   */
  public clear(): void {
    this.channelSubscribers.clear();
    this.webContentsById.clear();
    this.cleanupHandlers.clear();
  }
}
