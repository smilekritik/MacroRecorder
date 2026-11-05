import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';

import { type DispatchReceipt } from '../../../../contracts/src/index.js';

import {
  DiagnosticsJsonExporter,
  exportDiagnosticsJson,
  exportDiagnosticsJsonToFile,
  normalizeReceiptToWire,
} from '../diagnostics-json.js';

describe('DiagnosticsJsonExporter', () => {
  const sampleReceipts: DispatchReceipt[] = [
    {
      eventId: 'e1111111-1111-1111-1111-111111111111',
      scheduledMicroseconds: 0,
      plannedMicroseconds: 0,
      dispatchStartedMicroseconds: 2000,
      dispatchCompletedMicroseconds: 2000,
      hookConfirmedMicroseconds: 2000,
      dispatchJitterMilliseconds: 2.0,
      confirmationMilliseconds: 0.0,
      success: true,
      error: null,
    },
    {
      eventId: 'e2222222-2222-2222-2222-222222222222',
      scheduledMicroseconds: 50000,
      plannedMicroseconds: 54000,
      dispatchStartedMicroseconds: 54000,
      dispatchCompletedMicroseconds: 54500,
      hookConfirmedMicroseconds: null,
      dispatchJitterMilliseconds: 0.0,
      confirmationMilliseconds: null,
      success: true,
      error: null,
    },
  ];

  it('exports dispatch receipts to PascalCase indented JSON with explicit nulls', () => {
    const jsonStr = exportDiagnosticsJson(sampleReceipts);
    const parsed = JSON.parse(jsonStr) as Record<string, unknown>[];

    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed).toHaveLength(2);

    const first = parsed[0]!;
    expect(first['EventId']).toBe('e1111111-1111-1111-1111-111111111111');
    expect(first['ScheduledMicroseconds']).toBe(0);
    expect(first['PlannedMicroseconds']).toBe(0);
    expect(first['DispatchStartedMicroseconds']).toBe(2000);
    expect(first['DispatchCompletedMicroseconds']).toBe(2000);
    expect(first['HookConfirmedMicroseconds']).toBe(2000);
    expect(first['DispatchJitterMilliseconds']).toBe(2.0);
    expect(first['ConfirmationMilliseconds']).toBe(0.0);
    expect(first['Success']).toBe(true);
    expect(first['Error']).toBeNull();

    const second = parsed[1]!;
    expect(second['EventId']).toBe('e2222222-2222-2222-2222-222222222222');
    expect(second['HookConfirmedMicroseconds']).toBeNull();
    expect(second['ConfirmationMilliseconds']).toBeNull();
  });

  it('normalizes wire receipts and camelCase receipts identically', () => {
    const wire = {
      EventId: 'w-1',
      ScheduledMicroseconds: 100,
      PlannedMicroseconds: null,
      DispatchStartedMicroseconds: 120,
      DispatchCompletedMicroseconds: 150,
      HookConfirmedMicroseconds: null,
      DispatchJitterMilliseconds: 0.02,
      ConfirmationMilliseconds: null,
      Success: true,
      Error: null,
    };

    const normalized = normalizeReceiptToWire(wire);
    expect(normalized['EventId']).toBe('w-1');
    expect(normalized['ScheduledMicroseconds']).toBe(100);
    expect(normalized['PlannedMicroseconds']).toBeNull();
  });

  it('writes JSON to disk with proper formatting', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'json-test-'));
    const filePath = path.join(tmpDir, 'test.json');

    try {
      await exportDiagnosticsJsonToFile(sampleReceipts, filePath);

      const content = await fs.readFile(filePath, 'utf8');
      expect(content.endsWith('\n')).toBe(true);
      const parsed = JSON.parse(content);
      expect(parsed).toHaveLength(2);
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });

  it('supports DiagnosticsJsonExporter class wrapper', () => {
    const jsonStr = DiagnosticsJsonExporter.export([]);
    expect(jsonStr).toBe('[]\n');
  });
});
