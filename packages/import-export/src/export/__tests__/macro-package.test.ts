import * as crypto from 'node:crypto';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  type MacroDefinition,
  type MacroEvent,
  createDefaultMacroDefinition,
  MacroEventType,
} from '../../../../contracts/src/index.js';

import {
  MACRO_PACKAGE_FORMAT_ID,
  MACRO_PACKAGE_FORMAT_VERSION,
  MacroPackageExporter,
  exportMacroPackage,
  exportMacroPackageToFile,
} from '../macro-package.js';
import { readZipEntry, readZipEntryNames } from '../zip-writer.js';

describe('MacroPackageExporter', () => {
  it('packages single macro and manifest into valid .mrmacro ZIP', () => {
    const macro: MacroDefinition = createDefaultMacroDefinition({
      id: '12345678-1234-1234-1234-123456789abc',
      name: 'Package Test',
      events: [
        {
          timeMicroseconds: 0,
          type: MacroEventType.KeyDown,
          virtualKey: 65,
        },
      ] as unknown as MacroEvent[],
    });

    const buffer = exportMacroPackage(macro);
    expect(Buffer.isBuffer(buffer)).toBe(true);

    const names = readZipEntryNames(buffer);
    expect(names).toContain('manifest.json');
    expect(names).toContain('macro.json');

    const manifestBuf = readZipEntry(buffer, 'manifest.json');
    expect(manifestBuf).not.toBeNull();
    const manifest = JSON.parse(manifestBuf!.toString('utf8'));

    expect(manifest.format).toBe(MACRO_PACKAGE_FORMAT_ID);
    expect(manifest.formatVersion).toBe(MACRO_PACKAGE_FORMAT_VERSION);
    expect(manifest.macroSchemaVersion).toBe(12);
    expect(manifest.macroEntry).toBe('macro.json');
    expect(typeof manifest.macroSha256).toBe('string');
    expect(manifest.macroSha256).toHaveLength(64);
    expect(manifest.sourceDpi).toBe(96);

    const macroBuf = readZipEntry(buffer, 'macro.json');
    expect(macroBuf).not.toBeNull();

    const expectedHash = crypto.createHash('sha256').update(macroBuf!).digest('hex').toLowerCase();
    expect(manifest.macroSha256).toBe(expectedHash);
  });

  it('writes package to disk and verifies archive integrity', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'pkg-test-'));
    const pkgPath = path.join(tmpDir, 'test.mrmacro');

    try {
      const macro = createDefaultMacroDefinition({ name: 'Disk Macro' });
      await exportMacroPackageToFile(macro, pkgPath);

      const exists = await fs
        .stat(pkgPath)
        .then(() => true)
        .catch(() => false);
      expect(exists).toBe(true);

      const fileBuffer = await fs.readFile(pkgPath);
      const names = readZipEntryNames(fileBuffer);
      expect(names).toEqual(['manifest.json', 'macro.json']);
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });

  it('supports MacroPackageExporter class wrapper', () => {
    const macro = createDefaultMacroDefinition({ name: 'Wrapper Test' });
    const buffer = MacroPackageExporter.export(macro);
    expect(buffer.length).toBeGreaterThan(0);
  });
});
