import { defineConfig } from 'vitest/config';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    passWithNoTests: true,
    include: [
      path.resolve(__dirname, '**/*.test.ts').replace(/\\/g, '/'),
    ],
    coverage: {
      provider: 'v8',
      reportsDirectory: path.resolve(__dirname, '../../artifacts/coverage-compatibility').replace(/\\/g, '/'),
      reporter: ['text', 'json'],
    },
  },
});
