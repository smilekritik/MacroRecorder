/**
 * Macro Recorder Rewrite - Golden Compatibility Fixtures
 * 
 * Provides typed access, absolute file path resolution, file loaders,
 * and SHA-256 integrity verification for immutable legacy fixtures.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const FIXTURES_ROOT = __dirname;

export interface FixtureEntry {
  path: string;
  category: string;
  sha256: string;
  sizeBytes: number;
}

export interface FixtureManifest {
  version: number;
  createdAtUtc: string;
  fixtureCount: number;
  fixtures: FixtureEntry[];
}

export type ChecksumsMap = Record<string, string>;

/**
 * Returns the absolute path to a fixture given its relative path from fixtures root.
 */
export function getFixturePath(relativePath: string): string {
  const normalized = relativePath.replace(/\\/g, '/');
  return path.resolve(FIXTURES_ROOT, normalized);
}

/**
 * Reads a fixture as a UTF-8 string.
 */
export function loadFixtureText(relativePath: string): string {
  const filePath = getFixturePath(relativePath);
  return fs.readFileSync(filePath, 'utf-8');
}

/**
 * Reads and parses a fixture as JSON.
 */
export function loadFixtureJson<T = unknown>(relativePath: string): T {
  const text = loadFixtureText(relativePath);
  return JSON.parse(text) as T;
}

/**
 * Reads a fixture as a binary Buffer.
 */
export function loadFixtureBuffer(relativePath: string): Buffer {
  const filePath = getFixturePath(relativePath);
  return fs.readFileSync(filePath);
}

/**
 * Computes the SHA-256 hash of a file on disk.
 */
export function computeFileSha256(filePath: string): string {
  const buffer = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(buffer).digest('hex').toLowerCase();
}

/**
 * Loads the complete checksums map.
 */
export function loadChecksums(): ChecksumsMap {
  return loadFixtureJson<ChecksumsMap>('checksums.json');
}

/**
 * Loads the complete manifest.
 */
export function loadManifest(): FixtureManifest {
  return loadFixtureJson<FixtureManifest>('manifest.json');
}

/**
 * Verifies that a specific fixture file matches its recorded SHA-256 hash.
 */
export function verifyFixtureHash(relativePath: string): boolean {
  const normalized = relativePath.replace(/\\/g, '/');
  const checksums = loadChecksums();
  const expectedHash = checksums[normalized];
  if (!expectedHash) {
    throw new Error(`No checksum found in checksums.json for fixture: ${normalized}`);
  }
  const fullPath = getFixturePath(normalized);
  const actualHash = computeFileSha256(fullPath);
  return actualHash === expectedHash;
}

/**
 * Verifies that all fixtures match their recorded SHA-256 hashes.
 */
export function verifyAllFixtures(): { valid: boolean; errors: string[] } {
  const checksums = loadChecksums();
  const errors: string[] = [];

  for (const [relPath, expectedHash] of Object.entries(checksums)) {
    const fullPath = getFixturePath(relPath);
    if (!fs.existsSync(fullPath)) {
      errors.push(`Missing fixture file: ${relPath}`);
      continue;
    }
    const actualHash = computeFileSha256(fullPath);
    if (actualHash !== expectedHash) {
      errors.push(
        `SHA-256 drift for ${relPath}! Expected: ${expectedHash}, Actual: ${actualHash}`
      );
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

// Canonical Fixture Paths
export const SCHEMA_FIXTURES = {
  CURRENT_SCHEMA_12: 'schemas/schema-12-current.macro.json',
  CURRENT_SCHEMA_12_EXPECTED: 'schemas/schema-12-current.expected.json',
  PACKAGE_SCHEMA_11: 'schemas/schema-11-package.macro.json',
  PACKAGE_SCHEMA_11_EXPECTED: 'schemas/schema-11-package.expected.json',
  ANNOTATIONS_SCHEMA_10: 'schemas/schema-10-annotations.macro.json',
  ANNOTATIONS_SCHEMA_10_EXPECTED: 'schemas/schema-10-annotations.expected.json',
  LEGACY_SCHEMA_9: 'schemas/schema-09-legacy.macro.json',
  LEGACY_SCHEMA_9_EXPECTED: 'schemas/schema-09-legacy.expected.json',
  LEGACY_SCHEMA_4_5: 'schemas/schema-04-05-legacy.macro.json',
  LEGACY_SCHEMA_4_5_EXPECTED: 'schemas/schema-04-05-legacy.expected.json',
  LEGACY_UNVERSIONED: 'schemas/legacy-recorder-unversioned.json',
  LEGACY_UNVERSIONED_EXPECTED: 'schemas/legacy-recorder-unversioned.expected.json',
  EDGE_MINIMAL: 'schemas/edge-minimal-defaults.macro.json',
  EDGE_MINIMAL_EXPECTED: 'schemas/edge-minimal-defaults.expected.json',
  EDGE_CASE_INSENSITIVE: 'schemas/edge-case-insensitive-schema.macro.json',
  EDGE_CASE_INSENSITIVE_EXPECTED: 'schemas/edge-case-insensitive-schema.expected.json',
  EDGE_FUTURE_FIELDS: 'schemas/edge-future-unknown-fields.macro.json',
  EDGE_FUTURE_FIELDS_EXPECTED: 'schemas/edge-future-unknown-fields.expected.json',
  EDGE_REPEAT_FOREVER: 'schemas/edge-repeat-forever-toggle.macro.json',
  EDGE_REPEAT_FOREVER_EXPECTED: 'schemas/edge-repeat-forever-toggle.expected.json',
  EDGE_ALL_EVENTS: 'schemas/edge-all-event-types.macro.json',
  EDGE_ALL_EVENTS_EXPECTED: 'schemas/edge-all-event-types.expected.json',
} as const;

export const PACKAGE_FIXTURES = {
  VALID_MRMACRO: 'packages/valid.mrmacro',
  VALID_MRMACRO_MANIFEST: 'packages/valid.mrmacro.manifest.json',
  VALID_MRMACRO_EXPECTED: 'packages/valid.mrmacro.expected.json',
  VALID_MRMACRO_WARNINGS: 'packages/valid.mrmacro.expected.warnings.json',
  TAMPERED_CHECKSUM_MRMACRO: 'packages/tampered-checksum.mrmacro',
  TAMPERED_VERSION_MRMACRO: 'packages/tampered-manifest-unsupported-version.mrmacro',
  TAMPERED_FORMAT_MRMACRO: 'packages/tampered-manifest-bad-format.mrmacro',
  TAMPERED_MISSING_MACRO: 'packages/tampered-missing-macro.mrmacro',
  VALID_MRBACKUP: 'packages/valid.mrbackup',
  VALID_MRBACKUP_MANIFEST: 'packages/valid.mrbackup.manifest.json',
  VALID_MRBACKUP_EXPECTED: 'packages/valid.mrbackup.expected.json',
  TAMPERED_CHECKSUM_MRBACKUP: 'packages/tampered-checksum.mrbackup',
  TAMPERED_FORMAT_MRBACKUP: 'packages/tampered-manifest-bad-format.mrbackup',
  TAMPERED_MISSING_MANIFEST_MRBACKUP: 'packages/tampered-missing-manifest.mrbackup',
} as const;

export const IMPORTER_FIXTURES = {
  NATIVE_JSON: 'importers/native-json/sample.macro.json',
  NATIVE_JSON_EXPECTED: 'importers/native-json/sample.macro.expected.json',
  NATIVE_JSON_WARNINGS: 'importers/native-json/sample.macro.expected.warnings.json',
  LEGACY_JSON: 'importers/legacy-json/sample-legacy.json',
  LEGACY_JSON_EXPECTED: 'importers/legacy-json/sample-legacy.expected.json',
  LEGACY_JSON_WARNINGS: 'importers/legacy-json/sample-legacy.expected.warnings.json',
  AUTOHOTKEY: 'importers/autohotkey/sample.ahk',
  AUTOHOTKEY_EXPECTED: 'importers/autohotkey/sample.expected.json',
  AUTOHOTKEY_WARNINGS: 'importers/autohotkey/sample.expected.warnings.json',
  AUTOHOTKEY_COMMENTS: 'importers/autohotkey/comments.ahk',
  AUTOHOTKEY_COMMENTS_EXPECTED: 'importers/autohotkey/comments.expected.json',
  AUTOHOTKEY_COMMENTS_WARNINGS: 'importers/autohotkey/comments.expected.warnings.json',
  AMC: 'importers/amc/sample.amc',
  AMC_EXPECTED: 'importers/amc/sample.expected.json',
  AMC_WARNINGS: 'importers/amc/sample.expected.warnings.json',
  JITBIT_MRF: 'importers/jitbit-mrf/sample.mrf',
  JITBIT_MRF_EXPECTED: 'importers/jitbit-mrf/sample.expected.json',
  JITBIT_MRF_WARNINGS: 'importers/jitbit-mrf/sample.expected.warnings.json',
  AUTOIT: 'importers/autoit/sample.au3',
  AUTOIT_EXPECTED: 'importers/autoit/sample.expected.json',
  AUTOIT_WARNINGS: 'importers/autoit/sample.expected.warnings.json',
  RAZER: 'importers/razer/sample.xml',
  RAZER_EXPECTED: 'importers/razer/sample.expected.json',
  RAZER_WARNINGS: 'importers/razer/sample.expected.warnings.json',
  TINYTASK: 'importers/tinytask/sample.rec',
  TINYTASK_EXPECTED: 'importers/tinytask/sample.expected.json',
  TINYTASK_WARNINGS: 'importers/tinytask/sample.expected.warnings.json',
  MACRO_PACKAGE: 'importers/macro-package/sample.mrmacro',
  MACRO_PACKAGE_EXPECTED: 'importers/macro-package/sample.expected.json',
  MACRO_PACKAGE_WARNINGS: 'importers/macro-package/sample.expected.warnings.json',
  LIBRARY_BACKUP: 'importers/library-backup/sample.mrbackup',
  LIBRARY_BACKUP_EXPECTED: 'importers/library-backup/sample.expected.json',
  LIBRARY_BACKUP_WARNINGS: 'importers/library-backup/sample.expected.warnings.json',
} as const;

export const EXPORTER_FIXTURES = {
  AUTOHOTKEY_SOURCE: 'exporters/autohotkey-v2/source.macro.json',
  AUTOHOTKEY_EXPECTED: 'exporters/autohotkey-v2/expected.ahk',
  DIAGNOSTICS_CSV_SOURCE: 'exporters/diagnostics-csv/source-receipts.json',
  DIAGNOSTICS_CSV_EXPECTED: 'exporters/diagnostics-csv/expected.csv',
  DIAGNOSTICS_JSON_SOURCE: 'exporters/diagnostics-json/source-receipts.json',
  DIAGNOSTICS_JSON_EXPECTED: 'exporters/diagnostics-json/expected.json',
  DIAGNOSTIC_BUNDLE_SOURCE: 'exporters/diagnostic-bundle/source-timing.json',
  DIAGNOSTIC_BUNDLE_EXPECTED: 'exporters/diagnostic-bundle/expected-bundle.zip',
  NATIVE_JSON_SOURCE: 'exporters/native-json/source.macro.json',
  NATIVE_JSON_EXPECTED: 'exporters/native-json/expected.macro.json',
  MACRO_PACKAGE_SOURCE: 'exporters/macro-package/source.macro.json',
  MACRO_PACKAGE_EXPECTED: 'exporters/macro-package/expected.mrmacro',
  LIBRARY_BACKUP_EXPECTED: 'exporters/library-backup/expected.mrbackup',
} as const;

export const DPI_FIXTURES = {
  DPI_96_PACKAGE: 'dpi/source-dpi-96.mrmacro',
  DPI_96_TARGET_144_EXPECTED: 'dpi/source-dpi-96-target-144.expected.json',
  DPI_96_TARGET_144_WARNINGS: 'dpi/source-dpi-96-target-144.expected.warnings.json',
  DPI_144_PACKAGE: 'dpi/source-dpi-144.mrmacro',
  DPI_144_TARGET_96_EXPECTED: 'dpi/source-dpi-144-target-96.expected.json',
  DPI_144_TARGET_96_WARNINGS: 'dpi/source-dpi-144-target-96.expected.warnings.json',
  DPI_OMITTED_PACKAGE: 'dpi/source-dpi-omitted.mrmacro',
  DPI_OMITTED_EXPECTED: 'dpi/source-dpi-omitted.expected.json',
  DPI_OMITTED_WARNINGS: 'dpi/source-dpi-omitted.expected.warnings.json',
} as const;

export const SETTINGS_FIXTURES = {
  DEFAULT_SETTINGS: 'settings/default-settings.json',
  MIGRATED_F12_SETTINGS: 'settings/migrated-f12-to-f11-settings.json',
  MIGRATED_F12_EXPECTED: 'settings/migrated-f12-to-f11-settings.expected.json',
  CLEARABLE_INTENT_SETTINGS: 'settings/clearable-intent-hotkeys-settings.json',
  CLEARABLE_INTENT_EXPECTED: 'settings/clearable-intent-hotkeys-settings.expected.json',
  CUSTOM_OPTIONS_SETTINGS: 'settings/custom-options-settings.json',
} as const;

export const HISTORY_FIXTURES = {
  VALID_HISTORY: 'history/valid-run-history.json',
  VALID_HISTORY_EXPECTED: 'history/valid-run-history.expected.json',
  CORRUPTED_HISTORY: 'history/corrupted-run-history.json',
} as const;

export const RECOVERY_FIXTURES = {
  LEFTOVER_TMP: 'recovery/leftover-atomic-tmp-file.macro.json.tmp',
  CORRUPTED_SYNTAX: 'recovery/corrupted-macro-syntax-error.macro.json',
  DUPLICATE_ID_1: 'recovery/duplicate-ids/macro-1.macro.json',
  DUPLICATE_ID_2: 'recovery/duplicate-ids/macro-2-same-id.macro.json',
  DUPLICATE_IDS_EXPECTED: 'recovery/duplicate-ids/duplicate-ids.expected.json',
  FOLDER_TREE_ROOT: 'recovery/folder-tree/RootMacro.macro.json',
  FOLDER_TREE_GAMING_COMBO: 'recovery/folder-tree/Gaming/Combo.macro.json',
  FOLDER_TREE_SHOOTER_AIM: 'recovery/folder-tree/Gaming/Shooter/Aim.macro.json',
  FOLDER_TREE_WORK_EMAIL: 'recovery/folder-tree/Work/Email.macro.json',
  FOLDER_TREE_WORK_REPORT: 'recovery/folder-tree/Work/Daily/Report.macro.json',
  FOLDER_TREE_EXPECTED: 'recovery/folder-tree/folder-tree.expected.json',
} as const;
