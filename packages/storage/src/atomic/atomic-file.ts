/**
 * Atomic file write and interrupted-write recovery operations.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import type { AtomicWriteOptions, AtomicWriteJsonOptions, RecoveryResult } from './types.js';

const DEFAULT_RETRY_COUNT = 5;
const DEFAULT_RETRY_DELAY_MS = 25;

/**
 * Atomically writes data to a file by writing to a unique temporary file
 * in the same directory, syncing to disk, and renaming to target.
 *
 * Maintains a .bak recovery copy when enabled to guarantee that power-loss simulation
 * never leaves both the current and recovery copy invalid.
 */
export async function atomicWriteFile(
  filePath: string,
  data: string | Uint8Array,
  options?: AtomicWriteOptions,
): Promise<void> {
  const dir = path.dirname(filePath);
  await fs.promises.mkdir(dir, { recursive: true });

  const randomSuffix = crypto.randomUUID().replace(/-/g, '');
  const tempPath = `${filePath}.${randomSuffix}.tmp`;
  const backupPath = `${filePath}.bak`;
  const shouldBackup = options?.backup !== false;

  let handle: fs.promises.FileHandle | undefined;
  try {
    handle = await fs.promises.open(tempPath, 'w', options?.mode);
    if (typeof data === 'string') {
      await handle.writeFile(data, options?.encoding ?? 'utf-8');
    } else {
      await handle.writeFile(data);
    }
    if (options?.fsync !== false) {
      await handle.sync();
    }
    await handle.close();
    handle = undefined;

    // If target exists and backup enabled, maintain the recovery copy before replacing target
    if (shouldBackup && fs.existsSync(filePath)) {
      try {
        await fs.promises.copyFile(filePath, backupPath);
      } catch {
        // Continue even if backup copy fails
      }
    }

    // Atomically replace target with temp file (with retries for Windows file lock contention)
    const maxRetries = options?.maxRetries ?? DEFAULT_RETRY_COUNT;
    const retryDelay = options?.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS;
    let lastError: unknown;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        await fs.promises.rename(tempPath, filePath);
        lastError = undefined;
        break;
      } catch (err: unknown) {
        lastError = err;
        const code = (err as { code?: string })?.code;
        if (
          attempt < maxRetries - 1 &&
          (code === 'EPERM' || code === 'EBUSY' || code === 'EACCES')
        ) {
          await new Promise((resolve) => setTimeout(resolve, retryDelay * (attempt + 1)));
        } else {
          throw err;
        }
      }
    }

    if (lastError) {
      throw lastError;
    }
  } finally {
    if (handle) {
      try {
        await handle.close();
      } catch {
        // Ignore close error
      }
    }
    if (fs.existsSync(tempPath)) {
      try {
        await fs.promises.unlink(tempPath);
      } catch {
        // Ignore temp cleanup error
      }
    }
  }
}

/**
 * Synchronous version of atomicWriteFile.
 */
export function atomicWriteFileSync(
  filePath: string,
  data: string | Uint8Array,
  options?: AtomicWriteOptions,
): void {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });

  const randomSuffix = crypto.randomUUID().replace(/-/g, '');
  const tempPath = `${filePath}.${randomSuffix}.tmp`;
  const backupPath = `${filePath}.bak`;
  const shouldBackup = options?.backup !== false;

  let fd: number | undefined;
  try {
    fd = fs.openSync(tempPath, 'w', options?.mode);
    if (typeof data === 'string') {
      fs.writeFileSync(fd, data, { encoding: options?.encoding ?? 'utf-8' });
    } else {
      fs.writeFileSync(fd, data);
    }
    if (options?.fsync !== false) {
      fs.fsyncSync(fd);
    }
    fs.closeSync(fd);
    fd = undefined;

    if (shouldBackup && fs.existsSync(filePath)) {
      try {
        fs.copyFileSync(filePath, backupPath);
      } catch {
        // Continue even if backup copy fails
      }
    }

    const maxRetries = options?.maxRetries ?? DEFAULT_RETRY_COUNT;
    const retryDelay = options?.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS;
    let lastError: unknown;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        fs.renameSync(tempPath, filePath);
        lastError = undefined;
        break;
      } catch (err: unknown) {
        lastError = err;
        const code = (err as { code?: string })?.code;
        if (
          attempt < maxRetries - 1 &&
          (code === 'EPERM' || code === 'EBUSY' || code === 'EACCES')
        ) {
          const sleepUntil = Date.now() + retryDelay * (attempt + 1);
          while (Date.now() < sleepUntil) {
            // Busy-wait for brief retry delay
          }
        } else {
          throw err;
        }
      }
    }

    if (lastError) {
      throw lastError;
    }
  } finally {
    if (fd !== undefined) {
      try {
        fs.closeSync(fd);
      } catch {
        // Ignore close error
      }
    }
    if (fs.existsSync(tempPath)) {
      try {
        fs.unlinkSync(tempPath);
      } catch {
        // Ignore temp cleanup error
      }
    }
  }
}

/**
 * Atomically writes an object as formatted JSON.
 */
export async function atomicWriteJson(
  filePath: string,
  value: unknown,
  options?: AtomicWriteJsonOptions,
): Promise<void> {
  const spaces = options?.spaces ?? 2;
  const json = JSON.stringify(value, null, spaces) + '\n';
  await atomicWriteFile(filePath, json, options);
}

/**
 * Synchronous version of atomicWriteJson.
 */
export function atomicWriteJsonSync(
  filePath: string,
  value: unknown,
  options?: AtomicWriteJsonOptions,
): void {
  const spaces = options?.spaces ?? 2;
  const json = JSON.stringify(value, null, spaces) + '\n';
  atomicWriteFileSync(filePath, json, options);
}

/**
 * Validates whether a file content is non-empty and, if JSON, valid JSON.
 */
function isValidContent(content: string, isJson: boolean): boolean {
  const trimmed = content.trim();
  if (trimmed.length === 0) return false;
  if (isJson) {
    try {
      JSON.parse(trimmed);
      return true;
    } catch {
      return false;
    }
  }
  return true;
}

/**
 * Recovers a target file that may have been damaged by power loss or an interrupted write.
 * Inspects the target file, recovery backup (.bak), and any leftover temporary files (.tmp).
 */
export async function recoverInterruptedWrite(targetPath: string): Promise<RecoveryResult> {
  const isJson = targetPath.endsWith('.json') || targetPath.endsWith('.tmp');

  // If target file exists and is valid, no recovery needed
  if (fs.existsSync(targetPath)) {
    try {
      const content = await fs.promises.readFile(targetPath, 'utf-8');
      if (isValidContent(content, isJson)) {
        return { recovered: false, path: targetPath };
      }
    } catch {
      // Content read error, proceed to recovery
    }
  }

  // 1. Attempt recovery from .bak
  const backupPath = `${targetPath}.bak`;
  if (fs.existsSync(backupPath)) {
    try {
      const bakContent = await fs.promises.readFile(backupPath, 'utf-8');
      if (isValidContent(bakContent, isJson)) {
        await fs.promises.copyFile(backupPath, targetPath);
        return { recovered: true, source: 'backup', path: targetPath };
      }
    } catch {
      // Backup invalid or read error
    }
  }

  // 2. Attempt recovery from candidate .tmp files in the same directory
  const dir = path.dirname(targetPath);
  const baseName = path.basename(targetPath);
  if (fs.existsSync(dir)) {
    try {
      const entries = await fs.promises.readdir(dir);
      const candidates: { file: string; mtimeMs: number }[] = [];

      for (const entry of entries) {
        if (entry.startsWith(baseName) && entry.endsWith('.tmp')) {
          const candidatePath = path.join(dir, entry);
          try {
            const stat = await fs.promises.stat(candidatePath);
            candidates.push({ file: candidatePath, mtimeMs: stat.mtimeMs });
          } catch {
            // Ignore stat errors
          }
        }
      }

      // Sort by newest modified time
      candidates.sort((a, b) => b.mtimeMs - a.mtimeMs);

      for (const candidate of candidates) {
        try {
          const content = await fs.promises.readFile(candidate.file, 'utf-8');
          if (isValidContent(content, isJson)) {
            await fs.promises.copyFile(candidate.file, targetPath);
            return { recovered: true, source: 'temp', path: targetPath };
          }
        } catch {
          // Candidate unreadable
        }
      }
    } catch {
      // Directory readdir error
    }
  }

  return { recovered: false, path: targetPath };
}

/**
 * Cleans up temporary files (.tmp) in a directory that are older than maxAgeMs.
 * Default maxAgeMs is 60,000 (1 minute).
 */
export async function cleanupTempFiles(directory: string, maxAgeMs = 60_000): Promise<string[]> {
  const deleted: string[] = [];
  if (!fs.existsSync(directory)) return deleted;

  const now = Date.now();
  const threshold = now - maxAgeMs;

  async function scan(currentDir: string): Promise<void> {
    let entries: fs.Dirent[];
    try {
      entries = await fs.promises.readdir(currentDir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        await scan(fullPath);
      } else if (entry.isFile() && entry.name.endsWith('.tmp')) {
        try {
          const stat = await fs.promises.stat(fullPath);
          if (stat.mtimeMs <= threshold) {
            await fs.promises.unlink(fullPath);
            deleted.push(fullPath);
          }
        } catch {
          // Ignore individual file errors
        }
      }
    }
  }

  await scan(directory);
  return deleted;
}
