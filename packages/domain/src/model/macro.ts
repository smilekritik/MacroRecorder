/**
 * Macro definition domain entity, immutable helpers.
 */

import {
  CURRENT_SCHEMA_VERSION,
  macroDefinitionSchema,
  parseMacroDefinition,
} from '../../../contracts/src/index.js';
import { t } from '../../../localization/src/index.js';
import { cloneMacroEvent, getEventEndTimeMicroseconds, isCommentEvent } from './event.js';
import {
  cloneHotkeyBinding,
  createDefaultHotkeyBinding,
  formatHotkeyDisplay,
  HotkeyBindingModel,
} from './hotkey.js';
import {
  clonePlaybackOptions,
  cloneRecordingOptions,
  createDefaultPlaybackOptions,
  createDefaultRecordingOptions,
  PlaybackOptionsModel,
  RecordingOptionsModel,
} from './options.js';
import { getEventOrder } from './processing.js';
import {
  type Guid,
  type ISODateTimeString,
  type MacroDefinition,
  type MacroDefinitionWire,
  type MacroEvent,
  MacroEventType,
  type Microseconds,
  type ValidationResult,
} from './types.js';

export { CURRENT_SCHEMA_VERSION } from '../../../contracts/src/index.js';

/**
 * Creates default or partially populated MacroDefinition.
 */
export function createDefaultMacroDefinition(partial?: Partial<MacroDefinition>): MacroDefinition {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    id: partial?.id ?? crypto.randomUUID(),
    name: partial?.name ?? t('New macro'),
    folder: partial?.folder ?? '',
    storagePath: partial?.storagePath,
    description: partial?.description ?? '',
    isEnabled: partial?.isEnabled ?? true,
    tags: partial?.tags ? [...partial.tags] : [],
    modifiedAt: partial?.modifiedAt ?? new Date().toISOString(),
    recording: partial?.recording
      ? cloneRecordingOptions(partial.recording)
      : createDefaultRecordingOptions(),
    playback: partial?.playback
      ? clonePlaybackOptions(partial.playback)
      : createDefaultPlaybackOptions(),
    hotkey: partial?.hotkey ? cloneHotkeyBinding(partial.hotkey) : createDefaultHotkeyBinding(),
    events: partial?.events ? partial.events.map(cloneMacroEvent) : [],
    unknownFields: partial?.unknownFields ? { ...partial.unknownFields } : undefined,
  };
}

/**
 * Performs deep immutable cloning of a MacroDefinition, preserving unknown fields.
 */
export function cloneMacroDefinition(macro: MacroDefinition): MacroDefinition {
  return {
    schemaVersion: macro.schemaVersion,
    id: macro.id,
    name: macro.name,
    folder: macro.folder,
    storagePath: macro.storagePath,
    description: macro.description,
    isEnabled: macro.isEnabled,
    tags: [...macro.tags],
    modifiedAt: macro.modifiedAt,
    recording: cloneRecordingOptions(macro.recording),
    playback: clonePlaybackOptions(macro.playback),
    hotkey: cloneHotkeyBinding(macro.hotkey),
    events: macro.events.map(cloneMacroEvent),
    unknownFields: macro.unknownFields ? { ...macro.unknownFields } : undefined,
  };
}

/**
 * Validates a MacroDefinition against schema 12 rules.
 */
export function validateMacroDefinition(
  input: unknown,
  path = '',
): ValidationResult<MacroDefinition> {
  if (typeof input === 'object' && input !== null) {
    return parseMacroDefinition(input, path);
  }
  return macroDefinitionSchema.parse(input, path);
}

/**
 * Derives the total macro duration in 64-bit integer microseconds without floating point drift.
 * Duration is 0 for empty macros; otherwise maximum EndTimeMicroseconds across all events.
 */
export function getMacroDurationMicroseconds(macro: MacroDefinition): Microseconds {
  if (macro.events.length === 0) {
    return 0;
  }
  let maxEnd: Microseconds = 0;
  for (const event of macro.events) {
    const end = getEventEndTimeMicroseconds(event);
    if (end > maxEnd) {
      maxEnd = end;
    }
  }
  return maxEnd;
}

/**
 * Derives the total macro duration in fractional milliseconds.
 */
export function getMacroDurationMilliseconds(macro: MacroDefinition): number {
  return getMacroDurationMicroseconds(macro) / 1000.0;
}

/**
 * Evaluates whether a macro is an automatic pixel-color trigger.
 * True when the first non-comment event in time (with blocking wait priority) is PixelColorTrigger.
 */
export function isAutomaticTriggerMacro(target: MacroDefinition | readonly MacroEvent[]): boolean {
  const events = Array.isArray(target) ? target : (target as MacroDefinition).events;
  const nonComments = events.filter((e) => !isCommentEvent(e));
  if (nonComments.length === 0) return false;

  let minTime = nonComments[0]!.timeMicroseconds;
  for (let i = 1; i < nonComments.length; i++) {
    const t = nonComments[i]!.timeMicroseconds;
    if (t < minTime) {
      minTime = t;
    }
  }

  const atMinTime = nonComments.filter((e) => e.timeMicroseconds === minTime);
  atMinTime.sort((a, b) => getEventOrder(a) - getEventOrder(b));

  return atMinTime[0]?.type === MacroEventType.PixelColorTrigger;
}

/**
 * Evaluates whether the macro accepts a manual hotkey trigger.
 * True when the macro is not an automatic background trigger.
 */
export function usesManualHotkey(macro: MacroDefinition): boolean {
  return !isAutomaticTriggerMacro(macro);
}

/**
 * Returns human-readable hotkey column display string for library list:
 * "Automatic trigger" if automatic trigger, otherwise formatted shortcut text.
 */
export function getMacroHotkeyDisplay(macro: MacroDefinition): string {
  if (isAutomaticTriggerMacro(macro)) {
    return t('Automatic trigger');
  }
  return formatHotkeyDisplay(macro.hotkey);
}

/**
 * Object-oriented model wrapper around MacroDefinition.
 * with MacroDefinition class properties, getters, and duration/trigger queries.
 */
export class MacroModel implements MacroDefinition {
  public schemaVersion: number;
  public id: Guid;
  public name: string;
  public folder: string;
  public storagePath?: string | undefined;
  public description: string;
  public isEnabled: boolean;
  public tags: string[];
  public modifiedAt: ISODateTimeString;
  public recording: RecordingOptionsModel;
  public playback: PlaybackOptionsModel;
  public hotkey: HotkeyBindingModel;
  public events: MacroEvent[];
  public unknownFields?: Readonly<Record<string, unknown>> | undefined;

  public constructor(init?: Partial<MacroDefinition> | MacroDefinitionWire) {
    const raw = init ?? {};
    let initial: MacroDefinition;
    if (
      'schemaVersion' in raw &&
      'events' in raw &&
      Array.isArray((raw as MacroDefinition).events)
    ) {
      initial = raw as MacroDefinition;
    } else {
      const parsed = parseMacroDefinition(raw);
      initial = parsed.success ? parsed.data : createDefaultMacroDefinition();
    }

    const explicitUnknown =
      ('unknownFields' in raw && raw.unknownFields
        ? (raw.unknownFields as Record<string, unknown>)
        : undefined) ?? initial.unknownFields;

    this.schemaVersion = initial.schemaVersion ?? CURRENT_SCHEMA_VERSION;
    this.id = initial.id ?? crypto.randomUUID();
    this.name = initial.name ?? t('New macro');
    this.folder = initial.folder ?? '';
    this.storagePath = initial.storagePath;
    this.description = initial.description ?? '';
    this.isEnabled = initial.isEnabled ?? true;
    this.tags = initial.tags ? [...initial.tags] : [];
    this.modifiedAt = initial.modifiedAt ?? new Date().toISOString();
    this.recording = new RecordingOptionsModel(initial.recording);
    this.playback = new PlaybackOptionsModel(initial.playback);
    this.hotkey = new HotkeyBindingModel(initial.hotkey);
    this.events = initial.events ? initial.events.map(cloneMacroEvent) : [];
    this.unknownFields = explicitUnknown ? { ...explicitUnknown } : undefined;
  }

  public get SchemaVersion(): number {
    return this.schemaVersion;
  }
  public set SchemaVersion(val: number) {
    this.schemaVersion = val;
  }

  public get Id(): Guid {
    return this.id;
  }
  public set Id(val: Guid) {
    this.id = val;
  }

  public get Name(): string {
    return this.name;
  }
  public set Name(val: string) {
    this.name = val;
  }

  public get Folder(): string {
    return this.folder;
  }
  public set Folder(val: string) {
    this.folder = val;
  }

  public get StoragePath(): string | undefined {
    return this.storagePath;
  }
  public set StoragePath(val: string | undefined) {
    this.storagePath = val;
  }

  public get Description(): string {
    return this.description;
  }
  public set Description(val: string) {
    this.description = val;
  }

  public get IsEnabled(): boolean {
    return this.isEnabled;
  }
  public set IsEnabled(val: boolean) {
    this.isEnabled = val;
  }

  public get Tags(): string[] {
    return this.tags;
  }
  public set Tags(val: string[]) {
    this.tags = val;
  }

  public get ModifiedAt(): ISODateTimeString {
    return this.modifiedAt;
  }
  public set ModifiedAt(val: ISODateTimeString) {
    this.modifiedAt = val;
  }

  public get Recording(): RecordingOptionsModel {
    return this.recording;
  }
  public set Recording(val: RecordingOptionsModel) {
    this.recording = val;
  }

  public get Playback(): PlaybackOptionsModel {
    return this.playback;
  }
  public set Playback(val: PlaybackOptionsModel) {
    this.playback = val;
  }

  public get Hotkey(): HotkeyBindingModel {
    return this.hotkey;
  }
  public set Hotkey(val: HotkeyBindingModel) {
    this.hotkey = val;
  }

  public get Events(): MacroEvent[] {
    return this.events;
  }
  public set Events(val: MacroEvent[]) {
    this.events = val;
  }

  public get durationMicroseconds(): Microseconds {
    return getMacroDurationMicroseconds(this);
  }
  public get DurationMicroseconds(): Microseconds {
    return this.durationMicroseconds;
  }

  public get durationMilliseconds(): number {
    return getMacroDurationMilliseconds(this);
  }
  public get DurationMilliseconds(): number {
    return this.durationMilliseconds;
  }

  public get isAutomaticTrigger(): boolean {
    return isAutomaticTriggerMacro(this);
  }
  public get IsAutomaticTrigger(): boolean {
    return this.isAutomaticTrigger;
  }

  public get usesManualHotkey(): boolean {
    return usesManualHotkey(this);
  }
  public get UsesManualHotkey(): boolean {
    return this.usesManualHotkey;
  }

  public get hotkeyDisplay(): string {
    return getMacroHotkeyDisplay(this);
  }
  public get HotkeyDisplay(): string {
    return this.hotkeyDisplay;
  }

  public toDefinition(): MacroDefinition {
    return {
      schemaVersion: this.schemaVersion,
      id: this.id,
      name: this.name,
      folder: this.folder,
      storagePath: this.storagePath,
      description: this.description,
      isEnabled: this.isEnabled,
      tags: [...this.tags],
      modifiedAt: this.modifiedAt,
      recording: this.recording.toOptions(),
      playback: this.playback.toOptions(),
      hotkey: this.hotkey.toBinding(),
      events: this.events.map(cloneMacroEvent),
      unknownFields: this.unknownFields ? { ...this.unknownFields } : undefined,
    };
  }

  public clone(): MacroModel {
    return new MacroModel(this.toDefinition());
  }
}
