/**
 * @macro-recorder/desktop - Diagnostics Manager
 * Timing of the selected macro's last run, per action, with export; run history below.
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { IpcChannels } from '../../../../../../packages/contracts/src/index.js';
import type { RunHistoryEntry } from '../../../../../../packages/contracts/src/domain/diagnostics.js';
import { Button } from '../../design-system/Button.js';
import { useApi } from '../../hooks/useApi.js';
import { useLocalization } from '../../hooks/useLocalization.js';
import { useSystemCommands, type SystemFileFilter } from '../../hooks/systemCommands.js';
import type { DiagnosticsManagerProps } from './types.js';

/** Rendering every row of a long run would stall the window for no benefit to a reader. */
const MAX_VISIBLE_ROWS = 2000;

interface RunReceipt {
  readonly scheduledMicroseconds: number;
  readonly plannedMicroseconds?: number | null;
  readonly startedMicroseconds: number;
  readonly confirmedMicroseconds?: number | null;
  readonly success: boolean;
}

interface LastRun {
  readonly receipts: readonly RunReceipt[];
  readonly peakCpuPercent?: number | null;
  readonly peakGpuPercent?: number | null;
  readonly peakMemoryPercent?: number | null;
}

function quantile(sorted: readonly number[], q: number): number {
  return sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] ?? 0;
}

function jitterMs(receipt: RunReceipt): number {
  return (receipt.startedMicroseconds - (receipt.plannedMicroseconds ?? receipt.scheduledMicroseconds)) / 1000;
}

const ms = (value: number) => `${value.toFixed(3)} ms`;
const percent = (value: number | null | undefined) =>
  (typeof value === 'number' ? `${value.toFixed(1)} %` : '—');

function Tile({ label, value }: { readonly label: string; readonly value: string }): React.ReactElement {
  return (
    <div className="rounded-[8px] border border-[var(--color-border-subtle)] bg-[var(--color-surface-raised)] p-3">
      <div className="text-[12px] text-[var(--color-text-secondary)]">{label}</div>
      <div className="text-[18px] font-semibold text-[var(--color-text-primary)]">{value}</div>
    </div>
  );
}

export function DiagnosticsManager({
  macroId,
  onExportDiagnostics,
  apiOverride,
}: DiagnosticsManagerProps): React.ReactElement {
  const defaultApi = useApi();
  const api = apiOverride ?? defaultApi;
  const system = useSystemCommands();
  const { t } = useLocalization();

  const [historyEntries, setHistoryEntries] = useState<readonly RunHistoryEntry[]>([]);
  const [lastRun, setLastRun] = useState<LastRun | null>(null);
  const [statusText, setStatusText] = useState<string>('');

  const load = useCallback(async () => {
    try {
      const res = await api.invoke(IpcChannels.STORAGE_LOAD_RUN_HISTORY, {
        requestId: `diag-load-${Date.now()}`,
      });
      if (res.success && res.data?.entries) setHistoryEntries(res.data.entries);
      if (macroId) {
        const run = await system.lastRun(macroId);
        setLastRun((run.run as LastRun | null | undefined) ?? null);
      }
    } catch {
      // The tab stays usable with what it already shows.
    }
  }, [api, macroId, system]);

  useEffect(() => {
    void load();
    return api.on?.('playback:status-changed', (event: unknown) => {
      if ((event as { state?: string }).state === 'Idle') void load();
    });
  }, [api, load]);

  const stats = useMemo(() => {
    const receipts = lastRun?.receipts ?? [];
    if (receipts.length === 0) return null;
    const sorted = receipts.map(jitterMs).sort((a, b) => a - b);
    return {
      average: sorted.reduce((sum, value) => sum + value, 0) / sorted.length,
      p95: quantile(sorted, 0.95),
      p99: quantile(sorted, 0.99),
      maximum: sorted[sorted.length - 1] ?? 0,
      unconfirmed: receipts.filter((receipt) => receipt.confirmedMicroseconds == null).length,
    };
  }, [lastRun]);

  const entry = historyEntries.find((item) => item.macroId === macroId);

  const handleClearHistory = async () => {
    const res = await api.invoke(IpcChannels.STORAGE_CLEAR_RUN_HISTORY, {
      requestId: `diag-clear-${Date.now()}`,
    });
    if (res.success) {
      setHistoryEntries([]);
      setLastRun(null);
    } else {
      setStatusText(res.error?.message ?? t('Could not clear history'));
    }
  };

  const handleExport = async (format: 'csv' | 'json') => {
    const filters: readonly SystemFileFilter[] = [{ name: format.toUpperCase(), extensions: [format] }];
    const destinationPath = await system.pickSaveFile(`MacroRecorder_Diagnostics.${format}`, filters);
    if (!destinationPath) return;
    const invoke = api.invoke as unknown as (
      channel: string,
      request: Record<string, unknown>,
    ) => Promise<{ success: boolean; data?: { exportedPath: string }; error?: { message?: string } }>;
    const res = await invoke(IpcChannels.STORAGE_EXPORT_DIAGNOSTICS, {
      requestId: `diag-exp-${Date.now()}`,
      format,
      destinationPath,
      macroId,
    });
    if (res.success && res.data) {
      setStatusText(res.data.exportedPath);
      onExportDiagnostics?.(res.data.exportedPath);
    } else {
      setStatusText(res.error?.message ?? t('Could not export the macro.'));
    }
  };

  const rows = lastRun?.receipts.slice(0, MAX_VISIBLE_ROWS) ?? [];

  return (
    <div className="flex flex-col gap-3 h-full min-h-0 text-[13px] select-none">
      <div className="flex items-center justify-between">
        <span className="font-semibold text-[15px] text-[var(--color-text-primary)]">
          {t('Run history and diagnostics')}
        </span>
        <div className="flex items-center gap-2">
          <Button variant="base" size="sm" disabled={!stats} onClick={() => void handleExport('csv')}>
            {t('Export CSV')}
          </Button>
          <Button variant="base" size="sm" disabled={!stats} onClick={() => void handleExport('json')}>
            {t('Export JSON')}
          </Button>
          <Button variant="danger" size="sm" disabled={historyEntries.length === 0} onClick={() => void handleClearHistory()}>
            {t('Clear history')}
          </Button>
        </div>
      </div>

      {statusText && <span className="text-[12px] text-[var(--color-text-secondary)]">{statusText}</span>}

      {stats ? (
        <>
          <div className="grid grid-cols-5 gap-3">
            <Tile label={t('Average')} value={ms(stats.average)} />
            <Tile label="P95" value={ms(stats.p95)} />
            <Tile label="P99" value={ms(stats.p99)} />
            <Tile label={t('Maximum')} value={ms(stats.maximum)} />
            <Tile label={t('Unconfirmed')} value={String(stats.unconfirmed)} />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Tile label={t('Peak CPU')} value={percent(lastRun?.peakCpuPercent)} />
            <Tile label={t('Peak GPU')} value={percent(lastRun?.peakGpuPercent)} />
            <Tile label={t('Peak memory')} value={percent(lastRun?.peakMemoryPercent)} />
          </div>
          {entry && (
            <span className="text-[12px] text-[var(--color-text-secondary)]">
              {`${t('Runs')}: ${entry.runCount} · ${new Date(entry.lastRunAt).toLocaleString()} · ${ms(entry.averageJitterMs)} · ${ms(entry.maxJitterMs)}`}
            </span>
          )}
          <div className="flex-1 min-h-0 overflow-y-auto rounded-[6px] border border-[var(--color-border-subtle)]">
            <table className="w-full text-left text-[12px] border-collapse">
              <thead className="sticky top-0 bg-[var(--color-surface-raised)]">
                <tr className="text-[var(--color-text-muted)]">
                  <th className="p-2 font-semibold">{t('Scheduled, ms')}</th>
                  <th className="p-2 font-semibold">{t('Dispatch, ms')}</th>
                  <th className="p-2 font-semibold">{t('Jitter, ms')}</th>
                  <th className="p-2 font-semibold">{t('Confirm, ms')}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((receipt, index) => (
                  <tr key={index} className={`border-t border-[var(--color-border-subtle)] ${receipt.success ? '' : 'text-[var(--color-danger)]'}`}>
                    <td className="p-2">{(receipt.scheduledMicroseconds / 1000).toFixed(3)}</td>
                    <td className="p-2">{(receipt.startedMicroseconds / 1000).toFixed(3)}</td>
                    <td className="p-2">{jitterMs(receipt).toFixed(3)}</td>
                    <td className="p-2">
                      {receipt.confirmedMicroseconds == null
                        ? '—'
                        : ((receipt.confirmedMicroseconds - receipt.startedMicroseconds) / 1000).toFixed(3)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <div className="py-6 text-center text-[var(--color-text-muted)] text-[12px] rounded-[6px] bg-[var(--color-surface-raised)]">
          {t('No execution runs recorded yet.')}
        </div>
      )}
    </div>
  );
}
