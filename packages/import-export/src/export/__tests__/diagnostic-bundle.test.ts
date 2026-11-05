import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';

import { type TimingSummary } from '../../../../contracts/src/index.js';
import { PrivacyViolationError } from '../../../../domain/src/diagnostics/index.js';

import {
  DiagnosticBundle,
  buildDiagnosticSummary,
  createDiagnosticBundle,
  normalizeTimingSummaryToWire,
} from '../diagnostic-bundle.js';
import { readZipEntry, readZipEntryNames } from '../zip-writer.js';

describe('DiagnosticBundleExporter', () => {
  const timing: TimingSummary = {
    count: 2,
    failed: 0,
    unconfirmed: 1,
    meanMs: 0.2,
    medianMs: 0.2,
    p95Ms: 0.3,
    p99Ms: 0.3,
    maxMs: 0.4,
  };

  // 001 (DiagnosticsTests.cs:13)
  it('diagnostic bundle does not contain macro or input data', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'bundle-test-'));
    const zipPath = path.join(tmpDir, 'bundle.zip');

    try {
      await DiagnosticBundle.create(zipPath, timing);

      const zipBuffer = await fs.readFile(zipPath);
      const entryNames = readZipEntryNames(zipBuffer);

      // Single entry named summary.json
      expect(entryNames).toHaveLength(1);
      expect(entryNames[0]).toBe('summary.json');

      const entryBuffer = readZipEntry(zipBuffer, 'summary.json');
      expect(entryBuffer).not.toBeNull();

      const content = entryBuffer!.toString('utf8');

      // Assert privacy clause present and sensitive tokens absent (exact match with DiagnosticsTests.cs:23)
      expect(content).toContain('privacy');
      expect(content).not.toContain('VirtualKey');
      expect(content).not.toContain('MacroEvent');
      expect(content).not.toContain('keystroke');
      expect(content).not.toContain('inputPayload');
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });

  it('serializes timing summary metrics with PascalCase properties', () => {
    const wire = normalizeTimingSummaryToWire(timing);
    expect(wire.Count).toBe(2);
    expect(wire.Failed).toBe(0);
    expect(wire.Unconfirmed).toBe(1);
    expect(wire.MeanMs).toBe(0.2);
    expect(wire.MedianMs).toBe(0.2);
    expect(wire.P95Ms).toBe(0.3);
    expect(wire.P99Ms).toBe(0.3);
    expect(wire.MaxMs).toBe(0.4);
  });

  it('builds summary containing environment and timing without user macro payload', () => {
    const summary = buildDiagnosticSummary(timing, {
      appVersion: '2.0.0.0',
      os: 'Windows 11',
      runtime: 'Node.js 22',
      architecture: 'X64',
    });

    expect(summary['appVersion']).toBe('2.0.0.0');
    expect(summary['os']).toBe('Windows 11');
    expect(summary['runtime']).toBe('Node.js 22');
    expect(summary['architecture']).toBe('X64');
    expect(summary['privacy']).toContain('intentionally excluded');

    const timingField = summary['timing'] as Record<string, unknown>;
    expect(timingField['Count']).toBe(2);
  });

  it('throws PrivacyViolationError if any forbidden token is injected into summary', () => {
    expect(() =>
      buildDiagnosticSummary(timing, {
        privacyDisclaimer: 'Contains VirtualKey data',
      }),
    ).toThrow(PrivacyViolationError);
  });

  it('creates in-memory buffer via createDiagnosticBundle', () => {
    const buffer = createDiagnosticBundle(timing);
    expect(Buffer.isBuffer(buffer)).toBe(true);
    expect(buffer.length).toBeGreaterThan(0);

    const names = readZipEntryNames(buffer);
    expect(names).toEqual(['summary.json']);
  });

  it('supports DiagnosticBundle.Create PascalCase alias', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'bundle-alias-'));
    const zipPath = path.join(tmpDir, 'bundle-alias.zip');

    try {
      await DiagnosticBundle.Create(zipPath, timing);
      const exists = await fs
        .stat(zipPath)
        .then(() => true)
        .catch(() => false);
      expect(exists).toBe(true);
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });
});
