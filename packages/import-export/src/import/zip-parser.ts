/**
 * Zero-dependency ZIP file reader using node:zlib.
 * Reads central directory records to handle .mrmacro and .mrbackup containers safely.
 */

import * as zlib from 'node:zlib';

export interface ZipEntry {
  name: string;
  data: Uint8Array;
}

export function isZipSignature(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 4 &&
    bytes[0] === 0x50 &&
    bytes[1] === 0x4b &&
    bytes[2] === 0x03 &&
    bytes[3] === 0x04
  );
}

export function readZipEntries(bytes: Uint8Array): Map<string, Uint8Array> {
  const buf = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (buf.length < 22) {
    throw new Error('File too small to be a valid ZIP archive');
  }

  // Find End of Central Directory Record (EOCD)
  let eocdOffset = -1;
  const searchLimit = Math.max(0, buf.length - 65557);
  for (let i = buf.length - 22; i >= searchLimit; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocdOffset = i;
      break;
    }
  }

  if (eocdOffset < 0) {
    throw new Error('Missing ZIP End of Central Directory record');
  }

  const totalEntries = buf.readUInt16LE(eocdOffset + 10);
  const cdOffset = buf.readUInt32LE(eocdOffset + 16);
  const entries = new Map<string, Uint8Array>();

  let cdPos = cdOffset;
  for (let i = 0; i < totalEntries; i++) {
    if (cdPos + 46 > buf.length) {
      throw new Error('ZIP central directory truncated');
    }
    const sig = buf.readUInt32LE(cdPos);
    if (sig !== 0x02014b50) {
      throw new Error(`Invalid central directory header signature: 0x${sig.toString(16)}`);
    }

    const method = buf.readUInt16LE(cdPos + 10);
    const compSize = buf.readUInt32LE(cdPos + 20);
    const uncompSize = buf.readUInt32LE(cdPos + 24);
    const nameLen = buf.readUInt16LE(cdPos + 28);
    const extraLen = buf.readUInt16LE(cdPos + 30);
    const commentLen = buf.readUInt16LE(cdPos + 32);
    const localOffset = buf.readUInt32LE(cdPos + 42);

    const nameStart = cdPos + 46;
    if (nameStart + nameLen > buf.length) {
      throw new Error('ZIP entry name truncated');
    }
    const name = buf.subarray(nameStart, nameStart + nameLen).toString('utf-8');
    cdPos = nameStart + nameLen + extraLen + commentLen;

    // Read local header to calculate actual payload start
    if (localOffset + 30 > buf.length) {
      throw new Error('ZIP local file header truncated');
    }
    const localSig = buf.readUInt32LE(localOffset);
    if (localSig !== 0x04034b50) {
      throw new Error(`Invalid local file header signature at offset ${localOffset}`);
    }
    const localNameLen = buf.readUInt16LE(localOffset + 26);
    const localExtraLen = buf.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + localNameLen + localExtraLen;

    if (dataStart + compSize > buf.length) {
      throw new Error(`ZIP compressed payload truncated for entry: ${name}`);
    }

    const compressed = buf.subarray(dataStart, dataStart + compSize);
    let decompressed: Uint8Array;
    if (method === 0) {
      decompressed = new Uint8Array(compressed);
    } else if (method === 8) {
      try {
        const inflated = zlib.inflateRawSync(compressed);
        decompressed = new Uint8Array(inflated.buffer, inflated.byteOffset, inflated.byteLength);
      } catch (err) {
        throw new Error(
          `Failed to decompress ZIP entry "${name}": ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    } else {
      throw new Error(`Unsupported compression method ${method} in ZIP entry "${name}"`);
    }

    if (uncompSize > 0 && decompressed.length !== uncompSize) {
      throw new Error(
        `Uncompressed size mismatch for "${name}": expected ${uncompSize}, got ${decompressed.length}`,
      );
    }

    entries.set(name, decompressed);
  }

  return entries;
}
