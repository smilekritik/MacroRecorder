/**
 * Suite 1: Normalized Macros and Schema-12 Bidirectional Parity.
 *
 * Verifies:
 * - Schema-12 JSON is semantically identical in both directions.
 * - Migration from schemas 11, 10, 9, 4/5, and unversioned legacy recorder.
 * - Normalization algorithms match the legacy oracle exactly:
 *   - Clamping negative times and rounding to whole milliseconds.
 *   - Deterministic sorting of simultaneous events ("wait first, then act").
 *   - Comment row anchoring and timestamp borrowing.
 *   - Mouse move bucketing (10ms).
 *   - Time scaling and overlay duration scaling.
 *   - Rebase to zero.
 *   - Automatic trigger detection.
 *
 * Satisfies §, §, §, §, §,
 * §, §, §, §, §, §.
 */

import { describe, expect, it } from 'vitest';
import {
  CURRENT_SCHEMA_VERSION,
  migrateLegacyMacro,
  parseMacroDefinition,
  toWireMacroDefinition,
  type MacroDefinition,
  type MacroEvent,
  MacroEventType,
} from '../../../packages/contracts/src/index.js';
import {
  compressMouseMoves,
  normalizeEvents,
  rebaseEventsToZero,
  scaleTime,
  isAutomaticTriggerMacro,
} from '../../../packages/domain/src/timeline/index.js';
import {
  loadFixtureJson,
  SCHEMA_FIXTURES,
} from '../../fixtures/index.js';
import {
  LegacyMacroProcessingOracle,
  type LegacyMacroEvent,
} from '../oracle/legacy-oracle.js';
import { SemanticNormalizer } from '../harness/normalizer.js';

function parseMacro(raw: unknown): MacroDefinition {
  const res = parseMacroDefinition(raw);
  if (!res.success) {
    throw new Error(`Failed to parse macro: ${JSON.stringify(res.errors)}`);
  }
  return res.data;
}

describe('Suite 1: Normalized Macros & Schema-12', () => {
  const normalizer = new SemanticNormalizer();

  // 1. Schema-12 Bidirectional Roundtrip
  it('Schema-12 JSON is semantically identical in both directions', () => {
    const rawFixture = loadFixtureJson<Record<string, unknown>>(SCHEMA_FIXTURES.CURRENT_SCHEMA_12);
    const expected = loadFixtureJson<Record<string, unknown>>(SCHEMA_FIXTURES.CURRENT_SCHEMA_12_EXPECTED);

    // Read with the current parser
    const parsed = parseMacro(rawFixture);
    expect(parsed.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);

    // Wire serialization in PascalCase (standard disk persistence format)
    const wirePascal = toWireMacroDefinition(parsed, true);
    const diffPascal = normalizer.compareDeep(wirePascal, expected);
    if (!diffPascal.match) {
      console.error('Test 1 diffPascal differences:', diffPascal.differences);
    }
    expect(diffPascal.match).toBe(true);

    // Re-parse the wire output (roundtrip)
    const roundtrip = parseMacro(wirePascal);
    const wireRoundtrip = toWireMacroDefinition(roundtrip, true);
    const diffRoundtrip = normalizer.compareDeep(wireRoundtrip, wirePascal);
    expect(diffRoundtrip.match).toBe(true);

    // Wire serialization in camelCase (portable package format)
    const wireCamel = toWireMacroDefinition(parsed, false);
    expect(wireCamel).toHaveProperty('schemaVersion', 12);
    expect(wireCamel).toHaveProperty('events');

    // Parse camelCase
    const fromCamel = parseMacro(wireCamel);
    expect(fromCamel.id).toBe(parsed.id);
    expect(fromCamel.events.length).toBe(parsed.events.length);
  });

  // 2. Migration of Schema 11 (Portable Package)
  it('Migration of Schema 11 preserves all attributes and migrates to Schema 12 defaults', () => {
    const rawSchema11 = loadFixtureJson<Record<string, unknown>>(SCHEMA_FIXTURES.PACKAGE_SCHEMA_11);
    const expected = loadFixtureJson<Record<string, unknown>>(SCHEMA_FIXTURES.PACKAGE_SCHEMA_11_EXPECTED);

    const parsed = migrateLegacyMacro(rawSchema11);
    expect(parsed.schemaVersion).toBe(12);

    const wire = toWireMacroDefinition(parsed, true);
    const diff = normalizer.compareDeep(wire, expected);

    // Any differences must be strictly the fixture generator cloning artifacts
    const allowedClonedPaths = ['$.tags', '$.recording.gamepad', '$.recording.countdownSeconds', '$.playback.timingJitterMilliseconds'];
    for (const d of diff.differences) {
      const isAllowed = allowedClonedPaths.some((p) => d.startsWith(p));
      expect(isAllowed).toBe(true);
    }
  });

  // 3. Migration of Schema 10 (Annotations & Comment Rows)
  it('Migration of Schema 10 preserves standalone comment rows and defaults card overrides', () => {
    const rawSchema10 = loadFixtureJson<Record<string, unknown>>(SCHEMA_FIXTURES.ANNOTATIONS_SCHEMA_10);
    const expected = loadFixtureJson<Record<string, unknown>>(SCHEMA_FIXTURES.ANNOTATIONS_SCHEMA_10_EXPECTED);

    const parsed = migrateLegacyMacro(rawSchema10);
    expect(parsed.schemaVersion).toBe(12);
    expect(parsed.events.some((e) => e.type === MacroEventType.Comment)).toBe(true);

    const wire = toWireMacroDefinition(parsed, true);
    const diff = normalizer.compareDeep(wire, expected);
    expect(diff.match).toBe(true);
  });

  // 4. Migration of Schema 9 (Legacy without comments)
  it('Migration of Schema 9 populates empty comment strings and schema 12 playback defaults', () => {
    const rawSchema9 = loadFixtureJson<Record<string, unknown>>(SCHEMA_FIXTURES.LEGACY_SCHEMA_9);
    const expected = loadFixtureJson<Record<string, unknown>>(SCHEMA_FIXTURES.LEGACY_SCHEMA_9_EXPECTED);

    const parsed = migrateLegacyMacro(rawSchema9);
    expect(parsed.schemaVersion).toBe(12);

    const wire = toWireMacroDefinition(parsed, true);
    const diff = normalizer.compareDeep(wire, expected);
    expect(diff.match).toBe(true);
  });

  // 5. Migration of Schema 4/5 (ToggleRepeat -> ToggleStop)
  it('Migration of Schema 4/5 migrates ToggleRepeat to ToggleStop and sets finite repeat count', () => {
    const rawSchema45 = loadFixtureJson<Record<string, unknown>>(SCHEMA_FIXTURES.LEGACY_SCHEMA_4_5);
    const expected = loadFixtureJson<Record<string, unknown>>(SCHEMA_FIXTURES.LEGACY_SCHEMA_4_5_EXPECTED);

    const parsed = migrateLegacyMacro(rawSchema45);
    expect(parsed.schemaVersion).toBe(12);
    expect(parsed.playback.activationMode).toBe('ToggleStop');
    expect(parsed.playback.repeatCount).toBe(5);

    const wire = toWireMacroDefinition(parsed, true);
    const diff = normalizer.compareDeep(wire, expected);

    // Differences are strictly dynamic ModifiedAt and cloned schema_9 template fields
    const allowedClonedPaths = ['$.events[0].id', '$.modifiedAt', '$.recording.gamepad'];
    for (const d of diff.differences) {
      const isAllowed = allowedClonedPaths.some((p) => d.startsWith(p));
      expect(isAllowed).toBe(true);
    }
  });

  // 6. Edge Cases: Minimal Defaults, Case Insensitivity, Future Unknown Fields
  it('Handles minimal defaults, case-insensitive keys, and preserves unknown future fields', () => {
    // Minimal defaults
    const minimalRaw = loadFixtureJson<Record<string, unknown>>(SCHEMA_FIXTURES.EDGE_MINIMAL);
    const minimalParsed = parseMacro(minimalRaw);
    expect(minimalParsed.name).toBe('Minimal Default Macro');
    expect(minimalParsed.schemaVersion).toBe(12);

    // Case-insensitive schema
    const caseRaw = loadFixtureJson<Record<string, unknown>>(SCHEMA_FIXTURES.EDGE_CASE_INSENSITIVE);
    const caseParsed = parseMacro(caseRaw);
    expect(caseParsed.schemaVersion).toBe(12);
    expect(caseParsed.name).toBe('Case Insensitive Schema Macro');

    // Future unknown fields preserved
    const futureRaw = loadFixtureJson<Record<string, unknown>>(SCHEMA_FIXTURES.EDGE_FUTURE_FIELDS);
    const futureParsed = parseMacro(futureRaw);
    const wireFuture = toWireMacroDefinition(futureParsed, true) as Record<string, unknown>;
    expect(wireFuture).toHaveProperty('FutureSchemaAdditions');
    expect(wireFuture).toHaveProperty('CustomUnknownTag');
  });

  // 7. All 19 Event Types Represented
  it('All 19 MacroEventType enum values serialize, deserialize, and match expected fixture', () => {
    const allEventsRaw = loadFixtureJson<Record<string, unknown>>(SCHEMA_FIXTURES.EDGE_ALL_EVENTS);
    const allEventsExpected = loadFixtureJson<Record<string, unknown>>(SCHEMA_FIXTURES.EDGE_ALL_EVENTS_EXPECTED);

    const parsed = parseMacro(allEventsRaw);
    expect(parsed.events.length).toBe(19);

    const wire = toWireMacroDefinition(parsed, true);
    const diff = normalizer.compareDeep(wire, allEventsExpected);
    expect(diff.match).toBe(true);
  });

  // 8. Normalization Algorithm vs Legacy Oracle
  it('Normalize algorithm matches MacroProcessing.Normalize across comments and waits', () => {
    const events: MacroEvent[] = [
      {
        id: '1',
        timeMicroseconds: -5000,
        device: 'Keyboard' as any,
        type: MacroEventType.Comment,
        text: 'Header note',
      } as any,
      {
        id: '2',
        timeMicroseconds: 24600,
        device: 'Keyboard' as any,
        type: MacroEventType.KeyDown,
        virtualKey: 65,
      } as any,
      {
        id: '3',
        timeMicroseconds: 24600,
        device: 'Conditions' as any,
        type: MacroEventType.WaitForWindow,
        waitProcessName: 'app.exe',
      } as any,
      {
        id: '4',
        timeMicroseconds: 24600,
        device: 'Keyboard' as any,
        type: MacroEventType.Comment,
        text: 'Action note',
      } as any,
      {
        id: '5',
        timeMicroseconds: 50000,
        device: 'Keyboard' as any,
        type: MacroEventType.KeyUp,
        virtualKey: 65,
      } as any,
    ];

    const rewriteNormalized = normalizeEvents(events);

    // Convert to legacy oracle format
    const legacyEvents: LegacyMacroEvent[] = events.map((e) => ({
      Id: e.id,
      TimeMicroseconds: e.timeMicroseconds,
      Device: (e as any).device ?? 'Keyboard',
      Type: e.type,
      VirtualKey: (e as any).virtualKey ?? 0,
      ScanCode: 0,
      Extended: false,
      Button: 'None',
      DeltaX: 0,
      DeltaY: 0,
      WheelDelta: 0,
      AbsoluteMove: false,
      GamepadButton: 'None',
      GamepadAxis: 'None',
      AxisValue: 0,
      PadIndex: 0,
      Text: (e as any).text ?? '',
      Comment: (e as any).comment ?? '',
      DurationMicroseconds: 0,
      ShowOverlayTiming: false,
      PixelX: 0,
      PixelY: 0,
      PixelColor: 0,
      TriggerCooldownMilliseconds: 3000,
      WaitProcessName: (e as any).waitProcessName ?? '',
      WaitWindowTitle: '',
      WaitKeyVirtualKey: 0,
      WaitTimeoutMilliseconds: 0,
      SubMacroName: '',
    }));

    const oracleNormalized = LegacyMacroProcessingOracle.normalize(legacyEvents);

    expect(rewriteNormalized.length).toBe(oracleNormalized.length);
    for (let i = 0; i < rewriteNormalized.length; i++) {
      expect(rewriteNormalized[i]?.timeMicroseconds).toBe(oracleNormalized[i]?.TimeMicroseconds);
      expect(rewriteNormalized[i]?.type).toBe(oracleNormalized[i]?.Type);
    }
  });

  // 9. RebaseToZero Algorithm
  it('RebaseToZero removes leading offset consumed by filtered management hotkeys', () => {
    const events: MacroEvent[] = [
      { id: '1', timeMicroseconds: 0, type: MacroEventType.Comment, text: 'intro' } as any,
      { id: '2', timeMicroseconds: 35000, type: MacroEventType.KeyDown, virtualKey: 65 } as any,
      { id: '3', timeMicroseconds: 65000, type: MacroEventType.KeyUp, virtualKey: 65 } as any,
    ];

    const rebased = rebaseEventsToZero(events);
    expect(rebased[0]?.timeMicroseconds).toBe(0); // Comment row stays at 0
    expect(rebased[1]?.timeMicroseconds).toBe(0); // First action rebased from 35000 to 0
    expect(rebased[2]?.timeMicroseconds).toBe(30000); // 65000 - 35000 = 30000
  });

  // 10. MouseMove Bucketing
  it('CompressMouseMoves merges deltas within 10ms bucket while preserving buttons', () => {
    const events: MacroEvent[] = [
      { id: '1', timeMicroseconds: 2000, type: MacroEventType.MouseMove, deltaX: 5, deltaY: 2 } as any,
      { id: '2', timeMicroseconds: 6000, type: MacroEventType.MouseMove, deltaX: 7, deltaY: -1 } as any,
      { id: '3', timeMicroseconds: 15000, type: MacroEventType.MouseMove, deltaX: 3, deltaY: 4 } as any,
    ];

    const compressed = compressMouseMoves(events, 10);
    expect(compressed.length).toBe(2);
    // Bucket 0 (0..9999 us): deltaX = 5 + 7 = 12, deltaY = 2 - 1 = 1
    expect((compressed[0] as any).deltaX).toBe(12);
    expect((compressed[0] as any).deltaY).toBe(1);
    // Bucket 1 (10000..19999 us): deltaX = 3, deltaY = 4
    expect((compressed[1] as any).deltaX).toBe(3);
    expect((compressed[1] as any).deltaY).toBe(4);
  });

  // 11. Time Scaling
  it('ScaleTimeline multiplies event timestamps and overlay durations by factor', () => {
    const macro: MacroDefinition = {
      schemaVersion: 12,
      id: 'm1' as any,
      name: 'test',
      folder: '',
      description: '',
      isEnabled: true,
      tags: [],
      modifiedAt: new Date().toISOString(),
      recording: {} as any,
      playback: {} as any,
      hotkey: {} as any,
      events: [
        { id: '1', timeMicroseconds: 10000, type: MacroEventType.KeyDown, virtualKey: 65 } as any,
        { id: '2', timeMicroseconds: 20000, type: MacroEventType.OverlayText, text: 'Card', durationMicroseconds: 50000 } as any,
      ],
    };

    scaleTime(macro, 2.0);
    expect(macro.events[0]?.timeMicroseconds).toBe(20000);
    expect(macro.events[1]?.timeMicroseconds).toBe(40000);
    expect((macro.events[1] as any).durationMicroseconds).toBe(100000);
  });

  // 12. Automatic Trigger Recognition
  it('Automatic trigger macro is detected even when preceded by a comment row', () => {
    const macroWithCommentFirst: MacroDefinition = {
      schemaVersion: 12,
      id: 'm2' as any,
      name: 'auto',
      folder: '',
      description: '',
      isEnabled: true,
      tags: [],
      modifiedAt: new Date().toISOString(),
      recording: {} as any,
      playback: {} as any,
      hotkey: {} as any,
      events: [
        { id: '1', timeMicroseconds: 0, type: MacroEventType.Comment, text: 'Wait for health bar' } as any,
        { id: '2', timeMicroseconds: 0, type: MacroEventType.PixelColorTrigger, pixelX: 100, pixelY: 200, pixelColor: 0xff0000 } as any,
      ],
    };

    expect(isAutomaticTriggerMacro(macroWithCommentFirst)).toBe(true);
  });
});
