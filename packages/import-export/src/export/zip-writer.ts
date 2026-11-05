/**
 * Lightweight, zero-dependency, deterministic ZIP archive creator and inspector.
 * Implements standard PKZIP 2.0 format using Node.js built-in `node:zlib`.
 */

import * as zlib from 'node:zlib';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

export interface ZipEntryInput {
  readonly name: string;
  readonly data: string | Uint8Array | Buffer;
}

export interface ZipOptions {
  /** Fixed timestamp for reproducible deterministic archives. */
  readonly fixedDate?: Date | undefined;
  /** Whether to compress using Deflate. Defaults to true. */
  readonly compress?: boolean | undefined;
}

/**
 * Encodes a JavaScript Date into MS-DOS 16-bit time and date values.
 */
export function dateToDosDateTime(date: Date): { time: number; date: number } {
  const year = Math.max(1980, date.getFullYear());
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const hours = date.getHours();
  const minutes = date.getMinutes();
  const seconds = date.getSeconds();

  const dosTime = ((hours & 0x1f) << 11) | ((minutes & 0x3f) << 5) | ((seconds >> 1) & 0x1f);
  const dosDate = (((year - 1980) & 0x7f) << 9) | ((month & 0x0f) << 5) | (day & 0x1f);

  return { time: dosTime, date: dosDate };
}

/**
 * Standard fixed date used across golden compatibility fixtures (2026-03-30 12:00:00).
 */
export const DEFAULT_FIXED_ZIP_DATE = new Date('2026-03-30T12:00:00.000Z');

/**
 * Creates a ZIP archive buffer containing the provided entries.
 */
export function createZipArchive(entries: readonly ZipEntryInput[], options?: ZipOptions): Buffer {
  const dateObj = options?.fixedDate ?? DEFAULT_FIXED_ZIP_DATE;
  const { time: dosTime, date: dosDate } = dateToDosDateTime(dateObj);
  const shouldCompress = options?.compress ?? true;

  const localChunks: Buffer[] = [];
  const centralChunks: Buffer[] = [];
  let offset = 0;

  for (const entry of entries) {
    const rawData =
      typeof entry.data === 'string'
        ? Buffer.from(entry.data, 'utf8')
        : Buffer.isBuffer(entry.data)
          ? entry.data
          : Buffer.from(entry.data);

    const nameBuf = Buffer.from(entry.name.replace(/\\/g, '/'), 'utf8');
    const crc = zlib.crc32(rawData);

    let compressedData = rawData;
    let method = 0; // Stored

    if (shouldCompress && rawData.length > 0) {
      const deflated = zlib.deflateRawSync(rawData, { level: 9 });
      if (deflated.length < rawData.length) {
        compressedData = deflated;
        method = 8; // Deflated
      }
    }

    const localHeaderOffset = offset;

    // Local file header (30 bytes + name + compressedData)
    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0); // Signature
    localHeader.writeUInt16LE(20, 4); // Version needed to extract (2.0)
    localHeader.writeUInt16LE(0x0800, 6); // General purpose bit flag (UTF-8)
    localHeader.writeUInt16LE(method, 8); // Compression method
    localHeader.writeUInt16LE(dosTime, 10); // Last mod file time
    localHeader.writeUInt16LE(dosDate, 12); // Last mod file date
    localHeader.writeUInt32LE(crc, 14); // CRC-32
    localHeader.writeUInt32LE(compressedData.length, 18); // Compressed size
    localHeader.writeUInt32LE(rawData.length, 22); // Uncompressed size
    localHeader.writeUInt16LE(nameBuf.length, 26); // File name length
    localHeader.writeUInt16LE(0, 28); // Extra field length

    localChunks.push(localHeader, nameBuf, compressedData);
    offset += localHeader.length + nameBuf.length + compressedData.length;

    // Central directory header (46 bytes + name)
    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0); // Signature
    centralHeader.writeUInt16LE(0x0314, 4); // Version made by (Unix 2.0)
    centralHeader.writeUInt16LE(20, 6); // Version needed to extract (2.0)
    centralHeader.writeUInt16LE(0x0800, 8); // General purpose bit flag (UTF-8)
    centralHeader.writeUInt16LE(method, 10); // Compression method
    centralHeader.writeUInt16LE(dosTime, 12); // Last mod file time
    centralHeader.writeUInt16LE(dosDate, 14); // Last mod file date
    centralHeader.writeUInt32LE(crc, 16); // CRC-32
    centralHeader.writeUInt32LE(compressedData.length, 20); // Compressed size
    centralHeader.writeUInt32LE(rawData.length, 24); // Uncompressed size
    centralHeader.writeUInt16LE(nameBuf.length, 28); // File name length
    centralHeader.writeUInt16LE(0, 30); // Extra field length
    centralHeader.writeUInt16LE(0, 32); // File comment length
    centralHeader.writeUInt16LE(0, 34); // Disk number start
    centralHeader.writeUInt16LE(0, 36); // Internal file attributes
    centralHeader.writeUInt32LE(0o644 << 16, 38); // External file attributes (regular file rw-r--r--)
    centralHeader.writeUInt32LE(localHeaderOffset, 42); // Relative offset of local header

    centralChunks.push(centralHeader, nameBuf);
  }

  const centralDirBuffer = Buffer.concat(centralChunks);
  const centralDirOffset = offset;
  const centralDirSize = centralDirBuffer.length;

  // End of central directory record (22 bytes)
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0); // Signature
  eocd.writeUInt16LE(0, 4); // Disk number
  eocd.writeUInt16LE(0, 6); // Disk with central directory
  eocd.writeUInt16LE(entries.length, 8); // Number of entries on disk
  eocd.writeUInt16LE(entries.length, 10); // Total entries
  eocd.writeUInt32LE(centralDirSize, 12); // Size of central directory
  eocd.writeUInt32LE(centralDirOffset, 16); // Offset of start of central directory
  eocd.writeUInt16LE(0, 20); // Comment length

  return Buffer.concat([...localChunks, centralDirBuffer, eocd]);
}

/**
 * Writes a ZIP archive to the target destination path, ensuring parent directories exist.
 */
export async function writeZipArchive(
  filePath: string,
  entries: readonly ZipEntryInput[],
  options?: ZipOptions,
): Promise<void> {
  const buffer = createZipArchive(entries, options);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, buffer);
}

/**
 * Reads all entry names in a ZIP archive buffer.
 */
export function readZipEntryNames(zipBuffer: Buffer): string[] {
  const names: string[] = [];
  let p = 0;
  while (p < zipBuffer.length - 22) {
    const sig = zipBuffer.readUInt32LE(p);
    if (sig === 0x04034b50) {
      const compSize = zipBuffer.readUInt32LE(p + 18);
      const nameLen = zipBuffer.readUInt16LE(p + 26);
      const extraLen = zipBuffer.readUInt16LE(p + 28);
      const name = zipBuffer.toString('utf8', p + 30, p + 30 + nameLen);
      names.push(name);
      p = p + 30 + nameLen + extraLen + compSize;
    } else {
      p++;
    }
  }
  return names;
}

/**
 * Extracts a specific named entry from a ZIP archive buffer.
 */
export function readZipEntry(zipBuffer: Buffer, entryName: string): Buffer | null {
  const normalizedTarget = entryName.replace(/\\/g, '/');
  let p = 0;
  while (p < zipBuffer.length - 22) {
    const sig = zipBuffer.readUInt32LE(p);
    if (sig === 0x04034b50) {
      const method = zipBuffer.readUInt16LE(p + 8);
      const compSize = zipBuffer.readUInt32LE(p + 18);
      const nameLen = zipBuffer.readUInt16LE(p + 26);
      const extraLen = zipBuffer.readUInt16LE(p + 28);
      const name = zipBuffer.toString('utf8', p + 30, p + 30 + nameLen).replace(/\\/g, '/');
      const dataStart = p + 30 + nameLen + extraLen;
      const compData = zipBuffer.subarray(dataStart, dataStart + compSize);

      if (name === normalizedTarget) {
        if (method === 8) {
          return zlib.inflateRawSync(compData);
        }
        return Buffer.from(compData);
      }
      p = dataStart + compSize;
    } else {
      p++;
    }
  }
  return null;
}
