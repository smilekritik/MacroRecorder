/**
 * Native JSON macro importer (.macro.json, .json).
 */

import { CURRENT_SCHEMA_VERSION } from '../../../../packages/contracts/src/index.js';
import {
  MacroModel,
  normalizeEvents,
} from '../../../../packages/domain/src/model/index.js';
import { format, t } from '../../../../packages/localization/src/index.js';
import type { ImportProbe } from './probe.js';
import {
  MacroImportFormat,
  type IMacroImporter,
  type ImportOptions,
  type MacroImportResult,
} from './types.js';

export class NativeJsonImporter implements IMacroImporter {
  public readonly format = MacroImportFormat.NativeJson;
  public readonly displayName = 'Macro Recorder JSON';
  public readonly extensions: readonly string[] = ['.macro.json', '.json'];
  public readonly sniffPriority = 0;

  public canHandle(probe: ImportProbe): boolean {
    if (probe.looksBinary) {
      return false;
    }
    try {
      const data = JSON.parse(probe.text);
      if (typeof data !== 'object' || data === null || Array.isArray(data)) {
        return false;
      }
      return (
        'schemaVersion' in data ||
        'SchemaVersion' in data ||
        'schemaversion' in data
      );
    } catch {
      return false;
    }
  }

  public import(
    probe: ImportProbe,
    sourceName: string,
    options?: ImportOptions,
  ): MacroImportResult {
    return NativeJsonImporter.importText(probe.text, sourceName, options);
  }

  public static import(
    textOrObj: string | Record<string, unknown>,
    sourceName: string,
    options?: ImportOptions,
  ): MacroImportResult {
    if (typeof textOrObj === 'string') {
      return NativeJsonImporter.importText(textOrObj, sourceName, options);
    }
    return NativeJsonImporter.importObject(textOrObj, sourceName, options);
  }

  private static importText(
    text: string,
    sourceName: string,
    options?: ImportOptions,
  ): MacroImportResult {
    let raw: unknown;
    try {
      raw = JSON.parse(text);
    } catch {
      throw new Error(t('Empty macro file'));
    }
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
      throw new Error(t('Empty macro file'));
    }
    return NativeJsonImporter.importObject(
      raw as Record<string, unknown>,
      sourceName,
      options,
    );
  }

  private static importObject(
    raw: Record<string, unknown>,
    sourceName: string,
    options?: ImportOptions,
  ): MacroImportResult {
    const schemaVersion =
      raw['schemaVersion'] ?? raw['SchemaVersion'] ?? raw['schemaversion'];

    if (
      typeof schemaVersion === 'number' &&
      schemaVersion > CURRENT_SCHEMA_VERSION
    ) {
      throw new Error(
        format(
          t(
            'Macro schema version {0} is newer than supported version {1}. Update Macro Recorder.',
          ),
          schemaVersion,
          CURRENT_SCHEMA_VERSION,
        ),
      );
    }

    const macro = new MacroModel(raw);
    if (!macro.name || macro.name.trim().length === 0) {
      macro.name = sourceName;
    }

    macro.isEnabled = options?.isEnabled ?? false;
    macro.events = normalizeEvents(macro.events);

    return {
      format: MacroImportFormat.NativeJson,
      macros: [macro],
      warnings: [],
    };
  }
}
