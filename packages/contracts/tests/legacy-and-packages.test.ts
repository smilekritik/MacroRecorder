import { describe, expect, it } from 'vitest';
import {
  CURRENT_SCHEMA_VERSION,
  libraryBackupManifestSchema,
  MacroImportFormat,
  macroImportResultSchema,
  migrateLegacyMacro,
  PORTABLE_FORMAT_ID,
  portableMacroManifestSchema,
} from '../src/index.js';

describe('Schemas, Portable Packages, and Importers', () => {
  it('migrates schema 4/5 legacy macro with duration_ms, t_ms, and ToggleRepeat', () => {
    const legacy = {
      schema_version: 4,
      name: 'Legacy V4 Macro',
      duration_ms: 1500,
      events: [
        {
          t_ms: 0,
          type: 'KeyDown',
          virtualKey: 65,
          scanCode: 30,
        },
        {
          t_ms: 50,
          type: 'KeyUp',
          virtualKey: 65,
          scanCode: 30,
        },
      ],
      playback: {
        activation_mode: 'ToggleRepeat',
        repeat_count: 0,
        speed: 1.0,
      },
    };

    const migrated = migrateLegacyMacro(legacy);
    expect(migrated.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(migrated.name).toBe('Legacy V4 Macro');
    expect(migrated.events).toHaveLength(2);
    // t_ms 50 becomes 50_000 microseconds
    expect(migrated.events[1]?.timeMicroseconds).toBe(50000);
    // ToggleRepeat maps to ToggleStop
    expect(migrated.playback.activationMode).toBe('ToggleStop');
    // FocusLossBehavior defaults to Continue
    expect(migrated.playback.focusLossBehavior).toBe('Continue');
  });

  it('validates .mrmacro portable package manifest', () => {
    const validManifest = {
      format: PORTABLE_FORMAT_ID,
      formatVersion: 1,
      macroSchemaVersion: 12,
      createdAtUtc: '2026-08-06T20:00:00+00:00',
      macroEntry: 'macro.json',
      macroSha256: 'a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90',
      sourceDpi: 144,
    };
    const parsed = portableMacroManifestSchema.parse(validManifest);
    expect(parsed.success).toBe(true);

    const invalidHash = {
      ...validManifest,
      macroSha256: 'not-a-valid-sha256',
    };
    expect(portableMacroManifestSchema.parse(invalidHash).success).toBe(false);
  });

  it('validates .mrbackup library backup manifest', () => {
    const backupManifest = {
      format: 'macro-recorder/library-backup',
      formatVersion: 1,
      createdAtUtc: '2026-08-06T20:00:00+00:00',
      macroCount: 12,
      sha256: 'feedfacecafebeef0123456789abcdef',
      includesSettings: true,
    };
    const parsed = libraryBackupManifestSchema.parse(backupManifest);
    expect(parsed.success).toBe(true);
  });

  it('validates MacroImportResult structure with warnings', () => {
    const importResult = {
      format: MacroImportFormat.AutoHotkey,
      macros: [
        {
          schemaVersion: 12,
          id: crypto.randomUUID(),
          name: 'Imported AHK',
          folder: '',
          description: '',
          isEnabled: false,
          tags: [],
          modifiedAt: new Date().toISOString(),
          recording: {
            keyboard: true,
            mouseButtons: true,
            mouseMovement: true,
            mouseWheel: true,
            gamepad: true,
            mouseMoveBucketMilliseconds: 10,
            countdownSeconds: 0,
          },
          playback: {
            activationMode: 'Once' as const,
            targetMode: 'ForegroundAtStart' as const,
            focusLossBehavior: 'Continue' as const,
            passThroughHotkey: false,
            hotkeyScopedToTarget: false,
            targetProcessName: '',
            targetWindowTitle: '',
            speed: 1.0,
            randomizeTiming: false,
            timingJitterMilliseconds: 10,
            repeatCount: 1,
            repeatDelayMilliseconds: 0,
            preferScanCodes: false,
            infoCardOverride: 'Inherit' as const,
            customTextOverride: 'Inherit' as const,
          },
          hotkey: {
            virtualKey: 0,
            mouseButton: 'None' as const,
            wheel: 'None' as const,
            control: false,
            alt: false,
            shift: false,
            windows: false,
          },
          events: [],
        },
      ],
      warnings: [
        { line: 42, message: 'Unsupported command treated as comment' },
        { line: null, message: 'Hotkeys retained for review' },
      ],
    };
    const parsed = macroImportResultSchema.parse(importResult);
    expect(parsed.success).toBe(true);
  });
});
