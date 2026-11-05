import { describe, expect, it } from 'vitest';

import {
  type MacroDefinition,
  type MacroEvent,
  createDefaultMacroDefinition,
  MacroEventType,
  MouseButton,
  WheelDirection,
} from '../../../../contracts/src/index.js';

import {
  AutoHotkeyV2Exporter,
  exportAutoHotkeyV2,
  getAutoHotkeyKeyName,
  escapeAutoHotkeyString,
} from '../autohotkey.js';

describe('AutoHotkeyV2Exporter', () => {
  // 004 (ExportTests.cs:13)
  it('renders keys, mouse, timing, text, and comments', () => {
    const macro: MacroDefinition = createDefaultMacroDefinition({
      name: 'combo',
      events: [
        { timeMicroseconds: 0, type: MacroEventType.Comment, text: 'note' },
        { timeMicroseconds: 0, type: MacroEventType.KeyDown, virtualKey: 0x41 },
        { timeMicroseconds: 0, type: MacroEventType.KeyUp, virtualKey: 0x41 },
        { timeMicroseconds: 50_000, type: MacroEventType.KeyDown, virtualKey: 0x0d },
        { timeMicroseconds: 50_000, type: MacroEventType.KeyUp, virtualKey: 0x0d },
        {
          timeMicroseconds: 60_000,
          type: MacroEventType.MouseMove,
          deltaX: 12,
          deltaY: -8,
        },
        {
          timeMicroseconds: 60_000,
          type: MacroEventType.MouseButtonDown,
          button: MouseButton.Left,
        },
        {
          timeMicroseconds: 60_000,
          type: MacroEventType.MouseButtonUp,
          button: MouseButton.Left,
        },
        { timeMicroseconds: 70_000, type: MacroEventType.TypeText, text: 'Hi "x"' },
      ] as unknown as MacroEvent[],
    });

    const script = AutoHotkeyV2Exporter.export(macro);

    expect(script.startsWith('#Requires AutoHotkey v2.0')).toBe(true);
    expect(script).toContain('Send "{a down}"');
    expect(script).toContain('Send "{a up}"');
    expect(script).toContain('Send "{Enter down}"');
    expect(script).toContain('Sleep 50'); // 50 ms gap before Enter
    expect(script).toContain('MouseMove 12, -8, 0, "R"'); // relative motion preserved
    expect(script).toContain('Click "Left Down"');
    expect(script).toContain('Click "Left Up"');
    expect(script).toContain('SendText "Hi ""x"""'); // quotes doubled for AHK v2
    expect(script).toContain('; note'); // comment row kept
  });

  // 005 (ExportTests.cs:46)
  it('marks unsupported actions as comments without dropping them', () => {
    const macro: Partial<MacroDefinition> = {
      events: [
        {
          timeMicroseconds: 0,
          type: MacroEventType.GamepadButtonDown,
          gamepadButton: 'A',
        } as unknown as MacroEvent,
      ],
    };

    const script = AutoHotkeyV2Exporter.export(macro as MacroDefinition);
    expect(script).toContain('; [not exported] GamepadButtonDown');
  });

  it('preserves hotkey display bind comment when hotkey is assigned', () => {
    const macro: Partial<MacroDefinition> = {
      name: 'bind-test',
      hotkey: {
        virtualKey: 0x71, // F2
        mouseButton: MouseButton.None,
        wheel: WheelDirection.None,
        control: false,
        alt: false,
        shift: false,
        windows: false,
      },
      events: [],
    };

    const script = exportAutoHotkeyV2(macro as MacroDefinition);
    expect(script).toContain('; Original bind: F2 (run this script to replay the macro)');
    expect(script).toContain('; Exported from Macro Recorder — bind-test');
  });

  it('omits hotkey comment when hotkey is empty', () => {
    const macro: Partial<MacroDefinition> = {
      name: '',
      hotkey: {
        virtualKey: 0,
        mouseButton: MouseButton.None,
        wheel: WheelDirection.None,
        control: false,
        alt: false,
        shift: false,
        windows: false,
      },
      events: [],
    };

    const script = exportAutoHotkeyV2(macro as MacroDefinition);
    expect(script).not.toContain('; Original bind:');
    expect(script).toContain('; Exported from Macro Recorder\n');
  });

  it('exports wheel and horizontal wheel events with count calculation', () => {
    const macro: Partial<MacroDefinition> = {
      events: [
        { timeMicroseconds: 0, type: MacroEventType.Wheel, wheelDelta: 240 },
        { timeMicroseconds: 10_000, type: MacroEventType.Wheel, wheelDelta: -120 },
        { timeMicroseconds: 20_000, type: MacroEventType.HorizontalWheel, wheelDelta: 120 },
        { timeMicroseconds: 30_000, type: MacroEventType.HorizontalWheel, wheelDelta: -360 },
      ] as MacroEvent[],
    };

    const script = exportAutoHotkeyV2(macro as MacroDefinition);
    expect(script).toContain('Send "{WheelUp 2}"');
    expect(script).toContain('Send "{WheelDown 1}"');
    expect(script).toContain('Send "{WheelRight 1}"');
    expect(script).toContain('Send "{WheelLeft 3}"');
  });

  it('exports WaitForKey and WaitForWindow events', () => {
    const macro: Partial<MacroDefinition> = {
      events: [
        { timeMicroseconds: 0, type: MacroEventType.WaitForKey, waitKeyVirtualKey: 0x1b }, // Escape
        {
          timeMicroseconds: 5_000,
          type: MacroEventType.WaitForWindow,
          waitWindowTitle: 'Calculator "Pro"',
        },
      ] as MacroEvent[],
    };

    const script = exportAutoHotkeyV2(macro as MacroDefinition);
    expect(script).toContain('KeyWait "Escape", "D"');
    expect(script).toContain('WinWait "Calculator ""Pro"""');
  });

  it('falls back to comment when WaitForWindow has empty title', () => {
    const macro: Partial<MacroDefinition> = {
      events: [
        { timeMicroseconds: 0, type: MacroEventType.WaitForWindow, waitWindowTitle: '   ' },
      ] as MacroEvent[],
    };

    const script = exportAutoHotkeyV2(macro as MacroDefinition);
    expect(script).toContain('; [not exported] WaitForWindow');
  });

  it('supports multiline comments and text escaping', () => {
    const macro: Partial<MacroDefinition> = {
      events: [
        { timeMicroseconds: 0, type: MacroEventType.Comment, text: 'line 1\nline 2' },
        {
          timeMicroseconds: 1_000,
          type: MacroEventType.TypeText,
          text: 'col1\tcol2\r\nnext "line"',
        },
      ] as MacroEvent[],
    };

    const script = exportAutoHotkeyV2(macro as MacroDefinition);
    expect(script).toContain('; line 1\n; line 2');
    expect(script).toContain('SendText "col1`tcol2`nnext ""line"""');
  });

  it('correctly maps various virtual keys', () => {
    expect(getAutoHotkeyKeyName(0x41)).toBe('a');
    expect(getAutoHotkeyKeyName(0x5a)).toBe('z');
    expect(getAutoHotkeyKeyName(0x30)).toBe('0');
    expect(getAutoHotkeyKeyName(0x39)).toBe('9');
    expect(getAutoHotkeyKeyName(0x70)).toBe('F1');
    expect(getAutoHotkeyKeyName(0x87)).toBe('F24');
    expect(getAutoHotkeyKeyName(0x08)).toBe('Backspace');
    expect(getAutoHotkeyKeyName(0x09)).toBe('Tab');
    expect(getAutoHotkeyKeyName(0x0d)).toBe('Enter');
    expect(getAutoHotkeyKeyName(0x10)).toBe('Shift');
    expect(getAutoHotkeyKeyName(0x11)).toBe('Ctrl');
    expect(getAutoHotkeyKeyName(0x12)).toBe('Alt');
    expect(getAutoHotkeyKeyName(0x20)).toBe('Space');
    expect(getAutoHotkeyKeyName(0x25)).toBe('Left');
    expect(getAutoHotkeyKeyName(0x26)).toBe('Up');
    expect(getAutoHotkeyKeyName(0x27)).toBe('Right');
    expect(getAutoHotkeyKeyName(0x28)).toBe('Down');
    expect(getAutoHotkeyKeyName(0x5b)).toBe('LWin');
    expect(getAutoHotkeyKeyName(0x60)).toBe('Numpad0');
    expect(getAutoHotkeyKeyName(0xba)).toBe(';');
    expect(getAutoHotkeyKeyName(0xff)).toBe('vkFF');
  });

  it('escapes AutoHotkey strings properly', () => {
    expect(escapeAutoHotkeyString('hello "world"')).toBe('hello ""world""');
    expect(escapeAutoHotkeyString('line1\r\nline2')).toBe('line1`nline2');
    expect(escapeAutoHotkeyString('tab\tseparated')).toBe('tab`tseparated');
    expect(escapeAutoHotkeyString(null)).toBe('');
  });
});
