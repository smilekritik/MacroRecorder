/**
 * @macro-recorder/desktop - Import/Export Feature Types
 */

import type { MacroExportFormat, MacroImportFormat, LibraryBackupMode } from '../../../../../../packages/contracts/src/domain/enums.js';
import type { ImportReport, MacroImportResult, MacroImportWarning } from '../../../../../../packages/contracts/src/domain/import-export.js';
import type { RunHistoryEntry } from '../../../../../../packages/contracts/src/domain/diagnostics.js';
import type { MacroRecorderApi } from '../../hooks/useApi.js';

export interface ImportReportViewProps {
  readonly report: ImportReport | MacroImportResult;
  readonly onClose?: (() => void) | undefined;
}

export interface ImportConfirmationViewProps {
  readonly sourcePath: string;
  readonly targetFolder?: string | undefined;
  readonly onConfirm: (path: string, targetFolder?: string) => void;
  readonly onCancel: () => void;
}

export interface BackupManagerProps {
  readonly resolvedLibraryPath: string;
  readonly onBackupCreated?: ((path: string) => void) | undefined;
  readonly onBackupRestored?: ((result: { imported: number; total: number }) => void) | undefined;
  readonly apiOverride?: MacroRecorderApi | undefined;
}

export interface DiagnosticsManagerProps {
  readonly macroId?: string | undefined;
  readonly onExportDiagnostics?: ((path: string) => void) | undefined;
  readonly apiOverride?: MacroRecorderApi | undefined;
}

export type {
  MacroExportFormat,
  MacroImportFormat,
  LibraryBackupMode,
  ImportReport,
  MacroImportResult,
  MacroImportWarning,
  RunHistoryEntry,
};
