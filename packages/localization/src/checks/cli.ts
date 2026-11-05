import path from 'path';
import fs from 'fs';
import { runCoverageCheck } from './checker.js';

function findRepoRoot(): string {
  let cur = process.cwd();
  for (let i = 0; i < 10; i++) {
    if (
      fs.existsSync(path.join(cur, 'MacroRecorder.sln')) ||
      (fs.existsSync(path.join(cur, 'pnpm-workspace.yaml')) &&
        fs.existsSync(path.join(cur, 'packages', 'localization')))
    ) {
      return cur;
    }
    const parent = path.dirname(cur);
    if (parent === cur) {
      break;
    }
    cur = parent;
  }
  return process.cwd();
}

export function runCli(argv: string[] = process.argv.slice(2)): number {
  const root = findRepoRoot();
  const scanDirs: string[] = [];

  // Parse custom dirs if supplied, otherwise scan all standard app directories
  let i = 0;
  while (i < argv.length) {
    if (argv[i] === '--dir' && i + 1 < argv.length) {
      scanDirs.push(path.resolve(root, argv[i + 1]!));
      i += 2;
    } else {
      i++;
    }
  }

  if (scanDirs.length === 0) {
    // Default directories to scan in the post-cutover workspace.
    for (const d of ['apps', 'packages']) {
      const full = path.join(root, d);
      if (fs.existsSync(full)) {
        scanDirs.push(full);
      }
    }
  }

  console.log('--- Macro Recorder Localization Coverage Check ---');
  console.log(`Repository root: ${root}`);
  console.log(`Scanning directories: ${scanDirs.map((d) => path.relative(root, d)).join(', ')}`);

  const report = runCoverageCheck({ scanDirectories: scanDirs });

  console.log(`\nCatalog statistics:`);
  console.log(`  Total catalog keys: ${report.totalCatalogKeys}`);
  console.log(`  Empty translations: ${report.emptyCatalogKeys.length}`);
  console.log(`  Referenced keys in code: ${report.referencedKeysCount}`);
  console.log(`  Missing translations: ${report.missingKeys.length}`);
  console.log(`  Placeholder arity mismatches: ${report.arityMismatches.length}`);

  if (report.emptyCatalogKeys.length > 0) {
    console.error('\nFAIL: ru.json has empty translations for:');
    for (const key of report.emptyCatalogKeys) {
      console.error(`  - "${key}"`);
    }
  }

  if (report.missingKeys.length > 0) {
    console.error('\nFAIL: ru.json is missing translations for referenced keys:');
    for (const item of report.missingKeys) {
      console.error(
        `  - "${item.key}" (in ${item.occurrences.map((o) => `${path.relative(root, o.file)}:${o.line}`).join(', ')})`,
      );
    }
  }

  if (report.arityMismatches.length > 0) {
    console.error('\nFAIL: Placeholder arity mismatch detected:');
    for (const item of report.arityMismatches) {
      console.error(`  - Key: "${item.key}" [${item.keyPlaceholders.join(',')}]`);
      console.error(`    Ru:  "${item.translation}" [${item.translationPlaceholders.join(',')}]`);
    }
  }

  if (report.isValid) {
    console.log('\nSUCCESS: All localization coverage and placeholder arity checks passed.');
    return 0;
  }

  console.error('\nFAILURE: Localization coverage checks failed.');
  return 1;
}

// If invoked directly from CLI
if (process.argv[1] && (process.argv[1].endsWith('cli.ts') || process.argv[1].endsWith('cli.js'))) {
  const code = runCli();
  if (code !== 0) {
    process.exit(code);
  }
}
