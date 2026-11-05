/**
 * @macro-recorder/desktop - Dedicated BindMap Window View
 */

import React, { useCallback, useRef, useState } from 'react';
import { useSystemCommands } from '../hooks/systemCommands.js';
import type { HotkeyBinding } from '../../../../../packages/contracts/src/index.js';
import { BindMapView } from '../features/bind-map/BindMapView.js';
import { useLibrary } from '../hooks/useLibrary.js';
import { usePreferences } from '../hooks/usePreferences.js';
import { useApi } from '../hooks/useApi.js';
import { useCrossWindowStateSync } from './useCrossWindowStateSync.js';
import { useAppKeyboardShortcuts } from './useAppKeyboardShortcuts.js';
import { IpcChannels } from '../../../../../packages/contracts/src/index.js';

export function BindMapWindowView(): React.ReactElement {
  const api = useApi();
  const library = useLibrary();
  const { preferences } = usePreferences();

  const handleClose = useCallback(() => {
    void api.invoke(IpcChannels.WINDOWS_CLOSE, {
      requestId: `close-${Date.now()}`,
      windowId: 'BindMapWindow',
    });
  }, [api]);

  const handleOpenSettings = useCallback((_hotkeyTag?: string) => {
    void api.invoke(IpcChannels.WINDOWS_OPEN, {
      requestId: `settings-${Date.now()}`,
      windowId: 'SettingsWindow',
      params: { section: 'controls' },
    });
  }, [api]);

  const system = useSystemCommands();
  const [probeVersion, setProbeVersion] = useState(0);
  const probeCache = useRef(new Map<string, boolean>());
  const probeAvailability = useCallback((bindings: readonly HotkeyBinding[]): boolean[] => {
    const keyOf = (binding: HotkeyBinding) => JSON.stringify(binding);
    const unknown = bindings.filter((binding) => !probeCache.current.has(keyOf(binding)));
    if (unknown.length > 0) {
      const gestures = unknown.map((binding, index) => ({
        id: index + 1,
        virtualKey: binding.virtualKey,
        modifiers: (binding.alt ? 1 : 0) | (binding.control ? 2 : 0) | (binding.shift ? 4 : 0) | (binding.windows ? 8 : 0),
        mouseButton: binding.mouseButton,
        wheel: binding.wheel,
      }));
      for (const binding of unknown) probeCache.current.set(keyOf(binding), true);
      void system.probeHotkeys(gestures).then((result) => {
        unknown.forEach((binding, index) => probeCache.current.set(keyOf(binding), result.available?.[index] ?? true));
        setProbeVersion((version) => version + 1);
      });
    }
    return bindings.map((binding) => probeCache.current.get(keyOf(binding)) ?? true);
  }, [system, probeVersion]);

  // Listen to remote changes
  useCrossWindowStateSync({
    onLibraryChange: () => {
      void library.refetch();
    },
  });

  // Esc / F11 to close
  useAppKeyboardShortcuts({
    onEscape: handleClose,
    onToggleBindMap: handleClose,
    onEmergencyStop: () => {
      void api.invoke(IpcChannels.EMERGENCY_STOP, {
        requestId: `f10-${Date.now()}`,
      });
    },
  });

  return (
    <div className="flex flex-col h-screen w-screen bg-[var(--color-bg)] text-[var(--color-text-primary)] select-none overflow-hidden">
      <div className="flex-1 min-h-0 overflow-hidden">
        <BindMapView
          isOpen={true}
          macros={library.macros}
          probeAvailability={probeAvailability}
          preferences={preferences}
          onClose={handleClose}
          onOpenSettings={handleOpenSettings}
          onToggleMacro={async (macro) => {
            await library.saveMacro({ ...macro, isEnabled: !macro.isEnabled });
          }}
          onDeleteMacro={async (macro) => {
            await library.deleteMacro(macro.id);
          }}
        />
      </div>
    </div>
  );
}
