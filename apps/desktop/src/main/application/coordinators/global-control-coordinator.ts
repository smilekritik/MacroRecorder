/**
 * Global Control Coordinator.
 * Manages system-wide application shortcuts, per-macro hotkeys, dynamic routing refresh,
 * conflict probing, pass-through hooks, target window scoping, and the
 * unkillable Main-Process Native Emergency Stop Guarantee.
 *
 * Renderer reload or closure CANNOT stop emergency control or strand held input.
 * Saving settings or macros refreshes hotkey routing WITHOUT duplicate registrations.
 */

import type { HotkeyRegistration, IHotkeyAdapter, IInputInjectorAdapter, IWindowOrchestratorAdapter } from '../types.js';
import type { PlaybackCoordinator } from './playback-coordinator.js';
import type { RecordingCoordinator } from './recording-coordinator.js';
import type { AppPreferences, MacroDefinition } from '../../ipc/types.js';
import { hotkeyModifiers, isAutomaticMacro } from '../adapters/engine-plan.js';

export interface GlobalControlOptions {
  readonly hotkeyAdapter: IHotkeyAdapter;
  readonly playbackCoordinator: PlaybackCoordinator;
  readonly recordingCoordinator: RecordingCoordinator;
  readonly windowOrchestrator: IWindowOrchestratorAdapter;
  readonly onPixelCaptureTriggered?: (() => void) | undefined;
  readonly inputAdapter?: IInputInjectorAdapter | undefined;
  readonly triggerCoordinator?: unknown | undefined;
  readonly onMacrosChanged?: ((macros: readonly MacroDefinition[]) => void) | undefined;
}

interface HotkeyGesture {
  readonly virtualKey: number;
  readonly modifiers: number;
  readonly mouseButton?: string | undefined;
  readonly wheel?: string | undefined;
}

/** Reads a stored binding; null means the command deliberately has no shortcut. */
function gestureOf(binding: Readonly<Record<string, unknown>>): HotkeyGesture | null {
  const virtualKey = typeof binding['virtualKey'] === 'number' ? binding['virtualKey'] : 0;
  const button = String(binding['mouseButton'] ?? 'None');
  const wheel = String(binding['wheel'] ?? 'None');
  const mouseButton = button !== 'None' ? button : undefined;
  const wheelDirection = wheel !== 'None' ? wheel : undefined;
  if (virtualKey === 0 && !mouseButton && !wheelDirection) return null;
  return { virtualKey, modifiers: hotkeyModifiers(binding), mouseButton, wheel: wheelDirection };
}

// Fixed system hotkey ID slots (1..99 reserved for system)
const SYSTEM_HOTKEY_EMERGENCY_STOP = 1;
const SYSTEM_HOTKEY_RECORDING_START = 2;
const SYSTEM_HOTKEY_RECORDING_STOP = 3;
const SYSTEM_HOTKEY_PLAYBACK_PAUSE = 4;
const SYSTEM_HOTKEY_PIXEL_CAPTURE = 5;
const SYSTEM_HOTKEY_BIND_MAP = 6;

// Per-macro hotkeys start at ID 100
const MACRO_HOTKEY_START_ID = 100;

export class GlobalControlCoordinator {
  private readonly hotkeyAdapter: IHotkeyAdapter;
  private readonly playbackCoordinator: PlaybackCoordinator;
  private readonly recordingCoordinator: RecordingCoordinator;
  private readonly windowOrchestrator: IWindowOrchestratorAdapter;
  private readonly onPixelCaptureTriggered?: (() => void) | undefined;
  private readonly onMacrosChanged?: ((macros: readonly MacroDefinition[]) => void) | undefined;

  private currentPreferences: AppPreferences = {};
  private activeMacros: readonly MacroDefinition[] = [];
  private macroIdToHotkeyId = new Map<string, number>();
  private nextMacroHotkeyId = MACRO_HOTKEY_START_ID;
  private unsubscribeTriggerListener: (() => void) | null = null;

  public get preferences(): AppPreferences {
    return this.currentPreferences;
  }

  constructor(options: GlobalControlOptions) {
    this.hotkeyAdapter = options.hotkeyAdapter;
    this.playbackCoordinator = options.playbackCoordinator;
    this.recordingCoordinator = options.recordingCoordinator;
    this.windowOrchestrator = options.windowOrchestrator;
    this.onPixelCaptureTriggered = options.onPixelCaptureTriggered;
    this.onMacrosChanged = options.onMacrosChanged;

    this.attachTriggerListener();
  }

  private attachTriggerListener(): void {
    this.unsubscribeTriggerListener = this.hotkeyAdapter.onTrigger((reg) => {
      this.handleHotkeyTrigger(reg);
    });
  }

  /**
   * Dispatches a triggered hotkey.
   * Emergency Stop executes immediately on the main process
   * with zero dependence on renderer responsiveness.
   */
  public handleHotkeyTrigger(registration: HotkeyRegistration): void {
    if (registration.id === SYSTEM_HOTKEY_EMERGENCY_STOP) {
      // Direct main process emergency stop: halts recording & playback and releases inputs immediately
      this.playbackCoordinator.emergencyStop('Emergency stop shortcut pressed');
      if (this.recordingCoordinator.isRecording) {
        this.recordingCoordinator.stop();
      }
      return;
    }

    if (registration.id === SYSTEM_HOTKEY_RECORDING_START) {
      // The window owns the selected macro and asks how to merge, so it starts the session.
      return;
    }

    if (registration.id === SYSTEM_HOTKEY_RECORDING_STOP) {
      if (this.recordingCoordinator.isRecording) {
        this.recordingCoordinator.stop();
      }
      return;
    }

    if (registration.id === SYSTEM_HOTKEY_PLAYBACK_PAUSE) {
      const status = this.playbackCoordinator.getStatus();
      if (status.state === 'Playing') {
        this.playbackCoordinator.pause();
      } else if (status.state === 'Paused') {
        this.playbackCoordinator.resume();
      }
      return;
    }

    if (registration.id === SYSTEM_HOTKEY_PIXEL_CAPTURE) {
      this.onPixelCaptureTriggered?.();
      return;
    }

    if (registration.id === SYSTEM_HOTKEY_BIND_MAP) {
      // Toggle Bind Map Window visibility without disturbing foreground app
      if (this.windowOrchestrator.isWindowOpen('BindMapWindow')) {
        this.windowOrchestrator.closeWindow('BindMapWindow');
      } else {
        this.windowOrchestrator.openWindow('BindMapWindow');
      }
      return;
    }

    // Per-Macro Hotkey Trigger
    if (registration.isMacroHotkey && registration.macroId) {
      const macro = this.activeMacros.find((m) => m.id === registration.macroId);
      if (macro && macro.isEnabled) {
        // Evaluate activation repeat mode
        void this.playbackCoordinator.activate(macro).catch(error => console.error('Hotkey activation failed', error));
      }
    }
  }

  /**
   * Refreshes all system application hotkeys and per-macro hotkeys.
   * Guarantees clean unregistration of previous bindings and NO duplicate registrations.
   */
  public refreshHotkeys(preferences: AppPreferences, macros: readonly MacroDefinition[]): void {
    this.currentPreferences = preferences;
    this.activeMacros = macros;
    // Plans first, so that a bind can never fire for a macro the engine does not know yet.
    this.onMacrosChanged?.(macros);

    // Unregister everything first to prevent duplicate registrations or leaked IDs
    this.hotkeyAdapter.unregisterAll();
    this.macroIdToHotkeyId.clear();
    this.nextMacroHotkeyId = MACRO_HOTKEY_START_ID;

    // 1. Register System Application Hotkeys
    this.registerSystemHotkey(
      SYSTEM_HOTKEY_EMERGENCY_STOP,
      preferences['emergencyStopHotkey'],
      0x79, // VK_F10 default
      'Emergency Stop',
    );

    this.registerSystemHotkey(
      SYSTEM_HOTKEY_RECORDING_START,
      preferences['recordingStartHotkey'],
      0x78, // VK_F9 default
      'Recording Start',
    );

    this.registerSystemHotkey(
      SYSTEM_HOTKEY_RECORDING_STOP,
      preferences['recordingStopHotkey'],
      0x77, // VK_F8 default
      'Recording Stop',
    );

    this.registerSystemHotkey(
      SYSTEM_HOTKEY_PLAYBACK_PAUSE,
      preferences['playbackPauseHotkey'],
      0x13, // VK_PAUSE default
      'Playback Pause',
    );

    this.registerSystemHotkey(
      SYSTEM_HOTKEY_PIXEL_CAPTURE,
      preferences['pixelCaptureHotkey'],
      0x74, // VK_F5 default
      'Pixel Capture',
    );

    this.registerSystemHotkey(
      SYSTEM_HOTKEY_BIND_MAP,
      preferences['bindMapHotkey'],
      0x7a, // VK_F11 default
      'Bind Map',
    );

    // 2. Register Per-Macro Global Shortcuts
    for (const macro of macros) {
      if (!macro.isEnabled) continue;

      if (isAutomaticMacro(macro)) continue;

      const hotkey = (macro['hotkey'] ?? {}) as Record<string, unknown>;
      const gesture = gestureOf(hotkey);
      if (!gesture) continue;

      const playback = (macro.playback ?? {}) as Record<string, unknown>;
      const passThrough = Boolean(hotkey['passThrough'] ?? playback['passThroughHotkey']);
      const targetWindowOnly = Boolean(hotkey['targetWindowOnly'] ?? playback['hotkeyScopedToTarget']);

      const hotkeyId = this.nextMacroHotkeyId++;
      const registered = this.hotkeyAdapter.registerHotkey({
        id: hotkeyId,
        ...gesture,
        scopeProcess: targetWindowOnly ? String(playback['targetProcessName'] ?? '') : undefined,
        scopeTitle: targetWindowOnly ? String(playback['targetWindowTitle'] ?? '') : undefined,
        description: `Macro: ${macro.name}`,
        isMacroHotkey: true,
        macroId: macro.id,
        passThrough,
        targetWindowOnly,
      });

      if (registered) {
        this.macroIdToHotkeyId.set(macro.id, hotkeyId);
      }
    }
  }

  private registerSystemHotkey(
    id: number,
    rawBinding: unknown,
    defaultVk: number,
    description: string,
  ): void {
    let gesture: HotkeyGesture | null = { virtualKey: defaultVk, modifiers: 0 };

    // Application Hotkeys with Clearable Intent
    // If explicitly configured with virtualKey: 0 (or empty), do NOT revert to default!
    if (rawBinding && typeof rawBinding === 'object') {
      const binding = rawBinding as Record<string, unknown>;
      if (typeof binding['virtualKey'] === 'number') {
        gesture = gestureOf(binding);
      }
    }
    if (!gesture) return;

    this.hotkeyAdapter.registerHotkey({
      id,
      ...gesture,
      description,
      isMacroHotkey: false,
      emergency: id === SYSTEM_HOTKEY_EMERGENCY_STOP,
    });
  }

  public initialize(): void {
    if (!this.unsubscribeTriggerListener) {
      this.attachTriggerListener();
    }
  }

  public emergencyStop(reason = 'Emergency stop requested'): {
    stopped: boolean;
    inputsReleased: boolean;
  } {
    const playbackRes = this.playbackCoordinator.emergencyStop(reason);
    if (this.recordingCoordinator.hasActiveSession) {
      this.recordingCoordinator.stop();
    }
    return playbackRes;
  }

  /** Keys and buttons the recording must leave out, because they control the application. */
  public controlGestures(): { readonly virtualKeys: readonly number[]; readonly mouseButtons: readonly string[] } {
    const virtualKeys: number[] = [];
    const mouseButtons: string[] = [];
    for (const name of ['recordingStartHotkey', 'recordingStopHotkey', 'playbackPauseHotkey', 'emergencyStopHotkey', 'pixelCaptureHotkey']) {
      const binding = this.currentPreferences?.[name] as Record<string, unknown> | undefined;
      const gesture = binding ? gestureOf(binding) : null;
      if (!gesture) continue;
      if (gesture.virtualKey) virtualKeys.push(gesture.virtualKey);
      if (gesture.mouseButton) mouseButtons.push(gesture.mouseButton);
    }
    return { virtualKeys, mouseButtons };
  }

  public refreshSystemHotkeys(preferences: AppPreferences): void {
    this.refreshHotkeys(preferences, this.activeMacros);
  }

  public refreshMacroHotkeys(macros: readonly MacroDefinition[]): void {
    this.refreshHotkeys(this.currentPreferences, macros);
  }

  public onHotkeyTriggered(listener: (registration: HotkeyRegistration) => void): () => void {
    return this.hotkeyAdapter.onTrigger(listener);
  }

  public getRegisteredCount(): number {
    return this.hotkeyAdapter.getRegisteredHotkeys().length;
  }

  public dispose(): void {
    this.unsubscribeTriggerListener?.();
    this.unsubscribeTriggerListener = null;
    this.hotkeyAdapter.unregisterAll();
    this.macroIdToHotkeyId.clear();
  }
}
