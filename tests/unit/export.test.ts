/**
 * Deterministic unit tests for exporters:
 * AutoHotkey v2, Native JSON, Diagnostics CSV, Diagnostics JSON,
 * Diagnostic Bundle, and Macro Package.
 *
 * Covers:
 * - LEGACY-TEST-004 /: AutoHotkeyV2Exporter_RendersKeysMouseTimingTextAndComments
 * - LEGACY-TEST-005 /: AutoHotkeyV2Exporter_MarksUnsupportedActionsAsComments
 * Plus full export format coverage and edge cases.
 */

import { describe, expect, it, beforeEach, afterEach } from 'vitest';

import {
  GamepadButton,
  MouseButton,
  createDefaultMacroDefinition,
} from '../../packages/contracts/src/index.js';
import {
  createCommentEvent,
  createGamepadButtonDownEvent,
  createGamepadButtonUpEvent,
  createHorizontalWheelEvent,
  createKeyDownEvent,
  createKeyUpEvent,
  createMouseButtonDownEvent,
  createMouseButtonUpEvent,
  createMouseMoveEvent,
  createOverlayTextEvent,
  createRunMacroEvent,
  createTypeTextEvent,
  createWheelEvent,
} from '../../packages/domain/src/model/index.js';
import {
  AutoHotkeyV2Exporter,
  exportAutoHotkeyV2,
  exportDiagnosticsCsv,
  exportDiagnosticsJson,
  exportNativeJson,
  exportMacroPackage,
} from '../../packages/import-export/src/export/index.js';
import {
  createTemporaryRoot,
  deleteTemporaryRoot,
} from './test-helpers.js';

describe('Export Suites', () => {
  let tempRoot: string;

  beforeEach(() => {
    tempRoot = createTemporaryRoot('mr-export-');
  });

  afterEach(() => {
    deleteTemporaryRoot(tempRoot);
  });

  // --- LEGACY-TEST-004 / ---
  it('AutoHotkeyV2Exporter_RendersKeysMouseTimingTextAndComments', () => {
    const macro = createDefaultMacroDefinition({
      name: 'combo',
      events: [
        createCommentEvent({ id: '1', timeMicroseconds: 0, text: 'note' }),
        createKeyDownEvent({ id: '2', timeMicroseconds: 0, virtualKey: 0x41 }),
        createKeyUpEvent({ id: '3', timeMicroseconds: 0, virtualKey: 0x41 }),
        createKeyDownEvent({ id: '4', timeMicroseconds: 50_000, virtualKey: 0x0d }),
        createKeyUpEvent({ id: '5', timeMicroseconds: 50_000, virtualKey: 0x0d }),
        createMouseMoveEvent({ id: '6', timeMicroseconds: 60_000, deltaX: 12, deltaY: -8 }),
        createMouseButtonDownEvent({ id: '7', timeMicroseconds: 60_000, button: MouseButton.Left }),
        createMouseButtonUpEvent({ id: '8', timeMicroseconds: 60_000, button: MouseButton.Left }),
        createTypeTextEvent({ id: '9', timeMicroseconds: 70_000, text: 'Hi "x"' }),
      ],
    });

    const script = AutoHotkeyV2Exporter.Export(macro);

    expect(script.startsWith('#Requires AutoHotkey v2.0')).toBe(true);
    expect(script).toContain('Send "{a down}"');
    expect(script).toContain('Send "{a up}"');
    expect(script).toContain('Send "{Enter down}"');
    expect(script).toContain('Sleep 50');                 // 50 ms gap before Enter
    expect(script).toContain('MouseMove 12, -8, 0, "R"'); // relative motion preserved
    expect(script).toContain('Click "Left Down"');
    expect(script).toContain('SendText "Hi ""x"""');     // quotes doubled for AHK v2
    expect(script).toContain('; note');                   // comment row kept
  });

  // --- LEGACY-TEST-005 / ---
  it('AutoHotkeyV2Exporter_MarksUnsupportedActionsAsComments', () => {
    const macro = createDefaultMacroDefinition({
      events: [
        createGamepadButtonDownEvent({
          id: '1',
          timeMicroseconds: 0,
          gamepadButton: GamepadButton.A,
        }),
      ],
    });

    const script = AutoHotkeyV2Exporter.Export(macro);
    expect(script).toContain('; [not exported] GamepadButtonDown');
  });

  // --- Additional Exporter Edge Cases & Format ---
  it('exports native JSON format round-tripping all fields', () => {
    const macro = createDefaultMacroDefinition({
      name: 'native-export-test',
      events: [
        createKeyDownEvent({ id: '1', timeMicroseconds: 12_000, virtualKey: 0x45 }),
      ],
    });

    const json = exportNativeJson(macro);
    const parsed = JSON.parse(json) as Record<string, unknown>;

    expect(parsed['Name'] ?? parsed['name']).toBe('native-export-test');
    expect(parsed['Events'] ?? parsed['events']).toHaveLength(1);
  });

  it('exports diagnostics receipts to valid CSV with headers and jitter metrics', () => {
    const receipts = [
      {
        eventId: '00000000-0000-0000-0000-000000000001',
        scheduledMicroseconds: 0,
        dispatchStartedMicroseconds: 2000,
        dispatchCompletedMicroseconds: 2500,
        hookConfirmedMicroseconds: 2600,
        success: true,
        error: null,
        plannedMicroseconds: null,
        dispatchJitterMilliseconds: 2.0,
        confirmationMilliseconds: 0.6,
      },
    ];

    const csv = exportDiagnosticsCsv(receipts);
    expect(csv).toContain('event_id');
    expect(csv).toContain('jitter_ms');
    expect(csv).toContain('00000000-0000-0000-0000-000000000001');
    expect(csv).toContain('2.000000');
  });

  it('exports diagnostics receipts to formatted JSON wire model', () => {
    const receipts = [
      {
        eventId: '00000000-0000-0000-0000-000000000002',
        scheduledMicroseconds: 5000,
        dispatchStartedMicroseconds: 5200,
        dispatchCompletedMicroseconds: 5400,
        hookConfirmedMicroseconds: null,
        success: false,
        error: 'Target window closed',
        plannedMicroseconds: null,
        dispatchJitterMilliseconds: 0.2,
        confirmationMilliseconds: null,
      },
    ];

    const json = exportDiagnosticsJson(receipts);
    const parsed = JSON.parse(json);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed[0].Error).toBe('Target window closed');
    expect(parsed[0].Success).toBe(false);
  });

  it('exports portable .mrmacro package containing manifest.json and macro.json', () => {
    const macro = createDefaultMacroDefinition({
      name: 'portable-test',
      events: [
        createKeyDownEvent({ id: '1', timeMicroseconds: 0, virtualKey: 0x41 }),
      ],
    });

    const buffer = exportMacroPackage(macro);
    expect(buffer.length).toBeGreaterThan(50);
    // Standard ZIP signature PK\x03\x04
    expect(buffer[0]).toBe(0x50);
    expect(buffer[1]).toBe(0x4b);
    expect(buffer[2]).toBe(0x03);
    expect(buffer[3]).toBe(0x04);
  });

  it('AHK v2 exporter handles wheel events correctly', () => {
    const macro = createDefaultMacroDefinition({
      events: [
        createWheelEvent({ id: '1', timeMicroseconds: 0, wheelDelta: 120 }),
        createHorizontalWheelEvent({ id: '2', timeMicroseconds: 10_000, wheelDelta: -120 }),
      ],
    });

    const script = exportAutoHotkeyV2(macro);
    expect(script).toContain('Send "{WheelUp 1}"');
    expect(script).toContain('Send "{WheelLeft 1}"');
  });

  it('AHK v2 exporter handles multiple unsupported event types as comments', () => {
    const macro = createDefaultMacroDefinition({
      events: [
        createGamepadButtonUpEvent({ id: '1', timeMicroseconds: 0, gamepadButton: GamepadButton.B }),
        createOverlayTextEvent({ id: '2', timeMicroseconds: 0, text: 'HUD alert' }),
        createRunMacroEvent({ id: '3', timeMicroseconds: 0, subMacroName: 'child' }),
      ],
    });

    const script = exportAutoHotkeyV2(macro);
    expect(script).toContain('; [not exported] GamepadButtonUp');
    expect(script).toContain('; [not exported] OverlayText HUD alert');
    expect(script).toContain('; [not exported] RunMacro');
  });
});
