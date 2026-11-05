/**
 * Security, robustness, and edge-case tests for macro importers.
 * Covers tampered archives, corrupted binaries, malformed scripts/XML,
 * path sanitization, reserved Windows names, and boundary conditions.
 */

import { deflateRawSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { AmcMacroImporter } from '../amc-importer.js';
import { AutoHotkeyImporter } from '../autohotkey-importer.js';
import { AutoItImporter } from '../autoit-importer.js';
import {
  importBatch,
  normalizeFolder,
  resolveUniqueName,
  sanitizeName,
} from '../batch-report.js';
import { JitbitMrfImporter } from '../jitbit-mrf-importer.js';
import { LibraryBackupImporter } from '../library-backup-importer.js';
import { MacroPackageImporter } from '../macro-package-importer.js';
import { NativeJsonImporter } from '../native-json-importer.js';
import { RazerMacroImporter } from '../razer-importer.js';
import { TinyTaskImporter } from '../tinytask-importer.js';

/**
 * Creates a minimal valid ZIP in memory.
 */
function createSimpleZip(entries: { name: string; data: Uint8Array }[]): Uint8Array {
  const fileHeaders: Uint8Array[] = [];
  const centralHeaders: Uint8Array[] = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBytes = new TextEncoder().encode(entry.name);
    const compressed = deflateRawSync(entry.data);
    let crc = 0;
    // Compute simple CRC32
    let c = ~0;
    for (let i = 0; i < entry.data.length; i++) {
      c = (c >>> 8) ^ crcTable[(c ^ entry.data[i]!) & 0xff]!;
    }
    crc = ~c >>> 0;

    // Local file header (30 bytes + name + compressed data)
    const local = new Uint8Array(30 + nameBytes.length + compressed.length);
    const lv = new DataView(local.buffer, local.byteOffset, local.byteLength);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);
    lv.setUint16(6, 0, true);
    lv.setUint16(8, 8, true); // Deflate
    lv.setUint16(10, 0, true);
    lv.setUint16(12, 0, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, compressed.length, true);
    lv.setUint32(22, entry.data.length, true);
    lv.setUint16(26, nameBytes.length, true);
    lv.setUint16(28, 0, true);
    local.set(nameBytes, 30);
    local.set(compressed, 30 + nameBytes.length);
    fileHeaders.push(local);

    // Central directory header (46 bytes + name)
    const central = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(central.buffer, central.byteOffset, central.byteLength);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(8, 0, true);
    cv.setUint16(10, 8, true);
    cv.setUint16(12, 0, true);
    cv.setUint16(14, 0, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, compressed.length, true);
    cv.setUint32(24, entry.data.length, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint16(30, 0, true);
    cv.setUint16(32, 0, true);
    cv.setUint16(34, 0, true);
    cv.setUint16(36, 0, true);
    cv.setUint32(38, 0, true);
    cv.setUint32(42, offset, true);
    central.set(nameBytes, 46);
    centralHeaders.push(central);

    offset += local.length;
  }

  const centralSize = centralHeaders.reduce((s, h) => s + h.length, 0);
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer, eocd.byteOffset, eocd.byteLength);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(4, 0, true);
  ev.setUint16(6, 0, true);
  ev.setUint16(8, entries.length, true);
  ev.setUint16(10, entries.length, true);
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, offset, true);
  ev.setUint16(20, 0, true);

  const totalLength = offset + centralSize + 22;
  const result = new Uint8Array(totalLength);
  let pos = 0;
  for (const part of [...fileHeaders, ...centralHeaders, eocd]) {
    result.set(part, pos);
    pos += part.length;
  }
  return result;
}

const crcTable = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  crcTable[n] = c >>> 0;
}

describe('Security & Robustness: Archive Tampering & Boundaries', () => {
  it('MacroPackage rejects package with tampered macro.json checksum', () => {
    const manifest = {
      format: 'macro-recorder/macro-package',
      formatVersion: 1,
      macroEntry: 'macro.json',
      macroSha256: '0000000000000000000000000000000000000000000000000000000000000000',
    };
    const zip = createSimpleZip([
      { name: 'manifest.json', data: new TextEncoder().encode(JSON.stringify(manifest)) },
      { name: 'macro.json', data: new TextEncoder().encode('{"schemaVersion":12,"name":"test","events":[]}') },
    ]);
    expect(() => MacroPackageImporter.import(zip, 'tampered')).toThrow(
      /checksum does not match/i,
    );
  });

  it('MacroPackage rejects package with unsupported manifest version', () => {
    const manifest = {
      format: 'macro-recorder/macro-package',
      formatVersion: 99,
      macroEntry: 'macro.json',
      macroSha256: 'abc',
    };
    const zip = createSimpleZip([
      { name: 'manifest.json', data: new TextEncoder().encode(JSON.stringify(manifest)) },
      { name: 'macro.json', data: new TextEncoder().encode('{}') },
    ]);
    expect(() => MacroPackageImporter.import(zip, 'unsupported')).toThrow(
      /version .* is not supported/i,
    );
  });

  it('MacroPackage rejects package with invalid format identifier', () => {
    const manifest = {
      format: 'not-macro-recorder',
      formatVersion: 1,
      macroEntry: 'macro.json',
      macroSha256: 'abc',
    };
    const zip = createSimpleZip([
      { name: 'manifest.json', data: new TextEncoder().encode(JSON.stringify(manifest)) },
      { name: 'macro.json', data: new TextEncoder().encode('{}') },
    ]);
    expect(() => MacroPackageImporter.import(zip, 'bad-format')).toThrow(
      /not a Macro Recorder package/i,
    );
  });

  it('MacroPackage rejects package missing macro.json', () => {
    const manifest = {
      format: 'macro-recorder/macro-package',
      formatVersion: 1,
      macroEntry: 'macro.json',
      macroSha256: 'abc',
    };
    const zip = createSimpleZip([
      { name: 'manifest.json', data: new TextEncoder().encode(JSON.stringify(manifest)) },
    ]);
    expect(() => MacroPackageImporter.import(zip, 'missing')).toThrow(
      /has no macro\.json/i,
    );
  });

  it('LibraryBackup rejects backup with tampered checksum', () => {
    const manifest = {
      format: 'macro-recorder/library-backup',
      formatVersion: 1,
      sha256: '0000000000000000000000000000000000000000000000000000000000000000',
    };
    const zip = createSimpleZip([
      { name: 'manifest.json', data: new TextEncoder().encode(JSON.stringify(manifest)) },
      { name: 'Macros/m.macro.json', data: new TextEncoder().encode('{"schemaVersion":12,"name":"test","events":[]}') },
    ]);
    expect(() => LibraryBackupImporter.import(zip, 'tampered-backup')).toThrow(
      /checksum does not match/i,
    );
  });

  it('LibraryBackup rejects backup with bad format identifier', () => {
    const manifest = {
      format: 'not-backup',
      formatVersion: 1,
      sha256: 'abc',
    };
    const zip = createSimpleZip([
      { name: 'manifest.json', data: new TextEncoder().encode(JSON.stringify(manifest)) },
    ]);
    expect(() => LibraryBackupImporter.import(zip, 'bad-backup')).toThrow(
      /not a Macro Recorder library backup/i,
    );
  });

  it('LibraryBackup rejects backup missing manifest.json', () => {
    const zip = createSimpleZip([
      { name: 'Macros/m.macro.json', data: new TextEncoder().encode('{}') },
    ]);
    expect(() => LibraryBackupImporter.import(zip, 'no-manifest')).toThrow(
      /missing manifest\.json/i,
    );
  });
});

describe('Security & Robustness: Binary Corruptions (TinyTask)', () => {
  it('TinyTask rejects truncated header (< 8 bytes)', () => {
    const shortBytes = new Uint8Array([0x4d, 0x52, 0x00]);
    expect(() => TinyTaskImporter.import(shortBytes, 'corrupted')).toThrow(
      /not look like a TinyTask recording/i,
    );
  });

  it('TinyTask rejects file where trailing bytes violate 20-byte record alignment', () => {
    const bytes = new Uint8Array([
      // Header: 8 bytes
      0x4d, 0x52, 0x00, 0x01, 0x02, 0x03, 0x04, 0x05,
      // 1 valid EVENTMSG record: 20 bytes (KeyDown VK 65)
      0x00, 0x01, 0x00, 0x00, // WM_KEYDOWN
      0x41, 0x00, 0x00, 0x00, // paramL = 65
      0x00, 0x00, 0x00, 0x00, // paramH
      0x00, 0x00, 0x00, 0x00, // time = 0
      0x00, 0x00, 0x00, 0x00, // hwnd
      // 5 trailing garbage bytes (not a multiple of 20 bytes)
      0xff, 0xfe, 0xfd, 0xfc, 0xfb,
    ]);
    expect(() => TinyTaskImporter.import(bytes, 'unaligned')).toThrow(
      /not look like a TinyTask recording/i,
    );
  });

  it('TinyTask rejects file with valid header but zero event records', () => {
    const headerOnly = new Uint8Array([
      0x4d, 0x52, 0x00, 0x01, 0x02, 0x03, 0x04, 0x05,
    ]);
    expect(() => TinyTaskImporter.import(headerOnly, 'empty')).toThrow(
      /does not look like a TinyTask recording/i,
    );
  });
});

describe('Security & Robustness: Malformed XML (AMC & Razer)', () => {
  it('AMC importer rejects completely invalid XML', () => {
    expect(() => AmcMacroImporter.import('<<<>>>not xml at all', 'invalid')).toThrow(
      /Damaged AMC\/XML file/i,
    );
  });

  it('AMC importer rejects valid XML without DefaultMacro structure', () => {
    const xml = '<Root><OtherData>test</OtherData></Root>';
    expect(() => AmcMacroImporter.import(xml, 'empty-amc')).toThrow(
      /The AMC file has no DefaultMacro section/i,
    );
  });

  it('Razer importer rejects completely invalid XML', () => {
    expect(() => RazerMacroImporter.import('<<<>>>broken', 'invalid')).toThrow(
      /Damaged Razer XML file/i,
    );
  });

  it('Razer importer rejects empty MacroEvents list', () => {
    const xml = '<Macro><Name>Empty</Name><MacroEvents></MacroEvents></Macro>';
    expect(() => RazerMacroImporter.import(xml, 'empty-razer')).toThrow(
      /No importable actions/i,
    );
  });

  it('Razer importer handles unknown child tags gracefully', () => {
    const xml = `<Macro><Name>WithUnknown</Name><MacroEvents>
      <MacroEvent><UnknownTag>stuff</UnknownTag></MacroEvent>
      <MacroEvent><KeyboardEvent><VirtualKey>65</VirtualKey><State>Down</State></KeyboardEvent></MacroEvent>
    </MacroEvents></Macro>`;
    const result = RazerMacroImporter.import(xml, 'unknown-child');
    expect(result.macros.length).toBe(1);
    expect(result.macros[0]!.events.length).toBe(1);
  });
});

describe('Security & Robustness: Script Importers (AHK, AU3, MRF)', () => {
  it('AHK importer clamps loop counts exceeding 10000', () => {
    const script = `#Requires AutoHotkey v2.0
F1:: {
    Send "a"
    Loop 50000 {
        Send "x"
    }
}`;
    const result = AutoHotkeyImporter.import(script, 'loop-test');
    expect(result.warnings.some((w) => w.message.includes('0–10000'))).toBe(true);
    expect(result.macros.length).toBe(1);
  });

  it('AHK importer warns on overly deep block nesting (> 32 levels)', () => {
    let script = '#Requires AutoHotkey v2.0\nF1:: {\nSend "a"\n';
    for (let i = 0; i < 35; i++) {
      script += 'Loop 1 {\n';
    }
    script += 'Send "x"\n';
    for (let i = 0; i < 35; i++) {
      script += '}\n';
    }
    script += '}\n';

    const result = AutoHotkeyImporter.import(script, 'deep-nesting');
    expect(
      result.warnings.some((w) =>
        w.message.includes('Block nesting is too deep'),
      ),
    ).toBe(true);
    expect(result.macros.length).toBe(1);
  });

  it('AHK importer handles unclosed hotkey block safely', () => {
    const script = `#Requires AutoHotkey v2.0
F1:: {
    Send "a"
`;
    const result = AutoHotkeyImporter.import(script, 'unclosed');
    expect(result.macros.length).toBe(1);
    expect(
      result.warnings.some((w) => w.message.includes('Unclosed hotkey block')),
    ).toBe(true);
  });

  it('AutoIt importer handles unclosed comments safely', () => {
    const script = `#cs
This comment block is never closed
Send("{TAB}")
`;
    expect(() => AutoItImporter.import(script, 'unclosed-comment')).toThrow(
      /No importable actions/i,
    );
  });

  it('Jitbit MRF importer handles paths with colons inside TYPE TEXT', () => {
    const script = `TYPE TEXT : C:\\Program Files\\App\\app.exe
COMMENT : end`;
    const result = JitbitMrfImporter.import(script, 'colon-path');
    expect(result.macros.length).toBe(1);
    const typeText = result.macros[0]!.events.find((e) => e.type === 'TypeText');
    expect(typeText?.text).toBe('C:\\Program Files\\App\\app.exe');
  });

  it('Jitbit MRF importer handles relative coordinate prefix R and sets warning', () => {
    const script = `Mouse : R150 : R250 : LeftClick : 0 : 0`;
    const result = JitbitMrfImporter.import(script, 'relative-mouse');
    expect(result.macros.length).toBe(1);
    expect(
      result.warnings.some((w) => w.message.includes('Window-relative coordinates (R prefix)')),
    ).toBe(true);
  });
});

describe('Security & Robustness: Native JSON Importer', () => {
  it('Native JSON importer throws on malformed JSON', () => {
    expect(() => NativeJsonImporter.import('{ bad json: true', 'bad')).toThrow(
      /Empty macro file/i,
    );
  });

  it('Native JSON importer throws on empty or array JSON', () => {
    expect(() => NativeJsonImporter.import('[]', 'array')).toThrow(
      /Empty macro file/i,
    );
    expect(() => NativeJsonImporter.import('null', 'null')).toThrow(
      /Empty macro file/i,
    );
  });

  it('Native JSON importer rejects future unsupported schema version', () => {
    const futureJson = JSON.stringify({
      SchemaVersion: 99,
      Name: 'Future',
      Events: [{ TimeMicroseconds: 0, Type: 'KeyDown', VirtualKey: 65 }],
    });
    expect(() => NativeJsonImporter.import(futureJson, 'future')).toThrow(
      /Macro schema version 99 is newer than supported version 12/i,
    );
  });
});

describe('Sanitization & Path Security', () => {
  it('sanitizeName handles Windows reserved device names', () => {
    expect(sanitizeName('con')).toBe('con_');
    expect(sanitizeName('PRN')).toBe('PRN_');
    expect(sanitizeName('aux')).toBe('aux_');
    expect(sanitizeName('NUL')).toBe('NUL_');
    expect(sanitizeName('com1')).toBe('com1_');
    expect(sanitizeName('LPT9')).toBe('LPT9_');
  });

  it('sanitizeName strips invalid characters and control codes', () => {
    expect(sanitizeName('my:macro/test*name?')).toBe('my_macro_test_name_');
    expect(sanitizeName('   ...   ')).toBe('macro');
    expect(sanitizeName('')).toBe('macro');
  });

  it('resolveUniqueName generates numbered suffixes on collision', () => {
    const taken = new Set(['macro', 'macro 2', 'macro 3']);
    expect(resolveUniqueName('macro', taken)).toBe('macro 4');
  });

  it('normalizeFolder strips path traversal dots and leading/trailing slashes', () => {
    expect(normalizeFolder('../../secret/games/')).toBe('secret/games');
    expect(normalizeFolder('\\\\Windows\\System32\\..\\app')).toBe('Windows/System32/app');
    expect(normalizeFolder('   ')).toBe('');
  });

  it('importBatch processes multiple files and collects errors with continueOnError', () => {
    const batch = importBatch(
      [
        { path: 'test.ahk', content: 'F1:: { Send "a" }' },
        { path: 'corrupted.rec', content: new Uint8Array([0x00, 0x01]) },
        { path: 'test.au3', content: 'Sleep(10)\nSend("{TAB}")' },
      ],
      { continueOnError: true },
    );

    expect(batch.totalFiles).toBe(3);
    expect(batch.successfulFiles).toBe(2);
    expect(batch.failedFiles).toBe(1);
    expect(batch.totalMacros).toBe(2);
    expect(batch.results.length).toBe(2);
    expect(batch.warnings.some((w) => w.message.includes('corrupted.rec'))).toBe(true);
  });

  it('importBatch aborts on first failure when continueOnError is false', () => {
    const batch = importBatch(
      [
        { path: 'corrupted.rec', content: new Uint8Array([0x00, 0x01]) },
        { path: 'test.ahk', content: 'F1:: { Send "a" }' },
      ],
      { continueOnError: false },
    );

    expect(batch.totalFiles).toBe(2);
    expect(batch.successfulFiles).toBe(0);
    expect(batch.failedFiles).toBe(1);
    expect(batch.results.length).toBe(0);
  });
});
