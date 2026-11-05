/**
 * @macro-recorder/desktop - Dedicated Dialog Window Views
 * Covers:
 * - UI-WIN-012 AddActionWindow
 * - UI-WIN-013 AlreadyRunningWindow
 * - UI-WIN-014 ChoiceWindow
 * - UI-WIN-015 ConfirmDeleteWindow
 * - UI-WIN-016 ConfirmImportWindow
 * - UI-WIN-017 FirstRunWindow
 * - UI-WIN-018 ImportReportWindow
 * - UI-WIN-019 TextPromptWindow
 * - UI-WIN-020 WelcomeWindow
 */

import React, { useCallback, useEffect, useRef } from 'react';
import { FirstRunDialog } from '../features/dialogs/FirstRunDialog.js';
import { WelcomeDialog } from '../features/dialogs/WelcomeDialog.js';
import { AlreadyRunningDialog } from '../features/dialogs/AlreadyRunningDialog.js';
import { ChoiceDialog } from '../features/dialogs/ChoiceDialog.js';
import { ConfirmDeleteDialog } from '../features/dialogs/ConfirmDeleteDialog.js';
import { ConfirmImportDialog } from '../features/dialogs/ConfirmImportDialog.js';
import { ImportReportDialog } from '../features/dialogs/ImportReportDialog.js';
import { TextPromptDialog } from '../features/dialogs/TextPromptDialog.js';
import { AddActionDialog } from '../features/actions/AddActionDialog.js';
import { useApi } from '../hooks/useApi.js';
import { useSystemCommands } from '../hooks/systemCommands.js';
import { usePreferences } from '../hooks/usePreferences.js';
import { IpcChannels } from '../../../../../packages/contracts/src/index.js';

/** Sizes a dialog window to its content, so nothing is cut off at any language or DPI. */
function useFitWindowToContent(windowId: string): React.RefObject<HTMLDivElement> {
  const ref = useRef<HTMLDivElement>(null);
  const system = useSystemCommands();
  useEffect(() => {
    const element = ref.current;
    if (!element) return undefined;
    const fit = () => {
      void system.fitWindow(windowId, Math.ceil(element.getBoundingClientRect().height));
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(element);
    return () => observer.disconnect();
  }, [system, windowId]);
  return ref;
}

export function FirstRunWindowView(): React.ReactElement {
  const fitRef = useFitWindowToContent('FirstRunWindow');
  const preferences = usePreferences();
  const system = useSystemCommands();

  return (
    <div ref={fitRef} className="w-screen bg-[var(--color-bg)] text-[var(--color-text-primary)] select-none overflow-hidden">
      <div className="w-full">
        <FirstRunDialog
          isOpen={true}
          onComplete={(theme, languageCode) => {
            void (async () => {
              const prefs = preferences.preferences;
              if (prefs) await preferences.updatePreferences({ ...prefs, theme, languageCode });
              await system.finishFirstRun();
            })();
          }}
        />
      </div>
    </div>
  );
}

export function WelcomeWindowView(): React.ReactElement {
  const api = useApi();
  const fitRef = useFitWindowToContent('WelcomeWindow');
  const handleClose = useCallback(() => {
    void api.invoke(IpcChannels.WINDOWS_CLOSE, {
      requestId: `close-${Date.now()}`,
      windowId: 'WelcomeWindow',
    });
  }, [api]);

  return (
    <div ref={fitRef} className="w-screen bg-[var(--color-bg)] text-[var(--color-text-primary)] select-none overflow-hidden">
      <div className="w-full">
        <WelcomeDialog isOpen={true} onClose={handleClose} />
      </div>
    </div>
  );
}

export function AlreadyRunningWindowView(): React.ReactElement {
  const api = useApi();
  const fitRef = useFitWindowToContent('AlreadyRunningWindow');
  const handleClose = useCallback(() => {
    void api.invoke(IpcChannels.WINDOWS_CLOSE, {
      requestId: `close-${Date.now()}`,
      windowId: 'AlreadyRunningWindow',
    });
  }, [api]);

  return (
    <div ref={fitRef} className="w-screen bg-[var(--color-bg)] text-[var(--color-text-primary)] select-none overflow-hidden">
      <div className="w-full">
        <AlreadyRunningDialog isOpen={true} onClose={handleClose} />
      </div>
    </div>
  );
}

export function ChoiceWindowView(): React.ReactElement {
  const api = useApi();
  const fitRef = useFitWindowToContent('ChoiceWindow');
  const handleClose = useCallback(() => {
    void api.invoke(IpcChannels.WINDOWS_CLOSE, {
      requestId: `close-${Date.now()}`,
      windowId: 'ChoiceWindow',
    });
  }, [api]);

  return (
    <div ref={fitRef} className="w-screen bg-[var(--color-bg)] text-[var(--color-text-primary)] select-none overflow-hidden">
      <div className="w-full">
        <ChoiceDialog
          isOpen={true}
          question="Record Actions"
          description="The macro already contains actions. How would you like to proceed?"
          options={[
            { title: 'Overwrite', description: 'Replace all existing actions' },
            { title: 'Append', description: 'Add new actions to the end' },
            { title: 'Insert', description: 'Insert at current position' },
          ]}
          onSelect={() => handleClose()}
          onCancel={handleClose}
        />
      </div>
    </div>
  );
}

export function ConfirmDeleteWindowView(): React.ReactElement {
  const api = useApi();
  const fitRef = useFitWindowToContent('ConfirmDeleteWindow');
  const handleClose = useCallback(() => {
    void api.invoke(IpcChannels.WINDOWS_CLOSE, {
      requestId: `close-${Date.now()}`,
      windowId: 'ConfirmDeleteWindow',
    });
  }, [api]);

  return (
    <div ref={fitRef} className="w-screen bg-[var(--color-bg)] text-[var(--color-text-primary)] select-none overflow-hidden">
      <div className="w-full">
        <ConfirmDeleteDialog
          isOpen={true}
          mode="macro"
          targetName="Macro"
          onConfirm={handleClose}
          onCancel={handleClose}
        />
      </div>
    </div>
  );
}

export function ConfirmImportWindowView(): React.ReactElement {
  const api = useApi();
  const fitRef = useFitWindowToContent('ConfirmImportWindow');
  const handleClose = useCallback(() => {
    void api.invoke(IpcChannels.WINDOWS_CLOSE, {
      requestId: `close-${Date.now()}`,
      windowId: 'ConfirmImportWindow',
    });
  }, [api]);

  return (
    <div ref={fitRef} className="w-screen bg-[var(--color-bg)] text-[var(--color-text-primary)] select-none overflow-hidden">
      <div className="w-full">
        <ConfirmImportDialog
          isOpen={true}
          sourcePath="imported.json"
          targetFolder="Macros"
          onConfirm={handleClose}
          onCancel={handleClose}
        />
      </div>
    </div>
  );
}

export function ImportReportWindowView(): React.ReactElement {
  const api = useApi();
  const fitRef = useFitWindowToContent('ImportReportWindow');
  const handleClose = useCallback(() => {
    void api.invoke(IpcChannels.WINDOWS_CLOSE, {
      requestId: `close-${Date.now()}`,
      windowId: 'ImportReportWindow',
    });
  }, [api]);

  return (
    <div ref={fitRef} className="w-screen bg-[var(--color-bg)] text-[var(--color-text-primary)] select-none overflow-hidden">
      <div className="w-full">
        <ImportReportDialog
          isOpen={true}
          report={{
            formatName: 'Native JSON',
            macroCount: 1,
            eventCount: 10,
            warnings: [],
            userSummary: 'Successfully imported 1 macro',
          }}
          onClose={handleClose}
        />
      </div>
    </div>
  );
}

export function TextPromptWindowView(): React.ReactElement {
  const api = useApi();
  const fitRef = useFitWindowToContent('TextPromptWindow');
  const handleClose = useCallback(() => {
    void api.invoke(IpcChannels.WINDOWS_CLOSE, {
      requestId: `close-${Date.now()}`,
      windowId: 'TextPromptWindow',
    });
  }, [api]);

  return (
    <div ref={fitRef} className="w-screen bg-[var(--color-bg)] text-[var(--color-text-primary)] select-none overflow-hidden">
      <div className="w-full">
        <TextPromptDialog
          isOpen={true}
          question="Rename Macro"
          initialValue="New Name"
          onConfirm={handleClose}
          onCancel={handleClose}
        />
      </div>
    </div>
  );
}

export function AddActionWindowView(): React.ReactElement {
  const api = useApi();
  const fitRef = useFitWindowToContent('AddActionWindow');
  const handleClose = useCallback(() => {
    void api.invoke(IpcChannels.WINDOWS_CLOSE, {
      requestId: `close-${Date.now()}`,
      windowId: 'AddActionWindow',
    });
  }, [api]);

  return (
    <div ref={fitRef} className="w-screen bg-[var(--color-bg)] text-[var(--color-text-primary)] select-none overflow-hidden">
      <div className="w-full">
        <AddActionDialog
          isOpen={true}
          onClose={handleClose}
          onSubmit={() => {
            handleClose();
          }}
        />
      </div>
    </div>
  );
}
