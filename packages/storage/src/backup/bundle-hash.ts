/**
 * Canonical archive bundle hashing for .mrbackup packages.
 */

import * as crypto from 'node:crypto';
import type { BackupMacroEntry } from './types.js';

/**
 * Computes canonical SHA-256 bundle hash for library backup entries:
 * 1. Entries are sorted ordinally by entry name (case-sensitive code-point comparison).
 * 2. For each entry: sha.update(utf8(entry.name + "\n")) followed by sha.update(entry.bytes).
 * 3. Returns lowercase hexadecimal digest string.
 */
export function computeBundleHash(entries: readonly BackupMacroEntry[]): string {
  // Sort ordinally by entry name: string.CompareOrdinal equivalent
  const sorted = entries.slice().sort((left, right) => {
    if (left.name < right.name) return -1;
    if (left.name > right.name) return 1;
    return 0;
  });

  const sha = crypto.createHash('sha256');

  for (const entry of sorted) {
    const header = Buffer.from(`${entry.name}\n`, 'utf-8');
    sha.update(header);
    sha.update(entry.bytes);
  }

  return sha.digest('hex').toLowerCase();
}
