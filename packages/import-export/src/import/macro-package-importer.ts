/**
 * Macro package (.mrmacro) ZIP container importer.
 * Verifies manifest, schema version, and SHA-256 payload integrity.
 * Handles DPI rescaling and coordinate warnings.
 */

import { createHash } from 'node:crypto';
import {
  CURRENT_SCHEMA_VERSION,
  type MacroEvent,
  MacroEventType,
  TargetMode,
} from '../../../../packages/contracts/src/index.js';
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
  type MacroImportWarning,
} from './types.js';
import { isZipSignature, readZipEntries } from './zip-parser.js';

const PORTABLE_FORMAT_ID = 'macro-recorder/macro-package';
const PORTABLE_FORMAT_VERSION = 1;
const MAXIMUM_PORTABLE_JSON_BYTES = 50 * 1024 * 1024;

interface PortableMacroManifest {
  readonly format?: string;
  readonly formatVersion?: number;
  readonly macroSchemaVersion?: number;
  readonly createdAtUtc?: string;
  readonly macroEntry?: string;
  readonly macroSha256?: string;
  readonly sourceDpi?: number;
}

export class MacroPackageImporter implements IMacroImporter {
  public readonly format = MacroImportFormat.MacroPackage;
  public readonly displayName = 'Macro Recorder (.mrmacro)';
  public readonly extensions: readonly string[] = ['.mrmacro'];
  public readonly sniffPriority = 55;

  public canHandle(probe: ImportProbe): boolean {
    if (!probe.looksBinary || !isZipSignature(probe.bytes)) {
      return false;
    }
    try {
      const entries = readZipEntries(probe.bytes);
      const manifestBytes = entries.get('manifest.json');
      if (!manifestBytes) {
        return false;
      }
      const json = JSON.parse(
        new TextDecoder().decode(manifestBytes),
      ) as PortableMacroManifest;
      return json.format === PORTABLE_FORMAT_ID;
    } catch {
      return false;
    }
  }

  public import(
    probe: ImportProbe,
    sourceName: string,
    options?: ImportOptions,
  ): MacroImportResult {
    return MacroPackageImporter.importBytes(probe.bytes, sourceName, options);
  }

  public static import(
    bytes: Uint8Array,
    sourceName: string,
    options?: ImportOptions,
  ): MacroImportResult {
    return MacroPackageImporter.importBytes(bytes, sourceName, options);
  }

  private static importBytes(
    bytes: Uint8Array,
    sourceName: string,
    options?: ImportOptions,
  ): MacroImportResult {
    if (!isZipSignature(bytes)) {
      throw new Error(t('This file is not a Macro Recorder package.'));
    }

    const entries = readZipEntries(bytes);
    const manifestBytes = entries.get('manifest.json');
    if (!manifestBytes) {
      throw new Error(t('The .mrmacro package has no manifest.json.'));
    }

    let manifest: PortableMacroManifest;
    try {
      manifest = JSON.parse(
        new TextDecoder().decode(manifestBytes),
      ) as PortableMacroManifest;
    } catch {
      throw new Error(t('The .mrmacro manifest could not be read.'));
    }

    if (manifest.format !== PORTABLE_FORMAT_ID) {
      throw new Error(t('This file is not a Macro Recorder package.'));
    }

    const formatVersion = manifest.formatVersion ?? 1;
    if (formatVersion < 1 || formatVersion > PORTABLE_FORMAT_VERSION) {
      throw new Error(
        format(
          t(
            '.mrmacro package version {0} is not supported by this application version.',
          ),
          formatVersion,
        ),
      );
    }

    const macroSchemaVersion =
      manifest.macroSchemaVersion ?? CURRENT_SCHEMA_VERSION;
    if (macroSchemaVersion > CURRENT_SCHEMA_VERSION) {
      throw new Error(
        format(
          t(
            'Macro schema version {0} is newer than supported version {1}. Update Macro Recorder.',
          ),
          macroSchemaVersion,
          CURRENT_SCHEMA_VERSION,
        ),
      );
    }

    const macroEntryName = manifest.macroEntry ?? 'macro.json';
    if (!macroEntryName.trim()) {
      throw new Error(
        t('The .mrmacro manifest does not identify the macro payload.'),
      );
    }

    const macroBytes = entries.get(macroEntryName);
    if (!macroBytes) {
      throw new Error(t('The .mrmacro package has no macro.json.'));
    }

    if (macroBytes.length > MAXIMUM_PORTABLE_JSON_BYTES) {
      throw new Error(t('A file inside the .mrmacro package is too large.'));
    }

    const actualHash = createHash('sha256')
      .update(macroBytes)
      .digest('hex')
      .toLowerCase();
    const expectedHash = (manifest.macroSha256 ?? '').toLowerCase();
    if (actualHash !== expectedHash) {
      throw new Error(
        t(
          'The .mrmacro checksum does not match; the file is damaged or has been modified.',
        ),
      );
    }

    let raw: unknown;
    try {
      raw = JSON.parse(new TextDecoder().decode(macroBytes));
    } catch {
      throw new Error(t('The .mrmacro package does not contain a macro.'));
    }

    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
      throw new Error(t('The .mrmacro package does not contain a macro.'));
    }

    const macro = new MacroModel(raw as Record<string, unknown>);
    if (!macro.name || macro.name.trim().length === 0) {
      macro.name = sourceName;
    }

    if (macro.schemaVersion > CURRENT_SCHEMA_VERSION) {
      throw new Error(
        format(
          t(
            'Macro schema version {0} is newer than supported version {1}. Update Macro Recorder.',
          ),
          macro.schemaVersion,
          CURRENT_SCHEMA_VERSION,
        ),
      );
    }

    const warnings: MacroImportWarning[] = [];
    if (macro.playback.targetMode === TargetMode.SpecificWindow) {
      warnings.push({
        line: null,
        message: t(
          'The target window is computer-specific. Select it again before enabling the macro.',
        ),
      });
    }

    const targetDpi = options?.targetDpi ?? 96;
    const sourceDpi = manifest.sourceDpi ?? 0;
    const rescaled = MacroPackageImporter.rescaleForDpi(
      macro,
      sourceDpi,
      targetDpi,
    );

    if (rescaled) {
      warnings.push({
        line: null,
        message: format(
          t(
            'Screen coordinates were rescaled from DPI {0} to {1}. Verify them for a different monitor layout.',
          ),
          sourceDpi,
          targetDpi,
        ),
      });
    } else if (
      macro.events.some(
        (item) =>
          item.type === MacroEventType.PixelColorTrigger ||
          item.type === MacroEventType.WaitForPixelGone ||
          (item.type === MacroEventType.MouseMove && item.absoluteMove),
      )
    ) {
      warnings.push({
        line: null,
        message: t(
          'The macro contains screen coordinates. Verify them when using a different resolution, DPI, or monitor layout.',
        ),
      });
    }

    macro.isEnabled = options?.isEnabled ?? false;
    macro.events = normalizeEvents(macro.events);

    return {
      format: MacroImportFormat.MacroPackage,
      macros: [macro],
      warnings,
    };
  }

  private static rescaleForDpi(
    macro: MacroModel,
    sourceDpi: number,
    targetDpi: number,
  ): boolean {
    if (sourceDpi <= 0 || targetDpi <= 0 || sourceDpi === targetDpi) {
      return false;
    }
    const factor = targetDpi / sourceDpi;
    let touched = false;

    macro.events = macro.events.map((item) => {
      if (
        item.type === MacroEventType.PixelColorTrigger ||
        item.type === MacroEventType.WaitForPixelGone
      ) {
        touched = true;
        return {
          ...item,
          pixelX: Math.round(item.pixelX * factor),
          pixelY: Math.round(item.pixelY * factor),
        } as MacroEvent;
      }
      if (item.type === MacroEventType.MouseMove && item.absoluteMove) {
        touched = true;
        return {
          ...item,
          deltaX: Math.round(item.deltaX * factor),
          deltaY: Math.round(item.deltaY * factor),
        } as MacroEvent;
      }
      return item;
    });

    return touched;
  }
}
