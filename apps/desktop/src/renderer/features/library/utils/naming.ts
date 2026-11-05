/**
 * @macro-recorder/desktop - Library Naming Utilities
 * Resolves unique names across library macros and folders with automatic numeric suffixes.
 */

import { normalizeFolder } from './tree-builder.js';

const INVALID_CHARS_REGEX = /[<>:"/\\|?*\x00-\x1F]/g;

/**
 * Strips invalid filesystem characters from macro/folder names.
 */
export function sanitizeName(name: string, fallback = 'macro'): string {
  const sanitized = name.replace(INVALID_CHARS_REGEX, '').trim();
  return sanitized.length > 0 ? sanitized : fallback;
}

/**
 * Resolves a unique macro name across the entire library.
 * If the desired name is already taken, appends ' 2', ' 3', etc.
 *
 * Example:
 * - 'combo' -> taken -> 'combo 2'
 * - 'combo 2' -> taken -> 'combo 3'
 */
export function resolveUniqueMacroName(
  desiredName: string,
  existingNames: Iterable<string>,
  excludeId?: string,
  macroIdMap?: ReadonlyMap<string, string>, // name -> id
): string {
  const cleanDesired = sanitizeName(desiredName, 'New macro');
  const existingSet = new Set<string>();

  for (const name of existingNames) {
    if (excludeId && macroIdMap && macroIdMap.get(name.toLowerCase()) === excludeId) {
      continue;
    }
    existingSet.add(name.toLowerCase());
  }

  if (!existingSet.has(cleanDesired.toLowerCase())) {
    return cleanDesired;
  }

  // Check if desired name already ends with ' N'
  const match = /^(.*?)(?:\s+(\d+))?$/.exec(cleanDesired);
  const base = match && match[1] ? match[1].trim() : cleanDesired;
  let counter = match && match[2] ? parseInt(match[2], 10) + 1 : 2;

  while (true) {
    const candidate = `${base} ${counter}`;
    if (!existingSet.has(candidate.toLowerCase())) {
      return candidate;
    }
    counter++;
  }
}

/**
 * Resolves a unique folder name within a specific parent folder.
 */
export function resolveUniqueFolderName(
  desiredName: string,
  parentFolderPath: string,
  allFolderPaths: Iterable<string>,
): string {
  const cleanName = sanitizeName(desiredName, 'New folder');
  const parentNorm = normalizeFolder(parentFolderPath);

  const directSiblingFolderNames = new Set<string>();
  for (const fp of allFolderPaths) {
    const norm = normalizeFolder(fp);
    const lastSlash = norm.lastIndexOf('/');
    const p = lastSlash < 0 ? '' : norm.substring(0, lastSlash);
    const n = lastSlash < 0 ? norm : norm.substring(lastSlash + 1);
    if (p.toLowerCase() === parentNorm.toLowerCase()) {
      directSiblingFolderNames.add(n.toLowerCase());
    }
  }

  if (!directSiblingFolderNames.has(cleanName.toLowerCase())) {
    return cleanName;
  }

  const match = /^(.*?)(?:\s+(\d+))?$/.exec(cleanName);
  const base = match && match[1] ? match[1].trim() : cleanName;
  let counter = match && match[2] ? parseInt(match[2], 10) + 1 : 2;

  while (true) {
    const candidate = `${base} ${counter}`;
    if (!directSiblingFolderNames.has(candidate.toLowerCase())) {
      return candidate;
    }
    counter++;
  }
}
