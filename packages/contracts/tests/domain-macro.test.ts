import { describe, expect, it } from 'vitest';
import {
  CURRENT_SCHEMA_VERSION,
  createDefaultMacroDefinition,
  fromWireMacroEvent,
  getEndTimeMicroseconds,
  MacroEventType,
  matchMacroEvent,
  MouseButton,
  parseMacroDefinition,
  sendsInput,
  takesTime,
  toWireMacroDefinition,
  toWireMacroEvent,
} from '../src/index.js';

describe('Schema 12 MacroDefinition and Events', () => {
  it('creates valid default macro definition', () => {
    const def = createDefaultMacroDefinition();
    expect(def.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(def.name).toBe('New macro');
    expect(def.events).toHaveLength(0);
    expect(def.isEnabled).toBe(true);
    expect(def.recording.keyboard).toBe(true);
    expect(def.playback.activationMode).toBe('Once');
    expect(def.playback.speed).toBe(1.0);
  });

  it('preserves 64-bit integer microseconds without floating point drift', () => {
    const raw = {
      SchemaVersion: 12,
      Id: crypto.randomUUID(),
      Name: 'Timing Precision',
      Events: [
        {
          Type: 'Delay',
          TimeMicroseconds: 1234567890123,
          DurationMicroseconds: 500000,
        },
      ],
    };
    const parsed = parseMacroDefinition(raw);
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;

    expect(parsed.data.events[0]?.timeMicroseconds).toBe(1234567890123);
    if (parsed.data.events[0]?.type === 'Delay') {
      expect(parsed.data.events[0].durationMicroseconds).toBe(500000);
    }

    const roundtrip = toWireMacroDefinition(parsed.data, true);
    expect((roundtrip['Events'] as Record<string, unknown>[])[0]?.['TimeMicroseconds']).toBe(
      1234567890123,
    );
  });

  it('preserves forward-compatible unknown fields', () => {
    const raw = {
      SchemaVersion: 12,
      Id: crypto.randomUUID(),
      Name: 'Forward Compatibility',
      FutureFeatureFlag: true,
      CustomMetadata: { author: 'Kritik', revision: 42 },
      Events: [],
    };
    const parsed = parseMacroDefinition(raw);
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;

    expect(parsed.data.unknownFields).toBeDefined();
    expect(parsed.data.unknownFields?.['FutureFeatureFlag']).toBe(true);
    expect(parsed.data.unknownFields?.['CustomMetadata']).toEqual({
      author: 'Kritik',
      revision: 42,
    });

    const wire = toWireMacroDefinition(parsed.data, true);
    expect(wire['FutureFeatureFlag']).toBe(true);
    expect(wire['CustomMetadata']).toEqual({ author: 'Kritik', revision: 42 });
  });

  it('rejects future unsupported schema versions', () => {
    const raw = {
      SchemaVersion: 13,
      Id: crypto.randomUUID(),
      Name: 'Future Macro',
      Events: [],
    };
    const parsed = parseMacroDefinition(raw);
    expect(parsed.success).toBe(false);
    expect(parsed.errors?.[0]?.message).toContain('newer than supported version');
  });

  it('correctly validates and matches all 19 MacroEventType values exhaustively', () => {
    const sampleEventWires: Record<MacroEventType, Record<string, unknown>> = {
      KeyDown: { type: 'KeyDown', virtualKey: 65, scanCode: 30, extended: false },
      KeyUp: { type: 'KeyUp', virtualKey: 65, scanCode: 30, extended: false },
      MouseMove: { type: 'MouseMove', deltaX: 10, deltaY: -5, absoluteMove: false },
      MouseButtonDown: { type: 'MouseButtonDown', button: MouseButton.Left },
      MouseButtonUp: { type: 'MouseButtonUp', button: MouseButton.Left },
      Wheel: { type: 'Wheel', wheelDelta: 120 },
      HorizontalWheel: { type: 'HorizontalWheel', wheelDelta: -120 },
      Delay: { type: 'Delay', durationMicroseconds: 50000 },
      OverlayText: {
        type: 'OverlayText',
        text: 'Hello',
        durationMicroseconds: 1000000,
        showOverlayTiming: true,
      },
      PixelColorTrigger: {
        type: 'PixelColorTrigger',
        pixelX: 100,
        pixelY: 200,
        pixelColor: 0xff0000,
        triggerCooldownMilliseconds: 3000,
      },
      Comment: { type: 'Comment', text: 'Section Separator' },
      GamepadButtonDown: { type: 'GamepadButtonDown', gamepadButton: 'A', padIndex: 0 },
      GamepadButtonUp: { type: 'GamepadButtonUp', gamepadButton: 'A', padIndex: 0 },
      GamepadAxis: {
        type: 'GamepadAxis',
        gamepadAxis: 'LeftStickX',
        axisValue: 15000,
        padIndex: 0,
      },
      TypeText: { type: 'TypeText', text: 'Typed string 🚀' },
      WaitForPixelGone: {
        type: 'WaitForPixelGone',
        pixelX: 100,
        pixelY: 200,
        pixelColor: 0xffffff,
        waitTimeoutMilliseconds: 5000,
      },
      WaitForWindow: {
        type: 'WaitForWindow',
        waitProcessName: 'notepad',
        waitWindowTitle: 'Untitled',
        waitTimeoutMilliseconds: 10000,
      },
      WaitForKey: { type: 'WaitForKey', waitKeyVirtualKey: 13, waitTimeoutMilliseconds: 2000 },
      RunMacro: { type: 'RunMacro', subMacroName: 'SubRoutine1' },
    };

    const eventTypes = Object.values(MacroEventType);
    expect(eventTypes).toHaveLength(19);

    for (const type of eventTypes) {
      const wire = sampleEventWires[type];
      const parsed = fromWireMacroEvent(wire);
      expect(parsed.success).toBe(true);
      if (!parsed.success) continue;

      const event = parsed.data;
      expect(event.type).toBe(type);

      // Test exhaustive matcher
      const matchedType = matchMacroEvent(event, {
        KeyDown: (e) => e.type,
        KeyUp: (e) => e.type,
        MouseMove: (e) => e.type,
        MouseButtonDown: (e) => e.type,
        MouseButtonUp: (e) => e.type,
        Wheel: (e) => e.type,
        HorizontalWheel: (e) => e.type,
        Delay: (e) => e.type,
        OverlayText: (e) => e.type,
        PixelColorTrigger: (e) => e.type,
        Comment: (e) => e.type,
        GamepadButtonDown: (e) => e.type,
        GamepadButtonUp: (e) => e.type,
        GamepadAxis: (e) => e.type,
        TypeText: (e) => e.type,
        WaitForPixelGone: (e) => e.type,
        WaitForWindow: (e) => e.type,
        WaitForKey: (e) => e.type,
        RunMacro: (e) => e.type,
      });
      expect(matchedType).toBe(type);

      // Verify sendsInput and takesTime rules
      if (type === 'Comment') {
        expect(sendsInput(event)).toBe(false);
        expect(takesTime(event)).toBe(false);
      } else if (type === 'KeyDown') {
        expect(sendsInput(event)).toBe(true);
        expect(takesTime(event)).toBe(true);
      } else if (type === 'Delay') {
        expect(sendsInput(event)).toBe(false);
        expect(takesTime(event)).toBe(true);
      } else if (type === 'OverlayText') {
        expect(sendsInput(event)).toBe(false);
        expect(takesTime(event)).toBe(false);
        expect(getEndTimeMicroseconds(event)).toBe(event.timeMicroseconds + 1000000);
      }

      // Verify wire roundtrip in both camelCase and PascalCase
      const camelWire = toWireMacroEvent(event, false);
      expect(camelWire['type']).toBe(type);
      const pascalWire = toWireMacroEvent(event, true);
      expect(pascalWire['Type']).toBe(type);
    }
  });

  it('correctly maps PascalCase properties from .macro.json', () => {
    const csharpJson = {
      SchemaVersion: 12,
      Id: '4b868e64-fa26-4447-9759-4d8db19aa827',
      Name: 'C# Exported Macro',
      Folder: 'SubFolder/Nested',
      Description: 'Legacy compatibility test',
      IsEnabled: true,
      Tags: ['test', 'ci'],
      ModifiedAt: '2026-08-06T20:00:00+00:00',
      Recording: {
        Keyboard: true,
        MouseButtons: false,
        MouseMovement: true,
        MouseWheel: false,
        Gamepad: false,
        MouseMoveBucketMilliseconds: 15,
        CountdownSeconds: 3,
      },
      Playback: {
        ActivationMode: 'ToggleStop',
        TargetMode: 'SpecificWindow',
        FocusLossBehavior: 'Pause',
        PassThroughHotkey: true,
        HotkeyScopedToTarget: true,
        TargetProcessName: 'Game.exe',
        TargetWindowTitle: 'Main Window',
        Speed: 2.5,
        RandomizeTiming: true,
        TimingJitterMilliseconds: 25,
        RepeatCount: 5,
        RepeatDelayMilliseconds: 100,
        PreferScanCodes: true,
        InfoCardOverride: 'ForceShow',
        CustomTextOverride: 'ForceHide',
      },
      Hotkey: {
        VirtualKey: 112, // F1
        MouseButton: 'None',
        Wheel: 'None',
        Control: true,
        Alt: false,
        Shift: true,
        Windows: false,
      },
      Events: [
        {
          Id: 'a1b2c3d4-e5f6-4a5b-8c9d-0e1f2a3b4c5d',
          TimeMicroseconds: 10000,
          Device: 'Keyboard',
          Type: 'KeyDown',
          VirtualKey: 65,
          ScanCode: 30,
          Extended: false,
          Comment: 'Press A',
        },
      ],
    };

    const parsed = parseMacroDefinition(csharpJson);
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;

    const macro = parsed.data;
    expect(macro.name).toBe('C# Exported Macro');
    expect(macro.folder).toBe('SubFolder/Nested');
    expect(macro.recording.mouseButtons).toBe(false);
    expect(macro.recording.countdownSeconds).toBe(3);
    expect(macro.playback.activationMode).toBe('ToggleStop');
    expect(macro.playback.speed).toBe(2.5);
    expect(macro.playback.infoCardOverride).toBe('ForceShow');
    expect(macro.playback.customTextOverride).toBe('ForceHide');
    expect(macro.hotkey.virtualKey).toBe(112);
    expect(macro.hotkey.control).toBe(true);
    expect(macro.events).toHaveLength(1);
    expect(macro.events[0]?.type).toBe('KeyDown');
    expect(macro.events[0]?.comment).toBe('Press A');
  });
});
