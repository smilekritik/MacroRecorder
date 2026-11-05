import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import * as crypto from 'node:crypto';
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import {
  atomicWriteFile,
  atomicWriteFileSync,
  atomicWriteJson,
  atomicWriteJsonSync,
  recoverInterruptedWrite,
  cleanupTempFiles,
} from './atomic-file.js';

describe('Atomic File Operations', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = path.join(os.tmpdir(), 'atomic-file-test-' + crypto.randomUUID().replace(/-/g, ''));
    fs.mkdirSync(tempDir, { recursive: true });
  });

  afterEach(() => {
    try {
      if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    } catch {
      // Ignore cleanup error
    }
  });

  it('atomically writes a file and does not leave temporary files', async () => {
    const target = path.join(tempDir, 'sample.txt');
    await atomicWriteFile(target, 'hello world');

    expect(fs.existsSync(target)).toBe(true);
    expect(fs.readFileSync(target, 'utf-8')).toBe('hello world');

    const files = fs.readdirSync(tempDir);
    const tmpFiles = files.filter((f) => f.endsWith('.tmp'));
    expect(tmpFiles).toHaveLength(0);
  });

  it('atomically writes a file synchronously', () => {
    const target = path.join(tempDir, 'sync.txt');
    atomicWriteFileSync(target, 'sync content');

    expect(fs.existsSync(target)).toBe(true);
    expect(fs.readFileSync(target, 'utf-8')).toBe('sync content');

    const files = fs.readdirSync(tempDir);
    const tmpFiles = files.filter((f) => f.endsWith('.tmp'));
    expect(tmpFiles).toHaveLength(0);
  });

  it('atomically writes formatted JSON', async () => {
    const target = path.join(tempDir, 'data.json');
    const data = { name: 'test', value: 42 };
    await atomicWriteJson(target, data);

    const text = fs.readFileSync(target, 'utf-8');
    expect(JSON.parse(text)).toEqual(data);
    expect(text).toContain('  "name": "test"');
  });

  it('atomically writes formatted JSON synchronously', () => {
    const target = path.join(tempDir, 'data-sync.json');
    const data = { sync: true, count: 10 };
    atomicWriteJsonSync(target, data);

    const text = fs.readFileSync(target, 'utf-8');
    expect(JSON.parse(text)).toEqual(data);
  });

  it('auto-creates nested directories if they do not exist', async () => {
    const target = path.join(tempDir, 'nested', 'deep', 'file.txt');
    await atomicWriteFile(target, 'deep content');

    expect(fs.existsSync(target)).toBe(true);
    expect(fs.readFileSync(target, 'utf-8')).toBe('deep content');
  });

  it('power-loss simulation: existing file is untouched if write is interrupted mid-way', async () => {
    const target = path.join(tempDir, 'macro.json');
    const originalContent = JSON.stringify({ version: 1, name: 'original' });
    await atomicWriteFile(target, originalContent);

    // Simulate an interrupted write: create a partial .tmp file
    const simulatedTmp = `${target}.${crypto.randomUUID().replace(/-/g, '')}.tmp`;
    fs.writeFileSync(simulatedTmp, '{"version": 2, "name": "corrup');

    // The target file must remain completely valid and untouched
    expect(fs.readFileSync(target, 'utf-8')).toBe(originalContent);
    expect(JSON.parse(fs.readFileSync(target, 'utf-8'))).toEqual({
      version: 1,
      name: 'original',
    });
  });

  it('power-loss simulation: never leaves both current and recovery copy invalid', async () => {
    const target = path.join(tempDir, 'macro.json');
    const v1 = { version: 1, name: 'v1' };
    const v2 = { version: 2, name: 'v2' };

    // Write v1
    await atomicWriteJson(target, v1);
    expect(fs.existsSync(target)).toBe(true);

    // Write v2 (this automatically creates/updates target.bak)
    await atomicWriteJson(target, v2);

    const bakPath = `${target}.bak`;
    expect(fs.existsSync(bakPath)).toBe(true);

    // Both current (v2) and recovery copy (v1) exist and are valid
    expect(JSON.parse(fs.readFileSync(target, 'utf-8'))).toEqual(v2);
    expect(JSON.parse(fs.readFileSync(bakPath, 'utf-8'))).toEqual(v1);

    // Simulate sudden power loss that corrupts the target file to 0 bytes
    fs.writeFileSync(target, '');

    // Now current is invalid, but recovery copy (.bak) is valid!
    const res = await recoverInterruptedWrite(target);
    expect(res.recovered).toBe(true);
    expect(res.source).toBe('backup');
    expect(JSON.parse(fs.readFileSync(target, 'utf-8'))).toEqual(v1);
  });

  it('recovers from valid leftover .tmp file when target is corrupted and no backup exists', async () => {
    const target = path.join(tempDir, 'alone.json');
    // Target is corrupted (syntax error)
    fs.writeFileSync(target, '{"truncated": true, ');

    // Candidate .tmp file exists and has valid content
    const tmpFile = `${target}.12345.tmp`;
    const validData = { recoveredFromTmp: true };
    fs.writeFileSync(tmpFile, JSON.stringify(validData));

    const res = await recoverInterruptedWrite(target);
    expect(res.recovered).toBe(true);
    expect(res.source).toBe('temp');
    expect(JSON.parse(fs.readFileSync(target, 'utf-8'))).toEqual(validData);
  });

  it('cleans up temporary files older than threshold', async () => {
    const subDir = path.join(tempDir, 'cleanup-test');
    fs.mkdirSync(subDir, { recursive: true });

    const oldTmp = path.join(subDir, 'old.tmp');
    const freshTmp = path.join(subDir, 'fresh.tmp');
    fs.writeFileSync(oldTmp, 'old');
    fs.writeFileSync(freshTmp, 'fresh');

    // Backdate oldTmp mtime
    const pastTime = (Date.now() - 120_000) / 1000;
    fs.utimesSync(oldTmp, pastTime, pastTime);

    const deleted = await cleanupTempFiles(subDir, 60_000);
    expect(deleted).toContain(oldTmp);
    expect(deleted).not.toContain(freshTmp);

    expect(fs.existsSync(oldTmp)).toBe(false);
    expect(fs.existsSync(freshTmp)).toBe(true);
  });
});
