/**
 * Zero-dependency ZIP archive reader and writer built on node:zlib.
 * Includes path traversal rejection (Zip Slip mitigation) and CRC32 verification.
 * Compatible with .NET ZipArchive and Python zipfile.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as zlib from 'node:zlib';

export interface ZipEntryInput {
  readonly name: string;
  readonly data: Uint8Array | Buffer | string;
}

export interface ZipArchiveOptions {
  /** Optional fixed date for deterministic archives */
  readonly date?: Date | undefined;
}

/**
 * Validates that an archive entry relative path does not escape the target root (Zip Slip protection).
 */
export function isSafeZipEntryPath(entryPath: string): boolean {
  if (!entryPath || typeof entryPath !== 'string') {
    return false;
  }
  if (entryPath.includes('\0')) {
    return false;
  }
  if (path.isAbsolute(entryPath)) {
    return false;
  }
  if (/^[a-zA-Z]:/.test(entryPath)) {
    return false;
  }
  if (entryPath.startsWith('/') || entryPath.startsWith('\\')) {
    return false;
  }
  const parts = entryPath.split(/[/\\]/);
  for (const part of parts) {
    if (part === '..') {
      return false;
    }
  }
  return true;
}

/**
 * Asserts that an archive entry name is safe, throwing an error if path traversal is detected.
 */
export function assertSafeZipEntryPath(entryPath: string): void {
  if (!isSafeZipEntryPath(entryPath)) {
    throw new Error(`Path traversal entry rejected: "${entryPath}"`);
  }
}

/**
 * Checks if a buffer or file begins with the standard ZIP local header signature (PK\x03\x04).
 */
export async function hasZipSignature(
  pathOrBuffer: string | Buffer | Uint8Array,
): Promise<boolean> {
  if (typeof pathOrBuffer === 'string') {
    try {
      const handle = await fs.promises.open(pathOrBuffer, 'r');
      const buf = Buffer.alloc(4);
      const { bytesRead } = await handle.read(buf, 0, 4, 0);
      await handle.close();
      return (
        bytesRead === 4 && buf[0] === 0x50 && buf[1] === 0x4b && buf[2] === 0x03 && buf[3] === 0x04
      );
    } catch {
      return false;
    }
  }

  if (pathOrBuffer.length < 4) {
    return false;
  }
  return (
    pathOrBuffer[0] === 0x50 &&
    pathOrBuffer[1] === 0x4b &&
    pathOrBuffer[2] === 0x03 &&
    pathOrBuffer[3] === 0x04
  );
}

/**
 * Converts a Date to MS-DOS date and time integers.
 */
export function toDosDateTime(date: Date): { dosTime: number; dosDate: number } {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + 1;
  const day = date.getUTCDate();
  const hours = date.getUTCHours();
  const minutes = date.getUTCMinutes();
  const seconds = Math.floor(date.getUTCSeconds() / 2);

  const safeYear = Math.max(1980, year);
  const dosTime = (hours << 11) | (minutes << 5) | seconds;
  const dosDate = ((safeYear - 1980) << 9) | (month << 5) | day;

  return { dosTime, dosDate };
}

/**
 * Creates a valid ZIP archive containing the provided entries using Deflate compression.
 */
export function createZipArchive(
  entries: readonly ZipEntryInput[],
  options?: ZipArchiveOptions,
): Buffer {
  const date = options?.date ?? new Date();
  const { dosTime, dosDate } = toDosDateTime(date);

  const localChunks: Buffer[] = [];
  const cdChunks: Buffer[] = [];
  let offset = 0;

  for (const entry of entries) {
    assertSafeZipEntryPath(entry.name);
    // Normalize path separators to forward slashes in ZIP archives
    const normalizedName = entry.name.replace(/\\/g, '/');
    const nameBuf = Buffer.from(normalizedName, 'utf-8');
    const dataBuf = Buffer.isBuffer(entry.data)
      ? entry.data
      : typeof entry.data === 'string'
        ? Buffer.from(entry.data, 'utf-8')
        : Buffer.from(entry.data.buffer, entry.data.byteOffset, entry.data.byteLength);

    const uncompressedSize = dataBuf.length;
    const crc = zlib.crc32(dataBuf);
    const compBuf = zlib.deflateRawSync(dataBuf, { level: 9 });
    const compressedSize = compBuf.length;

    // Local file header (30 bytes + name length)
    const locHeader = Buffer.alloc(30);
    locHeader.writeUInt32LE(0x04034b50, 0); // signature
    locHeader.writeUInt16LE(20, 4); // version needed to extract (2.0)
    locHeader.writeUInt16LE(0x0800, 6); // general purpose bit flag (UTF-8 filename)
    locHeader.writeUInt16LE(8, 8); // compression method (Deflate)
    locHeader.writeUInt16LE(dosTime, 10);
    locHeader.writeUInt16LE(dosDate, 12);
    locHeader.writeUInt32LE(crc, 14);
    locHeader.writeUInt32LE(compressedSize, 18);
    locHeader.writeUInt32LE(uncompressedSize, 22);
    locHeader.writeUInt16LE(nameBuf.length, 26);
    locHeader.writeUInt16LE(0, 28); // extra field length

    const localOffset = offset;
    localChunks.push(locHeader, nameBuf, compBuf);
    offset += 30 + nameBuf.length + compressedSize;

    // Central directory file header (46 bytes + name length)
    const cdHeader = Buffer.alloc(46);
    cdHeader.writeUInt32LE(0x02014b50, 0); // signature
    cdHeader.writeUInt16LE(20, 4); // version made by
    cdHeader.writeUInt16LE(20, 6); // version needed
    cdHeader.writeUInt16LE(0x0800, 8); // UTF-8 filename
    cdHeader.writeUInt16LE(8, 10); // Deflate
    cdHeader.writeUInt16LE(dosTime, 12);
    cdHeader.writeUInt16LE(dosDate, 14);
    cdHeader.writeUInt32LE(crc, 16);
    cdHeader.writeUInt32LE(compressedSize, 20);
    cdHeader.writeUInt32LE(uncompressedSize, 24);
    cdHeader.writeUInt16LE(nameBuf.length, 28);
    cdHeader.writeUInt16LE(0, 30); // extra field length
    cdHeader.writeUInt16LE(0, 32); // comment length
    cdHeader.writeUInt16LE(0, 34); // disk number start
    cdHeader.writeUInt16LE(0, 36); // internal file attributes
    cdHeader.writeUInt32LE(0, 38); // external file attributes
    cdHeader.writeUInt32LE(localOffset, 42); // relative offset of local header

    cdChunks.push(cdHeader, nameBuf);
  }

  const cdOffset = offset;
  const cdBuf = Buffer.concat(cdChunks);
  const cdSize = cdBuf.length;

  // End of central directory record (22 bytes)
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0); // signature
  eocd.writeUInt16LE(0, 4); // disk number
  eocd.writeUInt16LE(0, 6); // start disk
  eocd.writeUInt16LE(entries.length, 8); // entries on this disk
  eocd.writeUInt16LE(entries.length, 10); // total entries
  eocd.writeUInt32LE(cdSize, 12);
  eocd.writeUInt32LE(cdOffset, 16);
  eocd.writeUInt16LE(0, 20); // comment length

  return Buffer.concat([...localChunks, cdBuf, eocd]);
}

/**
 * Reads and decompresses all entries in a ZIP archive buffer.
 * Performs path traversal safety checks before returning decompressed data.
 */
export function readZipArchive(buffer: Buffer): Map<string, Buffer> {
  if (buffer.length < 22) {
    throw new Error('Buffer is too small to be a valid ZIP archive.');
  }

  // Locate End of Central Directory Record (EOCD) by scanning backwards from end of file
  let eocdOffset = -1;
  const searchLimit = Math.max(0, buffer.length - 65536 - 22);
  for (let i = buffer.length - 22; i >= searchLimit; i--) {
    if (buffer.readUInt32LE(i) === 0x06054b50) {
      eocdOffset = i;
      break;
    }
  }

  if (eocdOffset === -1) {
    throw new Error('End of Central Directory record not found in ZIP archive.');
  }

  const entryCount = buffer.readUInt16LE(eocdOffset + 10);
  const cdSize = buffer.readUInt32LE(eocdOffset + 12);
  const cdOffset = buffer.readUInt32LE(eocdOffset + 16);

  if (cdOffset + cdSize > buffer.length) {
    throw new Error('Central directory range exceeds archive buffer length.');
  }

  const entries = new Map<string, Buffer>();
  let cdPtr = cdOffset;

  for (let i = 0; i < entryCount; i++) {
    if (cdPtr + 46 > buffer.length) {
      throw new Error('Unexpected end of buffer while reading central directory header.');
    }

    const cdSig = buffer.readUInt32LE(cdPtr);
    if (cdSig !== 0x02014b50) {
      throw new Error(
        `Corrupted central directory signature at offset ${cdPtr}: 0x${cdSig.toString(16)}`,
      );
    }

    const compMethod = buffer.readUInt16LE(cdPtr + 10);
    const expectedCrc = buffer.readUInt32LE(cdPtr + 16);
    const compSize = buffer.readUInt32LE(cdPtr + 20);
    const uncompSize = buffer.readUInt32LE(cdPtr + 24);
    const fnLen = buffer.readUInt16LE(cdPtr + 28);
    const extraLen = buffer.readUInt16LE(cdPtr + 30);
    const commentLen = buffer.readUInt16LE(cdPtr + 32);
    const localOffset = buffer.readUInt32LE(cdPtr + 42);

    if (cdPtr + 46 + fnLen > buffer.length) {
      throw new Error('Entry filename extends beyond buffer length.');
    }

    const entryName = buffer.toString('utf-8', cdPtr + 46, cdPtr + 46 + fnLen);
    assertSafeZipEntryPath(entryName);

    // Read local header at localOffset
    if (localOffset + 30 > buffer.length) {
      throw new Error(`Local file header offset ${localOffset} is out of bounds.`);
    }

    const locSig = buffer.readUInt32LE(localOffset);
    if (locSig !== 0x04034b50) {
      throw new Error(
        `Corrupted local file header signature at offset ${localOffset}: 0x${locSig.toString(16)}`,
      );
    }

    const locFnLen = buffer.readUInt16LE(localOffset + 26);
    const locExtraLen = buffer.readUInt16LE(localOffset + 28);
    const dataOffset = localOffset + 30 + locFnLen + locExtraLen;

    if (dataOffset + compSize > buffer.length) {
      throw new Error(`Compressed payload for entry "${entryName}" exceeds buffer length.`);
    }

    const compData = buffer.subarray(dataOffset, dataOffset + compSize);
    let decompressed: Buffer;

    if (compMethod === 0) {
      // Stored (uncompressed)
      decompressed = Buffer.from(compData);
    } else if (compMethod === 8) {
      // Deflate
      try {
        decompressed = zlib.inflateRawSync(compData);
      } catch (err) {
        throw new Error(`Failed to decompress entry "${entryName}": ${(err as Error).message}`);
      }
    } else {
      throw new Error(`Unsupported compression method ${compMethod} in entry "${entryName}".`);
    }

    if (decompressed.length !== uncompSize) {
      throw new Error(
        `Decompressed size mismatch for entry "${entryName}": expected ${uncompSize}, got ${decompressed.length}`,
      );
    }

    const actualCrc = zlib.crc32(decompressed);
    if (actualCrc !== expectedCrc) {
      throw new Error(
        `CRC32 mismatch for entry "${entryName}": expected 0x${expectedCrc.toString(16)}, got 0x${actualCrc.toString(16)}`,
      );
    }

    entries.set(entryName, decompressed);
    cdPtr += 46 + fnLen + extraLen + commentLen;
  }

  return entries;
}
