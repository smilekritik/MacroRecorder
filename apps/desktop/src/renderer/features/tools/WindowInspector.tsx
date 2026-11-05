/**
 * @macro-recorder/desktop - Window Inspector Tool
 * Live inspector capturing title, process name, window class, HWND,
 * geometry, mouse coordinates, and color under cursor.
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { IpcChannels } from '../../../../../../packages/contracts/src/index.js';
import type { WindowInspectionSnapshot } from '../../../../../../packages/contracts/src/descriptors/window.js';
import { Checkbox } from '../../design-system/Checkbox.js';
import { useApi } from '../../hooks/useApi.js';
import type { WindowInspectorProps } from './types.js';

const EMPTY_SNAPSHOT: WindowInspectionSnapshot = {
  isSelf: false,
  title: '—',
  className: '—',
  processName: '—',
  processId: 0,
  mouseScreenX: 0,
  mouseScreenY: 0,
  mouseWindowX: 0,
  mouseWindowY: 0,
  mouseClientX: 0,
  mouseClientY: 0,
  rgb: -1,
  windowX: 0,
  windowY: 0,
  windowWidth: 0,
  windowHeight: 0,
  clientWidth: 0,
  clientHeight: 0,
  controlClass: '—',
  controlX: 0,
  controlY: 0,
  controlWidth: 0,
  controlHeight: 0,
  hex: '—',
};

export function WindowInspector({
  isOpen = true,
  onClose,
  refreshIntervalMs = 220,
  apiOverride,
}: WindowInspectorProps): React.ReactElement | null {
  const defaultApi = useApi();
  const api = apiOverride ?? defaultApi;

  const [followMouse, setFollowMouse] = useState(true);
  const [isFrozen, setIsFrozen] = useState(false);
  const [snapshot, setSnapshot] = useState<WindowInspectionSnapshot>(EMPTY_SNAPSHOT);
  const isFrozenRef = useRef(false);
  isFrozenRef.current = isFrozen;

  // Track Ctrl or Shift to freeze display
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Control' || e.key === 'Shift') {
        setIsFrozen(true);
      }
      if (e.key === 'Escape' && onClose) {
        onClose();
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (!e.ctrlKey && !e.shiftKey) {
        setIsFrozen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [onClose]);

  const inspectNow = useCallback(async () => {
    if (isFrozenRef.current) return;
    try {
      const res = await api.invoke(IpcChannels.WINDOWS_INSPECT, {
        requestId: `inspect-${Date.now()}`,
        followMouse,
      });
      if (res.success && res.data?.snapshot && !res.data.snapshot.isSelf) {
        setSnapshot(res.data.snapshot);
      }
    } catch {
      // Best effort inspection poll
    }
  }, [api, followMouse]);

  useEffect(() => {
    if (!isOpen) return;
    void inspectNow();
    const timer = setInterval(() => {
      void inspectNow();
    }, refreshIntervalMs);
    return () => clearInterval(timer);
  }, [isOpen, inspectNow, refreshIntervalMs]);

  if (!isOpen) return null;

  const r = (snapshot.rgb >> 16) & 0xff;
  const g = (snapshot.rgb >> 8) & 0xff;
  const b = snapshot.rgb & 0xff;
  const swatchBg = snapshot.rgb >= 0 ? `rgb(${r}, ${g}, ${b})` : 'transparent';
  const colorText = snapshot.rgb >= 0 ? `${snapshot.hex} (R ${r} G ${g} B ${b})` : '—';

  return (
    <div
      role="region"
      aria-label="Window inspector"
      className="w-full p-4 bg-[var(--color-surface)] border border-[var(--color-border-subtle)] text-[var(--color-text-primary)] select-none text-[13px]"
    >
      <div className="flex flex-col gap-3 font-mono">
        {/* Header Controls */}
        <div className="flex items-center justify-between pb-2 border-b border-[var(--color-border-subtle)] font-sans">
          <span className="font-semibold text-[15px]">Window inspector</span>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] text-[14px]"
            >
              ✕
            </button>
          )}
        </div>

        <div className="flex flex-col gap-1 font-sans">
          <Checkbox
            checked={followMouse}
            onChange={setFollowMouse}
            label="Follow mouse"
          />
          <span className="text-[12px] text-[var(--color-text-muted)]">
            Hold Ctrl or Shift to freeze.
          </span>
        </div>

        {/* Window Section */}
        <div className="flex flex-col gap-1 pt-2 border-t border-[var(--color-border-subtle)]">
          <span className="font-sans font-semibold text-[11px] uppercase tracking-wider text-[var(--color-text-muted)]">
            Window
          </span>
          <div className="truncate text-[14px] font-semibold">{snapshot.title || '—'}</div>
          <div className="text-[var(--color-text-secondary)]">class: {snapshot.className}</div>
          <div className="text-[var(--color-text-secondary)]">exe:   {snapshot.processName}</div>
          <div className="text-[var(--color-text-secondary)]">pid:   {snapshot.processId}</div>
        </div>

        {/* Mouse Section */}
        <div className="flex flex-col gap-1 pt-2 border-t border-[var(--color-border-subtle)]">
          <span className="font-sans font-semibold text-[11px] uppercase tracking-wider text-[var(--color-text-muted)]">
            Mouse
          </span>
          <div className="text-[var(--color-text-secondary)]">
            Screen: {snapshot.mouseScreenX}, {snapshot.mouseScreenY}
          </div>
          <div className="text-[var(--color-text-secondary)]">
            Window: {snapshot.mouseWindowX}, {snapshot.mouseWindowY}
          </div>
          <div className="text-[var(--color-text-secondary)]">
            Client: {snapshot.mouseClientX}, {snapshot.mouseClientY}
          </div>
          <div className="flex items-center gap-2 mt-1">
            <div
              className="w-5 h-5 rounded-[4px] border border-[var(--color-border)] flex-shrink-0"
              style={{ backgroundColor: swatchBg }}
            />
            <span className="truncate">{colorText}</span>
          </div>
        </div>

        {/* Control Under Cursor Section */}
        <div className="flex flex-col gap-1 pt-2 border-t border-[var(--color-border-subtle)]">
          <span className="font-sans font-semibold text-[11px] uppercase tracking-wider text-[var(--color-text-muted)]">
            Control under cursor
          </span>
          <div className="text-[var(--color-text-secondary)]">{snapshot.controlClass || '—'}</div>
          <div className="text-[var(--color-text-secondary)]">
            x:{snapshot.controlX} y:{snapshot.controlY} w:{snapshot.controlWidth} h:{snapshot.controlHeight}
          </div>
        </div>

        {/* Window Position Section */}
        <div className="flex flex-col gap-1 pt-2 border-t border-[var(--color-border-subtle)]">
          <span className="font-sans font-semibold text-[11px] uppercase tracking-wider text-[var(--color-text-muted)]">
            Window position
          </span>
          <div className="text-[var(--color-text-secondary)]">
            x:{snapshot.windowX} y:{snapshot.windowY} w:{snapshot.windowWidth} h:{snapshot.windowHeight}
          </div>
          <div className="text-[var(--color-text-secondary)]">
            Client: w:{snapshot.clientWidth} h:{snapshot.clientHeight}
          </div>
        </div>

        {/* Frozen Indicator */}
        {isFrozen && (
          <div className="font-sans font-semibold text-[var(--color-warning)] pt-2 border-t border-[var(--color-border-subtle)]">
            Frozen
          </div>
        )}
      </div>
    </div>
  );
}
