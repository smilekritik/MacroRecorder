/**
 * @macro-recorder/desktop - Dedicated Settings Window View
 */

import React, { useCallback } from 'react';
import { useCrossWindowStateSync } from './useCrossWindowStateSync.js';
import { SettingsView } from '../features/settings/SettingsView.js';
import { useApi } from '../hooks/useApi.js';
import { useLibrary } from '../hooks/useLibrary.js';
import { useAppKeyboardShortcuts } from './useAppKeyboardShortcuts.js';
import type { SettingsSectionId } from '../features/settings/types.js';
import { IpcChannels } from '../../../../../packages/contracts/src/index.js';

export interface SettingsWindowViewProps {
  readonly initialSection?: SettingsSectionId | undefined;
}

export function SettingsWindowView({
  initialSection = 'interface',
}: SettingsWindowViewProps): React.ReactElement {
  const api = useApi();
  const library = useLibrary();

  const handleClose = useCallback(() => {
    void api.invoke(IpcChannels.WINDOWS_CLOSE, {
      requestId: `close-${Date.now()}`,
      windowId: 'SettingsWindow',
    });
  }, [api]);

  useCrossWindowStateSync();

  useAppKeyboardShortcuts({
    onEscape: handleClose,
    onEmergencyStop: () => {
      void api.invoke(IpcChannels.EMERGENCY_STOP, {
        requestId: `f10-${Date.now()}`,
      });
    },
  });

  return (
    <div className="flex flex-col h-screen w-screen bg-[var(--color-bg)] text-[var(--color-text-primary)] select-none overflow-hidden">
      <div className="flex-1 min-h-0 overflow-hidden">
        <SettingsView
          isOpen={true}
          onClose={handleClose}
          initialSection={initialSection}
          macroHotkeys={library.macros
            .filter((m) => Boolean(m.hotkey && m.hotkey.virtualKey > 0))
            .map((m) => m.hotkey)}
        />
      </div>
    </div>
  );
}
