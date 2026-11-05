/**
 * Global and Per-Macro Hotkey Adapter.
 * Manages low-level Win32 keyboard/mouse hooks, RegisterHotKey calls,
 * conflict probing, pass-through filtering, and emergency stop dispatching.
 */

import type { HotkeyRegistration, HotkeyTriggerCallback, IHotkeyAdapter } from '../types.js';

function sameGesture(left: HotkeyRegistration, right: HotkeyRegistration): boolean {
  return left.virtualKey === right.virtualKey
    && left.modifiers === right.modifiers
    && (left.mouseButton ?? 'None') === (right.mouseButton ?? 'None')
    && (left.wheel ?? 'None') === (right.wheel ?? 'None');
}

export class NativeHotkeyAdapter implements IHotkeyAdapter {
  private readonly registeredHotkeys = new Map<number, HotkeyRegistration>();
  private readonly nativeIds = new Map<number, number>();
  private readonly listeners = new Set<HotkeyTriggerCallback>();
  private nativeModule: any = null;
  private nativeModuleLoaded = false;
  private isProcessingTrigger = false;

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
      const addon = (process as unknown as { addon?: unknown }).addon;
      if (addon) {
        this.nativeModule = addon;
        this.nativeModuleLoaded = true;
      }
    } catch {
      // Lazy or mocked
    }
  }

  /** Delivers a bind the native side reported, which is how application commands arrive. */
  public handleNativeTrigger(id: number): void {
    const registration = this.registeredHotkeys.get(id);
    if (registration) this.handleTrigger(registration);
  }

  public registerHotkey(registration: HotkeyRegistration): boolean {
    // Check if ID is already registered
    if (this.registeredHotkeys.has(registration.id)) {
      this.unregisterHotkey(registration.id);
    }

    // Check for internal conflict: duplicate VK + Modifiers
    for (const existing of this.registeredHotkeys.values()) {
      if (sameGesture(existing, registration)) {
        // Conflict detected
        return false;
      }
    }

    if (!this.nativeModule?.registerNativeHotkey) {
      return false;
    }

    try {
      const nativeId = Number(this.nativeModule.registerNativeHotkey({
        id: registration.id,
        virtualKey: registration.virtualKey,
        modifiers: registration.modifiers,
        mouseButton: registration.mouseButton,
        wheel: registration.wheel,
        passThrough: registration.passThrough,
        scopeProcess: registration.scopeProcess,
        scopeTitle: registration.scopeTitle,
        macroId: registration.isMacroHotkey ? registration.macroId : undefined,
        emergency: registration.emergency,
      }));
      if (!Number.isInteger(nativeId) || nativeId <= 0) {
        return false;
      }
      this.registeredHotkeys.set(registration.id, registration);
      this.nativeIds.set(registration.id, nativeId);
      return true;
    } catch {
      return false;
    }
  }

  public unregisterHotkey(id: number): boolean {
    if (!this.registeredHotkeys.has(id)) {
      return false;
    }

    if (this.nativeModule?.unregisterNativeHotkey) {
      try {
        this.nativeModule.unregisterNativeHotkey({ id: this.nativeIds.get(id) ?? id });
      } catch {
        return false;
      }
    }

    this.nativeIds.delete(id);
    this.registeredHotkeys.delete(id);
    return true;
  }

  public unregisterAll(): void {
    for (const id of Array.from(this.registeredHotkeys.keys())) {
      this.unregisterHotkey(id);
    }
    this.registeredHotkeys.clear();
    this.nativeIds.clear();
  }

  public isRegistered(id: number): boolean {
    return this.registeredHotkeys.has(id);
  }

  /**
   * Foreign conflict detection probe.
   * Tests whether another external application has already registered this hotkey combination.
   */
  public probeAvailability(virtualKey: number, modifiers: number): boolean {
    // Internal conflict check
    for (const existing of this.registeredHotkeys.values()) {
      if (existing.virtualKey === virtualKey && existing.modifiers === modifiers) {
        return false;
      }
    }

    // External probe using native probe if available
    if (!this.nativeModule?.probeHotkeyAvailability) {
      return false;
    }
    try {
      const [available] = this.nativeModule.probeHotkeyAvailability([{ id: 1, virtualKey, modifiers }]);
      return Boolean(available);
    } catch {
      return false;
    }
  }

  public onTrigger(callback: HotkeyTriggerCallback): () => void {
    this.listeners.add(callback);
    return () => {
      this.listeners.delete(callback);
    };
  }

  public getRegisteredHotkeys(): readonly HotkeyRegistration[] {
    return Array.from(this.registeredHotkeys.values());
  }

  /**
   * Internal trigger dispatcher.
   */
  public handleTrigger(registration: HotkeyRegistration): void {
    if (this.isProcessingTrigger) return;
    this.isProcessingTrigger = true;
    try {
      for (const listener of this.listeners) {
        try {
          listener(registration);
        } catch (err) {
          console.warn('[NativeHotkeyAdapter] Hotkey trigger listener error:', err);
        }
      }
    } finally {
      this.isProcessingTrigger = false;
    }
  }
}

/**
 * Deterministic Fake Hotkey Adapter for Unit and Integration Testing.
 */
export class FakeHotkeyAdapter implements IHotkeyAdapter {
  private readonly registered = new Map<number, HotkeyRegistration>();
  private readonly listeners = new Set<HotkeyTriggerCallback>();
  public simulatedConflicts = new Set<string>(); // key: `${vk}-${modifiers}`

  public registerHotkey(registration: HotkeyRegistration): boolean {
    const key = `${registration.virtualKey}-${registration.modifiers}`;
    if (this.simulatedConflicts.has(key)) {
      return false;
    }

    // Check duplicate internal bindings
    for (const existing of this.registered.values()) {
      if (
        existing.id !== registration.id &&
        sameGesture(existing, registration)
      ) {
        return false;
      }
    }

    this.registered.set(registration.id, registration);
    return true;
  }

  public unregisterHotkey(id: number): boolean {
    return this.registered.delete(id);
  }

  public unregisterAll(): void {
    this.registered.clear();
  }

  public isRegistered(id: number): boolean {
    return this.registered.has(id);
  }

  public probeAvailability(virtualKey: number, modifiers: number): boolean {
    const key = `${virtualKey}-${modifiers}`;
    if (this.simulatedConflicts.has(key)) return false;

    for (const existing of this.registered.values()) {
      if (existing.virtualKey === virtualKey && existing.modifiers === modifiers) {
        return false;
      }
    }
    return true;
  }

  public onTrigger(callback: HotkeyTriggerCallback): () => void {
    this.listeners.add(callback);
    return () => {
      this.listeners.delete(callback);
    };
  }

  public getRegisteredHotkeys(): readonly HotkeyRegistration[] {
    return Array.from(this.registered.values());
  }

  /**
   * Simulates a physical user hotkey press event.
   */
  public simulatePress(id: number): boolean {
    const reg = this.registered.get(id);
    if (!reg) return false;

    for (const listener of this.listeners) {
      listener(reg);
    }
    return true;
  }
}
