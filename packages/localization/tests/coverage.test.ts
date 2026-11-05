import { describe, it, expect } from 'vitest';
import path from 'path';
import fs from 'fs';
import { runCoverageCheck } from '../src/index.js';

describe('coverage checks', () => {
  const repoRoot = path.resolve(__dirname, '../../../');

  it('verifies that every referenced key in application code has Russian translation', () => {
    const scanDirs = [
      path.join(repoRoot, 'apps'),
      path.join(repoRoot, 'packages'),
    ].filter((d) => fs.existsSync(d));

    const report = runCoverageCheck({ scanDirectories: scanDirs });

    expect(report.emptyCatalogKeys).toEqual([]);
    expect(report.referencedKeysCount).toBeGreaterThan(0);
    expect(report.missingKeys).toEqual([]);
    expect(report.arityMismatches).toEqual([]);
    expect(report.isValid).toBe(true);
  });

  it('runs CLI runner and returns exit code 0 on valid repository', async () => {
    const { runCli } = await import('../src/index.js');
    const exitCode = runCli([]);
    expect(exitCode).toBe(0);
  });
});
