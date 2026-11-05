/**
 * Path manipulation, folder normalization, sanitization, and security validations.
 */

import * as path from 'node:path';
import {
  MAXIMUM_FOLDER_DEPTH,
  MAXIMUM_NAME_LENGTH,
  MACRO_EXTENSION,
  RESERVED_FILE_NAMES,
} from './constants.js';

// Windows invalid filename characters: < > : " / \ | ? * and ASCII 0-31
function isInvalidFileNameChar(ch: string): boolean {
  const code = ch.charCodeAt(0);
  if (code < 32) return true;
  return '<>:"/\\|?*'.includes(ch);
}

const RESERVED_NAMES_SET = new Set(RESERVED_FILE_NAMES.map((name) => name.toLowerCase()));

/**
 * Sanitizes a macro or folder name into a safe Windows filename.
 */
export function sanitizeName(value: string | null | undefined, fallback = 'macro'): string {
  let text = Array.from(value ?? '')
    .map((ch) => (isInvalidFileNameChar(ch) ? '_' : ch))
    .join('');

  text = text
    .trim()
    .replace(/[. ]+$/, '')
    .trim();

  if (text.length > MAXIMUM_NAME_LENGTH) {
    text = text
      .slice(0, MAXIMUM_NAME_LENGTH)
      .replace(/[. ]+$/, '')
      .trim();
  }

  if (text.length === 0) {
    return fallback;
  }

  if (RESERVED_NAMES_SET.has(text.toLowerCase())) {
    return text + '_';
  }

  return text;
}

/**
 * Returns the standard file name for a macro definition.
 */
export function fileNameFor(macroName: string): string {
  return sanitizeName(macroName, 'macro') + MACRO_EXTENSION;
}

/**
 * Extracts the display name from a macro file path.
 */
export function displayNameFromPath(filePath: string): string {
  const name = path.basename(filePath);
  if (name.toLowerCase().endsWith(MACRO_EXTENSION.toLowerCase())) {
    return name.slice(0, -MACRO_EXTENSION.length);
  }
  return path.parse(name).name;
}

/**
 * Normalizes a relative folder path:
 * - strips leading/trailing separators
 * - strips "." and ".." navigation (prevents path escape)
 * - sanitizes each folder segment
 * - caps nesting at MAXIMUM_FOLDER_DEPTH (8 levels)
 * - returns empty string for the library root
 */
export function normalizeFolder(relativePath?: string | null): string {
  if (!relativePath || typeof relativePath !== 'string' || relativePath.trim().length === 0) {
    return '';
  }

  const segments = relativePath
    .replace(/[\\/]+/g, '/')
    .split('/')
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && s !== '.' && s !== '..')
    .map((s) => sanitizeName(s, 'New folder'))
    .slice(0, MAXIMUM_FOLDER_DEPTH);

  return segments.join(path.sep);
}

/**
 * Combines a parent relative folder path and a child folder name.
 */
export function combineFolder(parent: string, name: string): string {
  const normParent = normalizeFolder(parent);
  const safeName = sanitizeName(name, 'New folder');
  return normParent.length === 0 ? safeName : path.join(normParent, safeName);
}

/**
 * Returns the parent folder relative path.
 */
export function parentFolder(relativePath: string): string {
  const normalized = normalizeFolder(relativePath);
  const idx = normalized.lastIndexOf(path.sep);
  return idx < 0 ? '' : normalized.slice(0, idx);
}

/**
 * Returns the base name of a relative folder path.
 */
export function folderName(relativePath: string): string {
  const normalized = normalizeFolder(relativePath);
  if (normalized.length === 0) return '';
  const parts = normalized.split(path.sep);
  return parts[parts.length - 1] ?? '';
}

/**
 * Returns the nesting level (depth) of a relative folder path (0 for root).
 */
export function folderDepth(relativePath: string): number {
  const normalized = normalizeFolder(relativePath);
  return normalized.length === 0 ? 0 : normalized.split(path.sep).length;
}

/**
 * Returns true if candidate equals folder or is nested inside folder.
 */
export function isSameOrInside(candidate: string, folder: string): boolean {
  const normCandidate = normalizeFolder(candidate);
  const normFolder = normalizeFolder(folder);

  if (normFolder.length === 0) return true;
  if (normCandidate.length < normFolder.length) return false;
  if (!normCandidate.toLowerCase().startsWith(normFolder.toLowerCase())) return false;

  return (
    normCandidate.length === normFolder.length ||
    normCandidate[normFolder.length] === path.sep ||
    normCandidate[normFolder.length] === '/'
  );
}

/**
 * Returns true if absolute or relative candidatePath is identical to or located
 * inside folderPath on disk.
 */
export function isSameOrInsidePath(candidatePath: string, folderPath: string): boolean {
  const fullBase = path.resolve(folderPath).replace(/[\\/]+$/, '');
  const fullTarget = path.resolve(candidatePath).replace(/[\\/]+$/, '');

  return (
    fullTarget.toLowerCase() === fullBase.toLowerCase() ||
    fullTarget.toLowerCase().startsWith(fullBase.toLowerCase() + path.sep)
  );
}

/**
 * Returns true if two paths resolve to the same location (case-insensitive on Windows).
 */
export function pathEquals(left?: string | null, right?: string | null): boolean {
  if (!left || !right) return false;
  return (
    path
      .resolve(left)
      .replace(/[\\/]+$/, '')
      .toLowerCase() ===
    path
      .resolve(right)
      .replace(/[\\/]+$/, '')
      .toLowerCase()
  );
}

/**
 * Validates that targetPath does not escape basePath. Throws error if path escape detected.
 */
export function validatePathSafety(basePath: string, targetPath: string): string {
  const resolvedBase = path.resolve(basePath);
  const resolvedTarget = path.resolve(resolvedBase, targetPath);

  if (!isSameOrInsidePath(resolvedTarget, resolvedBase)) {
    throw new Error(`Path escape rejected: "${targetPath}" is outside "${basePath}".`);
  }

  return resolvedTarget;
}

/**
 * Generates the next available unique name: "Macro", "Macro 2", "Macro 3", etc.
 */
export function nextFreeName(desiredName: string, taken: ReadonlySet<string>): string {
  const baseName = sanitizeName(desiredName, 'New macro');
  const isTaken = (name: string) => taken.has(name.toLowerCase());

  if (!isTaken(baseName)) return baseName;

  for (let number = 2; number < 100_000; number++) {
    const suffix = ` ${number}`;
    const head =
      baseName.length + suffix.length > MAXIMUM_NAME_LENGTH
        ? baseName.slice(0, MAXIMUM_NAME_LENGTH - suffix.length).trimEnd()
        : baseName;
    const candidate = sanitizeName(head + suffix, baseName + suffix);
    if (!isTaken(candidate)) return candidate;
  }

  return baseName;
}
