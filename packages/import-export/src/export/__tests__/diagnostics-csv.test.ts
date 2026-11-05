import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';

import { type DispatchReceipt } from '../../../../contracts/src/index.js';

import {
  DiagnosticsCsvExporter,
  escapeCsvField,
  exportDiagnosticsCsv,
  exportDiagnosticsCsvToFile,
  formatFloatF6,
} from '../diagnostics-csv.js';

describe('DiagnosticsCsvExporter', () => {
  it('exports dispatch receipts with exact column order and CRLF line endings', () => {
    const receipts: DispatchReceipt[] = [
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

    const csv = exportDiagnosticsCsv(receipts);

    const expected =
      'event_id,scheduled_us,planned_us,dispatch_start_us,dispatch_end_us,hook_confirmed_us,jitter_ms,confirmation_ms,success,error\r\n' +
      'e1111111-1111-1111-1111-111111111111,0,0,2000,2000,2000,2.000000,0.000000,true,\r\n' +
      'e2222222-2222-2222-2222-222222222222,50000,54000,54000,54500,,0.000000,,true,\r\n';

    expect(csv).toBe(expected);
    expect(csv.includes('\r\n')).toBe(true);
  });

  it('handles error escaping and failed status properly', () => {
    const receipts: DispatchReceipt[] = [
      {
        eventId: 'e3333333-3333-3333-3333-333333333333',
        scheduledMicroseconds: 10000,
        plannedMicroseconds: null,
        dispatchStartedMicroseconds: 10500,
        dispatchCompletedMicroseconds: 11000,
        hookConfirmedMicroseconds: null,
        dispatchJitterMilliseconds: 0.5,
        confirmationMilliseconds: null,
        success: false,
        error: 'Failed: window "Calculator" not found, code=5',
      },
    ];

    const csv = exportDiagnosticsCsv(receipts);
    expect(csv).toContain('false,"Failed: window ""Calculator"" not found, code=5"\r\n');
  });

  it('escapes CSV fields with quotes and handles empty/null strings', () => {
    expect(escapeCsvField(null)).toBe('');
    expect(escapeCsvField('')).toBe('');
    expect(escapeCsvField('normal')).toBe('"normal"');
    expect(escapeCsvField('quote "here"')).toBe('"quote ""here"""');
  });

  it('formats floats to 6 decimal places invariant', () => {
    expect(formatFloatF6(0)).toBe('0.000000');
    expect(formatFloatF6(2.5)).toBe('2.500000');
    expect(formatFloatF6(null)).toBe('');
    expect(formatFloatF6(undefined)).toBe('');
  });

  it('writes CSV file to disk and optionally adds UTF-8 BOM', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'csv-test-'));
    const filePath = path.join(tmpDir, 'test.csv');

    try {
      await exportDiagnosticsCsvToFile(
        [
          {
            eventId: 'test-1',
            scheduledMicroseconds: 100,
            dispatchStartedMicroseconds: 100,
            dispatchCompletedMicroseconds: 200,
            dispatchJitterMilliseconds: 0,
            success: true,
          },
        ],
        filePath,
        { includeBom: true },
      );

      const buffer = await fs.readFile(filePath);
      // UTF-8 BOM is EF BB BF
      expect(buffer[0]).toBe(0xef);
      expect(buffer[1]).toBe(0xbb);
      expect(buffer[2]).toBe(0xbf);

      const content = buffer.toString('utf8');
      expect(content).toContain('event_id,scheduled_us');
      expect(content).toContain('test-1');
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });

  it('supports DiagnosticsCsvExporter class wrapper', () => {
    const csv = DiagnosticsCsvExporter.export([]);
    expect(csv).toBe(
      'event_id,scheduled_us,planned_us,dispatch_start_us,dispatch_end_us,hook_confirmed_us,jitter_ms,confirmation_ms,success,error\r\n',
    );
  });
});
