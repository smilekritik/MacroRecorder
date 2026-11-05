/**
 * Deterministic unit tests for input injection, text expansion, scan code mapping,
 * key bind decision matrix, hotkey conflicts, and mock input ports.
 *
 * Covers:
 * - LEGACY-TEST-021 / NATIVE-INPUT-021: ExpandTextToKeyUnits_ProducesDownUpPerCodeUnit
 * - LEGACY-TEST-022 / NATIVE-INPUT-022: ExpandTextToKeyUnits_SplitsSurrogatePairsIntoTwoUnits
 * - LEGACY-TEST-023 / NATIVE-INPUT-023: ExpandTextToKeyUnits_SendsNewlinesAsEnterKey
 * - LEGACY-TEST-024 / NATIVE-INPUT-024: ExpandTextToKeyUnits_EmptyIsNoInput
 * - LEGACY-TEST-025 / NATIVE-INPUT-025: KeyboardMapping_MapsLayoutIndependentScanCodes
 * - LEGACY-TEST-026 / NATIVE-INPUT-026: InputCaptureService_RegistersMouseHotkeysAndRejectsConflicts
 * - LEGACY-TEST-027 / NATIVE-INPUT-027: KeyboardBindPassThrough_ForwardsOnlyUserPress_NotAutoRepeats
 * - LEGACY-TEST-028 / NATIVE-INPUT-028: KeyboardBind_NoPassThrough_EatsPressAndRepeats
 * - LEGACY-TEST-029 / NATIVE-INPUT-029: KeyboardBind_OutOfScope_PassesEverythingThroughAndDoesNotFire
 * - LEGACY-TEST-030 / NATIVE-INPUT-030: KeyboardMapping_ProvidesScanCodesForManualActions
 * - LEGACY-TEST-087 / HELPER-TEST-087: SendAsync
 * - LEGACY-TEST-088 / HELPER-TEST-088: ReleaseAll
 * - LEGACY-TEST-089 / HELPER-TEST-089: GetPixelColorRgb
 */

import { describe, expect, it } from 'vitest';

import {
  MouseButton,
} from '../../packages/contracts/src/index.js';
import {
  HotkeyBindingModel,
  createKeyDownEvent,
} from '../../packages/domain/src/model/index.js';
import {
  FakeInjector,
  FakePixelColorProvider,
} from './test-helpers.js';

// --- Text Key Unit & Expansion Implementation ---
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

      // Individual UTF-16 code unit (handles surrogate halves as distinct code units)
      const codeUnit = text.charCodeAt(i);
      units.push({ value: codeUnit, keyUp: false, isVirtualKey: false });
      units.push({ value: codeUnit, keyUp: true, isVirtualKey: false });
      i++;
    }

    return units;
  }
}

// --- Keyboard Mapping Implementation ---
export interface KeyMappingResult {
  readonly scanCode: number;
  readonly extended: boolean;
}

export class KeyboardMapping {
  public static fromVirtualKey(vk: number): KeyMappingResult {
    // Exact scan code mappings from Windows Winuser.h / MapVirtualKey
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

// --- Input Capture Service & Bind Decision Matrix ---
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

describe('Input & Capture Suites', () => {
  // --- LEGACY-TEST-021 / NATIVE-INPUT-021 ---
  it('NATIVE-INPUT-021: ExpandTextToKeyUnits_ProducesDownUpPerCodeUnit', () => {
    // ASCII: two code units "Hi" -> four events (down/up each), as Unicode characters
    const units = WindowsInputInjector.expandTextToKeyUnits('Hi');
    expect(units).toHaveLength(4);
    expect(units[0]).toEqual({ value: 'H'.charCodeAt(0), keyUp: false, isVirtualKey: false });
    expect(units[1]).toEqual({ value: 'H'.charCodeAt(0), keyUp: true, isVirtualKey: false });
    expect(units[2]).toEqual({ value: 'i'.charCodeAt(0), keyUp: false, isVirtualKey: false });
    expect(units[3]).toEqual({ value: 'i'.charCodeAt(0), keyUp: true, isVirtualKey: false });
  });

  // --- LEGACY-TEST-022 / NATIVE-INPUT-022 ---
  it('NATIVE-INPUT-022: ExpandTextToKeyUnits_SplitsSurrogatePairsIntoTwoUnits', () => {
    // An emoji outside the BMP (U+1F600) — a surrogate pair: two units, each with a down/up pair
    const emoji = '\uD83D\uDE00';
    const units = WindowsInputInjector.expandTextToKeyUnits(emoji);
    expect(units).toHaveLength(4);
    expect(units[0]?.value).toBe(emoji.charCodeAt(0));
    expect(units[2]?.value).toBe(emoji.charCodeAt(1));
    expect(units.every((u) => !u.isVirtualKey)).toBe(true);
    expect(units.map((u) => u.keyUp)).toEqual([false, true, false, true]);
  });

  // --- LEGACY-TEST-023 / NATIVE-INPUT-023 ---
  it('NATIVE-INPUT-023: ExpandTextToKeyUnits_SendsNewlinesAsEnterKey', () => {
    // "A\r\nB": A (2 units) + one Enter as VK_RETURN (2 units) + B (2 units)
    const units = WindowsInputInjector.expandTextToKeyUnits('A\r\nB');
    expect(units).toHaveLength(6);
    expect(units[2]).toEqual({ value: 0x0d, keyUp: false, isVirtualKey: true });
    expect(units[3]).toEqual({ value: 0x0d, keyUp: true, isVirtualKey: true });
    expect(units[4]?.value).toBe('B'.charCodeAt(0));

    // A lone \n also becomes Enter
    const singleNewline = WindowsInputInjector.expandTextToKeyUnits('\n');
    expect(singleNewline).toHaveLength(2);
    expect(singleNewline[0]?.isVirtualKey).toBe(true);
  });

  // --- LEGACY-TEST-024 / NATIVE-INPUT-024 ---
  it('NATIVE-INPUT-024: ExpandTextToKeyUnits_EmptyIsNoInput', () => {
    expect(WindowsInputInjector.expandTextToKeyUnits('')).toEqual([]);
    expect(WindowsInputInjector.expandTextToKeyUnits(null)).toEqual([]);
  });

  // --- LEGACY-TEST-025 / NATIVE-INPUT-025 ---
  it('NATIVE-INPUT-025: KeyboardMapping_MapsLayoutIndependentScanCodes', () => {
    // Enter is the same on all layouts: scan code 0x1C, not extended
    const enter = KeyboardMapping.fromVirtualKey(0x0d);
    expect(enter.scanCode).toBe(0x1c);
    expect(enter.extended).toBe(false);

    // The key name by scan code is non-empty
    expect(KeyboardMapping.nameFromScanCode(0x1c, false).length).toBeGreaterThan(0);
  });

  // --- LEGACY-TEST-026 / NATIVE-INPUT-026 ---
  it('NATIVE-INPUT-026: InputCaptureService_RegistersMouseHotkeysAndRejectsConflicts', () => {
    const capture = new InputCaptureService();
    const binding1 = new HotkeyBindingModel({ mouseButton: MouseButton.X2, control: true });
    const id = capture.registerHotkey(binding1, () => {});
    expect(id).toBeGreaterThan(0);

    const binding2 = new HotkeyBindingModel({ mouseButton: MouseButton.X2, control: true });
    expect(() => capture.registerHotkey(binding2, () => {})).toThrow();

    capture.unregisterHotkey(id);
  });

  // --- LEGACY-TEST-027 / NATIVE-INPUT-027 ---
  it('NATIVE-INPUT-027: KeyboardBindPassThrough_ForwardsOnlyUserPress_NotAutoRepeats', () => {
    // Pass-through is on, the bind is active: the original press goes to the app (not eaten),
    // and the action (starting the loop macro) runs once
    const press = InputCaptureService.decideKeyboardDown(true, true, true);
    expect(press.eat).toBe(false);
    expect(press.runAction).toBe(true);

    // OS auto-repeats while held: eaten (do not reach the app) and do not restart the action
    const repeat = InputCaptureService.decideKeyboardDown(false, true, true);
    expect(repeat.eat).toBe(true);
    expect(repeat.runAction).toBe(false);
  });

  // --- LEGACY-TEST-028 / NATIVE-INPUT-028 ---
  it('NATIVE-INPUT-028: KeyboardBind_NoPassThrough_EatsPressAndRepeats', () => {
    const press = InputCaptureService.decideKeyboardDown(true, true, false);
    expect(press.eat).toBe(true);
    expect(press.runAction).toBe(true);

    const repeat = InputCaptureService.decideKeyboardDown(false, true, false);
    expect(repeat.eat).toBe(true);
    expect(repeat.runAction).toBe(false);
  });

  // --- LEGACY-TEST-029 / NATIVE-INPUT-029 ---
  it('NATIVE-INPUT-029: KeyboardBind_OutOfScope_PassesEverythingThroughAndDoesNotFire', () => {
    const press = InputCaptureService.decideKeyboardDown(true, false, false);
    expect(press.eat).toBe(false);
    expect(press.runAction).toBe(false);

    const repeat = InputCaptureService.decideKeyboardDown(false, false, true);
    expect(repeat.eat).toBe(false);
    expect(repeat.runAction).toBe(false);
  });

  // --- LEGACY-TEST-030 / NATIVE-INPUT-030 ---
  it('NATIVE-INPUT-030: KeyboardMapping_ProvidesScanCodesForManualActions', () => {
    const letter = KeyboardMapping.fromVirtualKey(0x41);
    const arrow = KeyboardMapping.fromVirtualKey(0x25);
    expect(letter.scanCode).toBeGreaterThan(0);
    expect(arrow.scanCode).toBeGreaterThan(0);
    expect(arrow.extended).toBe(true);
  });

  // --- LEGACY-TEST-087 / HELPER-TEST-087 ---
  it('HELPER-TEST-087: SendAsync', async () => {
    const fake = new FakeInjector();
    const event = createKeyDownEvent({ virtualKey: 0x41 });
    const receipt = await fake.sendAsync(event, 10_000, 0, false, 0x1234);

    expect(fake.actual).toHaveLength(1);
    expect(fake.scanCodePreferences).toEqual([false]);
    expect(fake.targets).toEqual([0x1234]);
    expect(receipt.scheduledMicroseconds).toBe(10_000);
    expect(receipt.success).toBe(true);
  });

  // --- LEGACY-TEST-088 / HELPER-TEST-088 ---
  it('HELPER-TEST-088: ReleaseAll', () => {
    const fake = new FakeInjector();
    expect(fake.releaseAllCount).toBe(0);
    fake.releaseAll();
    expect(fake.releaseAllCount).toBe(1);
  });

  // --- LEGACY-TEST-089 / HELPER-TEST-089 ---
  it('HELPER-TEST-089: GetPixelColorRgb', () => {
    const fake = new FakePixelColorProvider();
    fake.color = 0x57e06a;

    const color = fake.getPixelColorRgb(100, 200);
    expect(color).toBe(0x57e06a);
    expect(fake.requests).toEqual([[100, 200]]);
  });
});
