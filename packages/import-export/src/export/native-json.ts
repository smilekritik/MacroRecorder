/**
 * Native JSON exporter (.macro.json).
 *
 * Exports a single MacroDefinition to open schema 12 JSON representation.
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import {
  type MacroDefinition,
  toWireMacroDefinition,
  parseMacroDefinition,
} from '../../../contracts/src/index.js';

/**
 * Exports a macro definition to formatted Native JSON string.
 */
export function exportNativeJson(
  macro: MacroDefinition | Record<string, unknown>,
  indent = 2,
): string {
  let wireObj: Record<string, unknown>;

  if ('schemaVersion' in macro || 'SchemaVersion' in macro) {
    const rec = macro as Record<string, unknown>;
    if ('schemaVersion' in rec && typeof rec['schemaVersion'] === 'number') {
      wireObj = toWireMacroDefinition(macro as MacroDefinition, true);
    } else {
      // Already wire / PascalCase shape
      wireObj = rec;
    }
  } else {
    // Attempt parse
    const parsed = parseMacroDefinition(macro);
    if (parsed.success) {
      wireObj = toWireMacroDefinition(parsed.data, true);
    } else {
      wireObj = macro as Record<string, unknown>;
    }
  }

  return JSON.stringify(wireObj, null, indent) + '\n';
}

/**
 * Writes exported Native JSON macro to disk.
 */
export async function exportNativeJsonToFile(
  macro: MacroDefinition | Record<string, unknown>,
  filePath: string,
  indent = 2,
): Promise<void> {
  const content = exportNativeJson(macro, indent);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, content, 'utf8');
}

/**
 * Compatibility class for Native JSON exporter.
 */
export class NativeJsonExporter {
  public static export(macro: MacroDefinition | Record<string, unknown>, indent = 2): string {
    return exportNativeJson(macro, indent);
  }

  public static async exportToFile(
    macro: MacroDefinition | Record<string, unknown>,
    filePath: string,
    indent = 2,
  ): Promise<void> {
    return exportNativeJsonToFile(macro, filePath, indent);
  }
}
