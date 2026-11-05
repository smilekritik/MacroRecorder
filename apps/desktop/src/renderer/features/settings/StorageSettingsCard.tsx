/**
 * @macro-recorder/desktop - Storage Settings Card
 * Macro library custom path, location opening, and .mrbackup creation/restoration.
 */

import React, { useState } from 'react';
import { IpcChannels } from '../../../../../../packages/contracts/src/index.js';
import { useSystemCommands } from '../../hooks/systemCommands.js';
import { useLocalization } from '../../hooks/useLocalization.js';
import { Button } from '../../design-system/Button.js';
import { Input } from '../../design-system/Input.js';
import { Checkbox } from '../../design-system/Checkbox.js';
import { BackupRestoreChoiceDialog } from '../dialogs/BackupRestoreChoiceDialog.js';
import { useApi } from '../../hooks/useApi.js';
import type { MacroRecorderApi } from '../../hooks/useApi.js';

export interface StorageSettingsCardProps {
  readonly currentLibraryPath: string;
  readonly defaultLibraryPath?: string | undefined;
  readonly onLibraryPathChange: (newPath: string) => void;
  readonly onLibraryRestored?: (() => void) | undefined;
  readonly apiOverride?: MacroRecorderApi | undefined;
}

export function StorageSettingsCard({
  currentLibraryPath,
  onLibraryRestored,
  apiOverride,
}: StorageSettingsCardProps): React.ReactElement {
  const system = useSystemCommands();
  const { t } = useLocalization();
  const defaultApi = useApi();
  const api = apiOverride ?? defaultApi;

  const [pathStatus, setPathStatus] = useState('');
  const [backupStatus, setBackupStatus] = useState('');
  const [includeSettings, setIncludeSettings] = useState(false);
  const [isRestoreChoiceOpen, setIsRestoreChoiceOpen] = useState(false);
  const [pendingRestorePath, setPendingRestorePath] = useState('');

  const handleChangeFolder = async () => {
    const newPath = await system.pickFolder(t('Library folder'));
    if (!newPath || newPath === currentLibraryPath) return;
    const result = await system.setLibraryPath(newPath);
    if (!result.ok) setPathStatus(result.error ?? '');
  };

  const handleResetDefault = async () => {
    const result = await system.setLibraryPath('');
    if (!result.ok) setPathStatus(result.error ?? '');
  };

  const handleOpenLocation = async () => {
    const result = await system.openLibraryFolder();
    if (!result.ok) setPathStatus(result.error ?? '');
  };

  const handleCreateBackup = async () => {
    try {
      const destinationPath = await system.pickSaveFile(
        `MacroRecorder_Backup_${new Date().toISOString().slice(0, 10)}.mrbackup`,
        [{ name: 'Macro Recorder backup', extensions: ['mrbackup'] }],
      );
      if (!destinationPath) return;
      const res = await api.invoke(IpcChannels.STORAGE_EXPORT_BACKUP, {
        requestId: `exp-backup-${Date.now()}`,
        destinationPath,
        includesSettings: includeSettings,
      });
      if (res.success && res.data) {
        setBackupStatus(`Macros saved to ${res.data.exportedPath}`);
      } else {
        setBackupStatus(`Could not create backup: ${res.error?.message ?? 'Unknown error'}`);
      }
    } catch (err: unknown) {
      setBackupStatus(`Could not create backup: ${String(err)}`);
    }
  };

  const handleRestoreBackupClick = async () => {
    const [sourcePath] = await system.pickOpenFiles([{ name: 'Macro Recorder backup', extensions: ['mrbackup'] }]);
    if (!sourcePath) return;
    setPendingRestorePath(sourcePath);
    setIsRestoreChoiceOpen(true);
  };

  const handleExecuteRestore = async (mode: 'merge' | 'replace') => {
    setIsRestoreChoiceOpen(false);
    try {
      const res = await api.invoke(IpcChannels.STORAGE_RESTORE_BACKUP, {
        requestId: `restore-${Date.now()}`,
        sourcePath: pendingRestorePath,
        mode: mode === 'replace' ? 'Replace' : 'Merge',
      });
      if (res.success && res.data?.result) {
        setBackupStatus(`Macros restored: ${res.data.result.imported} of ${res.data.result.total}.`);
        onLibraryRestored?.();
      } else {
        setBackupStatus(`Could not restore: ${res.error?.message ?? 'Unknown error'}`);
      }
    } catch (err: unknown) {
      setBackupStatus(`Could not restore: ${String(err)}`);
    }
  };

  return (
    <section id="section-storage" aria-label="Macro storage" className="flex flex-col gap-4 select-none">
      <h3 className="text-[17px] font-semibold text-[var(--color-text-primary)]">
        Macro storage
      </h3>

      {/* Library Folder Card */}
      <div className="p-4 rounded-[10px] bg-[var(--color-surface)] border border-[var(--color-border-subtle)] flex flex-col gap-3">
        <div className="flex flex-col gap-0.5">
          <span className="text-[15px] font-semibold text-[var(--color-text-primary)]">
            Library folder
          </span>
          <span className="text-[13px] text-[var(--color-text-secondary)] leading-relaxed">
            Library folders are real folders on disk. You can open them in Explorer and move them together with your macros.
          </span>
        </div>

        <Input
          value={currentLibraryPath}
          readOnly
          aria-label="Current macro library location"
          className="font-mono text-[13px]"
        />

        <div className="flex items-center gap-2 pt-1">
          <Button variant="base" size="sm" onClick={handleChangeFolder}>
            Choose folder
          </Button>
          <Button variant="base" size="sm" onClick={handleOpenLocation}>
            Open location
          </Button>
          <Button variant="base" size="sm" onClick={handleResetDefault}>
            Default
          </Button>
        </div>

        {pathStatus && (
          <span className="text-[12px] text-[var(--color-text-secondary)]">
            {pathStatus}
          </span>
        )}
      </div>

      {/* Library Backup Card */}
      <div className="p-4 rounded-[10px] bg-[var(--color-surface)] border border-[var(--color-border-subtle)] flex flex-col gap-3">
        <div className="flex flex-col gap-0.5">
          <span className="text-[15px] font-semibold text-[var(--color-text-primary)]">
            Library backup
          </span>
          <span className="text-[13px] text-[var(--color-text-secondary)] leading-relaxed">
            Save the whole library into a single .mrbackup file and restore it on this or another computer.
          </span>
        </div>

        <Checkbox
          checked={includeSettings}
          onChange={setIncludeSettings}
          label="Include app settings in the backup"
        />

        <div className="flex items-center gap-2 pt-1">
          <Button variant="base" size="sm" onClick={handleCreateBackup}>
            Create backup…
          </Button>
          <Button variant="base" size="sm" onClick={handleRestoreBackupClick}>
            Restore from backup…
          </Button>
        </div>

        {backupStatus && (
          <span className="text-[12px] text-[var(--color-text-secondary)]">
            {backupStatus}
          </span>
        )}
      </div>

      {isRestoreChoiceOpen && (
        <BackupRestoreChoiceDialog
          isOpen={isRestoreChoiceOpen}
          onSelectMode={handleExecuteRestore}
          onCancel={() => setIsRestoreChoiceOpen(false)}
        />
      )}
    </section>
  );
}
