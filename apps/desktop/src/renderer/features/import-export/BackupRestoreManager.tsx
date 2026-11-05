/**
 * @macro-recorder/desktop - Backup and Restore Manager
 * Handles whole-library backup package (.mrbackup) creation and Merge/Replace restoration.
 */

import React, { useState } from 'react';
import { IpcChannels } from '../../../../../../packages/contracts/src/index.js';
import { Button } from '../../design-system/Button.js';
import { Checkbox } from '../../design-system/Checkbox.js';
import { BackupRestoreChoiceDialog } from '../dialogs/BackupRestoreChoiceDialog.js';
import { useApi } from '../../hooks/useApi.js';
import type { BackupManagerProps } from './types.js';

export function BackupRestoreManager({
  onBackupCreated,
  onBackupRestored,
  apiOverride,
}: BackupManagerProps): React.ReactElement {
  const defaultApi = useApi();
  const api = apiOverride ?? defaultApi;

  const [includeSettings, setIncludeSettings] = useState(false);
  const [statusText, setStatusText] = useState<string>('');
  const [isChoiceOpen, setIsChoiceOpen] = useState(false);
  const [pendingSourcePath, setPendingSourcePath] = useState<string>('');

  const handleCreateBackup = async () => {
    try {
      const defaultName = `MacroRecorder_Backup_${new Date().toISOString().slice(0, 10)}.mrbackup`;
      const destinationPath = defaultName;

      const res = await api.invoke(IpcChannels.STORAGE_EXPORT_BACKUP, {
        requestId: `exp-backup-${Date.now()}`,
        destinationPath,
        includesSettings: includeSettings,
      });

      if (res.success && res.data) {
        setStatusText(`Backup saved to ${res.data.exportedPath}`);
        onBackupCreated?.(res.data.exportedPath);
      } else {
        setStatusText(`Could not create backup: ${res.error?.message ?? 'Unknown error'}`);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setStatusText(`Could not create backup: ${msg}`);
    }
  };

  const handleStartRestore = (sourcePath?: string) => {
    const effectivePath = sourcePath ?? 'backup.mrbackup';
    setPendingSourcePath(effectivePath);
    setIsChoiceOpen(true);
  };

  const handleSelectRestoreMode = async (mode: 'merge' | 'replace') => {
    setIsChoiceOpen(false);
    try {
      const res = await api.invoke(IpcChannels.STORAGE_RESTORE_BACKUP, {
        requestId: `restore-backup-${Date.now()}`,
        sourcePath: pendingSourcePath,
        mode: mode === 'replace' ? 'Replace' : 'Merge',
      });

      if (res.success && res.data?.result) {
        setStatusText(`Macros restored: ${res.data.result.imported} of ${res.data.result.total}.`);
        onBackupRestored?.(res.data.result);
      } else {
        setStatusText(`Could not restore: ${res.error?.message ?? 'Unknown error'}`);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setStatusText(`Could not restore: ${msg}`);
    }
  };

  return (
    <div className="flex flex-col gap-3 text-[13px] select-none">
      <div className="flex flex-col gap-1">
        <span className="font-semibold text-[15px] text-[var(--color-text-primary)]">
          Library backup
        </span>
        <p className="text-[13px] text-[var(--color-text-secondary)] leading-relaxed">
          Save the whole library into a single .mrbackup file and restore it on this or another computer.
        </p>
      </div>

      <Checkbox
        checked={includeSettings}
        onChange={setIncludeSettings}
        label="Include app settings in the backup"
      />

      <div className="flex items-center gap-2 pt-1">
        <Button variant="base" onClick={handleCreateBackup}>
          Create backup…
        </Button>
        <Button variant="base" onClick={() => handleStartRestore()}>
          Restore from backup…
        </Button>
      </div>

      {statusText && (
        <span className="text-[12px] text-[var(--color-text-secondary)] pt-1">
          {statusText}
        </span>
      )}

      {isChoiceOpen && (
        <BackupRestoreChoiceDialog
          isOpen={isChoiceOpen}
          onSelectMode={handleSelectRestoreMode}
          onCancel={() => setIsChoiceOpen(false)}
        />
      )}
    </div>
  );
}
