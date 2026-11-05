/**
 * Importer and exporter contracts, warnings, and reports.
 */

import {
  array,
  integer,
  nullable,
  object,
  optional,
  string,
  type Schema,
} from '../common/validation.js';
import {
  MacroExportFormat,
  macroExportFormatSchema,
  MacroImportFormat,
  macroImportFormatSchema,
} from './enums.js';
import { type MacroDefinition, macroDefinitionSchema } from './macro.js';

export interface MacroImportWarning {
  readonly line?: number | null | undefined;
  readonly message: string;
}

export const macroImportWarningSchema: Schema<MacroImportWarning> = object({
  line: optional(nullable(integer({ min: 1 }))),
  message: string({ min: 1 }),
});

export interface MacroImportResult {
  readonly format: MacroImportFormat;
  readonly macros: readonly MacroDefinition[];
  readonly warnings: readonly MacroImportWarning[];
}

export const macroImportResultSchema: Schema<MacroImportResult> = object({
  format: macroImportFormatSchema,
  macros: array(macroDefinitionSchema),
  warnings: array(macroImportWarningSchema),
});

export interface ImportReport {
  readonly formatName: string;
  readonly macroCount: number;
  readonly eventCount: number;
  readonly warnings: readonly MacroImportWarning[];
  readonly userSummary: string;
}

export interface ExportMacroParams {
  readonly macroId: string;
  readonly format: MacroExportFormat;
  readonly destinationPath: string;
}

export const exportMacroParamsSchema: Schema<ExportMacroParams> = object({
  macroId: string({ min: 1 }),
  format: macroExportFormatSchema,
  destinationPath: string({ min: 1 }),
});
