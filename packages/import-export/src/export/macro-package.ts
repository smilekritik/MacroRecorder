/**
 * Macro Package (.mrmacro) portable container exporter.
 *
 * Packages a single macro and manifest into a versioned, SHA-256 verified ZIP container.
 */

import * as crypto from 'node:crypto';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import {
  type MacroDefinition,
  toWireMacroDefinition,
  parseMacroDefinition,
} from '../../../contracts/src/index.js';

import { type MacroPackageExportOptions } from './types.js';
import { createZipArchive } from './zip-writer.js';

export const MACRO_PACKAGE_FORMAT_ID = 'macro-recorder/macro-package';
export const MACRO_PACKAGE_FORMAT_VERSION = 1;

/**
 * Computes bundle SHA-256 hash matching MacroLibraryStore.ComputeBundleHash:
 * Entries sorted ordinally by name; for each entry: UTF-8 (name + "\n") followed by file bytes.
 */
export function computeBundleHash(
  entries: readonly { readonly name: string; readonly bytes: Buffer }[],
): string {
  const sorted = [...entries].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  const hasher = crypto.createHash('sha256');

  for (const entry of sorted) {
    hasher.update(Buffer.from(entry.name + '\n', 'utf8'));
    hasher.update(entry.bytes);
  }

  return hasher.digest('hex').toLowerCase();
}

/**
 * Exports a macro definition to a .mrmacro ZIP package buffer.
 */
export function exportMacroPackage(
  macro: MacroDefinition | Record<string, unknown>,
  options?: MacroPackageExportOptions,
): Buffer {
  let wireMacro: Record<string, unknown>;

  if ('schemaVersion' in macro || 'SchemaVersion' in macro) {
    const rec = macro as Record<string, unknown>;
    if ('schemaVersion' in rec && typeof rec['schemaVersion'] === 'number') {
      wireMacro = toWireMacroDefinition(macro as MacroDefinition, true);
    } else {
      wireMacro = rec;
    }
  } else {
    const parsed = parseMacroDefinition(macro);
    if (parsed.success) {
      wireMacro = toWireMacroDefinition(parsed.data, true);
    } else {
      wireMacro = macro as Record<string, unknown>;
    }
  }

  const macroJsonStr = JSON.stringify(wireMacro, null, 2) + '\n';
  const macroBytes = Buffer.from(macroJsonStr, 'utf8');

  const macroSha256 = crypto.createHash('sha256').update(macroBytes).digest('hex').toLowerCase();
  const createdAtUtc = options?.createdAtUtc ?? new Date().toISOString();
  const formatVersion = options?.formatVersion ?? MACRO_PACKAGE_FORMAT_VERSION;
  const macroSchemaVersion =
    options?.macroSchemaVersion ??
    Number(wireMacro['SchemaVersion'] ?? wireMacro['schemaVersion'] ?? 12);
  const sourceDpi = options?.sourceDpi ?? 96;

  const manifest = {
    format: MACRO_PACKAGE_FORMAT_ID,
    formatVersion,
    macroSchemaVersion,
    createdAtUtc,
    macroEntry: 'macro.json',
    macroSha256,
    sourceDpi,
  };

  const manifestJsonStr = JSON.stringify(manifest, null, 2) + '\n';
  const manifestBytes = Buffer.from(manifestJsonStr, 'utf8');

  return createZipArchive(
    [
      { name: 'manifest.json', data: manifestBytes },
      { name: 'macro.json', data: macroBytes },
    ],
    {
      fixedDate: options?.fixedDate,
      compress: true,
    },
  );
}

/**
 * Writes exported .mrmacro package to disk.
 */
export async function exportMacroPackageToFile(
  macro: MacroDefinition | Record<string, unknown>,
  filePath: string,
  options?: MacroPackageExportOptions,
): Promise<void> {
  const buffer = exportMacroPackage(macro, options);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, buffer);
}

/**
 * Compatibility class for Macro Package exporter.
 */
export class MacroPackageExporter {
  public static export(
    macro: MacroDefinition | Record<string, unknown>,
    options?: MacroPackageExportOptions,
  ): Buffer {
    return exportMacroPackage(macro, options);
  }

  public static async exportToFile(
    macro: MacroDefinition | Record<string, unknown>,
    filePath: string,
    options?: MacroPackageExportOptions,
  ): Promise<void> {
    return exportMacroPackageToFile(macro, filePath, options);
  }
}
