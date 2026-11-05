/**
 * MacroImporterRegistry.
 * Single source of truth for all third-party format importers,
 * native extension definitions, content sniff ordering, and OpenDialog filter masks.
 */

import { t } from '../../../../packages/localization/src/index.js';
import { AmcMacroImporter } from './amc-importer.js';
import { AutoHotkeyImporter } from './autohotkey-importer.js';
import { AutoItImporter } from './autoit-importer.js';
import { JitbitMrfImporter } from './jitbit-mrf-importer.js';
import type { ImportProbe } from './probe.js';
import { RazerMacroImporter } from './razer-importer.js';
import { TinyTaskImporter } from './tinytask-importer.js';
import type { IMacroImporter } from './types.js';

export class MacroImporterRegistry {
  public static readonly PortableExtension = '.mrmacro';
  public static readonly MacroExtension = '.macro.json';

  /**
   * Third-party format importers in registration order.
   * Content sniffing is ordered separately by sniffPriority.
   */
  public static readonly importers: readonly IMacroImporter[] = [
    new AutoHotkeyImporter(),
    new AmcMacroImporter(),
    new JitbitMrfImporter(),
    new AutoItImporter(),
    new RazerMacroImporter(),
    new TinyTaskImporter(),
  ];

  /**
   * App's own native extensions (.mrmacro, .macro.json, .json).
   */
  public static readonly nativeExtensions: readonly string[] = [
    MacroImporterRegistry.PortableExtension,
    MacroImporterRegistry.MacroExtension,
    '.json',
  ];

  /**
   * Whether the app can import a file at this path (by extension).
   */
  public static isSupported(path: string): boolean {
    const lower = path.toLowerCase();
    for (const extension of MacroImporterRegistry.nativeExtensions) {
      if (lower.endsWith(extension.toLowerCase())) {
        return true;
      }
    }
    for (const importer of MacroImporterRegistry.importers) {
      for (const extension of importer.extensions) {
        if (lower.endsWith(extension.toLowerCase())) {
          return true;
        }
      }
    }
    return false;
  }

  /**
   * Whether the path ends with one of the app's own native formats (.mrmacro, .macro.json, .json).
   */
  public static isNativeExtension(path: string): boolean {
    const lower = path.toLowerCase();
    for (const extension of MacroImporterRegistry.nativeExtensions) {
      if (lower.endsWith(extension.toLowerCase())) {
        return true;
      }
    }
    return false;
  }

  /**
   * Finds the importer whose extension matches the file's extension, or null.
   */
  public static findByExtension(extension: string): IMacroImporter | null {
    const lower = extension.toLowerCase();
    for (const importer of MacroImporterRegistry.importers) {
      for (const candidate of importer.extensions) {
        if (candidate.toLowerCase() === lower) {
          return importer;
        }
      }
    }
    return null;
  }

  /**
   * Finds the importer that recognized the content by sniffing (in descending sniffPriority order), or null.
   */
  public static findBySniff(probe: ImportProbe): IMacroImporter | null {
    const sorted = [...MacroImporterRegistry.importers].sort(
      (a, b) => b.sniffPriority - a.sniffPriority,
    );
    for (const importer of sorted) {
      if (importer.canHandle(probe)) {
        return importer;
      }
    }
    return null;
  }

  /**
   * Filter string for OpenFileDialog matching MacroImporterRegistry.BuildDialogFilter.
   */
  public static buildDialogFilter(): string {
    const masks = [
      '*' + MacroImporterRegistry.PortableExtension,
      '*' + MacroImporterRegistry.MacroExtension,
      '*.json',
    ];
    for (const importer of MacroImporterRegistry.importers) {
      for (const extension of importer.extensions) {
        masks.push('*' + extension);
      }
    }

    const segments: string[] = [
      t('Supported macros'),
      masks.join(';'),
      'Macro Recorder',
      '*' + MacroImporterRegistry.PortableExtension,
    ];

    for (const importer of MacroImporterRegistry.importers) {
      segments.push(importer.displayName);
      segments.push(importer.extensions.map((ext) => '*' + ext).join(';'));
    }

    segments.push('JSON');
    segments.push('*.json;*' + MacroImporterRegistry.MacroExtension);
    segments.push(t('All files'));
    segments.push('*.*');

    return segments.join('|');
  }
}
