/**
 * Macro activation policies and debounce guard rules.
 */

import { ActivationMode } from '../model/types.js';

export enum MacroActivationCommand {
  Start = 'Start',
  Ignore = 'Ignore',
  Stop = 'Stop',
  Restart = 'Restart',
}

export const ACTIVATION_REPRESS_GUARD_MILLISECONDS = 50;

export class ActivationPolicy {
  public static readonly RepressGuardMilliseconds = ACTIVATION_REPRESS_GUARD_MILLISECONDS;

  public static resolve(
    mode: ActivationMode,
    isRunning: boolean,
    elapsedMilliseconds: number,
  ): MacroActivationCommand {
    if (!isRunning) {
      return MacroActivationCommand.Start;
    }
    if (
      mode === ActivationMode.ToggleStop &&
      elapsedMilliseconds >= this.RepressGuardMilliseconds
    ) {
      return MacroActivationCommand.Stop;
    }
    if (mode === ActivationMode.Restart) {
      return MacroActivationCommand.Restart;
    }
    return MacroActivationCommand.Ignore;
  }

  public static Resolve(
    mode: ActivationMode,
    isRunning: boolean,
    elapsedMilliseconds: number,
  ): MacroActivationCommand {
    return this.resolve(mode, isRunning, elapsedMilliseconds);
  }
}
