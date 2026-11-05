/**
 * Macro import dispatcher.
 * Implements extension-first dispatch, content sniffing fallback,
 * ZIP package routing, and library naming/folder application.
 */

import { existsSync, statSync } from 'node:fs';
import { basename, extname } from 'node:path';
import {
  type MacroImportResult,
  type MacroImportWarning,
} from '../../../../packages/contracts/src/index.js';
import { format, t } from '../../../../packages/localization/src/index.js';
import {
  normalizeFolder,
  resolveUniqueName,
} from './batch-report.js';
import { LegacyMacroImporter } from './legacy-json-importer.js';
import { LibraryBackupImporter } from './library-backup-importer.js';
import { MacroPackageImporter } from './macro-package-importer.js';
import { NativeJsonImporter } from './native-json-importer.js';
import { ImportProbe } from './probe.js';
import { MacroImporterRegistry } from './registry.js';
import type { ImportOptions } from './types.js';
import { isZipSignature } from './zip-parser.js';

/**
 * Imports a macro from a file path, string content, raw bytes, or ImportProbe.
 */
export function importMacro(
  source: string | Uint8Array | ImportProbe,
  sourceName = 'macro',
  options?: ImportOptions,
): MacroImportResult {
  let probe: ImportProbe;
  let effectiveName = sourceName;

  if (source instanceof ImportProbe) {
    probe = source;
  } else if (source instanceof Uint8Array) {
    const ext = extname(sourceName) || '';
    probe = ImportProbe.fromBytes(ext, source);
  } else if (typeof source === 'string') {
    const isExplicitContent =
      source.includes('\n') ||
      source.trimStart().startsWith('{') ||
      source.trimStart().startsWith('<');

    if (!isExplicitContent) {
      try {
        if (existsSync(source) && statSync(source).isFile()) {
          probe = ImportProbe.fromFileSync(source);
          effectiveName =
            sourceName !== 'macro'
              ? sourceName
              : basename(source, extname(source));
        } else {
          const ext = extname(sourceName) || '';
          probe = ImportProbe.fromText(ext, source);
        }
      } catch {
        const ext = extname(sourceName) || '';
        probe = ImportProbe.fromText(ext, source);
      }
    } else {
      const ext = extname(sourceName) || '';
      probe = ImportProbe.fromText(ext, source);
    }
  } else {
    throw new Error('Unsupported import source type.');
  }

  let result: MacroImportResult;
  const extLower = probe.extension.toLowerCase();

  // 1. Library Backup (.mrbackup)
  const backupImporter = new LibraryBackupImporter();
  if (extLower === '.mrbackup' || (probe.looksBinary && isZipSignature(probe.bytes) && backupImporter.canHandle(probe))) {
    result = backupImporter.import(probe, effectiveName, options);
  }
  // 2. Portable Package (.mrmacro) or ZIP signature
  else if (
    extLower === MacroImporterRegistry.PortableExtension.toLowerCase() ||
    (probe.looksBinary && isZipSignature(probe.bytes))
  ) {
    const pkgImporter = new MacroPackageImporter();
    result = pkgImporter.import(probe, effectiveName, options);
  }
  // 3. Extension match (extension wins over content sniffing)
  else if (MacroImporterRegistry.findByExtension(probe.extension)) {
    const byExtension = MacroImporterRegistry.findByExtension(probe.extension)!;
    result = byExtension.import(probe, effectiveName, options);
  }
  // 4. Native extension check (.macro.json, .json)
  else if (MacroImporterRegistry.isNativeExtension(probe.extension)) {
    result = importNativeOrLegacyJson(probe, effectiveName, options);
  }
  // 5. Content sniffing in priority order (TinyTask 60 > Razer 50 > AMC 40 > AHK 20 > AutoIt 15 > Jitbit 10)
  else if (MacroImporterRegistry.findBySniff(probe)) {
    const sniffed = MacroImporterRegistry.findBySniff(probe)!;
    result = sniffed.import(probe, effectiveName, options);
  }
  // 6. JSON fallback
  else {
    result = importNativeOrLegacyJson(probe, effectiveName, options);
  }

  // Apply folder, naming collision handling, and disabled state
  const warnings: MacroImportWarning[] = [...result.warnings];
  const finalFolder = normalizeFolder(options?.destinationFolder);

  for (const macro of result.macros) {
    const mutableMacro = macro as {
      folder?: string;
      isEnabled?: boolean;
      name?: string;
    };
    if (finalFolder) {
      mutableMacro.folder = finalFolder;
    }
    if (options?.isEnabled !== undefined) {
      mutableMacro.isEnabled = options.isEnabled;
    } else {
      mutableMacro.isEnabled = false;
    }

    if (options?.takenNames) {
      const requested = macro.name;
      const unique = resolveUniqueName(requested, options.takenNames);
      if (unique !== requested) {
        mutableMacro.name = unique;
        warnings.push({
          line: null,
          message: format(
            t('The name “{0}” is already taken; the macro was saved as “{1}”.'),
            requested,
            unique,
          ),
        });
      }
    }
  }

  return {
    format: result.format,
    macros: result.macros,
    warnings,
  };
}

function importNativeOrLegacyJson(
  probe: ImportProbe,
  name: string,
  options?: ImportOptions,
): MacroImportResult {
  const nativeImporter = new NativeJsonImporter();
  const legacyImporter = new LegacyMacroImporter();

  if (nativeImporter.canHandle(probe)) {
    return nativeImporter.import(probe, name, options);
  }
  if (legacyImporter.canHandle(probe)) {
    return legacyImporter.import(probe, name, options);
  }

  // If text is valid JSON with schemaVersion
  try {
    const obj = JSON.parse(probe.text);
    if (typeof obj === 'object' && obj !== null) {
      if (
        'schemaVersion' in obj ||
        'SchemaVersion' in obj ||
        'schemaversion' in obj
      ) {
        return nativeImporter.import(probe, name, options);
      }
      return legacyImporter.import(probe, name, options);
    }
  } catch {
    // Not valid JSON
  }

  throw new Error(t('Empty macro file'));
}
