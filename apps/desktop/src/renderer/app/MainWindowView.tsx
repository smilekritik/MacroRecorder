/**
 * @macro-recorder/desktop - Main Window View
 * Primary application shell composing header, library sidebar, timeline editor,
 * playback/record options, diagnostics, status bar, and dialog overlays.
 */

import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import type { MacroDefinition, ActivationMode } from '../../../../../packages/contracts/src/index.js';
import { IpcChannels } from '../../../../../packages/contracts/src/index.js';
import { MacroLibraryPanel } from '../features/library/components/MacroLibraryPanel.js';
import { MacroDetailsHeader } from '../features/library/components/MacroDetailsHeader.js';
import { TimelineEditorView } from '../features/timeline/TimelineEditorView.js';
import { PlaybackOptionsView } from '../features/playback/PlaybackOptionsView.js';
import { RecordingOptionsView } from '../features/recording/RecordingOptionsView.js';
import { DiagnosticsManager } from '../features/import-export/DiagnosticsManager.js';
import { usePlaybackController } from '../features/playback/usePlaybackController.js';
import { useRecordingController } from '../features/recording/useRecordingController.js';
import { useLibrary } from '../hooks/useLibrary.js';
import { createMacroAction } from '../features/library/hooks/useLibraryActions.js';
import { useApi } from '../hooks/useApi.js';
import { useCrossWindowStateSync } from './useCrossWindowStateSync.js';
import { useAppKeyboardShortcuts } from './useAppKeyboardShortcuts.js';
import { useUnsavedChangesPolicy } from './useUnsavedChangesPolicy.js';
import { useFocusRestoration } from './useFocusRestoration.js';
import { useDpiBehavior } from './useDpiBehavior.js';
import { PillSwitch } from '../design-system/PillSwitch.js';
import { Select } from '../design-system/Select.js';
import { useLocalization } from '../hooks/useLocalization.js';
import { EXPORT_FILE_FILTERS, IMPORT_FILE_FILTERS, exportFormatForPath, useSystemCommands } from '../hooks/systemCommands.js';
import { ImportReportDialog } from '../features/dialogs/ImportReportDialog.js';
import { RecordingChoiceDialog } from '../features/recording/RecordingChoiceDialog.js';
import type { MainWindowTab } from './types.js';

type ImportReportData = React.ComponentProps<typeof ImportReportDialog>['report'];

const MainWindowTabs = ['editor', 'playback', 'record', 'diagnostics'] as const;

function getActivationModeOptions(t: (key: string) => string) {
  return [
    { value: 'Once', label: t('Run once to completion') },
    { value: 'ToggleStop', label: t('Start / Stop on press') },
    { value: 'WhileHeld', label: t('Run while key is held') },
    { value: 'Restart', label: t('Restart from start on press') },
  ];
}

export interface MainWindowViewProps {
  readonly initialTab?: MainWindowTab | undefined;
  readonly initialMacroId?: string | undefined;
  readonly onOpenSettings?: (() => void) | undefined;
}

export function MainWindowView({
  initialTab = 'editor',
  initialMacroId = undefined,
  onOpenSettings,
}: MainWindowViewProps): React.ReactElement {
  const api = useApi();
  const system = useSystemCommands();
  const { t } = useLocalization();
  const [importReport, setImportReport] = useState<ImportReportData | null>(null);
  const [selectedTimeMs, setSelectedTimeMs] = useState<number | null>(null);
  const [renameMacroId, setRenameMacroId] = useState<string | null>(null);
  const clearRename = useCallback(() => setRenameMacroId(null), []);
  const library = useLibrary();

  const [activeTab, setActiveTab] = useState<MainWindowTab>(initialTab);
  const [selectedMacroId, setSelectedMacroId] = useState<string | null>(initialMacroId ?? null);
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(300);
  const libraryColumnRef = useRef<HTMLDivElement | null>(null);
  const resizeController = useRef<AbortController | null>(null);
  useEffect(() => () => resizeController.current?.abort(), []);

  // Selected macro lookup
  const currentMacro = useMemo<MacroDefinition | null>(() => {
    if (!selectedMacroId) return null;
    return library.macros.find((m) => m.id === selectedMacroId) ?? null;
  }, [library.macros, selectedMacroId]);

  // Cross-window state sync
  const { broadcastLibraryMutation, broadcastMacroState } = useCrossWindowStateSync({
    onLibraryChange: () => {
      void library.refetch();
    },
    onMacroStateChange: (_state) => {
      // Keep UI in sync with remote engine updates
    },
  });

  // Controllers for playback and recording
  const playback = usePlaybackController({
    initialMacro: currentMacro,
    onStateChanged: (state) => {
      broadcastMacroState(state, currentMacro?.id, currentMacro?.name);
    },
  });

  const recording = useRecordingController({
    onSessionEnded: () => {
      void library.refetch();
    },
  });

  // Files opened from Explorer arrive in the main process.
  useEffect(() => api.on('library:changed', () => { void library.refetch(); }), [api, library]);

  // The start bind is handled here, because this window knows the selected macro.
  useEffect(() => {
    const hotkeys = (api as unknown as {
      hotkeys?: { onTriggered?: (listener: (event: { id: number }) => void) => () => void };
    }).hotkeys;
    return hotkeys?.onTriggered?.((event) => {
      if (event.id === 2) startRecordingRef.current?.();
    });
  }, []);
  const startRecordingRef = useRef<(() => void) | null>(null);
  startRecordingRef.current = currentMacro && !recording.isRecording
    ? () => { void recording.startRecording(currentMacro, selectedTimeMs); }
    : null;

  // DPI behavior
  useDpiBehavior();
  useFocusRestoration();

  // Unsaved changes policy guard
  const { guardNavigation } = useUnsavedChangesPolicy({
    isDirty,
    currentMacro,
    onSaveMacro: async (macro) => {
      try {
        await library.saveMacro(macro);
        setIsDirty(false);
        broadcastLibraryMutation('saved', macro.id);
        return true;
      } catch {
        return false;
      }
    },
    onDiscardChanges: () => {
      setIsDirty(false);
    },
  });

  // Handle macro selection
  const handleSelectMacro = useCallback(
    (macro: MacroDefinition | null) => {
      guardNavigation(() => {
        setSelectedMacroId(macro ? macro.id : null);
        setIsDirty(false);
      });
    },
    [guardNavigation],
  );

  // App Keyboard shortcuts
  useAppKeyboardShortcuts({
    onRun: () => {
      if (currentMacro) {
        void playback.play(currentMacro);
      }
    },
    onRecord: () => {
      if (currentMacro) {
        void recording.startRecording(currentMacro, selectedTimeMs);
      }
    },
    onPause: () => {
      if (playback.engineState === 'Playing') {
        void playback.pause();
      } else if (playback.engineState === 'Paused') {
        void playback.resume();
      }
    },
    onStop: () => {
      if (recording.isRecording) {
        void recording.stopRecording();
      } else {
        void playback.stop();
      }
    },
    onEmergencyStop: () => {
      void api.invoke(IpcChannels.EMERGENCY_STOP, { requestId: `f10-${Date.now()}` });
    },
    onToggleBindMap: () => {
      void api.invoke(IpcChannels.WINDOWS_OPEN, { requestId: `bind-map-${Date.now()}`, windowId: 'BindMapWindow' });
    },
    onSave: () => {
      if (currentMacro) {
        void library.saveMacro(currentMacro).then(() => {
          setIsDirty(false);
          broadcastLibraryMutation('saved', currentMacro.id);
        });
      }
    },
  });

  // Activity Status & Header indicator
  const activityState = recording.isRecording
    ? 'Recording'
    : playback.engineState === 'Playing'
      ? 'Playing'
      : playback.engineState === 'Paused'
        ? 'Paused'
        : 'Idle';

  const playbackBanner =
    activityState === 'Playing'
      ? `${t('Playing')}: ${currentMacro?.name ?? ''}`
      : activityState === 'Recording'
        ? t('Recording…')
        : activityState === 'Paused'
          ? t('Paused')
          : '';

  // Header button handlers
  const handleRecordClick = () => {
    if (recording.isRecording) {
      void recording.stopRecording();
    } else if (currentMacro) {
      void recording.startRecording(currentMacro, selectedTimeMs);
    }
  };

  const handlePlayClick = () => {
    if (currentMacro) {
      void playback.play(currentMacro);
    }
  };

  const handlePauseClick = () => {
    if (playback.engineState === 'Playing') {
      void playback.pause();
    } else if (playback.engineState === 'Paused') {
      void playback.resume();
    }
  };

  const handleStopClick = () => {
    if (recording.isRecording) {
      void recording.stopRecording();
    } else {
      void playback.stop();
    }
  };

  const handleOpenSettings = () => {
    if (onOpenSettings) {
      onOpenSettings();
    } else {
      void api.invoke(IpcChannels.WINDOWS_OPEN, { requestId: `settings-${Date.now()}`, windowId: 'SettingsWindow' });
    }
  };

  const handleCreateMacro = async () => {
    const macro = await createMacroAction({
      macros: library.macros,
      targetFolder: selectedFolder ?? '',
      onSaveMacro: async (created) => {
        await library.saveMacro(created);
        broadcastLibraryMutation('saved', created.id);
      },
    });
    setSelectedMacroId(macro.id);
    setRenameMacroId(macro.id);
  };

  const handleImport = async (targetFolder?: string) => {
    const paths = await system.pickOpenFiles(IMPORT_FILE_FILTERS, true, t('Import macro'));
    if (paths.length === 0) return;
    const warnings: string[] = [];
    let imported = 0;
    let formatName = '';
    const failures: string[] = [];
    for (const sourcePath of paths) {
      const result = await api.invoke(IpcChannels.STORAGE_IMPORT_MACRO, {
        requestId: `import-${Date.now()}-${Math.random()}`,
        sourcePath,
        ...(targetFolder ? { targetFolderRelativePath: targetFolder } : {}),
      });
      if (result.success && result.data) {
        imported += 1;
        formatName = String((result.data.result as unknown as { sourceFormat?: string }).sourceFormat ?? formatName);
        warnings.push(...result.data.result.warnings.map((warning) => (typeof warning === 'string' ? warning : warning.message)));
      } else {
        failures.push(`${sourcePath}: ${result.error?.message ?? t('Could not import the file.')}`);
      }
    }
    await library.refetch();
    broadcastLibraryMutation('loaded');
    setImportReport({
      formatName,
      macroCount: imported,
      eventCount: 0,
      warnings: [...failures, ...warnings].map((message) => ({ message })),
      userSummary: imported > 0 ? `${t('Imported macros')}: ${imported}` : t('Could not import the file.'),
    });
  };

  const handleExport = async (macro: MacroDefinition | null) => {
    const target = macro ?? currentMacro;
    if (!target) return;
    const destinationPath = await system.pickSaveFile(`${target.name}.mrmacro`, EXPORT_FILE_FILTERS, t('Export macro'));
    if (!destinationPath) return;
    const result = await api.invoke(IpcChannels.STORAGE_EXPORT_MACRO, {
      requestId: `export-${Date.now()}`,
      macroId: target.id,
      format: exportFormatForPath(destinationPath) as never,
      destinationPath,
    });
    if (!result.success) {
      setImportReport({
        formatName: '',
        macroCount: 0,
        eventCount: 0,
        warnings: [{ message: result.error?.message ?? t('Could not export the macro.') }],
        userSummary: t('Could not export the macro.'),
      });
    }
  };

  // Macro property update helpers
  const handleUpdateMacro = useCallback(
    (updater: (prev: MacroDefinition) => MacroDefinition) => {
      if (!currentMacro) return;
      const updated = updater(currentMacro);
      void library.saveMacro(updated).then(() => {
        setIsDirty(false);
        broadcastLibraryMutation('saved', updated.id);
      });
    },
    [currentMacro, library, broadcastLibraryMutation],
  );

  return (
    <div className="reference-main-window flex flex-col h-screen w-screen select-none overflow-hidden">
      <header className="reference-app-header">
        <div className="reference-brand">
          <span className={`reference-status-dot state-${activityState.toLowerCase()}`} aria-label={t(activityState)} />
          <span>Macro Recorder</span>
        </div>
        {playbackBanner && <div className="reference-playback-banner" role="status">{playbackBanner}</div>}
        <div className="reference-primary-controls">
          <button type="button" className="reference-button reference-accent-button" onClick={handleRecordClick} disabled={!currentMacro && !recording.isRecording}>
            <span className="reference-record-icon" aria-hidden="true" />{t('Record')}
          </button>
          <button type="button" className="reference-button" onClick={handlePlayClick} disabled={!currentMacro || activityState === 'Playing' || recording.isRecording}>
            <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M1 0 11 6 1 12Z" fill="currentColor" /></svg>{t('Run')}
          </button>
          <button type="button" className="reference-button" onClick={handlePauseClick} disabled={activityState !== 'Playing' && activityState !== 'Paused'}>
            <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M0 0H4V12H0ZM8 0H12V12H8Z" fill="currentColor" /></svg>{t('Pause / resume')}
          </button>
          <button type="button" className="reference-button reference-danger-button" onClick={handleStopClick} disabled={activityState === 'Idle'}>
            <span className="reference-stop-icon" aria-hidden="true" />{t('Stop')}
          </button>
        </div>
        <span className="reference-header-separator" aria-hidden="true" />
        <button type="button" className="reference-button reference-settings-button" onClick={handleOpenSettings} title={t('Application settings')} aria-label={t('Application settings')}>
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
            <path d="M2 5H18M2 15H18" strokeLinecap="round" /><circle cx="8" cy="5" r="3" fill="var(--color-surface-raised)" /><circle cx="13" cy="15" r="3" fill="var(--color-surface-raised)" />
          </svg>
        </button>
      </header>

      <div className="reference-main-body">
        <div ref={libraryColumnRef} style={{ width: sidebarWidth }} className="reference-library-column">
          <MacroLibraryPanel
            macros={library.macros} folders={library.folders} selectedMacroId={selectedMacroId} selectedFolder={selectedFolder}
            onSelectMacro={handleSelectMacro} onSelectFolder={setSelectedFolder}
            onSaveMacro={async macro => { await library.saveMacro(macro); broadcastLibraryMutation('saved', macro.id); }}
            onDeleteMacro={async macroId => { const result = await library.deleteMacro(macroId); broadcastLibraryMutation('deleted', macroId); return result; }}
            onRestoreMacro={async params => { await library.restoreMacro(params); broadcastLibraryMutation('restored'); }}
            onMoveMacro={async params => { await library.moveMacro(params); broadcastLibraryMutation('moved', params.macroId); }}
            onCreateFolder={async path => { await library.createFolder(path); }}
            onDeleteFolder={async path => library.deleteFolder(path)}
            onMoveFolder={async params => { await library.moveFolder(params); }}
            onOpenFolderInExplorer={folderPath => { void system.openLibraryFolder(folderPath); }}
            onImport={targetFolder => { void handleImport(targetFolder); }}
            onMacroCreated={setRenameMacroId}
            onExport={macro => { void handleExport(macro ?? null); }}
            className="h-full"
          />
        </div>
        <div className="reference-library-divider" role="separator" aria-orientation="vertical" aria-label={t('Library panel divider')} tabIndex={0}
          onKeyDown={event => { if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); setSidebarWidth(width => Math.max(210, Math.min(620, width + (event.key === 'ArrowRight' ? 10 : -10)))); } }}
          onMouseDown={event => {
            event.preventDefault();
            resizeController.current?.abort();
            const controller = new AbortController();
            resizeController.current = controller;
            const startX = event.clientX; const startWidth = sidebarWidth;
            let width = startWidth;
            // Only the column changes during the drag; re-rendering the whole window would make it lag.
            const move = (pointer: MouseEvent) => {
              width = Math.max(210, Math.min(620, startWidth + pointer.clientX - startX));
              if (libraryColumnRef.current) libraryColumnRef.current.style.width = `${width}px`;
            };
            const stop = () => {
              controller.abort();
              document.documentElement.classList.remove('is-col-resizing');
              setSidebarWidth(width);
            };
            document.documentElement.classList.add('is-col-resizing');
            window.addEventListener('mousemove', move, { signal: controller.signal });
            window.addEventListener('mouseup', stop, { signal: controller.signal });
            window.addEventListener('blur', stop, { signal: controller.signal });
          }} />

        <main className="reference-workspace">
          {currentMacro ? <>
            <div className="reference-workspace-header">
              <div className="reference-tabs" role="tablist" aria-label={t('Macro editor tabs')}>
                {MainWindowTabs.map((tab, index) => (
                  <button key={tab} type="button" role="tab" id={`tab-${tab}`} aria-controls={`panel-${tab}`} aria-selected={activeTab === tab} tabIndex={activeTab === tab ? 0 : -1} onClick={() => setActiveTab(tab)} onKeyDown={event => {
                    const nextIndex = event.key === 'ArrowRight' ? (index + 1) % MainWindowTabs.length : event.key === 'ArrowLeft' ? (index + MainWindowTabs.length - 1) % MainWindowTabs.length : event.key === 'Home' ? 0 : event.key === 'End' ? MainWindowTabs.length - 1 : null;
                    if (nextIndex === null) return;
                    event.preventDefault();
                    const nextTab = MainWindowTabs[nextIndex];
                    if (nextTab) { setActiveTab(nextTab); document.getElementById(`tab-${nextTab}`)?.focus(); }
                  }} className={activeTab === tab ? 'is-active' : ''}>
                    {tab === 'editor' ? t('Editor') : tab === 'playback' ? t('Playback') : tab === 'record' ? t('Record') : t('Diagnostics')}
                  </button>
                ))}
              </div>
              <div className="reference-macro-controls">
                <span>{t('Shortcut behavior')}</span>
                <div className="reference-activation-select"><Select value={currentMacro.playback.activationMode} options={getActivationModeOptions(t)} onChange={mode => handleUpdateMacro(previous => ({ ...previous, playback: { ...previous.playback, activationMode: mode as ActivationMode } }))} aria-label={t('Macro shortcut behavior')} /></div>
                <div className="reference-enabled-control">
                  <span>{currentMacro.isEnabled ? t('Macro enabled') : t('Macro disabled')}</span>
                  <PillSwitch checked={currentMacro.isEnabled} onChange={isEnabled => handleUpdateMacro(previous => ({ ...previous, isEnabled }))} aria-label={t('Macro enabled')} />
                </div>
              </div>
            </div>
            <section className={`reference-tab-panel ${activeTab === 'editor' ? 'reference-editor-panel' : ''}`} role="tabpanel" id={`panel-${activeTab}`} aria-labelledby={`tab-${activeTab}`}>
              {activeTab === 'editor' && <>
                <MacroDetailsHeader startRenaming={renameMacroId === currentMacro.id} onRenameStarted={clearRename} macro={currentMacro} allMacros={library.macros} isModified={isDirty}
                  onUpdateName={name => handleUpdateMacro(previous => ({ ...previous, name }))}
                  onUpdateDescription={description => handleUpdateMacro(previous => ({ ...previous, description }))}
                  onToggleEnabled={isEnabled => handleUpdateMacro(previous => ({ ...previous, isEnabled }))}
                  onAssignHotkey={hotkey => handleUpdateMacro(previous => ({ ...previous, hotkey }))}
                  onAddTag={tag => handleUpdateMacro(previous => ({ ...previous, tags: [...(previous.tags ?? []), tag] }))}
                  onRemoveTag={tag => handleUpdateMacro(previous => ({ ...previous, tags: (previous.tags ?? []).filter(item => item !== tag) }))} />
                <TimelineEditorView onStartRecording={handleRecordClick} onImportFile={() => { void handleImport(selectedFolder ?? ''); }} onSelectedTimeChange={setSelectedTimeMs} macro={currentMacro} availableMacroNames={library.macros.map(item => item.name)}
                  onSaveMacro={async updated => { await library.saveMacro(updated); setIsDirty(false); broadcastLibraryMutation('saved', updated.id); }}
                  onStatusChange={() => setIsDirty(true)} />
              </>}
              {activeTab === 'playback' && <PlaybackOptionsView options={currentMacro.playback} onChange={playback => handleUpdateMacro(previous => ({ ...previous, playback }))} openWindows={playback.openWindows} onRefreshWindows={() => { void playback.refreshOpenWindows(); }} />}
              {activeTab === 'record' && <RecordingOptionsView options={currentMacro.recording} onChange={recording => handleUpdateMacro(previous => ({ ...previous, recording }))} />}
              {activeTab === 'diagnostics' && <DiagnosticsManager macroId={currentMacro.id} />}
            </section>
          </> : <div className="reference-empty-state">
            <h2>{t('Select a macro to work with')}</h2>
            <p>{t('Click a macro in the library on the left to open it in the timeline editor, or create a new one.')}</p>
            <div className="reference-empty-actions">
              <button type="button" className="reference-button reference-accent-button" onClick={() => { void handleCreateMacro(); }}>{t('Create a macro')}</button>
              <button type="button" className="reference-button" onClick={() => { void handleImport(selectedFolder ?? ''); }}>{t('Import')}</button>
            </div>
          </div>}
        </main>
      </div>
      {importReport && <ImportReportDialog isOpen={true} report={importReport} onClose={() => setImportReport(null)} />}
      <RecordingChoiceDialog
        isOpen={recording.isChoiceDialogOpen}
        {...recording.choiceDialogProps}
        onSelectChoice={(choice) => { void recording.handleChoiceSelected(choice); }}
        onCancel={recording.handleChoiceCancelled}
      />
      <footer className="reference-statusbar">
        <div><a href="https://github.com/smilekritik" target="_blank" rel="noreferrer">@kritik</a><a href="https://github.com/smilekritik/MacroRecorder/releases/tag/v1.0.0" target="_blank" rel="noreferrer">v1.0.0</a></div>
        <span>{t('Emergency stop')}: F10</span>
      </footer>
    </div>
  );
}
