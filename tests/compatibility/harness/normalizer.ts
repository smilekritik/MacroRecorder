/**
 * Semantic normalizer for comparing macro data.
 *
 * Provides deep semantic normalization for macros, events, packages, manifests,
 * warnings, settings, and traces to ensure accurate comparison across language runtimes.
 */

export interface DiffResult {
  match: boolean;
  differences: string[];
}

export class SemanticNormalizer {
  /**
   * Normalizes path separators to POSIX forward slash.
   */
  public normalizePath(pathStr: string): string {
    if (pathStr.includes('\\')) {
      return pathStr.replace(/\\/g, '/');
    }
    return pathStr;
  }

  /**
   * Normalizes UUIDs to lowercase string.
   */
  public normalizeUuid(uuidStr: string): string {
    const lower = uuidStr.toLowerCase();
    if (uuidStr !== lower) {
    }
    return lower;
  }

  /**
   * Normalizes ISO timestamp to canonical ISO-8601 UTC string.
   */
  public normalizeTimestamp(tsStr: string): string {
    try {
      const d = new Date(tsStr);
      if (isNaN(d.getTime())) return tsStr;
      const canonical = d.toISOString();
      if (tsStr !== canonical) {
      }
      return canonical;
    } catch {
      return tsStr;
    }
  }

  /**
   * Recursively normalizes an arbitrary JSON object/array/primitive:
   * - Lowercases UUID keys or string fields matching UUID format
   * - Converts backslashes in paths
   * - Canonicalizes ISO timestamps
   * - Normalizes property names to canonical camelCase or PascalCase for comparison
   */
  public normalizeValue(val: unknown, keyName = ''): unknown {
    if (val === null || val === undefined) return null;

    if (typeof val === 'string') {
      // Check for UUID pattern
      if (/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(val)) {
        return this.normalizeUuid(val);
      }
      // Check for ISO timestamp
      if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(val)) {
        return this.normalizeTimestamp(val);
      }
      // Check for path containing backslash
      if (val.includes('\\') && (keyName.toLowerCase().includes('path') || keyName.toLowerCase().includes('folder') || val.includes('Macros\\'))) {
        return this.normalizePath(val);
      }
      return val;
    }

    if (typeof val === 'number') {
      // Float precision normalization to 3 decimal places
      return Math.round(val * 1000) / 1000;
    }

    if (typeof val === 'boolean') {
      return val;
    }

    if (Array.isArray(val)) {
      return val.map((item) => this.normalizeValue(item, keyName));
    }

    if (typeof val === 'object') {
      const result: Record<string, unknown> = {};
      // Sort keys alphabetically for stable comparison
      const sortedKeys = Object.keys(val as Record<string, unknown>).sort();
      for (const k of sortedKeys) {
        // Lowercase property name internally to bridge PascalCase vs camelCase
        const canonicalKey = k.charAt(0).toLowerCase() + k.slice(1);
        const childVal = (val as Record<string, unknown>)[k];
        result[canonicalKey] = this.normalizeValue(childVal, k);
      }
      return result;
    }

    return val;
  }

  /**
   * Deeply compares two objects with semantic normalization.
   */
  public compareDeep(actual: unknown, expected: unknown, contextPath = '$'): DiffResult {
    const normActual = this.normalizeValue(actual);
    const normExpected = this.normalizeValue(expected);

    const differences: string[] = [];
    this.diffWalk(normActual, normExpected, contextPath, differences);

    return {
      match: differences.length === 0,
      differences,
    };
  }

  private diffWalk(a: unknown, b: unknown, path: string, diffs: string[]): void {
    if (a === b) return;

    if (a === null || a === undefined || b === null || b === undefined) {
      if (a !== b) {
        diffs.push(`${path}: value mismatch (actual: ${JSON.stringify(a)}, expected: ${JSON.stringify(b)})`);
      }
      return;
    }

    if (typeof a !== typeof b) {
      diffs.push(`${path}: type mismatch (actual: ${typeof a}, expected: ${typeof b})`);
      return;
    }

    if (typeof a !== 'object') {
      if (a !== b) {
        diffs.push(`${path}: primitive mismatch (actual: ${JSON.stringify(a)}, expected: ${JSON.stringify(b)})`);
      }
      return;
    }

    if (Array.isArray(a) && Array.isArray(b)) {
      if (a.length !== b.length) {
        diffs.push(`${path}: array length mismatch (actual: ${a.length}, expected: ${b.length})`);
        return;
      }
      for (let i = 0; i < a.length; i++) {
        this.diffWalk(a[i], b[i], `${path}[${i}]`, diffs);
      }
      return;
    }

    const objA = a as Record<string, unknown>;
    const objB = b as Record<string, unknown>;

    const isDefaultEventField = (k: string, v: unknown): boolean => {
      const lower = k.toLowerCase();
      if (
        v === 0 ||
        v === '' ||
        v === false ||
        v === 'None' ||
        (lower === 'device' && (v === 'Keyboard' || v === 'None')) ||
        (lower === 'triggercooldownmilliseconds' && v === 3000) ||
        (lower === 'showoverlaytiming' && v === true)
      ) {
        return true;
      }
      return false;
    };

    const allKeys = new Set([...Object.keys(objA), ...Object.keys(objB)]);
    for (const key of allKeys) {
      if (!(key in objA)) {
        if (isDefaultEventField(key, objB[key])) {
        } else {
          diffs.push(`${path}.${key}: missing in actual object`);
        }
      } else if (!(key in objB)) {
        if (isDefaultEventField(key, objA[key])) {
        } else {
          diffs.push(`${path}.${key}: unexpected extra property in actual object`);
        }
      } else {
        this.diffWalk(objA[key], objB[key], `${path}.${key}`, diffs);
      }
    }
  }
}
