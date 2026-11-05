/**
 * Legacy macro schemas (4/5, 9, 10, 11) migration to Schema 12.
 */

import { ActivationMode, FocusLossBehavior, OverlayCardOverride } from './enums.js';
import { CURRENT_SCHEMA_VERSION, type MacroDefinition, parseMacroDefinition } from './macro.js';

export interface LegacyMacroV4V5 {
  readonly schema_version?: number | undefined;
  readonly name?: string | undefined;
  readonly duration_ms?: number | undefined;
  readonly events?:
    | readonly {
        readonly t_ms?: number | undefined;
        readonly type?: string | undefined;
        readonly [key: string]: unknown;
      }[]
    | undefined;
  readonly playback?:
    | {
        readonly activation_mode?: string | undefined;
        readonly repeat_count?: number | undefined;
        readonly speed?: number | undefined;
        readonly [key: string]: unknown;
      }
    | undefined;
  readonly [key: string]: unknown;
}

export function migrateLegacyMacro(raw: unknown): MacroDefinition {
  if (typeof raw !== 'object' || raw === null) {
    throw new Error('Invalid legacy macro format: expected non-null object');
  }

  const obj = raw as Record<string, unknown>;
  const version = (obj['SchemaVersion'] ??
    obj['schemaVersion'] ??
    obj['schema_version'] ??
    0) as number;

  // If it's already schema 12, just parse it
  if (version === CURRENT_SCHEMA_VERSION) {
    const parsed = parseMacroDefinition(raw);
    if (parsed.success) {
      return parsed.data;
    }
  }

  // Handle schema 4/5 snake_case legacy format
  if ('duration_ms' in obj || 'schema_version' in obj) {
    const legacyEvents = Array.isArray(obj['events'])
      ? (obj['events'] as Record<string, unknown>[])
      : [];
    const events = legacyEvents.map((e) => {
      const tMs = typeof e['t_ms'] === 'number' ? e['t_ms'] : 0;
      const timeMicroseconds = Math.round(tMs * 1000);
      const { t_ms: _t, ...rest } = e;
      return {
        ...rest,
        timeMicroseconds,
      };
    });

    const rawPlayback = (obj['playback'] as Record<string, unknown>) ?? {};
    let activationMode = rawPlayback['activation_mode'] ?? rawPlayback['activationMode'] ?? 'Once';
    if (activationMode === 'ToggleRepeat') {
      activationMode = ActivationMode.ToggleStop;
    }

    const transformed: Record<string, unknown> = {
      ...obj,
      schemaVersion: CURRENT_SCHEMA_VERSION,
      name: obj['name'] ?? 'Imported Macro',
      events,
      playback: {
        ...rawPlayback,
        activationMode,
        focusLossBehavior: FocusLossBehavior.Continue,
        infoCardOverride: OverlayCardOverride.Inherit,
        customTextOverride: OverlayCardOverride.Inherit,
      },
    };

    const parsed = parseMacroDefinition(transformed);
    if (parsed.success) {
      return parsed.data;
    }
  }

  // Handle schema 9 / 10 / 11 where some schema 12 fields are missing
  const parsed = parseMacroDefinition({
    ...obj,
    schemaVersion: CURRENT_SCHEMA_VERSION,
  });

  if (parsed.success) {
    return parsed.data;
  }

  throw new Error(
    `Failed to migrate legacy macro: ${parsed.errors ? parsed.errors.map((e) => e.message).join('; ') : 'unknown error'}`,
  );
}
