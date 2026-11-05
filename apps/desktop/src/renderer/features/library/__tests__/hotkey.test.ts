/**
 * @macro-recorder/desktop - Hotkey Utilities Tests
 * Verifies hotkey display, automatic trigger labeling,
 * conflict detection, and key event parsing.
 */

import { describe, it, expect } from 'vitest';
import type {
  MacroDefinition,
  HotkeyBinding,
} from '../../../../../../../packages/contracts/src/index.js';
import {
  getMacroHotkeyDisplay,
  findHotkeyConflict,
  isApplicationReservedHotkey,
  parseKeyEventToHotkey,
} from '../utils/hotkey.js';

describe('Library Hotkey Utilities', () => {
  describe('getMacroHotkeyDisplay', () => {
    it('returns "Automatic trigger" for pixel trigger macros', () => {
      const autoMacro: MacroDefinition = {
        schemaVersion: 12,
        id: '1',
        name: 'Auto Trigger',
        folder: '',
        description: '',
        isEnabled: true,
        tags: [],
        modifiedAt: new Date().toISOString(),
        recording: {} as any,
        playback: {} as any,
        hotkey: {
          virtualKey: 0x41, // 'A'
          mouseButton: 'None',
          wheel: 'None',
          control: false,
          alt: false,
          shift: false,
          windows: false,
        },
        events: [
          {
            id: 'e1',
            type: 'PixelColorTrigger',
            timeMicroseconds: 0,
            comment: '',
          } as any,
        ],
      };

      expect(getMacroHotkeyDisplay(autoMacro)).toBe('Automatic trigger');
    });

    it('returns empty string or "Not assigned" for empty manual hotkey', () => {
      const manualMacro: MacroDefinition = {
        schemaVersion: 12,
        id: '2',
        name: 'Manual Macro',
        folder: '',
        description: '',
        isEnabled: true,
        tags: [],
        modifiedAt: new Date().toISOString(),
        recording: {} as any,
        playback: {} as any,
        hotkey: {
          virtualKey: 0,
          mouseButton: 'None',
          wheel: 'None',
          control: false,
          alt: false,
          shift: false,
          windows: false,
        },
        events: [],
      };

      expect(getMacroHotkeyDisplay(manualMacro)).toBe('');
      expect(getMacroHotkeyDisplay(manualMacro, true)).toBe('Not assigned');
    });

    it('formats combination with modifiers and key name', () => {
      const macro: MacroDefinition = {
        schemaVersion: 12,
        id: '3',
        name: 'Combo Macro',
        folder: '',
        description: '',
        isEnabled: true,
        tags: [],
        modifiedAt: new Date().toISOString(),
        recording: {} as any,
        playback: {} as any,
        hotkey: {
          virtualKey: 0x41, // 'A'
          mouseButton: 'None',
          wheel: 'None',
          control: true,
          alt: true,
          shift: false,
          windows: false,
        },
        events: [],
      };

      expect(getMacroHotkeyDisplay(macro)).toBe('Ctrl + Alt + A');
    });

    it('formats mouse button and wheel bindings', () => {
      const mouseMacro: MacroDefinition = {
        schemaVersion: 12,
        id: '4',
        name: 'Mouse Macro',
        folder: '',
        description: '',
        isEnabled: true,
        tags: [],
        modifiedAt: new Date().toISOString(),
        recording: {} as any,
        playback: {} as any,
        hotkey: {
          virtualKey: 0,
          mouseButton: 'X1',
          wheel: 'None',
          control: true,
          alt: false,
          shift: false,
          windows: false,
        },
        events: [],
      };

      expect(getMacroHotkeyDisplay(mouseMacro)).toBe('Ctrl + Mouse X1');

      const wheelMacro: MacroDefinition = {
        ...mouseMacro,
        hotkey: {
          virtualKey: 0,
          mouseButton: 'None',
          wheel: 'Up',
          control: false,
          alt: false,
          shift: false,
          windows: false,
        },
      };

      expect(getMacroHotkeyDisplay(wheelMacro)).toBe('Wheel up');
    });
  });

  describe('findHotkeyConflict', () => {
    const macroA: MacroDefinition = {
      schemaVersion: 12,
      id: 'id-a',
      name: 'Macro A',
      folder: '',
      description: '',
      isEnabled: true,
      tags: [],
      modifiedAt: new Date().toISOString(),
      recording: {} as any,
      playback: {} as any,
      hotkey: {
        virtualKey: 0x70, // F1
        mouseButton: 'None',
        wheel: 'None',
        control: true,
        alt: false,
        shift: false,
        windows: false,
      },
      events: [],
    };

    const macroDisabled: MacroDefinition = {
      schemaVersion: 12,
      id: 'id-disabled',
      name: 'Macro Disabled',
      folder: '',
      description: '',
      isEnabled: false,
      tags: [],
      modifiedAt: new Date().toISOString(),
      recording: {} as any,
      playback: {} as any,
      hotkey: {
        virtualKey: 0x71, // F2
        mouseButton: 'None',
        wheel: 'None',
        control: true,
        alt: false,
        shift: false,
        windows: false,
      },
      events: [],
    };

    it('detects conflict with another enabled macro having the same gesture', () => {
      const binding: HotkeyBinding = {
        virtualKey: 0x70,
        mouseButton: 'None',
        wheel: 'None',
        control: true,
        alt: false,
        shift: false,
        windows: false,
      };

      const conflict = findHotkeyConflict(binding, 'id-other', [macroA, macroDisabled]);
      expect(conflict).not.toBeNull();
      expect(conflict!.name).toBe('Macro A');
    });

    it('ignores conflict with itself', () => {
      const binding: HotkeyBinding = {
        virtualKey: 0x70,
        mouseButton: 'None',
        wheel: 'None',
        control: true,
        alt: false,
        shift: false,
        windows: false,
      };

      const conflict = findHotkeyConflict(binding, 'id-a', [macroA, macroDisabled]);
      expect(conflict).toBeNull();
    });

    it('ignores conflict with disabled macros', () => {
      const binding: HotkeyBinding = {
        virtualKey: 0x71,
        mouseButton: 'None',
        wheel: 'None',
        control: true,
        alt: false,
        shift: false,
        windows: false,
      };

      const conflict = findHotkeyConflict(binding, 'id-other', [macroA, macroDisabled]);
      expect(conflict).toBeNull();
    });
  });

  describe('isApplicationReservedHotkey', () => {
    it('detects F11 as application reserved', () => {
      const f11: HotkeyBinding = {
        virtualKey: 0x7a,
        mouseButton: 'None',
        wheel: 'None',
        control: false,
        alt: false,
        shift: false,
        windows: false,
      };
      expect(isApplicationReservedHotkey(f11)).toBe(true);
    });

    it('allows Ctrl+F11 or other keys', () => {
      const ctrlF11: HotkeyBinding = {
        virtualKey: 0x7a,
        mouseButton: 'None',
        wheel: 'None',
        control: true,
        alt: false,
        shift: false,
        windows: false,
      };
      expect(isApplicationReservedHotkey(ctrlF11)).toBe(false);
    });
  });

  describe('parseKeyEventToHotkey', () => {
    it('returns isClear for Escape', () => {
      const event = { key: 'Escape', code: 'Escape' } as any;
      expect(parseKeyEventToHotkey(event).isClear).toBe(true);
    });

    it('returns isModifierOnly for lone Control', () => {
      const event = { key: 'Control', code: 'ControlLeft' } as any;
      expect(parseKeyEventToHotkey(event).isModifierOnly).toBe(true);
    });

    it('returns hotkey binding for letter key with Ctrl modifier', () => {
      const event = {
        key: 'a',
        code: 'KeyA',
        keyCode: 65,
        ctrlKey: true,
        altKey: false,
        shiftKey: false,
        metaKey: false,
      } as any;

      const res = parseKeyEventToHotkey(event);
      expect(res.isClear).toBe(false);
      expect(res.isModifierOnly).toBe(false);
      expect(res.binding).toEqual({
        virtualKey: 65,
        mouseButton: 'None',
        wheel: 'None',
        control: true,
        alt: false,
        shift: false,
        windows: false,
      });
    });
  });
});
