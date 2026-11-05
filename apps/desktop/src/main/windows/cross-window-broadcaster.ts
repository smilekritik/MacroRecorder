/**
 * @macro-recorder/desktop - Main Process Cross-Window Broadcaster
 * Propagates theme, language, library, macro state, and hotkeys across all open BrowserWindows.
 * Strictly satisfies the requirement:
 * "Theme, language, library, macro state, and hotkeys remain consistent across all open windows".
 */

import type { BrowserWindow } from 'electron';

export interface CrossWindowStateBroadcasts {
  readonly themeChannel: string;
  readonly localizationChannel: string;
  readonly libraryChannel: string;
  readonly macroStateChannel: string;
  readonly hotkeysChannel: string;
  readonly windowStateChannel: string;
}

export const DEFAULT_BROADCAST_CHANNELS: CrossWindowStateBroadcasts = {
  themeChannel: 'theme:changed',
  localizationChannel: 'localization:changed',
  libraryChannel: 'library:updated',
  macroStateChannel: 'macro:state-changed',
  hotkeysChannel: 'hotkeys:updated',
  windowStateChannel: 'window:state-changed',
};

export class CrossWindowBroadcaster {
  private readonly getWindows: () => readonly BrowserWindow[];
  private readonly channels: CrossWindowStateBroadcasts;

  constructor(
    getWindows: () => readonly BrowserWindow[],
    channels: CrossWindowStateBroadcasts = DEFAULT_BROADCAST_CHANNELS,
  ) {
    this.getWindows = getWindows;
    this.channels = channels;
  }

  /**
   * Broadcasts an arbitrary event to all active BrowserWindows, optionally excluding the sender.
   */
  public broadcast(channel: string, payload: unknown, excludeWebContentsId?: number): number {
    let sentCount = 0;
    const windows = this.getWindows();

    for (const win of windows) {
      if (win && !win.isDestroyed() && win.webContents && !win.webContents.isDestroyed()) {
        if (excludeWebContentsId && win.webContents.id === excludeWebContentsId) {
          continue;
        }
        try {
          win.webContents.send(channel, payload);
          sentCount++;
        } catch {
          // Best-effort push
        }
      }
    }

    return sentCount;
  }

  /**
   * Propagates theme changes across all open windows.
   */
  public broadcastTheme(theme: string, excludeSenderId?: number): void {
    this.broadcast(this.channels.themeChannel, { theme }, excludeSenderId);
  }

  /**
   * Propagates language / localization changes across all open windows.
   */
  public broadcastLocalization(language: string, excludeSenderId?: number): void {
    this.broadcast(this.channels.localizationChannel, { language }, excludeSenderId);
  }

  /**
   * Propagates macro library mutations across all open windows.
   */
  public broadcastLibraryUpdate(
    reason: 'loaded' | 'saved' | 'deleted' | 'restored' | 'moved',
    macroId?: string,
    excludeSenderId?: number,
  ): void {
    this.broadcast(this.channels.libraryChannel, { reason, macroId }, excludeSenderId);
  }

  /**
   * Propagates active playback / recording state across all open windows.
   */
  public broadcastMacroState(
    engineState: string,
    macroId?: string,
    macroName?: string,
    excludeSenderId?: number,
  ): void {
    this.broadcast(
      this.channels.macroStateChannel,
      { engineState, macroId, macroName },
      excludeSenderId,
    );
  }

  /**
   * Propagates active hotkeys configuration across all open windows.
   */
  public broadcastHotkeys(hotkeys: readonly unknown[], excludeSenderId?: number): void {
    this.broadcast(this.channels.hotkeysChannel, { hotkeys }, excludeSenderId);
  }

  /**
   * Propagates window lifecycle changes (open/close/minimize/restore).
   */
  public broadcastWindowState(windowId: string, state: string): void {
    this.broadcast(this.channels.windowStateChannel, { windowId, state });
  }
}
