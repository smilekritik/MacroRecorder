import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';

it('buildProduction rejects CSS compilation failures', () => {
  const workspaceRoot = fileURLToPath(new URL('../../', import.meta.url));
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'macro-build-failure-'));
  const themePath = path.join(temporaryRoot, 'apps/desktop/src/renderer/design-system/theme.css');
  fs.mkdirSync(path.dirname(themePath), { recursive: true });
  fs.writeFileSync(themePath, 'body {}');
  try {
    // Isolate CommonJS dependency replacements from the test runner and other builds.
    const result = spawnSync(
      process.execPath,
      [
        '-e',
        `
      require('node:child_process').execSync = () => { throw new Error('CSS compiler failed'); };
      require('esbuild');
      require.cache[require.resolve('esbuild')].exports = { build: async () => {} };
      const { buildProduction } = require('./scripts/build-app.cjs');
      buildProduction({ workspaceRoot: process.argv[1], outDir: process.argv[2], skipNative: true })
        .then(() => { process.exitCode = 1; })
        .catch(error => { process.exitCode = error.message === 'CSS compiler failed' ? 23 : 2; });
    `,
        temporaryRoot,
        path.join(temporaryRoot, 'bundle'),
      ],
      {
        cwd: workspaceRoot,
        encoding: 'utf8',
      },
    );
    expect(result.status, result.stderr).toBe(23);
  } finally {
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
  }
});
