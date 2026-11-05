/**
 * @macro-recorder/desktop - Dialogs Feature Types
 */

import type { AppTheme } from '../../../../../../packages/contracts/src/domain/enums.js';
import type { ImportReport, MacroImportResult } from '../../../../../../packages/contracts/src/domain/import-export.js';

export type ChoiceTone = 'neutral' | 'danger' | 'accent';

export interface ChoiceOption {
  readonly title: string;
  readonly description?: string | undefined;
  readonly tone?: ChoiceTone | undefined;
  readonly enabled?: boolean | undefined;
}

export interface FirstRunDialogProps {
  readonly isOpen: boolean;
  readonly initialLanguage?: string | undefined;
  readonly initialTheme?: AppTheme | undefined;
  readonly onComplete: (theme: AppTheme, language: string) => void;
  readonly onCancel?: (() => void) | undefined;
}

export interface WelcomeDialogProps {
  readonly isOpen: boolean;
  readonly shortcuts?: Partial<Record<'start' | 'stop' | 'pause' | 'bindmap' | 'emergency', string>> | undefined;
  readonly onClose: () => void;
}

export interface AlreadyRunningDialogProps {
  readonly isOpen: boolean;
  readonly onClose: () => void;
}

export interface ChoiceDialogProps {
  readonly isOpen: boolean;
  readonly question: string;
  readonly description?: string | undefined;
  readonly details?: string | undefined;
  readonly options: readonly ChoiceOption[];
  readonly showCancel?: boolean | undefined;
  readonly onSelect: (index: number) => void;
  readonly onCancel: () => void;
}

export interface ConfirmDeleteDialogProps {
  readonly isOpen: boolean;
  readonly mode?: 'macro' | 'actions' | 'folder' | undefined;
  readonly targetName?: string | undefined;
  readonly eventCount?: number | undefined;
  readonly macroCount?: number | undefined;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
}

export interface ConfirmImportDialogProps {
  readonly isOpen: boolean;
  readonly sourcePath: string;
  readonly targetFolder?: string | undefined;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
}

export interface ImportReportDialogProps {
  readonly isOpen: boolean;
  readonly report: ImportReport | MacroImportResult;
  readonly onClose: () => void;
}

export interface TextPromptDialogProps {
  readonly isOpen: boolean;
  readonly question: string;
  readonly description?: string | undefined;
  readonly initialValue?: string | undefined;
  readonly confirmText?: string | undefined;
  readonly maxLength?: number | undefined;
  readonly onConfirm: (value: string) => void;
  readonly onCancel: () => void;
}

export interface ResetConfirmDialogProps {
  readonly isOpen: boolean;
  readonly libraryPath?: string | undefined;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
}

export interface BackupRestoreChoiceDialogProps {
  readonly isOpen: boolean;
  readonly onSelectMode: (mode: 'merge' | 'replace') => void;
  readonly onCancel: () => void;
}
