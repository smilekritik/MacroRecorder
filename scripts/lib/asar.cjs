/**
 * Self-contained ASAR archive packer and unpacker (CommonJS).
 * Implements the Chromium / Electron Pickle + JSON ASAR archive format
 * with support for unpack rules (unpacked: true) and directory traversal.
 */

const fs = require('fs');
const path = require('path');

class AsarPacker {
  static isUnpacked(relPath, patterns = []) {
    const normalized = relPath.replace(/\\/g, '/');
    for (const pat of patterns) {
      if (typeof pat === 'string') {
        if (pat.startsWith('*.')) {
          const ext = pat.slice(1);
          if (normalized.endsWith(ext)) return true;
        } else if (normalized.includes(pat)) {
          return true;
        }
      } else if (pat instanceof RegExp && pat.test(normalized)) {
        return true;
      }
    }
    return false;
  }

  static pack(options) {
    const origNoAsar = process.noAsar;
    process.noAsar = true;
    try {
      const { srcDir, destFile, unpackPatterns = [] } = options;
      const absSrc = path.resolve(srcDir);
      const absDest = path.resolve(destFile);
      const unpackedDir = `${absDest}.unpacked`;

      const rootFiles = {};
      const filesToConcatenate = [];
      let currentOffset = 0n;
      let totalFiles = 0;
      let unpackedCount = 0;

      function walk(currentDir, parentNode) {
        const entries = fs.readdirSync(currentDir, { withFileTypes: true });
        entries.sort((a, b) => a.name.localeCompare(b.name));

        for (const entry of entries) {
          const fullPath = path.join(currentDir, entry.name);
          const relPath = path.relative(absSrc, fullPath);

          if (entry.isDirectory()) {
            const dirNode = { files: {} };
            parentNode[entry.name] = dirNode;
            walk(fullPath, dirNode.files);
          } else if (entry.isFile()) {
            totalFiles++;
            const stat = fs.statSync(fullPath);
            const shouldUnpack = AsarPacker.isUnpacked(relPath, unpackPatterns);

            if (shouldUnpack) {
              unpackedCount++;
              parentNode[entry.name] = {
                size: stat.size,
                unpacked: true,
              };
              const destUnpacked = path.join(unpackedDir, relPath);
              fs.mkdirSync(path.dirname(destUnpacked), { recursive: true });
              fs.copyFileSync(fullPath, destUnpacked);
            } else {
              parentNode[entry.name] = {
                size: stat.size,
                offset: currentOffset.toString(),
              };
              currentOffset += BigInt(stat.size);
              filesToConcatenate.push({ absPath: fullPath, size: stat.size });
            }
          }
        }
      }

      walk(absSrc, rootFiles);

      const headerObj = { files: rootFiles };
      const jsonStr = JSON.stringify(headerObj);
      const jsonBuf = Buffer.from(jsonStr, 'utf-8');
      const jsonLen = jsonBuf.length;

      const padding = (4 - (jsonLen % 4)) % 4;
      const alignedLen = jsonLen + padding;

      const headerBuf = Buffer.alloc(16 + alignedLen);
      headerBuf.writeUInt32LE(4, 0);
      headerBuf.writeUInt32LE(alignedLen + 8, 4);
      headerBuf.writeUInt32LE(alignedLen + 4, 8);
      headerBuf.writeUInt32LE(jsonLen, 12);
      jsonBuf.copy(headerBuf, 16);
      if (padding > 0) {
        headerBuf.fill(0, 16 + jsonLen, 16 + alignedLen);
      }

      fs.mkdirSync(path.dirname(absDest), { recursive: true });
      const outFd = fs.openSync(absDest, 'w');
      try {
        fs.writeSync(outFd, headerBuf);

        const buffer = Buffer.alloc(64 * 1024);
        for (const item of filesToConcatenate) {
          const inFd = fs.openSync(item.absPath, 'r');
          try {
            let bytesRead = 0;
            let pos = 0;
            while ((bytesRead = fs.readSync(inFd, buffer, 0, buffer.length, pos)) > 0) {
              fs.writeSync(outFd, buffer, 0, bytesRead);
              pos += bytesRead;
            }
          } finally {
            fs.closeSync(inFd);
          }
        }
      } finally {
        fs.closeSync(outFd);
      }

      const finalStat = fs.statSync(absDest);
      return {
        totalFiles,
        packedSize: finalStat.size,
        unpackedCount,
      };
    } finally {
      process.noAsar = origNoAsar;
    }
  }

  static readHeader(asarFile) {
    const origNoAsar = process.noAsar;
    process.noAsar = true;
    try {
      const fd = fs.openSync(asarFile, 'r');
      try {
        const pickleHead = Buffer.alloc(16);
        fs.readSync(fd, pickleHead, 0, 16, 0);
        const jsonLen = pickleHead.readUInt32LE(12);
        const jsonBuf = Buffer.alloc(jsonLen);
        fs.readSync(fd, jsonBuf, 0, jsonLen, 16);
        return JSON.parse(jsonBuf.toString('utf-8'));
      } finally {
        fs.closeSync(fd);
      }
    } finally {
      process.noAsar = origNoAsar;
    }
  }

  static extractAll(asarFile, destDir) {
    const origNoAsar = process.noAsar;
    process.noAsar = true;
    try {
      const header = this.readHeader(asarFile);
      const fd = fs.openSync(asarFile, 'r');
      const pickleHead = Buffer.alloc(16);
      fs.readSync(fd, pickleHead, 0, 16, 0);
      const jsonLen = pickleHead.readUInt32LE(12);
      const padding = (4 - (jsonLen % 4)) % 4;
      const dataOffset = 16 + jsonLen + padding;

      function extractNode(node, currentDest) {
        fs.mkdirSync(currentDest, { recursive: true });
        for (const [name, entry] of Object.entries(node.files || {})) {
          const targetPath = path.join(currentDest, name);
          if (entry.files) {
            extractNode(entry, targetPath);
          } else if (!entry.unpacked) {
            const offset = BigInt(entry.offset);
            const buf = Buffer.alloc(entry.size);
            fs.readSync(fd, buf, 0, entry.size, Number(BigInt(dataOffset) + offset));
            fs.writeFileSync(targetPath, buf);
          }
        }
      }

      try {
        extractNode(header, destDir);
      } finally {
        fs.closeSync(fd);
      }
    } finally {
      process.noAsar = origNoAsar;
    }
  }
}

module.exports = { AsarPacker };
