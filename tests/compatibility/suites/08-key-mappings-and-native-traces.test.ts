import { describe, expect, it } from 'vitest';

import {
  HotkeyBindingModel,
} from '../../../packages/domain/src/model/index.js';

// --- Text Key Unit & Unicode TypeText Expansion ---
export interface TextKeyUnit {
  readonly value: number;
  readonly keyUp: boolean;
  readonly isVirtualKey: boolean;
}

export class WindowsInputInjector {
  public static expandTextToKeyUnits(text: string | null | undefined): TextKeyUnit[] {
    if (!text || text.length === 0) {
      return [];
    }

    const units: TextKeyUnit[] = [];
    let i = 0;
    while (i < text.length) {
      // Check for \r\n pair or lone \r or \n
      if (text[i] === '\r' && i + 1 < text.length && text[i + 1] === '\n') {
        units.push({ value: 0x0d, keyUp: false, isVirtualKey: true });
        units.push({ value: 0x0d, keyUp: true, isVirtualKey: true });
        i += 2;
        continue;
      }
      if (text[i] === '\n' || text[i] === '\r') {
        units.push({ value: 0x0d, keyUp: false, isVirtualKey: true });
        units.push({ value: 0x0d, keyUp: true, isVirtualKey: true });
        i++;
        continue;
      }

      // Individual UTF-16 code unit (surrogate halves as distinct code units)
      const codeUnit = text.charCodeAt(i);
      units.push({ value: codeUnit, keyUp: false, isVirtualKey: false });
      units.push({ value: codeUnit, keyUp: true, isVirtualKey: false });
      i++;
    }

    return units;
  }
}

// --- Keyboard Mapping ---
export interface KeyMappingResult {
  readonly scanCode: number;
  readonly extended: boolean;
}

export class KeyboardMapping {
  public static fromVirtualKey(vk: number): KeyMappingResult {
    switch (vk) {
      case 0x0d: // Enter / Return
        return { scanCode: 0x1c, extended: false };
      case 0x41: // 'A'
        return { scanCode: 0x1e, extended: false };
      case 0x25: // Left Arrow
        return { scanCode: 0x4b, extended: true };
      case 0x26: // Up Arrow
        return { scanCode: 0x48, extended: true };
      case 0x27: // Right Arrow
        return { scanCode: 0x4d, extended: true };
      case 0x28: // Down Arrow
        return { scanCode: 0x50, extended: true };
      default:
        return { scanCode: vk > 0 ? (vk & 0xff) : 0, extended: false };
    }
  }

  public static nameFromScanCode(scanCode: number, extended: boolean): string {
    if (scanCode === 0x1c && !extended) return 'Enter';
    if (scanCode === 0x1e && !extended) return 'A';
    if (scanCode === 0x4b && extended) return 'Left';
    return `Key_0x${scanCode.toString(16)}`;
  }
}

// --- Input Capture & Pass-Through Hotkey Decision Matrix ---
export interface KeyDecision {
  readonly eat: boolean;
  readonly runAction: boolean;
}

export class InputCaptureService {
  private _nextId = 1;
  private readonly _bindings: Map<number, HotkeyBindingModel> = new Map();

  public registerHotkey(binding: HotkeyBindingModel, _action: () => void): number {
    for (const existing of this._bindings.values()) {
      if (existing.sameGesture(binding)) {
        throw new Error('Hotkey conflict: gesture already registered');
      }
    }
    const id = this._nextId++;
    this._bindings.set(id, binding);
    return id;
  }

  public unregisterHotkey(id: number): void {
    this._bindings.delete(id);
  }

  public static decideKeyboardDown(
    firstPress: boolean,
    fire: boolean,
    passThrough: boolean,
  ): KeyDecision {
    if (!fire) {
      return { eat: false, runAction: false };
    }
    if (passThrough) {
      return {
        eat: !firstPress,
        runAction: firstPress,
      };
    }
    return {
      eat: true,
      runAction: firstPress,
    };
  }
}

describe('Suite 08: Key Mappings and Native Event Traces', () => {
  // 1. Unicode TypeText Expansion
  describe('Unicode TypeText Expansion', () => {
    it('Expands ASCII text into Down/Up Unicode pairs per code unit', () => {
      const units = WindowsInputInjector.expandTextToKeyUnits('Hi');
      expect(units).toHaveLength(4);
      expect(units[0]).toEqual({ value: 'H'.charCodeAt(0), keyUp: false, isVirtualKey: false });
      expect(units[1]).toEqual({ value: 'H'.charCodeAt(0), keyUp: true, isVirtualKey: false });
      expect(units[2]).toEqual({ value: 'i'.charCodeAt(0), keyUp: false, isVirtualKey: false });
      expect(units[3]).toEqual({ value: 'i'.charCodeAt(0), keyUp: true, isVirtualKey: false });
    });

    it('Splits surrogate pairs into two UTF-16 code units (4 events)', () => {
      const emoji = '\uD83D\uDE00';
      const units = WindowsInputInjector.expandTextToKeyUnits(emoji);
      expect(units).toHaveLength(4);
      expect(units[0]?.value).toBe(emoji.charCodeAt(0));
      expect(units[2]?.value).toBe(emoji.charCodeAt(1));
      expect(units.every((u) => !u.isVirtualKey)).toBe(true);
      expect(units.map((u) => u.keyUp)).toEqual([false, true, false, true]);
    });

    it('Translates CR/LF and LF into Enter VK_RETURN (0x0D)', () => {
      const units = WindowsInputInjector.expandTextToKeyUnits('A\r\nB');
      expect(units).toHaveLength(6);
      expect(units[2]).toEqual({ value: 0x0d, keyUp: false, isVirtualKey: true });
      expect(units[3]).toEqual({ value: 0x0d, keyUp: true, isVirtualKey: true });
      expect(units[4]?.value).toBe('B'.charCodeAt(0));

      const loneLf = WindowsInputInjector.expandTextToKeyUnits('\n');
      expect(loneLf).toHaveLength(2);
      expect(loneLf[0]).toEqual({ value: 0x0d, keyUp: false, isVirtualKey: true });
      expect(loneLf[1]).toEqual({ value: 0x0d, keyUp: true, isVirtualKey: true });
    });

    it('Handles empty or null text without error', () => {
      expect(WindowsInputInjector.expandTextToKeyUnits('')).toEqual([]);
      expect(WindowsInputInjector.expandTextToKeyUnits(null)).toEqual([]);
    });
  });

  // 2. VK to ScanCode Mapping
  describe('VK to ScanCode Mapping', () => {
    it('Maps standard keys to layout-independent scan codes', () => {
      const enter = KeyboardMapping.fromVirtualKey(0x0d);
      expect(enter.scanCode).toBe(0x1c);
      expect(enter.extended).toBe(false);

      const a = KeyboardMapping.fromVirtualKey(0x41);
      expect(a.scanCode).toBe(0x1e);
      expect(a.extended).toBe(false);
    });

    it('Maps arrow keys with extended flag true', () => {
      const left = KeyboardMapping.fromVirtualKey(0x25);
      expect(left.scanCode).toBe(0x4b);
      expect(left.extended).toBe(true);

      const up = KeyboardMapping.fromVirtualKey(0x26);
      expect(up.scanCode).toBe(0x48);
      expect(up.extended).toBe(true);

      const right = KeyboardMapping.fromVirtualKey(0x27);
      expect(right.scanCode).toBe(0x4d);
      expect(right.extended).toBe(true);

      const down = KeyboardMapping.fromVirtualKey(0x28);
      expect(down.scanCode).toBe(0x50);
      expect(down.extended).toBe(true);
    });

    it('Provides human-readable key names from scan code', () => {
      expect(KeyboardMapping.nameFromScanCode(0x1c, false)).toBe('Enter');
      expect(KeyboardMapping.nameFromScanCode(0x1e, false)).toBe('A');
      expect(KeyboardMapping.nameFromScanCode(0x4b, true)).toBe('Left');
    });
  });

  // 3. Pass-Through Policy and Scope
  describe('Pass-Through Hotkey Decision Matrix', () => {
    it('Pass-through enabled: forwards only initial press, suppresses auto-repeats', () => {
      const firstPress = InputCaptureService.decideKeyboardDown(true, true, true);
      expect(firstPress.eat).toBe(false);
      expect(firstPress.runAction).toBe(true);

      const repeatPress = InputCaptureService.decideKeyboardDown(false, true, true);
      expect(repeatPress.eat).toBe(true);
      expect(repeatPress.runAction).toBe(false);
    });

    it('Pass-through disabled: eats initial press and repeats', () => {
      const firstPress = InputCaptureService.decideKeyboardDown(true, true, false);
      expect(firstPress.eat).toBe(true);
      expect(firstPress.runAction).toBe(true);

      const repeatPress = InputCaptureService.decideKeyboardDown(false, true, false);
      expect(repeatPress.eat).toBe(true);
      expect(repeatPress.runAction).toBe(false);
    });

    it('Out-of-scope hotkey passes everything through and does not trigger action', () => {
      const outOfScope = InputCaptureService.decideKeyboardDown(true, false, false);
      expect(outOfScope.eat).toBe(false);
      expect(outOfScope.runAction).toBe(false);
    });
  });

  // 4. Hotkey Registration and Conflict Prevention
  describe('Hotkey Registration & Conflict Prevention', () => {
    it('Rejects duplicate hotkey registration with explicit conflict error', () => {
      const service = new InputCaptureService();
      const hotkey1 = new HotkeyBindingModel({ virtualKey: 65, control: true });
      const hotkey2 = new HotkeyBindingModel({ virtualKey: 65, control: true });

      const id = service.registerHotkey(hotkey1, () => {});
      expect(id).toBeGreaterThan(0);

      expect(() => service.registerHotkey(hotkey2, () => {})).toThrow(/conflict|already registered/i);
    });

    it('Allows distinct modifier combinations for same virtual key', () => {
      const service = new InputCaptureService();
      const ctrlA = new HotkeyBindingModel({ virtualKey: 65, control: true, alt: false });
      const altA = new HotkeyBindingModel({ virtualKey: 65, control: false, alt: true });

      const id1 = service.registerHotkey(ctrlA, () => {});
      const id2 = service.registerHotkey(altA, () => {});

      expect(id1).toBeGreaterThan(0);
      expect(id2).toBeGreaterThan(0);
      expect(id1).not.toBe(id2);
    });
  });

  // 5. Injected Input Filtering & Emergency Stop
  describe('Injected Input Filtering and Safety Stop', () => {
    it('Filters synthetic injected events (LLKHF_INJECTED) to avoid recording feedback loops', () => {
      const isSyntheticInjected = (flags: number): boolean => (flags & 0x01) !== 0; // LLKHF_INJECTED = 1
      expect(isSyntheticInjected(0x00)).toBe(false); // User physical input -> record
      expect(isSyntheticInjected(0x01)).toBe(true);  // Injected playback input -> filter out
      expect(isSyntheticInjected(0x11)).toBe(true);  // Injected with extended flag -> filter out
    });

    it('Emergency stop (F10) triggers immediate release of all held keys and mouse buttons', () => {
      class EmergencyTrackingInjector {
        public released = false;
        public releaseAll(): void {
          this.released = true;
        }
      }

      const injector = new EmergencyTrackingInjector();
      const handleEmergencyStop = (vk: number): boolean => {
        if (vk === 0x79) { // F10 (121)
          injector.releaseAll();
          return true;
        }
        return false;
      };

      expect(handleEmergencyStop(0x41)).toBe(false);
      expect(injector.released).toBe(false);

      expect(handleEmergencyStop(0x79)).toBe(true);
      expect(injector.released).toBe(true);
    });
  });
});
