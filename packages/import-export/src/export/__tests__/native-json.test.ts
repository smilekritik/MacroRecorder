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

import { NativeJsonExporter, exportNativeJson, exportNativeJsonToFile } from '../native-json.js';

describe('NativeJsonExporter', () => {
  it('exports macro to schema 12 open JSON format', () => {
    const macro: MacroDefinition = createDefaultMacroDefinition({
      name: 'Sample Export',
      events: [
        {
          timeMicroseconds: 0,
          type: MacroEventType.KeyDown,
          virtualKey: 65,
          scanCode: 30,
          extended: false,
        },
      ] as unknown as MacroEvent[],
    });

    const json = exportNativeJson(macro);
    expect(json.endsWith('\n')).toBe(true);

    const parsed = JSON.parse(json);
    expect(parsed.SchemaVersion).toBe(12);
    expect(parsed.Name).toBe('Sample Export');
    expect(parsed.Events).toHaveLength(1);
    expect(parsed.Events[0].VirtualKey).toBe(65);
  });

  it('writes exported macro to disk', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'native-test-'));
    const filePath = path.join(tmpDir, 'test.macro.json');

    try {
      const macro = createDefaultMacroDefinition({ name: 'File Test' });
      await exportNativeJsonToFile(macro, filePath);

      const exists = await fs
        .stat(filePath)
        .then(() => true)
        .catch(() => false);
      expect(exists).toBe(true);

      const content = await fs.readFile(filePath, 'utf8');
      expect(content).toContain('"Name": "File Test"');
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });

  it('supports NativeJsonExporter class wrapper', () => {
    const macro = createDefaultMacroDefinition({ name: 'Class Test' });
    const json = NativeJsonExporter.export(macro);
    expect(json).toContain('"Name": "Class Test"');
  });
});
