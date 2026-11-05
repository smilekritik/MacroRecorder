/**
 * Atomic file writing primitives ensuring files are never left in half-written or corrupted state.
 */

import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * Atomically writes content to the target file synchronously.
 * Writes to a temporary file (.tmp) in the same directory first and atomically renames.
 */
export function atomicWriteFileSync(filePath: string, content: string): void {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const tempSuffix = crypto.randomUUID().replace(/-/g, '');
  const tempPath = `${filePath}.${tempSuffix}.tmp`;

  try {
    fs.writeFileSync(tempPath, content, 'utf8');

    // On Windows, renameSync can occasionally encounter transient locks from indexing/antivirus.
    let retries = 5;
    while (retries > 0) {
      try {
        fs.renameSync(tempPath, filePath);
        return;
      } catch (renameErr) {
        retries--;
        if (retries === 0) {
          try {
            if (fs.existsSync(filePath)) {
              fs.unlinkSync(filePath);
            }
            fs.renameSync(tempPath, filePath);
            return;
          } catch {
            throw renameErr;
          }
        }
        // Brief spin wait (10ms)
        const start = Date.now();
        while (Date.now() - start < 10) {
          // busy wait
        }
      }
    }
  } catch (err) {
    try {
      if (fs.existsSync(tempPath)) {
        fs.unlinkSync(tempPath);
      }
    } catch {
      // ignore cleanup error
    }
    throw err;
  }
}

/**
 * Atomically writes content to the target file asynchronously.
 */
export async function atomicWriteFile(filePath: string, content: string): Promise<void> {
  const dir = path.dirname(filePath);
  await fs.promises.mkdir(dir, { recursive: true });

  const tempSuffix = crypto.randomUUID().replace(/-/g, '');
  const tempPath = `${filePath}.${tempSuffix}.tmp`;

  try {
    await fs.promises.writeFile(tempPath, content, 'utf8');

    let retries = 5;
    while (retries > 0) {
      try {
        await fs.promises.rename(tempPath, filePath);
        return;
      } catch (renameErr) {
        retries--;
        if (retries === 0) {
          try {
            await fs.promises.unlink(filePath);
            await fs.promises.rename(tempPath, filePath);
            return;
          } catch {
            throw renameErr;
          }
        }
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
    }
  } catch (err) {
    try {
      if (fs.existsSync(tempPath)) {
        await fs.promises.unlink(tempPath);
      }
    } catch {
      // ignore cleanup error
    }
    throw err;
  }
}
