/**
 * IPC Broadcaster connects coordinator events to SubscriptionManager push notifications.
 * Dispatches status updates, recording events, hotkey triggers, gamepad state, and overlay changes.
 */

import { IpcEventChannels } from '../../ipc/channels.js';
import type { SubscriptionManager } from '../../ipc/subscriptions.js';
import type {
  GlobalControlCoordinator,
  PlaybackCoordinator,
  RecordingCoordinator,
} from '../coordinators/index.js';
import type {
  GamepadCoordinator,
  OverlayCoordinator,
} from '../state/index.js';

export interface IpcBroadcasterDependencies {
  readonly playbackCoordinator: PlaybackCoordinator;
  readonly recordingCoordinator: RecordingCoordinator;
  readonly globalControlCoordinator: GlobalControlCoordinator;
  readonly gamepadCoordinator: GamepadCoordinator;
  readonly overlayCoordinator: OverlayCoordinator;
}

export class IpcBroadcaster {
  private readonly subscriptions: SubscriptionManager;
  private readonly deps: IpcBroadcasterDependencies;
  private readonly unsubscribers: Array<() => void> = [];
  private isListening = false;

  constructor(subscriptions: SubscriptionManager, deps: IpcBroadcasterDependencies) {
    this.subscriptions = subscriptions;
    this.deps = deps;
  }

  /**
   * Begins listening to coordinator events and broadcasting them over IPC.
   */
  public start(): void {
    if (this.isListening) return;
    this.isListening = true;

    // 1. Playback status change
    this.unsubscribers.push(
      this.deps.playbackCoordinator.onStatusChange((status) => {
        this.subscriptions.broadcast(IpcEventChannels.PLAYBACK_STATUS_CHANGED, {
          state: status.state,
          currentMacroId: status.macroId,
          macroName: status.macroName,
          elapsedMicroseconds: status.elapsedMicroseconds,
          currentActionIndex: status.currentActionIndex,
          totalActions: status.totalActions,
        });
      }),
    );

    // 2. Recording events and state change
    this.unsubscribers.push(
      this.deps.recordingCoordinator.onEvent((event) => {
        this.subscriptions.broadcast(IpcEventChannels.RECORDING_EVENT, event);
      }),
    );

    this.unsubscribers.push(
      this.deps.recordingCoordinator.onStateChange((status) => {
        const state = status.isCountdown
          ? 'Countdown'
          : status.isPaused
            ? 'Paused'
            : status.isRecording ? 'Recording'
            : 'Idle';
        this.subscriptions.broadcast(IpcEventChannels.RECORDING_STATE_CHANGED, state);
      }),
    );

    // 3. Hotkey triggered
    this.unsubscribers.push(
      this.deps.globalControlCoordinator.onHotkeyTriggered((reg) => {
        this.subscriptions.broadcast(IpcEventChannels.HOTKEY_TRIGGERED, {
          id: reg.id,
          key: reg.description ?? `VK_${reg.virtualKey}`,
        });
      }),
    );

    // 4. Gamepad state changed
    this.unsubscribers.push(
      this.deps.gamepadCoordinator.onStateChanged((readings) => {
        this.subscriptions.broadcast(IpcEventChannels.GAMEPAD_STATE_CHANGED, readings);
      }),
    );

    // 5. Overlay changed
    this.unsubscribers.push(
      this.deps.overlayCoordinator.onStateChange((card) => {
        this.subscriptions.broadcast(IpcEventChannels.OVERLAY_CHANGED, card);
      }),
    );
  }

  /**
   * Broadcasts a window state change directly.
   */
  public broadcastWindowState(windowId: string, state: string): void {
    this.subscriptions.broadcast(IpcEventChannels.WINDOW_STATE_CHANGED, { windowId, state });
  }

  /**
   * Unsubscribes from all coordinator events.
   */
  public stop(): void {
    for (const unsubscribe of this.unsubscribers) {
      try {
        unsubscribe();
      } catch {
        // Ignore errors during teardown
      }
    }
    this.unsubscribers.length = 0;
    this.isListening = false;
  }
}
