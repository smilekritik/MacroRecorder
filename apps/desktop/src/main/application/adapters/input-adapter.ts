/**
 * Input Injection Adapter for global SendInput and background HWND PostMessage delivery.
 * Enforces the Universal Input Release Guarantee
 * and isolates input states across global and targeted HWND destinations.
 */

import type { DispatchReceipt, IInputInjectorAdapter, Microseconds } from '../types.js';
import type { MacroEvent } from '../../ipc/types.js';
import { t } from '../../../../../../packages/localization/src/manager.js';

interface HeldKeyboardCommand {
  readonly virtualKey: number;
  readonly scanCode: number;
  readonly extended: boolean;
  readonly targetWindow: number;
}

interface HeldWindowState {
  readonly keys: Set<number>;
  readonly mouseButtons: Set<string>;
}

function createReceipt(params: {
  id: string;
  scheduledMicroseconds: number;
  startedMicroseconds: number;
  completedMicroseconds: number;
  confirmedMicroseconds?: number | null;
  success: boolean;
  error?: string | null;
  plannedMicroseconds?: number | null;
}): DispatchReceipt {
  const planned = params.plannedMicroseconds ?? params.scheduledMicroseconds;
  const confirmed = params.confirmedMicroseconds ?? null;
  return {
    eventId: params.id,
    id: params.id,
    scheduledMicroseconds: params.scheduledMicroseconds,
    dispatchStartedMicroseconds: params.startedMicroseconds,
    startedMicroseconds: params.startedMicroseconds,
    dispatchCompletedMicroseconds: params.completedMicroseconds,
    completedMicroseconds: params.completedMicroseconds,
    hookConfirmedMicroseconds: confirmed,
    confirmedMicroseconds: confirmed,
    success: params.success,
    error: params.error ?? null,
    plannedMicroseconds: params.plannedMicroseconds ?? null,
    dispatchJitterMilliseconds: (params.startedMicroseconds - planned) / 1000,
    confirmationMilliseconds: confirmed === null
      ? null
      : (confirmed - params.startedMicroseconds) / 1000,
  };
}

export class NativeInputAdapter implements IInputInjectorAdapter {
  private readonly globalHeldKeys = new Set<number>();
  private readonly globalHeldMouseButtons = new Set<string>();
  private readonly windowHeldStates = new Map<number, HeldWindowState>();
  private readonly heldKeyboardCommands = new Map<string, HeldKeyboardCommand>();
  private nativeModule: any = null;
  private nativeModuleLoaded = false;

  constructor(nativeModule?: unknown) {
    if (nativeModule) {
      this.nativeModule = nativeModule;
      this.nativeModuleLoaded = true;
    } else {
      this.tryLoadNative();
    }
  }

  private tryLoadNative(): void {
    if (this.nativeModuleLoaded) return;
    try {
      // Best-effort dynamic native binding lookup
      // In production packaged environment, addon is unpacked next to app
      const addon = (process as unknown as { addon?: unknown }).addon;
      if (addon) {
        this.nativeModule = addon;
        this.nativeModuleLoaded = true;
      }
    } catch {
      // Native addon loaded lazily or mocked in test environments
    }
  }

  public trackInputState(virtualKey: number, isDown: boolean, hwnd = 0): void {
    if (!isDown) this.heldKeyboardCommands.delete(`${hwnd}/${virtualKey}`);
    if (hwnd === 0) {
      if (isDown) {
        this.globalHeldKeys.add(virtualKey);
      } else {
        this.globalHeldKeys.delete(virtualKey);
      }
    } else {
      let winState = this.windowHeldStates.get(hwnd);
      if (!winState && isDown) {
        winState = { keys: new Set(), mouseButtons: new Set() };
        this.windowHeldStates.set(hwnd, winState);
      }
      if (!winState) return;
      if (isDown) {
        winState.keys.add(virtualKey);
      } else {
        winState.keys.delete(virtualKey);
        if (winState.keys.size === 0 && winState.mouseButtons.size === 0) this.windowHeldStates.delete(hwnd);
      }
    }
  }

  public trackMouseState(button: string, isDown: boolean, hwnd = 0): void {
    if (hwnd === 0) {
      if (isDown) {
        this.globalHeldMouseButtons.add(button);
      } else {
        this.globalHeldMouseButtons.delete(button);
      }
    } else {
      let winState = this.windowHeldStates.get(hwnd);
      if (!winState && isDown) {
        winState = { keys: new Set(), mouseButtons: new Set() };
        this.windowHeldStates.set(hwnd, winState);
      }
      if (!winState) return;
      if (isDown) {
        winState.mouseButtons.add(button);
      } else {
        winState.mouseButtons.delete(button);
        if (winState.keys.size === 0 && winState.mouseButtons.size === 0) this.windowHeldStates.delete(hwnd);
      }
    }
  }

  public isKeyDown(virtualKey: number): boolean {
    if (!this.nativeModule?.isKeyDown) {
      throw new Error('Physical keyboard state is unavailable in the native runtime.');
    }
    return Boolean(this.nativeModule.isKeyDown(virtualKey));
  }

  public getHeldInputsCount(): number {
    let count = this.globalHeldKeys.size + this.globalHeldMouseButtons.size;
    for (const win of this.windowHeldStates.values()) {
      count += win.keys.size + win.mouseButtons.size;
    }
    return count;
  }

  /**
   * Universal Input Release Guarantee:
   * Releases all held keys, buttons, and axes across global and targeted HWND destinations.
   * Can never throw and must complete synchronously on emergency stop or shutdown.
   */
  public releaseAll(hwnd?: number): void {
    try {
      if (hwnd !== undefined && hwnd !== 0) {
        // Target specific HWND
        const winState = this.windowHeldStates.get(hwnd);
        if (winState) {
          if (this.nativeModule?.releaseAllInputs) {
            this.nativeModule.releaseAllInputs({ hwnd });
          }
          winState.keys.clear();
          winState.mouseButtons.clear();
          this.windowHeldStates.delete(hwnd);
          for (const [key, command] of this.heldKeyboardCommands) {
            if (command.targetWindow === hwnd) this.heldKeyboardCommands.delete(key);
          }
        }
        return;
      }

      // Universal global release across all tracked targets
      if (this.nativeModule?.releaseAllInputs) {
        this.nativeModule.releaseAllInputs();
      }

      // Also dispatch release for all registered windows
      for (const [targetHwnd, winState] of this.windowHeldStates.entries()) {
        if (this.nativeModule?.releaseAllInputs) {
          try {
            this.nativeModule.releaseAllInputs({ hwnd: targetHwnd });
          } catch {
            // Best effort per window
          }
        }
        winState.keys.clear();
        winState.mouseButtons.clear();
      }

      this.globalHeldKeys.clear();
      this.globalHeldMouseButtons.clear();
      this.windowHeldStates.clear();
      this.heldKeyboardCommands.clear();
    } catch (err) {
      console.warn('[NativeInputAdapter] Universal input release error:', err);
    }
  }

  public releaseInputs(events: readonly MacroEvent[], targetWindow: number): void {
    const failures: unknown[] = [];
    for (const event of events) {
      try {
        if (event.type === 'KeyDown') {
          const virtualKey = Number(event['virtualKey'] ?? 0);
          const command = this.heldKeyboardCommands.get(`${targetWindow}/${virtualKey}`)
            ?? { virtualKey, scanCode: 0, extended: Boolean(event['extended']), targetWindow };
          const receipt = this.nativeModule?.injectKeyboard({ ...command, isUp: true });
          if (receipt?.success !== true) throw new Error(receipt?.error ?? 'Native keyboard release failed.');
          this.trackInputState(virtualKey, false, targetWindow);
        } else if (event.type === 'MouseButtonDown') {
          const button = String(event['button'] ?? 'Left');
          const flags = button === 'Left' ? 0x0004 : button === 'Right' ? 0x0010 : button === 'Middle' ? 0x0040 : 0x0100;
          const receipt = this.nativeModule?.injectMouse({ deltaX: 0, deltaY: 0, flags, wheelDelta: 0, isAbsolute: false, button, targetWindow });
          if (receipt?.success !== true) throw new Error(receipt?.error ?? 'Native mouse release failed.');
          this.trackMouseState(button, false, targetWindow);
        }
      } catch (error) {
        failures.push(error);
      }
    }
    if (failures.length) throw new AggregateError(failures, t('Some held inputs could not be released.'));
  }

  public async sendAsync(
    item: MacroEvent,
    scheduledMicroseconds: Microseconds,
    clockStartTimestamp: number,
    _preferScanCodes: boolean,
    targetWindow: number,
    token?: AbortSignal,
  ): Promise<DispatchReceipt> {
    if (token?.aborted) {
      throw new Error('Operation was cancelled');
    }

    const startedMicroseconds = clockStartTimestamp > 0
      ? Math.max(0, Math.round((performance.now() * 1000) - clockStartTimestamp))
      : scheduledMicroseconds;
    const eventType = String(item['type'] ?? item['eventType'] ?? '');

    if (eventType === 'Delay') {
      return createReceipt({
        id: String(item.id ?? ''),
        scheduledMicroseconds,
        startedMicroseconds,
        completedMicroseconds: startedMicroseconds,
        confirmedMicroseconds: startedMicroseconds,
        success: true,
        plannedMicroseconds: scheduledMicroseconds,
      });
    }

    if (!this.nativeModule) {
      throw new Error('Native input injection is unavailable.');
    }

    let nativeReceipt: { success?: boolean; error?: string | null; confirmedMicroseconds?: number | null } | undefined;

    // Track input state only after a successful native dispatch.
    if (eventType === 'KeyDown' || eventType === 'KeyUp') {
      const vk = typeof item['virtualKey'] === 'number' ? item['virtualKey'] : 0;
      const isDown = eventType === 'KeyDown';
      if (!this.nativeModule.injectKeyboard) {
        throw new Error('Native keyboard injection is unavailable.');
      }
      const command = !isDown ? this.heldKeyboardCommands.get(`${targetWindow}/${vk}`) : undefined;
      const identity = command ?? {
        virtualKey: vk,
        scanCode: _preferScanCodes && typeof item['scanCode'] === 'number' ? item['scanCode'] : 0,
        extended: Boolean(item['extended']),
        targetWindow,
      };
      nativeReceipt = this.nativeModule.injectKeyboard({ ...identity, isUp: !isDown });
      if (nativeReceipt?.success !== true) {
        throw new Error(nativeReceipt?.error ?? 'Native keyboard injection failed.');
      }
      if (isDown) this.heldKeyboardCommands.set(`${targetWindow}/${vk}`, identity);
      this.trackInputState(vk, isDown, targetWindow);
    } else if (eventType === 'MouseButtonDown' || eventType === 'MouseButtonUp') {
      const button = String(item['button'] ?? 'Left');
      const isDown = eventType === 'MouseButtonDown';
      if (!this.nativeModule.injectMouse) {
        throw new Error('Native mouse injection is unavailable.');
      }
      let flags = 0;
      if (button === 'Left') flags = isDown ? 0x0002 : 0x0004;
      else if (button === 'Right') flags = isDown ? 0x0008 : 0x0010;
      else if (button === 'Middle') flags = isDown ? 0x0020 : 0x0040;
      else if (button === 'X1' || button === 'X2') flags = isDown ? 0x0080 : 0x0100;

      nativeReceipt = this.nativeModule.injectMouse({
        deltaX: 0,
        deltaY: 0,
        flags,
        wheelDelta: 0,
        isAbsolute: false,
        button,
        targetWindow,
      });
      if (nativeReceipt?.success !== true) {
        throw new Error(nativeReceipt?.error ?? 'Native mouse injection failed.');
      }
      this.trackMouseState(button, isDown, targetWindow);
    } else if (eventType === 'MouseMove') {
      if (!this.nativeModule.injectMouse) {
        throw new Error('Native mouse injection is unavailable.');
      }
      const isAbsolute = Boolean(item['absoluteMove']);
      nativeReceipt = this.nativeModule.injectMouse({
        deltaX: typeof item['deltaX'] === 'number' ? item['deltaX'] : 0,
        deltaY: typeof item['deltaY'] === 'number' ? item['deltaY'] : 0,
        flags: isAbsolute ? 0x8000 | 0x0001 : 0x0001,
        wheelDelta: 0,
        isAbsolute,
        targetWindow,
      });
      if (nativeReceipt?.success !== true) {
        throw new Error(nativeReceipt?.error ?? 'Native mouse movement failed.');
      }
    } else if (eventType === 'Wheel' || eventType === 'HorizontalWheel') {
      if (!this.nativeModule.injectMouse) {
        throw new Error('Native mouse injection is unavailable.');
      }
      const delta = typeof item['wheelDelta'] === 'number' ? item['wheelDelta'] : 0;
      const flags = eventType === 'Wheel' ? 0x0800 : 0x01000;
      nativeReceipt = this.nativeModule.injectMouse({
        deltaX: 0,
        deltaY: 0,
        flags,
        wheelDelta: delta,
        isAbsolute: false,
        targetWindow,
      });
      if (nativeReceipt?.success !== true) {
        throw new Error(nativeReceipt?.error ?? 'Native mouse wheel injection failed.');
      }
    } else if (eventType === 'TypeText') {
      if (!this.nativeModule.injectKeyboard) {
        throw new Error('Native keyboard injection is unavailable.');
      }
      // The native text builder owns UTF-16 pairs and CR/LF normalization for the whole string.
      nativeReceipt = this.nativeModule.injectKeyboard({
        virtualKey: 0,
        scanCode: 0,
        extended: false,
        isUp: false,
        isUnicode: true,
        unicodeChar: String(item['text'] ?? ''),
        targetWindow,
      });
      if (nativeReceipt?.success !== true) {
        throw new Error(nativeReceipt?.error ?? 'Native text injection failed.');
      }
    } else {
      throw new Error(`Input event type ${eventType || '<empty>'} is not supported by the native adapter.`);
    }

    const completedMicroseconds = clockStartTimestamp > 0
      ? Math.max(0, Math.round((performance.now() * 1000) - clockStartTimestamp))
      : startedMicroseconds;
    const nativeConfirmedMicroseconds = nativeReceipt?.confirmedMicroseconds;
    const confirmedMicroseconds = typeof nativeConfirmedMicroseconds === 'number' && Number.isFinite(nativeConfirmedMicroseconds)
      ? startedMicroseconds + Math.max(0, Math.round(nativeConfirmedMicroseconds))
      : null;

    return createReceipt({
      id: String(item.id ?? ''),
      scheduledMicroseconds,
      startedMicroseconds,
      completedMicroseconds,
      confirmedMicroseconds,
      success: true,
      error: nativeReceipt?.error ?? null,
      plannedMicroseconds: scheduledMicroseconds,
    });
  }
}

/**
 * Deterministic In-Memory Fake Input Adapter for Unit and Integration Testing.
 */
export class FakeInputAdapter implements IInputInjectorAdapter {
  public readonly sentItems: MacroEvent[] = [];
  public readonly scheduledTimes: Microseconds[] = [];
  public readonly targetWindows: number[] = [];
  public readonly scanCodePreferences: boolean[] = [];
  public readonly releaseAllCalls: Array<{ hwnd?: number | undefined }> = [];
  public readonly heldKeys = new Set<number>();
  public readonly heldButtons = new Set<string>();
  public shouldFailOnSend = false;

  public trackInputState(virtualKey: number, isDown: boolean): void {
    if (isDown) this.heldKeys.add(virtualKey);
    else this.heldKeys.delete(virtualKey);
  }

  public trackMouseState(button: string, isDown: boolean): void {
    if (isDown) this.heldButtons.add(button);
    else this.heldButtons.delete(button);
  }

  public isKeyDown(virtualKey: number): boolean {
    return this.heldKeys.has(virtualKey);
  }

  public getHeldInputsCount(): number {
    return this.heldKeys.size + this.heldButtons.size;
  }

  public releaseAll(hwnd?: number): void {
    this.releaseAllCalls.push({ hwnd });
    this.heldKeys.clear();
    this.heldButtons.clear();
  }

  public releaseInputs(events: readonly MacroEvent[], _targetWindow: number): void {
    for (const event of events) {
      if (event.type === 'KeyDown') this.heldKeys.delete(Number(event['virtualKey'] ?? 0));
      if (event.type === 'MouseButtonDown') this.heldButtons.delete(String(event['button'] ?? 'Left'));
    }
  }

  public async sendAsync(
    item: MacroEvent,
    scheduledMicroseconds: Microseconds,
    _clockStartTimestamp: number,
    preferScanCodes: boolean,
    targetWindow: number,
    token?: AbortSignal,
  ): Promise<DispatchReceipt> {
    if (token?.aborted) {
      throw new Error('Operation was cancelled');
    }

    if (this.shouldFailOnSend) {
      throw new Error('Simulated input injection failure');
    }

    this.sentItems.push(item);
    this.scheduledTimes.push(scheduledMicroseconds);
    this.targetWindows.push(targetWindow);
    this.scanCodePreferences.push(preferScanCodes);

    const eventType = String(item['type'] ?? item['eventType'] ?? '');
    if (eventType === 'KeyDown') {
      this.heldKeys.add(Number(item['virtualKey'] ?? 0));
    } else if (eventType === 'KeyUp') {
      this.heldKeys.delete(Number(item['virtualKey'] ?? 0));
    } else if (eventType === 'MouseButtonDown') {
      this.heldButtons.add(String(item['button'] ?? 'Left'));
    } else if (eventType === 'MouseButtonUp') {
      this.heldButtons.delete(String(item['button'] ?? 'Left'));
    }

    return createReceipt({
      id: String(item.id ?? `fake-receipt-${this.sentItems.length}`),
      scheduledMicroseconds,
      startedMicroseconds: scheduledMicroseconds,
      completedMicroseconds: scheduledMicroseconds,
      confirmedMicroseconds: scheduledMicroseconds,
      success: true,
      plannedMicroseconds: scheduledMicroseconds,
    });
  }
}
