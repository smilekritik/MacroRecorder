/**
 * Batch import reporting, user summary builder, warning formatting,
 * folder normalization, and unique name resolution.
 */

import {
  MacroImportFormat,
  type ImportReport,
  type MacroDefinition,
  type MacroImportResult,
  type MacroImportWarning,
} from '../../../../packages/contracts/src/index.js';
import { existsSync, statSync } from 'node:fs';
import { extname } from 'node:path';
import { format, t } from '../../../../packages/localization/src/index.js';
import { importMacro } from './dispatcher.js';
import { ImportProbe } from './probe.js';
import type {
  BatchImportFileItem,
  BatchImportOptions,
  BatchImportResult,
} from './types.js';

export const MAXIMUM_FOLDER_DEPTH = 8;
export const MAXIMUM_NAME_LENGTH = 96;

const RESERVED_FILE_NAMES = new Set([
  'CON',
  'PRN',
  'AUX',
  'NUL',
  'COM1',
  'COM2',
  'COM3',
  'COM4',
  'COM5',
  'COM6',
  'COM7',
  'COM8',
  'COM9',
  'LPT1',
  'LPT2',
  'LPT3',
  'LPT4',
  'LPT5',
  'LPT6',
  'LPT7',
  'LPT8',
  'LPT9',
]);

const INVALID_CHARS_REGEX = /[<>:"/\\|?*\x00-\x1F]/g;

/**
 * Formats a MacroImportWarning as "Line {0}: {1}" or message alone.
 */
export function formatWarning(warning: MacroImportWarning): string {
  return warning.line !== undefined && warning.line !== null
    ? format(t('Line {0}: {1}'), warning.line, warning.message)
    : warning.message;
}

/**
 * Returns the human-readable format display name matching FormatName.
 */
export function getFormatName(importFormat: MacroImportFormat): string {
  switch (importFormat) {
    case MacroImportFormat.MacroPackage:
      return 'Macro Recorder (.mrmacro)';
    case MacroImportFormat.AutoHotkey:
      return 'AutoHotkey';
    case MacroImportFormat.Amc:
      return 'AMC';
    case MacroImportFormat.JitbitMrf:
      return 'Jitbit / Bartels (.mrf)';
    case MacroImportFormat.AutoIt:
      return 'AutoIt (.au3)';
    case MacroImportFormat.Razer:
      return 'Razer Synapse (.xml)';
    case MacroImportFormat.TinyTask:
      return 'TinyTask (.rec)';
    case MacroImportFormat.NativeJson:
      return 'Macro Recorder JSON';
    case MacroImportFormat.LegacyJson:
    default:
      return t('legacy JSON');
  }
}

/**
 * Builds user-facing multi-line summary string matching BuildUserSummary.
 */
export function buildUserSummary(
  result: {
    readonly format: MacroImportFormat;
    readonly macros: readonly MacroDefinition[];
    readonly warnings: readonly MacroImportWarning[];
  },
  maxWarnings = 12,
): string {
  const formatName = getFormatName(result.format);
  const macroCount = result.macros.length;
  const actionCount = result.macros.reduce(
    (sum, m) => sum + m.events.length,
    0,
  );

  let text = format(
    t('Format: {0}\nMacros: {1}\nActions: {2}'),
    formatName,
    macroCount,
    actionCount,
  );

  if (result.warnings.length === 0) {
    return text + t('\n\nImport completed without warnings.');
  }

  text += format(t('\nWarnings: {0}\n\n'), result.warnings.length);
  const head = result.warnings.slice(0, maxWarnings);
  for (const warning of head) {
    text += '• ' + formatWarning(warning) + '\n';
  }

  if (result.warnings.length > maxWarnings) {
    text += format(
      t('…and {0} more'),
      result.warnings.length - maxWarnings,
    );
  }

  return text.trimEnd();
}

/**
 * Constructs an ImportReport object from a MacroImportResult.
 */
export function buildImportReport(
  result: MacroImportResult,
  maxWarnings = 12,
): ImportReport {
  return {
    formatName: getFormatName(result.format),
    macroCount: result.macros.length,
    eventCount: result.macros.reduce((sum, m) => sum + m.events.length, 0),
    warnings: result.warnings,
    userSummary: buildUserSummary(result, maxWarnings),
  };
}

/**
 * Sanitizes a macro or file name: replaces invalid filesystem characters with _,
 * trims whitespace and periods, checks reserved Windows filenames, and enforces max length.
 */
export function sanitizeName(
  value: string | undefined | null,
  fallback = 'macro',
): string {
  if (!value) {
    return fallback;
  }
  let text = value.replace(INVALID_CHARS_REGEX, '_').trim();
  text = text.replace(/^[.\s]+|[.\s]+$/g, '');
  if (text.length > MAXIMUM_NAME_LENGTH) {
    text = text.slice(0, MAXIMUM_NAME_LENGTH).replace(/^[.\s]+|[.\s]+$/g, '');
  }
  if (text.length === 0) {
    return fallback;
  }
  return RESERVED_FILE_NAMES.has(text.toUpperCase()) ? text + '_' : text;
}

/**
 * Resolves a unique macro name in the destination library or folder by adding numeric suffix:
 * "Macro", "Macro 2", "Macro 3", etc.
 */
export function resolveUniqueName(
  desiredName: string,
  takenNames?: ReadonlySet<string>,
): string {
  const fallback = t('New macro');
  const baseName = sanitizeName(desiredName, fallback);
  if (!takenNames || !takenNames.has(baseName.toLowerCase())) {
    return baseName;
  }

  for (let number = 2; number < 100_000; number++) {
    const suffix = ` ${number}`;
    const head =
      baseName.length + suffix.length > MAXIMUM_NAME_LENGTH
        ? baseName.slice(0, MAXIMUM_NAME_LENGTH - suffix.length).trimEnd()
        : baseName;
    const candidate = sanitizeName(head + suffix, baseName + suffix);
    if (!takenNames.has(candidate.toLowerCase())) {
      return candidate;
    }
  }

  return baseName;
}

/**
 * Normalizes relative folder path inside library:
 * converts slashes, eliminates . and .., takes up to 8 levels, and sanitizes segment names.
 */
export function normalizeFolder(relativePath?: string | null): string {
  if (!relativePath || !relativePath.trim()) {
    return '';
  }
  const segments = relativePath
    .replace(/\\/g, '/')
    .split('/')
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && s !== '.' && s !== '..')
    .slice(0, MAXIMUM_FOLDER_DEPTH)
    .map((s) => sanitizeName(s, t('New folder')));

  return segments.join('/');
}

/**
 * Imports a batch of files, reporting progress and consolidating all results and warnings.
 */
export function importBatch(
  files: readonly BatchImportFileItem[],
  options?: BatchImportOptions,
): BatchImportResult {
  const results: MacroImportResult[] = [];
  const allWarnings: MacroImportWarning[] = [];
  let successfulFiles = 0;
  let failedFiles = 0;
  let totalMacros = 0;
  let totalActions = 0;

  const taken = new Set<string>();
  if (options?.takenNames) {
    for (const name of options.takenNames) {
      taken.add(name.toLowerCase());
    }
  }

  for (const item of files) {
    try {
      const ext = extname(item.path);
      const sourceName = item.path.replace(/^.*[\\/]/, '').replace(/\.[^.]+$/, '');
      const content = item.content ?? item.path;
      const fileOptions = {
        ...options,
        destinationFolder: item.destinationFolder ?? options?.destinationFolder,
        takenNames: taken,
      };

      let probe: ImportProbe;
      if (typeof content === 'string') {
        if (!item.content && existsSync(content) && statSync(content).isFile()) {
          probe = ImportProbe.fromFileSync(content);
        } else {
          probe = ImportProbe.fromText(ext, content);
        }
      } else {
        probe = ImportProbe.fromBytes(ext, content);
      }

      const result = importMacro(probe, sourceName, fileOptions);
      results.push(result);
      successfulFiles++;
      totalMacros += result.macros.length;

      for (const m of result.macros) {
        taken.add(m.name.toLowerCase());
        totalActions += m.events.length;
      }
      allWarnings.push(...result.warnings);
    } catch (err) {
      failedFiles++;
      const message = err instanceof Error ? err.message : String(err);
      allWarnings.push({
        line: null,
        message: `Failed to import ${item.path}: ${message}`,
      });
      if (!options?.continueOnError) {
        break;
      }
    }
  }

  const userSummary = `Batch Import: ${files.length} files processed (${successfulFiles} succeeded, ${failedFiles} failed). Macros: ${totalMacros}, Actions: ${totalActions}.`;

  return {
    totalFiles: files.length,
    successfulFiles,
    failedFiles,
    totalMacros,
    totalActions,
    results,
    warnings: allWarnings,
    userSummary,
  };
}
