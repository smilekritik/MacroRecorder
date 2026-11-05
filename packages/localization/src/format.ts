import type { PlaceholderValidationResult } from './types.js';

/**
 * Formats a template string containing .NET-style composite format placeholders
 * like {0}, {1}, etc. Escaped braces {{ and }} are unescaped to { and }.
 */
export function formatPlaceholder(template: string, ...args: readonly unknown[]): string {
  if (!template) {
    return '';
  }

  // Handle .NET composite formatting:
  // {{ -> {
  // }} -> }
  // {n} or {n,alignment} or {n:format} -> args[n]
  return template.replace(
    /\{\{|\}\}|\{(\d+)(?:,[^}]*)?(?::[^}]*)?\}/g,
    (match, indexStr?: string) => {
      if (match === '{{') {
        return '{';
      }
      if (match === '}}') {
        return '}';
      }
      if (indexStr !== undefined) {
        const index = parseInt(indexStr, 10);
        if (index >= 0 && index < args.length) {
          const val = args[index];
          if (val === null || val === undefined) {
            return '';
          }
          return String(val);
        }
      }
      return match;
    },
  );
}

/**
 * Extracts unique sorted placeholder indices (e.g. [0, 1, 2]) from a template string.
 * Escaped braces {{ and }} are ignored.
 */
export function extractPlaceholders(template: string): number[] {
  if (!template) {
    return [];
  }

  const indices = new Set<number>();
  let i = 0;
  const len = template.length;

  while (i < len) {
    const char = template[i];
    if (char === '{') {
      if (i + 1 < len && template[i + 1] === '{') {
        // Escaped {{
        i += 2;
        continue;
      }
      // Found potential placeholder
      const close = template.indexOf('}', i + 1);
      if (close !== -1) {
        const inner = template.slice(i + 1, close);
        // Match index before any, or :
        const match = inner.match(/^(\d+)/);
        if (match && match[1]) {
          indices.add(parseInt(match[1], 10));
        }
        i = close + 1;
        continue;
      }
    } else if (char === '}') {
      if (i + 1 < len && template[i + 1] === '}') {
        // Escaped }}
        i += 2;
        continue;
      }
    }
    i++;
  }

  return Array.from(indices).sort((a, b) => a - b);
}

/**
 * Validates that all placeholder indices in the source key match the placeholder indices in the target translation.
 */
export function validatePlaceholderArity(
  key: string,
  translation: string,
): PlaceholderValidationResult {
  const keyPlaceholders = extractPlaceholders(key);
  const translationPlaceholders = extractPlaceholders(translation);

  const keySet = new Set(keyPlaceholders);
  const transSet = new Set(translationPlaceholders);

  const missingInTranslation = keyPlaceholders.filter((idx) => !transSet.has(idx));
  const extraInTranslation = translationPlaceholders.filter((idx) => !keySet.has(idx));

  const valid = missingInTranslation.length === 0 && extraInTranslation.length === 0;

  return {
    valid,
    keyPlaceholders,
    translationPlaceholders,
    missingInTranslation,
    extraInTranslation,
  };
}
