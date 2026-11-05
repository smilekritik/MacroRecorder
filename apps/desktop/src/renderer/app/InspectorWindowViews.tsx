/**
 * @macro-recorder/desktop - Dedicated Inspector Window Views
 * Covers:
 * - UI-WIN-005 GamepadTesterWindow
 * - UI-WIN-006 KeyCodeInspectorWindow
 * - UI-WIN-007 PixelInspectorWindow
 * - UI-WIN-008 PixelPickerWindow
 * - UI-WIN-009 WindowInspectorWindow
 */

import React, { useCallback } from 'react';
import { GamepadTester } from '../features/tools/GamepadTester.js';
import { KeyCodeInspector } from '../features/tools/KeyCodeInspector.js';
import { PixelInspector } from '../features/tools/PixelInspector.js';
import { PixelPicker } from '../features/tools/PixelPicker.js';
import { WindowInspector } from '../features/tools/WindowInspector.js';
import { useApi } from '../hooks/useApi.js';
import { useAppKeyboardShortcuts } from './useAppKeyboardShortcuts.js';
import { IpcChannels } from '../../../../../packages/contracts/src/index.js';

export function GamepadTesterWindowView(): React.ReactElement {
  const api = useApi();
  const handleClose = useCallback(() => {
    void api.invoke(IpcChannels.WINDOWS_CLOSE, { requestId: `close-${Date.now()}`, windowId: 'GamepadTesterWindow' });
  }, [api]);

  useAppKeyboardShortcuts({ onEscape: handleClose });

  return (
    <div className="flex flex-col h-screen w-screen bg-[var(--color-bg)] text-[var(--color-text-primary)] select-none overflow-hidden">
      <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
        <GamepadTester isOpen={true} onClose={handleClose} />
      </div>
    </div>
  );
}

export function KeyCodeInspectorWindowView(): React.ReactElement {
  const api = useApi();
  const handleClose = useCallback(() => {
    void api.invoke(IpcChannels.WINDOWS_CLOSE, { requestId: `close-${Date.now()}`, windowId: 'KeyCodeInspectorWindow' });
  }, [api]);

  useAppKeyboardShortcuts({ onEscape: handleClose });

  return (
    <div className="flex flex-col h-screen w-screen bg-[var(--color-bg)] text-[var(--color-text-primary)] select-none overflow-hidden">
      <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
        <KeyCodeInspector isOpen={true} onClose={handleClose} />
      </div>
    </div>
  );
}

export function PixelInspectorWindowView(): React.ReactElement {
  const api = useApi();
  const handleClose = useCallback(() => {
    void api.invoke(IpcChannels.WINDOWS_CLOSE, { requestId: `close-${Date.now()}`, windowId: 'PixelInspectorWindow' });
  }, [api]);

  useAppKeyboardShortcuts({ onEscape: handleClose });

  return (
    <div className="flex flex-col h-screen w-screen bg-[var(--color-bg)] text-[var(--color-text-primary)] select-none overflow-hidden">
      <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
        <PixelInspector isOpen={true} onClose={handleClose} />
      </div>
    </div>
  );
}

export function PixelPickerWindowView(): React.ReactElement {
  const api = useApi();
  const handleClose = useCallback(() => {
    void api.invoke(IpcChannels.WINDOWS_CLOSE, { requestId: `close-${Date.now()}`, windowId: 'PixelPickerWindow' });
  }, [api]);

  useAppKeyboardShortcuts({ onEscape: handleClose });

  return (
    <div className="h-screen w-screen bg-transparent select-none overflow-hidden">
      <PixelPicker isOpen={true} onCancel={handleClose} />
    </div>
  );
}

export function WindowInspectorWindowView(): React.ReactElement {
  const api = useApi();
  const handleClose = useCallback(() => {
    void api.invoke(IpcChannels.WINDOWS_CLOSE, { requestId: `close-${Date.now()}`, windowId: 'WindowInspectorWindow' });
  }, [api]);

  useAppKeyboardShortcuts({ onEscape: handleClose });

  return (
    <div className="flex flex-col h-screen w-screen bg-[var(--color-bg)] text-[var(--color-text-primary)] select-none overflow-hidden">
      <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
        <WindowInspector isOpen={true} onClose={handleClose} />
      </div>
    </div>
  );
}
