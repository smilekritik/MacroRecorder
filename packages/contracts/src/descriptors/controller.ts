/**
 * Gamepad controller descriptors and state snapshots.
 */

import {
  array,
  boolean,
  integer,
  nullable,
  object,
  optional,
  string,
  type Schema,
} from '../common/validation.js';
import { GamepadButton, gamepadButtonSchema } from '../domain/enums.js';

export const GamepadButtonMasks = {
  DPadUp: 0x0001,
  DPadDown: 0x0002,
  DPadLeft: 0x0004,
  DPadRight: 0x0008,
  Start: 0x0010,
  Back: 0x0020,
  LeftStick: 0x0040,
  RightStick: 0x0080,
  LeftBumper: 0x0100,
  RightBumper: 0x0200,
  Guide: 0x0400,
  A: 0x1000,
  B: 0x2000,
  X: 0x4000,
  Y: 0x8000,
} as const;

export interface GamepadSnapshot {
  readonly connected: boolean;
  readonly buttons: number;
  readonly leftX: number;
  readonly leftY: number;
  readonly rightX: number;
  readonly rightY: number;
  readonly leftTrigger: number;
  readonly rightTrigger: number;
}

export const gamepadSnapshotSchema: Schema<GamepadSnapshot> = object({
  connected: boolean(),
  buttons: integer({ min: 0, max: 65535 }),
  leftX: integer({ min: -32768, max: 32767 }),
  leftY: integer({ min: -32768, max: 32767 }),
  rightX: integer({ min: -32768, max: 32767 }),
  rightY: integer({ min: -32768, max: 32767 }),
  leftTrigger: integer({ min: 0, max: 255 }),
  rightTrigger: integer({ min: 0, max: 255 }),
});

export interface GamepadPadReading {
  readonly source: string;
  readonly pressed: readonly GamepadButton[];
  readonly leftX: number;
  readonly leftY: number;
  readonly rightX: number;
  readonly rightY: number;
  readonly leftTrigger: number;
  readonly rightTrigger: number;
  readonly rawAxes?: string | null | undefined;
}

export const gamepadPadReadingSchema: Schema<GamepadPadReading> = object({
  source: string({ min: 1 }),
  pressed: array(gamepadButtonSchema),
  leftX: integer({ min: -32768, max: 32767 }),
  leftY: integer({ min: -32768, max: 32767 }),
  rightX: integer({ min: -32768, max: 32767 }),
  rightY: integer({ min: -32768, max: 32767 }),
  leftTrigger: integer({ min: 0, max: 255 }),
  rightTrigger: integer({ min: 0, max: 255 }),
  rawAxes: optional(nullable(string())),
});
