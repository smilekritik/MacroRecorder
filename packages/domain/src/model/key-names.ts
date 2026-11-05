/**
 * Human-readable key, mouse button, and gamepad component names.
 */

import {
  getVirtualKeyName as getContractVkName,
  getGamepadButtonName as getContractGamepadButtonName,
  getGamepadAxisName as getContractGamepadAxisName,
} from '../../../contracts/src/index.js';
import { getMouseButtonName as getLocalizedMouseButtonName } from '../../../localization/src/index.js';
import { type GamepadAxis, type GamepadButton, type MouseButton } from './types.js';

/**
 * Returns human-readable virtual key name matching hardware key legend.
 */
export function getVirtualKeyName(vk: number): string {
  return getContractVkName(vk);
}

/**
 * Returns human-readable mouse button display name.
 */
export function getMouseButtonName(button: MouseButton): string {
  return getLocalizedMouseButtonName(button);
}

/**
 * Returns non-linguistic gamepad button name matching controller legend (A, B, X, Y, LB, RB, etc.).
 */
export function getGamepadButtonName(button: GamepadButton): string {
  return getContractGamepadButtonName(button);
}

/**
 * Returns non-linguistic gamepad axis name matching controller legend (LS X, LS Y, RS X, RS Y, LT, RT).
 */
export function getGamepadAxisName(axis: GamepadAxis): string {
  return getContractGamepadAxisName(axis);
}

export const VirtualKeyName = {
  get: getVirtualKeyName,
  Get: getVirtualKeyName,
} as const;

export const MouseButtonName = {
  get: getMouseButtonName,
  Get: getMouseButtonName,
} as const;

export const GamepadButtonName = {
  get: getGamepadButtonName,
  Get: getGamepadButtonName,
} as const;

export const GamepadAxisName = {
  get: getGamepadAxisName,
  Get: getGamepadAxisName,
} as const;
