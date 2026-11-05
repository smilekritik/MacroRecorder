/**
 * ImportProbe provides cached byte and text access with lazy BOM decoding.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

export class ImportProbe {
  private _text: string | null = null;
  public readonly extension: string;
  public readonly bytes: Uint8Array;
  public readonly looksBinary: boolean;

  public constructor(extension: string, bytes: Uint8Array | null | undefined) {
    const ext = extension ? extension.trim().toLowerCase() : '';
    this.extension = ext.length > 0 && !ext.startsWith('.') ? `.${ext}` : ext;
    this.bytes = bytes ?? new Uint8Array(0);
    this.looksBinary = ImportProbe.containsNul(this.bytes);
  }

  /**
   * Lazily decoded string content with BOM detection (UTF-8, UTF-16LE, UTF-16BE).
   */
  public get text(): string {
    if (this._text === null) {
      this._text = ImportProbe.decodeText(this.bytes);
    }
    return this._text;
  }

  public static containsNul(bytes: Uint8Array): boolean {
    const limit = Math.min(bytes.length, 512);
    for (let i = 0; i < limit; i++) {
      if (bytes[i] === 0) {
        return true;
      }
    }
    return false;
  }

  public static decodeText(bytes: Uint8Array): string {
    if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
      return new TextDecoder('utf-8').decode(bytes.subarray(3));
    }
    if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
      return new TextDecoder('utf-16le').decode(bytes.subarray(2));
    }
    if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
      return new TextDecoder('utf-16be').decode(bytes.subarray(2));
    }
    return new TextDecoder('utf-8').decode(bytes);
  }

  public static fromBytes(extension: string, bytes: Uint8Array): ImportProbe {
    return new ImportProbe(extension, bytes);
  }

  public static fromText(extension: string, text: string): ImportProbe {
    const encoded = new TextEncoder().encode(text);
    const probe = new ImportProbe(extension, encoded);
    probe._text = text;
    return probe;
  }

  public static async fromFile(filePath: string): Promise<ImportProbe> {
    const bytes = await fs.promises.readFile(filePath);
    const ext = path.extname(filePath);
    return new ImportProbe(ext, bytes);
  }

  public static fromFileSync(filePath: string): ImportProbe {
    const bytes = fs.readFileSync(filePath);
    const ext = path.extname(filePath);
    return new ImportProbe(ext, bytes);
  }
}
