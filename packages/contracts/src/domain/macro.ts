/**
 * Schema 12 MacroDefinition domain contract, wire serialization,
 * and forward-compatible unknown fields preservation.
 */

import { type Guid, type ISODateTimeString } from '../common/types.js';
import { type Schema, type ValidationResult } from '../common/validation.js';
import {
  DEFAULT_HOTKEY_BINDING,
  type HotkeyBinding,
  type HotkeyBindingWire,
  parseHotkeyBindingWire,
} from './hotkey.js';
import {
  DEFAULT_PLAYBACK_OPTIONS,
  DEFAULT_RECORDING_OPTIONS,
  type PlaybackOptions,
  type PlaybackOptionsWire,
  type RecordingOptions,
  type RecordingOptionsWire,
  parsePlaybackOptionsWire,
  parseRecordingOptionsWire,
} from './options.js';
import {
  fromWireMacroEvent,
  type MacroEvent,
  type MacroEventWire,
  toWireMacroEvent,
} from './event.js';

export const CURRENT_SCHEMA_VERSION = 12;

export interface MacroDefinition {
  readonly schemaVersion: number;
  readonly id: Guid;
  readonly name: string;
  readonly folder: string;
  readonly storagePath?: string | undefined;
  readonly description: string;
  readonly isEnabled: boolean;
  readonly tags: readonly string[];
  readonly modifiedAt: ISODateTimeString;
  readonly recording: RecordingOptions;
  readonly playback: PlaybackOptions;
  readonly hotkey: HotkeyBinding;
  readonly events: readonly MacroEvent[];
  /** Forward-compatible unknown properties preserved during round-trip. */
  readonly unknownFields?: Readonly<Record<string, unknown>> | undefined;
}

export interface MacroDefinitionWire {
  readonly SchemaVersion?: number | undefined;
  readonly schemaVersion?: number | undefined;
  readonly Id?: string | undefined;
  readonly id?: string | undefined;
  readonly Name?: string | undefined;
  readonly name?: string | undefined;
  readonly Folder?: string | undefined;
  readonly folder?: string | undefined;
  readonly StoragePath?: string | undefined;
  readonly storagePath?: string | undefined;
  readonly Description?: string | undefined;
  readonly description?: string | undefined;
  readonly IsEnabled?: boolean | undefined;
  readonly isEnabled?: boolean | undefined;
  readonly Tags?: readonly string[] | undefined;
  readonly tags?: readonly string[] | undefined;
  readonly ModifiedAt?: string | undefined;
  readonly modifiedAt?: string | undefined;
  readonly Recording?: RecordingOptionsWire | undefined;
  readonly recording?: RecordingOptionsWire | undefined;
  readonly Playback?: PlaybackOptionsWire | undefined;
  readonly playback?: PlaybackOptionsWire | undefined;
  readonly Hotkey?: HotkeyBindingWire | undefined;
  readonly hotkey?: HotkeyBindingWire | undefined;
  readonly Events?: readonly MacroEventWire[] | undefined;
  readonly events?: readonly MacroEventWire[] | undefined;
  readonly [unknownKey: string]: unknown;
}

export function createDefaultMacroDefinition(partial?: Partial<MacroDefinition>): MacroDefinition {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    id: partial?.id ?? crypto.randomUUID(),
    name: partial?.name ?? 'New macro',
    folder: partial?.folder ?? '',
    storagePath: partial?.storagePath,
    description: partial?.description ?? '',
    isEnabled: partial?.isEnabled ?? true,
    tags: partial?.tags ?? [],
    modifiedAt: partial?.modifiedAt ?? new Date().toISOString(),
    recording: partial?.recording ?? DEFAULT_RECORDING_OPTIONS,
    playback: partial?.playback ?? DEFAULT_PLAYBACK_OPTIONS,
    hotkey: partial?.hotkey ?? DEFAULT_HOTKEY_BINDING,
    events: partial?.events ?? [],
    unknownFields: partial?.unknownFields,
  };
}

const KNOWN_MACRO_KEYS = new Set([
  'SchemaVersion',
  'schemaVersion',
  'Id',
  'id',
  'Name',
  'name',
  'Folder',
  'folder',
  'StoragePath',
  'storagePath',
  'Description',
  'description',
  'IsEnabled',
  'isEnabled',
  'Tags',
  'tags',
  'ModifiedAt',
  'modifiedAt',
  'Recording',
  'recording',
  'Playback',
  'playback',
  'Hotkey',
  'hotkey',
  'Events',
  'events',
]);

export function parseMacroDefinition(raw: unknown, path = ''): ValidationResult<MacroDefinition> {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return {
      success: false,
      errors: [{ path, message: 'Expected object for MacroDefinition', received: raw }],
    };
  }

  const obj = raw as Record<string, unknown>;
  const schemaVersion = (obj['schemaVersion'] ??
    obj['SchemaVersion'] ??
    CURRENT_SCHEMA_VERSION) as number;

  if (typeof schemaVersion === 'number' && schemaVersion > CURRENT_SCHEMA_VERSION) {
    return {
      success: false,
      errors: [
        {
          path: path ? `${path}.schemaVersion` : 'schemaVersion',
          message: `Macro schema version ${schemaVersion} is newer than supported version ${CURRENT_SCHEMA_VERSION}. Update Macro Recorder.`,
          received: schemaVersion,
        },
      ],
    };
  }

  const id = (obj['id'] ?? obj['Id'] ?? crypto.randomUUID()) as Guid;
  const name = (obj['name'] ?? obj['Name'] ?? 'New macro') as string;
  const folder = (obj['folder'] ?? obj['Folder'] ?? '') as string;
  const storagePath = (obj['storagePath'] ?? obj['StoragePath'] ?? undefined) as string | undefined;
  const description = (obj['description'] ?? obj['Description'] ?? '') as string;
  const isEnabled = (obj['isEnabled'] ?? obj['IsEnabled'] ?? true) as boolean;
  const rawTags = (obj['tags'] ?? obj['Tags'] ?? []) as unknown;
  const tags: string[] = Array.isArray(rawTags)
    ? rawTags.filter((t): t is string => typeof t === 'string')
    : [];
  const modifiedAt = (obj['modifiedAt'] ??
    obj['ModifiedAt'] ??
    new Date().toISOString()) as ISODateTimeString;

  const rawRecording = obj['recording'] ?? obj['Recording'] ?? {};
  const recordingParsed = parseRecordingOptionsWire(
    rawRecording,
    path ? `${path}.recording` : 'recording',
  );
  if (!recordingParsed.success) {
    return { success: false, errors: recordingParsed.errors };
  }

  const rawPlayback = obj['playback'] ?? obj['Playback'] ?? {};
  const playbackParsed = parsePlaybackOptionsWire(
    rawPlayback,
    path ? `${path}.playback` : 'playback',
  );
  if (!playbackParsed.success) {
    return { success: false, errors: playbackParsed.errors };
  }

  const rawHotkey = obj['hotkey'] ?? obj['Hotkey'] ?? {};
  const hotkeyParsed = parseHotkeyBindingWire(rawHotkey, path ? `${path}.hotkey` : 'hotkey');
  if (!hotkeyParsed.success) {
    return { success: false, errors: hotkeyParsed.errors };
  }

  const rawEvents = (obj['events'] ?? obj['Events'] ?? []) as unknown;
  if (!Array.isArray(rawEvents)) {
    return {
      success: false,
      errors: [
        {
          path: path ? `${path}.events` : 'events',
          message: 'Expected array for events',
          received: rawEvents,
        },
      ],
    };
  }

  const events: MacroEvent[] = [];
  const eventErrors = [];
  for (let i = 0; i < rawEvents.length; i++) {
    const itemPath = path ? `${path}.events[${i}]` : `events[${i}]`;
    const parsed = fromWireMacroEvent(rawEvents[i], itemPath);
    if (parsed.success) {
      events.push(parsed.data);
    } else {
      eventErrors.push(...parsed.errors);
    }
  }

  if (eventErrors.length > 0) {
    return { success: false, errors: eventErrors };
  }

  // Preserve unknown fields for forward compatibility
  const unknownFields: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (!KNOWN_MACRO_KEYS.has(key)) {
      unknownFields[key] = value;
    }
  }

  const macro: MacroDefinition = {
    schemaVersion,
    id,
    name,
    folder,
    ...(storagePath !== undefined ? { storagePath } : {}),
    description,
    isEnabled,
    tags,
    modifiedAt,
    recording: recordingParsed.data,
    playback: playbackParsed.data,
    hotkey: hotkeyParsed.data,
    events,
    ...(Object.keys(unknownFields).length > 0 ? { unknownFields } : {}),
  };

  return { success: true, data: macro };
}

export function toWireMacroDefinition(
  macro: MacroDefinition,
  pascalCase = false,
): Record<string, unknown> {
  const wireEvents = macro.events.map((e) => toWireMacroEvent(e, pascalCase));

  if (!pascalCase) {
    return {
      schemaVersion: CURRENT_SCHEMA_VERSION,
      id: macro.id,
      name: macro.name,
      folder: macro.folder,
      description: macro.description,
      isEnabled: macro.isEnabled,
      tags: [...macro.tags],
      modifiedAt: macro.modifiedAt,
      recording: { ...macro.recording },
      playback: { ...macro.playback },
      hotkey: { ...macro.hotkey },
      events: wireEvents,
      ...(macro.unknownFields ?? {}),
    };
  }

  return {
    SchemaVersion: CURRENT_SCHEMA_VERSION,
    Id: macro.id,
    Name: macro.name,
    Folder: macro.folder,
    Description: macro.description,
    IsEnabled: macro.isEnabled,
    Tags: [...macro.tags],
    ModifiedAt: macro.modifiedAt,
    Recording: {
      Keyboard: macro.recording.keyboard,
      MouseButtons: macro.recording.mouseButtons,
      MouseMovement: macro.recording.mouseMovement,
      MouseWheel: macro.recording.mouseWheel,
      Gamepad: macro.recording.gamepad,
      MouseMoveBucketMilliseconds: macro.recording.mouseMoveBucketMilliseconds,
      CountdownSeconds: macro.recording.countdownSeconds,
    },
    Playback: {
      ActivationMode: macro.playback.activationMode,
      TargetMode: macro.playback.targetMode,
      FocusLossBehavior: macro.playback.focusLossBehavior,
      PassThroughHotkey: macro.playback.passThroughHotkey,
      HotkeyScopedToTarget: macro.playback.hotkeyScopedToTarget,
      TargetProcessName: macro.playback.targetProcessName,
      TargetWindowTitle: macro.playback.targetWindowTitle,
      Speed: macro.playback.speed,
      RandomizeTiming: macro.playback.randomizeTiming,
      TimingJitterMilliseconds: macro.playback.timingJitterMilliseconds,
      RepeatCount: macro.playback.repeatCount,
      RepeatDelayMilliseconds: macro.playback.repeatDelayMilliseconds,
      PreferScanCodes: macro.playback.preferScanCodes,
      InfoCardOverride: macro.playback.infoCardOverride,
      CustomTextOverride: macro.playback.customTextOverride,
    },
    Hotkey: {
      VirtualKey: macro.hotkey.virtualKey,
      MouseButton: macro.hotkey.mouseButton,
      Wheel: macro.hotkey.wheel,
      Control: macro.hotkey.control,
      Alt: macro.hotkey.alt,
      Shift: macro.hotkey.shift,
      Windows: macro.hotkey.windows,
    },
    Events: wireEvents,
    ...(macro.unknownFields ?? {}),
  };
}

export const macroDefinitionSchema: Schema<MacroDefinition> = {
  _output: undefined as unknown as MacroDefinition,
  parse(input: unknown, path = ''): ValidationResult<MacroDefinition> {
    return parseMacroDefinition(input, path);
  },
  is(input: unknown): input is MacroDefinition {
    return parseMacroDefinition(input, '').success;
  },
};
