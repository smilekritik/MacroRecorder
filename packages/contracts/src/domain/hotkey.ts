/**
 * Hotkey binding contract matching HotkeyBinding.
 */

import {
  boolean,
  integer,
  object,
  type Schema,
  type ValidationResult,
} from '../common/validation.js';
import { MouseButton, mouseButtonSchema, WheelDirection, wheelDirectionSchema } from './enums.js';
import { getVirtualKeyName } from './key-constants.js';

export interface HotkeyBinding {
  readonly virtualKey: number;
  readonly mouseButton: MouseButton;
  readonly wheel: WheelDirection;
  readonly control: boolean;
  readonly alt: boolean;
  readonly shift: boolean;
  readonly windows: boolean;
}

export interface HotkeyBindingWire {
  readonly VirtualKey?: number | undefined;
  readonly virtualKey?: number | undefined;
  readonly MouseButton?: MouseButton | undefined;
  readonly mouseButton?: MouseButton | undefined;
  readonly Wheel?: WheelDirection | undefined;
  readonly wheel?: WheelDirection | undefined;
  readonly Control?: boolean | undefined;
  readonly control?: boolean | undefined;
  readonly Alt?: boolean | undefined;
  readonly alt?: boolean | undefined;
  readonly Shift?: boolean | undefined;
  readonly shift?: boolean | undefined;
  readonly Windows?: boolean | undefined;
  readonly windows?: boolean | undefined;
}

export const DEFAULT_HOTKEY_BINDING: HotkeyBinding = {
  virtualKey: 0,
  mouseButton: MouseButton.None,
  wheel: WheelDirection.None,
  control: false,
  alt: false,
  shift: false,
  windows: false,
};

export const hotkeyBindingSchema: Schema<HotkeyBinding> = object({
  virtualKey: integer({ min: 0, max: 255 }),
  mouseButton: mouseButtonSchema,
  wheel: wheelDirectionSchema,
  control: boolean(),
  alt: boolean(),
  shift: boolean(),
  windows: boolean(),
});

export function isMouseHotkey(binding: HotkeyBinding): boolean {
  return binding.mouseButton !== MouseButton.None || binding.wheel !== WheelDirection.None;
}

export function isEmptyHotkey(binding: HotkeyBinding): boolean {
  return (
    binding.virtualKey === 0 &&
    binding.mouseButton === MouseButton.None &&
    binding.wheel === WheelDirection.None
  );
}

export function sameGesture(a: HotkeyBinding, b: HotkeyBinding): boolean {
  return (
    a.virtualKey === b.virtualKey &&
    a.mouseButton === b.mouseButton &&
    a.wheel === b.wheel &&
    a.control === b.control &&
    a.alt === b.alt &&
    a.shift === b.shift &&
    a.windows === b.windows
  );
}

export function parseHotkeyBindingWire(raw: unknown, path = ''): ValidationResult<HotkeyBinding> {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return {
      success: false,
      errors: [{ path, message: 'Expected object for HotkeyBinding', received: raw }],
    };
  }
  const obj = raw as HotkeyBindingWire;
  const normalized: HotkeyBinding = {
    virtualKey: obj.virtualKey ?? obj.VirtualKey ?? 0,
    mouseButton: obj.mouseButton ?? obj.MouseButton ?? MouseButton.None,
    wheel: obj.wheel ?? obj.Wheel ?? WheelDirection.None,
    control: obj.control ?? obj.Control ?? false,
    alt: obj.alt ?? obj.Alt ?? false,
    shift: obj.shift ?? obj.Shift ?? false,
    windows: obj.windows ?? obj.Windows ?? false,
  };
  return hotkeyBindingSchema.parse(normalized, path);
}

export function formatHotkeyDisplay(binding: HotkeyBinding): string {
  if (isEmptyHotkey(binding)) {
    return 'Not assigned';
  }
  const parts: string[] = [];
  if (binding.control) parts.push('Ctrl');
  if (binding.alt) parts.push('Alt');
  if (binding.shift) parts.push('Shift');
  if (binding.windows) parts.push('Win');

  if (binding.wheel === WheelDirection.Up) {
    parts.push('Wheel up');
  } else if (binding.wheel === WheelDirection.Down) {
    parts.push('Wheel down');
  } else if (binding.mouseButton !== MouseButton.None) {
    parts.push(`Mouse ${binding.mouseButton}`);
  } else {
    parts.push(getVirtualKeyName(binding.virtualKey));
  }

  return parts.join(' + ');
}
