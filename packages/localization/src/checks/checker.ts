import { ruCatalog } from '../catalogs/index.js';
import { validatePlaceholderArity } from '../format.js';
import { isNonLinguisticLegend } from '../legends.js';
import { extractKeysFromDirectory } from '../extraction/extractor.js';
import type {
  ArityMismatchReport,
  CoverageReport,
  ExtractedKeyInfo,
  MissingKeyReport,
} from '../types.js';

export interface CoverageCheckOptions {
  readonly scanDirectories?: readonly string[];
  readonly customCatalog?: Readonly<Record<string, string>>;
}

/**
 * Runs complete localization coverage checks:
 * 1. Checks that the catalog contains no empty or whitespace-only translations.
 * 2. Checks that every referenced key in source files has a Russian translation.
 * 3. Validates placeholder arity between English keys and Russian translations.
 * 4. Ensures no user-visible product string bypasses localization except documented non-linguistic legends.
 */
export function runCoverageCheck(options: CoverageCheckOptions = {}): CoverageReport {
  const catalog = options.customCatalog || ruCatalog;
  const catalogKeys = Object.keys(catalog);
  const totalCatalogKeys = catalogKeys.length;

  // 1. Check for empty values in catalog
  const emptyCatalogKeys: string[] = [];
  for (const [key, value] of Object.entries(catalog)) {
    if (!value || !value.trim()) {
      emptyCatalogKeys.push(key);
    }
  }

  // 2. Validate placeholder arity across the entire catalog
  const arityMismatches: ArityMismatchReport[] = [];
  for (const [key, translation] of Object.entries(catalog)) {
    const arityResult = validatePlaceholderArity(key, translation);
    if (!arityResult.valid) {
      arityMismatches.push({
        key,
        translation,
        keyPlaceholders: arityResult.keyPlaceholders,
        translationPlaceholders: arityResult.translationPlaceholders,
      });
    }
  }

  // 3. Extract referenced keys from source directories
  const occurrencesByKey = new Map<string, ExtractedKeyInfo[]>();

  if (options.scanDirectories && options.scanDirectories.length > 0) {
    for (const dir of options.scanDirectories) {
      const extracted = extractKeysFromDirectory(dir);
      for (const info of extracted) {
        let list = occurrencesByKey.get(info.key);
        if (!list) {
          list = [];
          occurrencesByKey.set(info.key, list);
        }
        list.push(info);
      }
    }
  }

  const referencedKeysCount = occurrencesByKey.size;
  const missingKeys: MissingKeyReport[] = [];

  for (const [key, occurrences] of occurrencesByKey.entries()) {
    // Pure punctuation or non-linguistic legends do not require a separate catalog entry
    if (!/[a-zA-Zа-яА-Я]/.test(key) || isNonLinguisticLegend(key)) {
      continue;
    }

    const translation = catalog[key];
    if (!translation || !translation.trim()) {
      missingKeys.push({
        key,
        occurrences: occurrences.map((occ) => ({
          file: occ.file,
          line: occ.line,
          column: occ.column,
        })),
      });
    }
  }

  const isValid =
    emptyCatalogKeys.length === 0 && missingKeys.length === 0 && arityMismatches.length === 0;

  return {
    totalCatalogKeys,
    emptyCatalogKeys,
    referencedKeysCount,
    missingKeys,
    arityMismatches,
    isValid,
  };
}
