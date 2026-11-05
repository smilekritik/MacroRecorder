/**
 * Automatic Pixel Trigger Coordinator.
 * Manages background pixel color monitoring, trigger detection, cooldown guards,
 * and automatic suspension/resumption across application lifecycle transitions.
 */

import type { IPixelColorAdapter, Milliseconds } from '../types.js';
import type { MacroDefinition } from '../../ipc/types.js';

export interface AutomaticTriggerMacro {
  readonly macro: MacroDefinition;
  readonly pixelX: number;
  readonly pixelY: number;
  readonly expectedColorRgb: number;
  readonly cooldownMs: Milliseconds;
  lastFiredTimestamp: number;
}

export type TriggerFiredCallback = (macro: MacroDefinition) => void;

export class TriggerCoordinator {
  private readonly pixelAdapter: IPixelColorAdapter;
  private readonly registeredTriggers = new Map<string, AutomaticTriggerMacro>();
  private readonly triggerListeners = new Set<TriggerFiredCallback>();

  private pollIntervalTimer: NodeJS.Timeout | null = null;
  private isSuspended = false;
  private suspensionReasons = new Set<string>();
  private pollIntervalMs = 50;

  constructor(pixelAdapter: IPixelColorAdapter, pollIntervalMs = 50) {
    this.pixelAdapter = pixelAdapter;
    this.pollIntervalMs = pollIntervalMs;
  }

  /**
   * Registers or updates an automatic trigger macro.
   * A macro qualifies as an automatic trigger if:
   * macro.isEnabled && events[0]?.type === 'PixelColorTrigger'
   */
  public registerMacro(macro: MacroDefinition): boolean {
    if (!macro.isEnabled) {
      this.unregisterMacro(macro.id);
      return false;
    }

    const events = (macro.events ?? []) as ReadonlyArray<Record<string, unknown>>;
    const firstNonComment = events.find((e) => {
      const type = String(e['type'] ?? e['eventType'] ?? '');
      return type !== 'Comment';
    });

    if (!firstNonComment) {
      this.unregisterMacro(macro.id);
      return false;
    }

    const eventType = String(firstNonComment['type'] ?? firstNonComment['eventType'] ?? '');
    if (eventType !== 'PixelColorTrigger') {
      this.unregisterMacro(macro.id);
      return false;
    }

    const pixelX = typeof firstNonComment['pixelX'] === 'number' ? firstNonComment['pixelX'] : 0;
    const pixelY = typeof firstNonComment['pixelY'] === 'number' ? firstNonComment['pixelY'] : 0;
    const expectedColorRgb =
      typeof firstNonComment['pixelColor'] === 'number'
        ? firstNonComment['pixelColor'] & 0xffffff
        : typeof firstNonComment['expectedColorRgb'] === 'number'
          ? (firstNonComment['expectedColorRgb'] as number) & 0xffffff
          : 0;

    // Cooldown default is 3000ms
    const cooldownMs =
      typeof firstNonComment['triggerCooldownMilliseconds'] === 'number' &&
      firstNonComment['triggerCooldownMilliseconds'] > 0
        ? firstNonComment['triggerCooldownMilliseconds']
        : 3000;

    const existing = this.registeredTriggers.get(macro.id);
    const trigger: AutomaticTriggerMacro = {
      macro,
      pixelX,
      pixelY,
      expectedColorRgb,
      cooldownMs,
      lastFiredTimestamp: existing?.lastFiredTimestamp ?? 0,
    };

    this.registeredTriggers.set(macro.id, trigger);
    this.ensurePolling();
    return true;
  }

  public unregisterMacro(macroId: string): void {
    this.registeredTriggers.delete(macroId);
    if (this.registeredTriggers.size === 0) {
      this.stopPolling();
    }
  }

  public clearAllTriggers(): void {
    this.registeredTriggers.clear();
    this.stopPolling();
  }

  public getRegisteredCount(): number {
    return this.registeredTriggers.size;
  }

  public isMacroRegistered(macroId: string): boolean {
    return this.registeredTriggers.has(macroId);
  }

  /**
   * Suspends automatic trigger polling with a specific reason.
   * Reasons can be 'recording', 'power_suspend', 'user_pause', 'window_inactive'.
   */
  public suspend(reason: string): void {
    this.suspensionReasons.add(reason);
    this.isSuspended = true;
    this.stopPolling();
  }

  /**
   * Resumes automatic trigger polling for a specific reason.
   * When all reasons are cleared, polling resumes.
   */
  public resume(reason: string): void {
    this.suspensionReasons.delete(reason);
    if (this.suspensionReasons.size === 0) {
      this.isSuspended = false;
      this.ensurePolling();
    }
  }

  public get isCurrentlySuspended(): boolean {
    return this.isSuspended;
  }

  public get suspended(): boolean {
    return this.isSuspended;
  }

  public get activeTriggerCount(): number {
    return this.registeredTriggers.size;
  }

  public sampleAllTriggers(): number {
    return this.evaluateTriggers();
  }

  public get activeSuspensionReasons(): readonly string[] {
    return Array.from(this.suspensionReasons);
  }

  public onTriggerFired(callback: TriggerFiredCallback): () => void {
    this.triggerListeners.add(callback);
    return () => {
      this.triggerListeners.delete(callback);
    };
  }

  /**
   * Starts background evaluation timer if triggers exist and coordinator is not suspended.
   */
  private ensurePolling(): void {
    if (this.isSuspended || this.registeredTriggers.size === 0) {
      return;
    }

    if (this.pollIntervalTimer === null) {
      this.pollIntervalTimer = setInterval(() => {
        this.evaluateTriggers();
      }, this.pollIntervalMs);
    }
  }

  private stopPolling(): void {
    if (this.pollIntervalTimer !== null) {
      clearInterval(this.pollIntervalTimer);
      this.pollIntervalTimer = null;
    }
  }

  /**
   * Evaluates all registered triggers against current screen pixels.
   * Public for deterministic testing without real timers.
   */
  public evaluateTriggers(): number {
    if (this.isSuspended || this.registeredTriggers.size === 0) {
      return 0;
    }

    const now = Date.now();
    let firedCount = 0;

    for (const trigger of this.registeredTriggers.values()) {
      // Cooldown check
      if (trigger.lastFiredTimestamp > 0 && now - trigger.lastFiredTimestamp < trigger.cooldownMs) {
        continue;
      }

      // Sample pixel color
      const sampled =
        this.pixelAdapter.getPixelColorRgb(trigger.pixelX, trigger.pixelY) & 0xffffff;

      if (sampled === trigger.expectedColorRgb) {
        trigger.lastFiredTimestamp = now;
        firedCount++;
        this.notifyTrigger(trigger.macro);
      }
    }

    return firedCount;
  }

  private notifyTrigger(macro: MacroDefinition): void {
    for (const listener of this.triggerListeners) {
      try {
        listener(macro);
      } catch (err) {
        console.warn('[TriggerCoordinator] Trigger listener error:', err);
      }
    }
  }

  public stop(): void {
    this.stopPolling();
  }

  public dispose(): void {
    this.stopPolling();
    this.registeredTriggers.clear();
    this.triggerListeners.clear();
    this.suspensionReasons.clear();
  }
}
