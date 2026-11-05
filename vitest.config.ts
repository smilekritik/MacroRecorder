import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    passWithNoTests: true,
    include: [
      'tests/unit/**/*.{test,spec}.ts',
      'tests/native/**/*.{test,spec}.ts',
      'packages/**/__tests__/**/*.{test,spec}.ts',
      'packages/**/*.{test,spec}.ts',
      'apps/**/*.{test,spec}.ts',
    ],
    coverage: {
      provider: 'v8',
      reportsDirectory: './artifacts/coverage',
      reporter: ['text', 'json', 'html'],
    },
  },
});
