/**
 * Hotkey binding domain model, immutable helpers.
 */

import {
  DEFAULT_HOTKEY_BINDING,
  hotkeyBindingSchema,
  parseHotkeyBindingWire,
} from '../../../contracts/src/index.js';
import { formatHotkeyDisplay } from './display.js';
import {
  type HotkeyBinding,
  type HotkeyBindingWire,
  MouseButton,
  type ValidationResult,
  WheelDirection,
} from './types.js';

export { formatHotkeyDisplay } from './display.js';

/**
 * Creates a default or partially populated HotkeyBinding.
 */
export function createDefaultHotkeyBinding(partial?: Partial<HotkeyBinding>): HotkeyBinding {
  return {
    virtualKey: partial?.virtualKey ?? DEFAULT_HOTKEY_BINDING.virtualKey,
    mouseButton: partial?.mouseButton ?? DEFAULT_HOTKEY_BINDING.mouseButton,
    wheel: partial?.wheel ?? DEFAULT_HOTKEY_BINDING.wheel,
    control: partial?.control ?? DEFAULT_HOTKEY_BINDING.control,
    alt: partial?.alt ?? DEFAULT_HOTKEY_BINDING.alt,
    shift: partial?.shift ?? DEFAULT_HOTKEY_BINDING.shift,
    windows: partial?.windows ?? DEFAULT_HOTKEY_BINDING.windows,
  };
}

/**
 * Performs deep immutable cloning of a HotkeyBinding.
 */
export function cloneHotkeyBinding(binding: HotkeyBinding): HotkeyBinding {
  return {
    virtualKey: binding.virtualKey,
    mouseButton: binding.mouseButton,
    wheel: binding.wheel,
    control: binding.control,
    alt: binding.alt,
    shift: binding.shift,
    windows: binding.windows,
  };
}

/**
 * Validates a HotkeyBinding against schema.
 */
export function validateHotkeyBinding(input: unknown, path = ''): ValidationResult<HotkeyBinding> {
  if (typeof input === 'object' && input !== null) {
    return parseHotkeyBindingWire(input, path);
  }
  return hotkeyBindingSchema.parse(input, path);
}

/**
 * Checks if a hotkey binding is a mouse gesture (mouse button or wheel).
 * Mouse gestures cannot be registered via RegisterHotKey and require low-level hooks.
 */
export function isMouseHotkey(binding: HotkeyBinding): boolean {
  return binding.mouseButton !== MouseButton.None || binding.wheel !== WheelDirection.None;
}

/**
 * Checks if a hotkey binding has no physical keys, buttons, or wheel scrolls assigned.
 */
export function isEmptyHotkey(binding: HotkeyBinding): boolean {
  return (
    binding.virtualKey === 0 &&
    binding.mouseButton === MouseButton.None &&
    binding.wheel === WheelDirection.None
  );
}

/**
 * Compares two hotkey bindings for identity of gesture.
 */
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

/**
 * Object-oriented model wrapper around HotkeyBinding.
 * with HotkeyBinding class properties and methods.
 */
export class HotkeyBindingModel implements HotkeyBinding {
  public virtualKey: number;
  public mouseButton: MouseButton;
  public wheel: WheelDirection;
  public control: boolean;
  public alt: boolean;
  public shift: boolean;
  public windows: boolean;

  public constructor(init?: Partial<HotkeyBinding> | HotkeyBindingWire) {
    const raw = init ?? {};
    this.virtualKey =
      ('virtualKey' in raw ? raw.virtualKey : (raw as HotkeyBindingWire).VirtualKey) ?? 0;
    this.mouseButton =
      ('mouseButton' in raw ? raw.mouseButton : (raw as HotkeyBindingWire).MouseButton) ??
      MouseButton.None;
    this.wheel =
      ('wheel' in raw ? raw.wheel : (raw as HotkeyBindingWire).Wheel) ?? WheelDirection.None;
    this.control = ('control' in raw ? raw.control : (raw as HotkeyBindingWire).Control) ?? false;
    this.alt = ('alt' in raw ? raw.alt : (raw as HotkeyBindingWire).Alt) ?? false;
    this.shift = ('shift' in raw ? raw.shift : (raw as HotkeyBindingWire).Shift) ?? false;
    this.windows = ('windows' in raw ? raw.windows : (raw as HotkeyBindingWire).Windows) ?? false;
  }

  public get isMouse(): boolean {
    return isMouseHotkey(this);
  }

  public get IsMouse(): boolean {
    return this.isMouse;
  }

  public get isEmpty(): boolean {
    return isEmptyHotkey(this);
  }

  public get IsEmpty(): boolean {
    return this.isEmpty;
  }

  public sameGesture(other: HotkeyBinding | HotkeyBindingModel): boolean {
    return sameGesture(this, other);
  }

  public SameGesture(other: HotkeyBinding | HotkeyBindingModel): boolean {
    return this.sameGesture(other);
  }

  public toString(): string {
    return formatHotkeyDisplay(this);
  }

  public ToString(): string {
    return this.toString();
  }

  public toBinding(): HotkeyBinding {
    return {
      virtualKey: this.virtualKey,
      mouseButton: this.mouseButton,
      wheel: this.wheel,
      control: this.control,
      alt: this.alt,
      shift: this.shift,
      windows: this.windows,
    };
  }

  public clone(): HotkeyBindingModel {
    return new HotkeyBindingModel(this.toBinding());
  }
}
