/**
 * Implementation of .mrmacro portable macro package container.
 * Handles ZIP container layout, manifest versioning, canonical SHA-256 integrity verification,
 * DPI coordinate rescaling, disabled-on-import behavior, ID regeneration, and name disambiguation.
 */

import * as fs from 'node:fs';
import * as crypto from 'node:crypto';

import {
  CURRENT_SCHEMA_VERSION,
  MacroEventType,
  MacroImportFormat,
  TargetMode,
  createDefaultMacroDefinition,
  parseMacroDefinition,
  toWireMacroDefinition,
  type MacroDefinition,
  type MacroImportResult,
  type MacroImportWarning,
} from '../../../contracts/src/index.js';

import { format, t } from '../../../localization/src/index.js';
import { atomicWriteFile } from '../atomic/atomic-file.js';
import { normalizeMacroEvents } from '../library/event-normalization.js';
import { displayNameFromPath, normalizeFolder, sanitizeName } from '../library/path-utils.js';

import { rescaleForDpi } from './dpi.js';
import {
  MAXIMUM_EVENT_COUNT,
  MAXIMUM_MANIFEST_BYTES,
  MAXIMUM_PORTABLE_JSON_BYTES,
  PORTABLE_EXTENSION,
  PORTABLE_FORMAT_ID,
  PORTABLE_FORMAT_VERSION,
  type ExportPortableOptions,
  type ImportPortableOptions,
  type PortableMacroManifest,
} from './types.js';
import {
  assertSafeZipEntryPath,
  createZipArchive,
  hasZipSignature,
  readZipArchive,
} from './zip.js';

/**
 * Creates a safe filename for a portable macro package by sanitizing illegal characters
 * and appending .mrmacro.
 */
export function createPortableFileName(macroName: string): string {
  let safe = Array.from(macroName ?? '')
    .map((ch) => {
      const code = ch.charCodeAt(0);
      if (code < 32 || '<>:"/\\|?*'.includes(ch)) {
        return '_';
      }
      return ch;
    })
    .join('')
    .trim()
    .replace(/\.+$/, '')
    .trim();

  if (safe.length === 0) {
    safe = 'macro';
  }
  return `${safe}${PORTABLE_EXTENSION}`;
}

/**
 * Packs a single MacroDefinition into a versioned .mrmacro ZIP archive.
 * Includes manifest.json and macro.json with SHA-256 checksum and sourceDpi.
 */
export async function exportPortablePackage(
  macro: MacroDefinition,
  targetPath: string,
  options?: ExportPortableOptions,
): Promise<void> {
  const currentDisplayDpi = options?.currentDisplayDpi ?? 96;
  const macroSchemaVersion = macro.schemaVersion || CURRENT_SCHEMA_VERSION;
  const createdAtUtc = options?.createdAtUtc ?? new Date().toISOString();

  // Update schemaVersion on definition
  const exportDef: MacroDefinition = {
    ...macro,
    schemaVersion: CURRENT_SCHEMA_VERSION,
  };

  // Wire serialization (default: camelCase per MRMACRO_FORMAT.md specification)
  const usePascalCase = options?.pascalCase ?? false;
  const wire = toWireMacroDefinition(exportDef, usePascalCase);
  const jsonText = JSON.stringify(wire, null, 2) + '\n';
  const macroBytes = Buffer.from(jsonText, 'utf-8');

  const macroSha256 = crypto.createHash('sha256').update(macroBytes).digest('hex').toLowerCase();

  const manifest: PortableMacroManifest = {
    format: PORTABLE_FORMAT_ID,
    formatVersion: PORTABLE_FORMAT_VERSION,
    macroSchemaVersion,
    createdAtUtc,
    macroEntry: 'macro.json',
    macroSha256,
    sourceDpi: currentDisplayDpi,
  };

  const manifestBytes = Buffer.from(JSON.stringify(manifest, null, 2) + '\n', 'utf-8');

  const zipBuffer = createZipArchive(
    [
      { name: 'manifest.json', data: manifestBytes },
      { name: manifest.macroEntry, data: macroBytes },
    ],
    { date: options?.archiveDate },
  );

  await atomicWriteFile(targetPath, zipBuffer, { backup: false });
}

/**
 * Imports a portable macro package (.mrmacro).
 * Rejects corrupt, modified, or path-traversal packages before extraction.
 * Applies DPI rescaling, disables on import, regenerates ID, and optionally
 * stores into a MacroLibraryStore with name disambiguation.
 */
export async function importPortablePackage(
  sourcePath: string,
  options?: ImportPortableOptions,
): Promise<MacroImportResult> {
  const isZip = await hasZipSignature(sourcePath);
  if (!isZip) {
    throw new Error(t('This file is not a Macro Recorder package.'));
  }

  const buffer = await fs.promises.readFile(sourcePath);
  const entries = readZipArchive(buffer);

  // 1. Validate manifest.json existence and limits
  const manifestBytes = entries.get('manifest.json');
  if (!manifestBytes) {
    throw new Error(t('The .mrmacro package has no manifest.json.'));
  }
  if (manifestBytes.length > MAXIMUM_MANIFEST_BYTES) {
    throw new Error(t('A file inside the .mrmacro package is too large.'));
  }

  let manifest: PortableMacroManifest;
  try {
    manifest = JSON.parse(manifestBytes.toString('utf-8')) as PortableMacroManifest;
  } catch {
    throw new Error(t('The .mrmacro manifest could not be read.'));
  }

  // 2. Validate manifest signature and versioning
  if (manifest.format !== PORTABLE_FORMAT_ID) {
    throw new Error(t('This file is not a Macro Recorder package.'));
  }
  if (
    typeof manifest.formatVersion !== 'number' ||
    manifest.formatVersion < 1 ||
    manifest.formatVersion > PORTABLE_FORMAT_VERSION
  ) {
    throw new Error(
      format(
        t('.mrmacro package version {0} is not supported by this application version.'),
        manifest.formatVersion,
      ),
    );
  }
  if (manifest.macroSchemaVersion > CURRENT_SCHEMA_VERSION) {
    throw new Error(
      format(
        t('Macro schema version {0} is newer than supported version {1}. Update Macro Recorder.'),
        manifest.macroSchemaVersion,
        CURRENT_SCHEMA_VERSION,
      ),
    );
  }

  // 3. Validate macro entry pointer
  if (
    !manifest.macroEntry ||
    typeof manifest.macroEntry !== 'string' ||
    manifest.macroEntry.trim() === ''
  ) {
    throw new Error(t('The .mrmacro manifest does not identify the macro payload.'));
  }
  assertSafeZipEntryPath(manifest.macroEntry);

  const macroBytes = entries.get(manifest.macroEntry);
  if (!macroBytes) {
    throw new Error(t('The .mrmacro package has no macro.json.'));
  }
  if (macroBytes.length > MAXIMUM_PORTABLE_JSON_BYTES) {
    throw new Error(t('A file inside the .mrmacro package is too large.'));
  }

  // 4. Validate SHA-256 integrity of macro.json
  const actualHash = crypto.createHash('sha256').update(macroBytes).digest('hex').toLowerCase();
  const expectedHash = (manifest.macroSha256 ?? '').toLowerCase();
  if (actualHash !== expectedHash) {
    throw new Error(
      t('The .mrmacro checksum does not match; the file is damaged or has been modified.'),
    );
  }

  // 5. Parse macro payload
  let rawJson: unknown;
  try {
    rawJson = JSON.parse(macroBytes.toString('utf-8'));
  } catch {
    throw new Error(t('The .mrmacro package does not contain a macro.'));
  }

  const parsed = parseMacroDefinition(rawJson);
  if (!parsed.success) {
    throw new Error(t('The .mrmacro package does not contain a macro.'));
  }

  let macro = parsed.data;
  if (macro.schemaVersion > CURRENT_SCHEMA_VERSION) {
    throw new Error(
      format(
        t('Macro schema version {0} is newer than supported version {1}. Update Macro Recorder.'),
        macro.schemaVersion,
        CURRENT_SCHEMA_VERSION,
      ),
    );
  }
  if (macro.events.length > MAXIMUM_EVENT_COUNT) {
    throw new Error(format(t('The macro contains too many actions: {0}.'), macro.events.length));
  }

  // 6. Inspect settings and collect portability warnings
  const warnings: MacroImportWarning[] = [];
  if (macro.playback.targetMode === TargetMode.SpecificWindow) {
    warnings.push({
      message: t(
        'The target window is computer-specific. Select it again before enabling the macro.',
      ),
    });
  }

  // 7. DPI coordinate rescaling
  const currentDpi = options?.currentDisplayDpi ?? options?.store?.currentDisplayDpi ?? 96;
  const dpiResult = rescaleForDpi(macro, manifest.sourceDpi, currentDpi);

  if (dpiResult.rescaled) {
    macro = dpiResult.macro;
    warnings.push({
      message: format(
        t(
          'Screen coordinates were rescaled from DPI {0} to {1}. Verify them for a different monitor layout.',
        ),
        manifest.sourceDpi,
        currentDpi,
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
      message: t(
        'The macro contains screen coordinates. Verify them when using a different resolution, DPI, or monitor layout.',
      ),
    });
  }

  // 8. Prepare imported macro (new ID, disabled by default, normalize events and names)
  const fallbackName = displayNameFromPath(sourcePath);
  const safeName = sanitizeName(macro.name, sanitizeName(fallbackName, t('New macro')));
  const normalizedEvents = normalizeMacroEvents(macro.events);

  macro = createDefaultMacroDefinition({
    ...macro,
    id: crypto.randomUUID(),
    isEnabled: false,
    name: safeName,
    events: normalizedEvents,
    storagePath: undefined,
  });

  // 9. Store into library store if provided, handling name disambiguation
  if (options?.store) {
    const targetFolder = normalizeFolder(options.targetFolder ?? '');
    (macro as { folder: string }).folder = targetFolder;
    const requestedName = macro.name;

    await options.store.save(macro);

    if (requestedName !== macro.name) {
      warnings.push({
        message: format(
          t('The name “{0}” is already taken; the macro was saved as “{1}”.'),
          requestedName,
          macro.name,
        ),
      });
    }
  }

  return {
    format: MacroImportFormat.MacroPackage,
    macros: [macro],
    warnings,
  };
}
