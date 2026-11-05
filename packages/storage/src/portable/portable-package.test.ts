import * as fs from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import { describe, expect, it, beforeEach, afterEach } from 'vitest';

import {
  DEFAULT_PLAYBACK_OPTIONS,
  createDefaultMacroDefinition,
  MacroEventType,
  MacroImportFormat,
  MouseButton,
  TargetMode,
  type PixelColorTriggerEvent,
  type MouseMoveEvent,
} from '../../../contracts/src/index.js';

import { MacroLibraryStore } from '../library/library-store.js';
import {
  createPortableFileName,
  exportPortablePackage,
  importPortablePackage,
} from './portable-package.js';
import { createZipArchive, hasZipSignature, readZipArchive } from './zip.js';
import { PORTABLE_FORMAT_ID } from './types.js';

describe('Portable Macro Packages (.mrmacro)', () => {
  let root: string;
  let store: MacroLibraryStore;

  beforeEach(() => {
    root = MacroLibraryStore.createTemporaryRoot();
    store = new MacroLibraryStore(root);
  });

  afterEach(() => {
    MacroLibraryStore.deleteTemporaryRoot(root);
  });

  // --- ---
  it('MrMacroPackage_RoundTripsPortableDataAndHasManifest', async () => {
    const filePath = path.join(root, 'transfer.mrmacro');
    const source = createDefaultMacroDefinition({
      name: 'transfer',
      description: 'portable',
      isEnabled: true,
      hotkey: {
        virtualKey: 0,
        mouseButton: MouseButton.X1,
        wheel: 'None',
        control: true,
        alt: false,
        shift: false,
        windows: false,
      },
      playback: {
        ...DEFAULT_PLAYBACK_OPTIONS,
        activationMode: 'Once',
        targetMode: TargetMode.SpecificWindow,
        targetProcessName: 'sample',
        targetWindowTitle: 'Sample window',
      },
      events: [
        {
          id: crypto.randomUUID(),
          timeMicroseconds: 0,
          type: MacroEventType.PixelColorTrigger,
          pixelX: 140,
          pixelY: -30,
          pixelColor: 0x123abc,
          triggerCooldownMilliseconds: 4200,
          comment: '',
        },
        {
          id: crypto.randomUUID(),
          timeMicroseconds: 50_000,
          type: MacroEventType.KeyDown,
          device: 'Keyboard',
          virtualKey: 0x45,
          scanCode: 18,
          extended: false,
          comment: '',
        },
      ],
    });

    const originalId = source.id;
    await exportPortablePackage(source, filePath, { currentDisplayDpi: 96 });

    // Verify ZIP archive entries
    const buffer = fs.readFileSync(filePath);
    const entries = readZipArchive(buffer);
    expect(entries.has('manifest.json')).toBe(true);
    expect(entries.has('macro.json')).toBe(true);

    const manifest = JSON.parse(entries.get('manifest.json')!.toString('utf-8'));
    expect(manifest.format).toBe(PORTABLE_FORMAT_ID);
    expect(manifest.formatVersion).toBe(1);
    expect(manifest.sourceDpi).toBe(96);
    expect(manifest.macroEntry).toBe('macro.json');
    expect(manifest.macroSha256).toBeTruthy();

    // Import package
    const result = await importPortablePackage(filePath, { store, currentDisplayDpi: 96 });
    expect(result.macros).toHaveLength(1);
    const imported = result.macros[0]!;

    expect(result.format).toBe(MacroImportFormat.MacroPackage);
    expect(imported.id).not.toBe(originalId);
    expect(imported.isEnabled).toBe(false);
    expect(imported.name).toBe('transfer');
    expect(imported.hotkey.mouseButton).toBe(MouseButton.X1);
    expect(imported.playback.targetMode).toBe(TargetMode.SpecificWindow);

    const firstEvent = imported.events[0] as PixelColorTriggerEvent;
    expect(firstEvent.triggerCooldownMilliseconds).toBe(4200);
    expect(firstEvent.pixelColor).toBe(0x123abc);

    expect(result.warnings.length).toBeGreaterThanOrEqual(2);
    expect(
      result.warnings.some((w) =>
        w.message.toLowerCase().includes('disabled so it can be reviewed safely'),
      ),
    ).toBe(false);
  });

  // --- ---
  it('MrMacroPackage_RejectsModifiedPayload', async () => {
    const filePath = path.join(root, 'damaged.mrmacro');
    const source = createDefaultMacroDefinition({ name: 'checksum' });
    await exportPortablePackage(source, filePath);

    // Tamper with macro.json by replacing its content with different bytes
    const buffer = fs.readFileSync(filePath);
    const entries = readZipArchive(buffer);
    const manifestBytes = entries.get('manifest.json')!;
    const tamperedZip = createZipArchive([
      { name: 'manifest.json', data: manifestBytes },
      { name: 'macro.json', data: '{}' },
    ]);
    fs.writeFileSync(filePath, tamperedZip);

    await expect(importPortablePackage(filePath, { store })).rejects.toThrow(/checksum/i);
  });

  // --- ---
  it('PortableImport_RescalesPixelCoordinatesForDpi', async () => {
    const filePath = path.join(root, 'dpi.mrmacro');
    const macro = createDefaultMacroDefinition({
      name: 'dpi',
      events: [
        {
          id: crypto.randomUUID(),
          timeMicroseconds: 0,
          type: MacroEventType.PixelColorTrigger,
          pixelX: 100,
          pixelY: 200,
          pixelColor: 0x112233,
          triggerCooldownMilliseconds: 0,
          comment: '',
        },
      ],
    });

    await exportPortablePackage(macro, filePath, { currentDisplayDpi: 96 });

    const result = await importPortablePackage(filePath, { store, currentDisplayDpi: 144 });
    expect(result.macros).toHaveLength(1);
    const imported = result.macros[0]!;
    const trigger = imported.events[0] as PixelColorTriggerEvent;

    expect(trigger.pixelX).toBe(150); // 100 * 144 / 96
    expect(trigger.pixelY).toBe(300); // 200 * 144 / 96

    expect(
      result.warnings.some((w) =>
        w.message.includes('Screen coordinates were rescaled from DPI 96 to 144.'),
      ),
    ).toBe(true);
  });

  // --- Golden Fixtures Compatibility ---
  it('imports golden fixture source-dpi-96.mrmacro and rescales for target DPI 144', async () => {
    const fixturePath = path.resolve(
      __dirname,
      '../../../../tests/fixtures/dpi/source-dpi-96.mrmacro',
    );
    if (!fs.existsSync(fixturePath)) return;

    const result = await importPortablePackage(fixturePath, { currentDisplayDpi: 144 });
    const macro = result.macros[0]!;

    const trigger = macro.events.find((e) => e.type === MacroEventType.PixelColorTrigger) as
      | PixelColorTriggerEvent
      | undefined;
    const move = macro.events.find((e) => e.type === MacroEventType.MouseMove && e.absoluteMove) as
      | MouseMoveEvent
      | undefined;

    expect(trigger?.pixelX).toBe(150);
    expect(trigger?.pixelY).toBe(300);
    expect(move?.deltaX).toBe(180);
    expect(move?.deltaY).toBe(360);

    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]?.message).toBe(
      'Screen coordinates were rescaled from DPI 96 to 144. Verify them for a different monitor layout.',
    );
  });

  it('imports golden fixture source-dpi-144.mrmacro and rescales for target DPI 96', async () => {
    const fixturePath = path.resolve(
      __dirname,
      '../../../../tests/fixtures/dpi/source-dpi-144.mrmacro',
    );
    if (!fs.existsSync(fixturePath)) return;

    const result = await importPortablePackage(fixturePath, { currentDisplayDpi: 96 });
    const macro = result.macros[0]!;

    const trigger = macro.events.find((e) => e.type === MacroEventType.PixelColorTrigger) as
      | PixelColorTriggerEvent
      | undefined;
    const move = macro.events.find((e) => e.type === MacroEventType.MouseMove && e.absoluteMove) as
      | MouseMoveEvent
      | undefined;

    expect(trigger?.pixelX).toBe(100);
    expect(trigger?.pixelY).toBe(200);
    expect(move?.deltaX).toBe(120);
    expect(move?.deltaY).toBe(240);
  });

  it('imports golden fixture source-dpi-omitted.mrmacro without rescaling', async () => {
    const fixturePath = path.resolve(
      __dirname,
      '../../../../tests/fixtures/dpi/source-dpi-omitted.mrmacro',
    );
    if (!fs.existsSync(fixturePath)) return;

    const result = await importPortablePackage(fixturePath, { currentDisplayDpi: 144 });
    const macro = result.macros[0]!;

    const trigger = macro.events.find((e) => e.type === MacroEventType.PixelColorTrigger) as
      | PixelColorTriggerEvent
      | undefined;
    expect(trigger?.pixelX).toBe(100);
    expect(trigger?.pixelY).toBe(200);

    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]?.message).toBe(
      'The macro contains screen coordinates. Verify them when using a different resolution, DPI, or monitor layout.',
    );
  });

  // --- Security & Path Traversal Rejections ---
  it('rejects archives containing path traversal entry names', async () => {
    const filePath = path.join(root, 'traversal.mrmacro');
    const validMacro = createDefaultMacroDefinition({ name: 'valid' });
    await exportPortablePackage(validMacro, filePath);

    const buffer = fs.readFileSync(filePath);
    const entries = readZipArchive(buffer);
    const manifestBytes = entries.get('manifest.json')!;

    // Craft a zip with a traversal entry
    expect(() =>
      createZipArchive([
        { name: 'manifest.json', data: manifestBytes },
        { name: '../../etc/passwd', data: 'malicious' },
      ]),
    ).toThrow(/path traversal/i);
  });

  it('rejects manifest with unsupported future formatVersion', async () => {
    const filePath = path.join(root, 'unsupported-ver.mrmacro');
    const manifest = {
      format: PORTABLE_FORMAT_ID,
      formatVersion: 99,
      macroSchemaVersion: 12,
      createdAtUtc: new Date().toISOString(),
      macroEntry: 'macro.json',
      macroSha256: '0'.repeat(64),
    };
    const zip = createZipArchive([
      { name: 'manifest.json', data: JSON.stringify(manifest) },
      { name: 'macro.json', data: '{}' },
    ]);
    fs.writeFileSync(filePath, zip);

    await expect(importPortablePackage(filePath)).rejects.toThrow(
      '.mrmacro package version 99 is not supported by this application version.',
    );
  });

  it('rejects manifest with bad format signature', async () => {
    const filePath = path.join(root, 'bad-format.mrmacro');
    const manifest = {
      format: 'unknown/other-format',
      formatVersion: 1,
      macroSchemaVersion: 12,
      createdAtUtc: new Date().toISOString(),
      macroEntry: 'macro.json',
      macroSha256: '0'.repeat(64),
    };
    const zip = createZipArchive([
      { name: 'manifest.json', data: JSON.stringify(manifest) },
      { name: 'macro.json', data: '{}' },
    ]);
    fs.writeFileSync(filePath, zip);

    await expect(importPortablePackage(filePath)).rejects.toThrow(
      'This file is not a Macro Recorder package.',
    );
  });

  it('rejects package with missing manifest.json', async () => {
    const filePath = path.join(root, 'missing-manifest.mrmacro');
    const zip = createZipArchive([{ name: 'macro.json', data: '{}' }]);
    fs.writeFileSync(filePath, zip);

    await expect(importPortablePackage(filePath)).rejects.toThrow(
      'The .mrmacro package has no manifest.json.',
    );
  });

  it('rejects package with non-zip file content', async () => {
    const filePath = path.join(root, 'corrupted.mrmacro');
    fs.writeFileSync(filePath, 'not a zip file at all');

    expect(await hasZipSignature(filePath)).toBe(false);
    await expect(importPortablePackage(filePath)).rejects.toThrow(
      'This file is not a Macro Recorder package.',
    );
  });

  // --- Filename Sanitization ---
  it('creates safe portable file names', () => {
    expect(createPortableFileName('my macro')).toBe('my macro.mrmacro');
    expect(createPortableFileName('bad/name:test*?')).toBe('bad_name_test__.mrmacro');
    expect(createPortableFileName('trailing dots...')).toBe('trailing dots.mrmacro');
    expect(createPortableFileName('')).toBe('macro.mrmacro');
  });

  // --- Disambiguating names on import into store ---
  it('disambiguates name when imported into store with existing macro name', async () => {
    const existing = createDefaultMacroDefinition({ name: 'duplicate' });
    await store.save(existing);

    const filePath = path.join(root, 'dup.mrmacro');
    const macroToImport = createDefaultMacroDefinition({ name: 'duplicate' });
    await exportPortablePackage(macroToImport, filePath);

    const result = await importPortablePackage(filePath, { store });
    expect(result.macros[0]?.name).toBe('duplicate 2');
    expect(
      result.warnings.some((w) =>
        w.message.includes(
          'The name “duplicate” is already taken; the macro was saved as “duplicate 2”.',
        ),
      ),
    ).toBe(true);
  });

  // --- .NET / Legacy Application Readability ---
  it('newly exported .mrmacro is readable by .NET ZipFile', async () => {
    const filePath = path.join(root, 'dotnet_compat.mrmacro');
    const source = createDefaultMacroDefinition({ name: 'NetCompatMacro' });
    await exportPortablePackage(source, filePath);

    const { execSync } = await import('node:child_process');
    if (process.platform === 'win32') {
      const psCommand = `Add-Type -AssemblyName System.IO.Compression.FileSystem; $a = [System.IO.Compression.ZipFile]::OpenRead('${filePath.replace(/'/g, "''")}'); $a.Entries | ForEach-Object { $_.FullName }; $a.Dispose()`;
      const stdout = execSync(`powershell -NoProfile -Command "${psCommand}"`, {
        encoding: 'utf-8',
      });
      expect(stdout).toContain('manifest.json');
      expect(stdout).toContain('macro.json');
    }
  });
});
