/**
 * Boundary to the native macro engine. Macros run on native threads; JavaScript only supplies
 * plans, sends commands, and observes reports.
 */

import type { MacroDefinition } from '../../ipc/types.js';
import { buildEnginePlan } from './engine-plan.js';

export interface EngineReceiptReport {
  readonly id: string;
  readonly scheduledMicroseconds: number;
  readonly plannedMicroseconds?: number | null | undefined;
  readonly startedMicroseconds: number;
  readonly completedMicroseconds: number;
  readonly confirmedMicroseconds?: number | null | undefined;
  readonly success: boolean;
  readonly error?: string | null | undefined;
}

export interface EngineReport {
  readonly kind: 'state' | 'receipts' | 'overlay' | 'finished' | 'emergency' | 'hotkey' | 'gamepad';
  readonly sessionId?: number | null | undefined;
  readonly macroId?: string | null | undefined;
  readonly macroName?: string | null | undefined;
  readonly state?: string | null | undefined;
  readonly activation?: string | null | undefined;
  readonly totalActions?: number | null | undefined;
  readonly elapsedMicroseconds?: number | null | undefined;
  readonly receipts?: readonly EngineReceiptReport[] | null | undefined;
  readonly text?: string | null | undefined;
  readonly durationMicroseconds?: number | null | undefined;
  readonly showTiming?: boolean | null | undefined;
  readonly error?: string | null | undefined;
  readonly reason?: string | null | undefined;
  readonly hotkeyId?: number | null | undefined;
  readonly gamepadEvent?: string | null | undefined;
  readonly gamepadButton?: string | null | undefined;
  readonly gamepadAxis?: string | null | undefined;
  readonly axisValue?: number | null | undefined;
  readonly padIndex?: number | null | undefined;
  readonly timestampMicroseconds?: number | null | undefined;
}

export interface IPlaybackEngine {
  onReport(listener: (report: EngineReport) => void): () => void;
  loadMacros(macros: readonly MacroDefinition[]): readonly string[];
  /** Replaces one plan without waiting for the next library sync, e.g. to run unsaved edits. */
  upsertMacro(macro: MacroDefinition): readonly string[];
  start(macroId: string, activation: string, targetWindow?: number): number;
  activate(macroId: string): void;
  pause(sessionId?: number): boolean;
  resume(sessionId?: number): boolean;
  stop(sessionId?: number): boolean;
  emergencyStop(reason: string): void;
  suspendAutomatic(suspended: boolean): void;
  setRecording(recording: boolean, gamepad: boolean): void;
  configureGamepad(output: string, hideReal: boolean): void;
  sampleSystemLoad?(): { cpuPercent?: number | null; gpuPercent?: number | null; memoryPercent?: number | null } | undefined;
}

interface NativeEngineModule {
  engineSetCallback(callback: (report: EngineReport) => void): void;
  engineLoadPlans(plans: readonly unknown[]): string[];
  engineStart(macroId: string, activation: string, targetWindow?: number | null): number;
  engineActivate(macroId: string): void;
  enginePause(sessionId?: number | null): boolean;
  engineResume(sessionId?: number | null): boolean;
  engineStop(sessionId?: number | null): boolean;
  engineEmergencyStop(reason: string): void;
  engineSuspendAutomatic(suspended: boolean): void;
  engineSetRecording(recording: boolean, gamepad: boolean): void;
  engineConfigureGamepad(output: string, hideReal: boolean): void;
  getSystemLoadSnapshot?(): { cpuPercent?: number | null; gpuPercent?: number | null; memoryPercent?: number | null };
}

export class NativeEngineAdapter implements IPlaybackEngine {
  private readonly listeners = new Set<(report: EngineReport) => void>();
  private readonly known = new Map<string, MacroDefinition>();
  private readonly native: NativeEngineModule;

  constructor(nativeModule?: unknown) {
    const module = (nativeModule ?? (process as unknown as { addon?: unknown }).addon) as
      | NativeEngineModule
      | undefined;
    if (!module?.engineStart) {
      throw new Error('The native macro engine is unavailable.');
    }
    this.native = module;
    this.native.engineSetCallback((report) => {
      for (const listener of this.listeners) {
        try {
          listener(report);
        } catch (error) {
          console.error('[NativeEngineAdapter] Report listener failed:', error);
        }
      }
    });
  }

  public onReport(listener: (report: EngineReport) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  public loadMacros(macros: readonly MacroDefinition[]): readonly string[] {
    this.known.clear();
    for (const macro of macros) this.known.set(macro.id, macro);
    return this.push();
  }

  public upsertMacro(macro: MacroDefinition): readonly string[] {
    this.known.set(macro.id, macro);
    return this.push();
  }

  private push(): readonly string[] {
    const errors = this.native.engineLoadPlans(Array.from(this.known.values(), buildEnginePlan));
    for (const error of errors) console.error(`[NativeEngineAdapter] Macro not loaded: ${error}`);
    return errors;
  }

  public start(macroId: string, activation: string, targetWindow?: number): number {
    return this.native.engineStart(macroId, activation, targetWindow ?? null);
  }

  public activate(macroId: string): void {
    this.native.engineActivate(macroId);
  }

  public pause(sessionId?: number): boolean {
    return this.native.enginePause(sessionId ?? null);
  }

  public resume(sessionId?: number): boolean {
    return this.native.engineResume(sessionId ?? null);
  }

  public stop(sessionId?: number): boolean {
    return this.native.engineStop(sessionId ?? null);
  }

  public emergencyStop(reason: string): void {
    this.native.engineEmergencyStop(reason);
  }

  public suspendAutomatic(suspended: boolean): void {
    this.native.engineSuspendAutomatic(suspended);
  }

  public setRecording(recording: boolean, gamepad: boolean): void {
    this.native.engineSetRecording(recording, gamepad);
  }

  public sampleSystemLoad() {
    return this.native.getSystemLoadSnapshot?.();
  }

  public configureGamepad(output: string, hideReal: boolean): void {
    this.native.engineConfigureGamepad(output, hideReal);
  }
}
