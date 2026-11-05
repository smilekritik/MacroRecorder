/**
 * @macro-recorder/desktop - Pixel Inspector Tool
 * Live probe of pixel under cursor: coordinates, hex, RGB, and owner window.
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { IpcChannels } from '../../../../../../packages/contracts/src/index.js';
import { Button } from '../../design-system/Button.js';
import { useApi } from '../../hooks/useApi.js';
import type { PixelInspectorProps } from './types.js';

export function PixelInspector({
  isOpen = true,
  onClose,
  refreshIntervalMs = 33,
  apiOverride,
}: PixelInspectorProps): React.ReactElement | null {
  const defaultApi = useApi();
  const api = apiOverride ?? defaultApi;

  const [isFrozen, setIsFrozen] = useState(false);
  const [sample, setSample] = useState({
    x: 0,
    y: 0,
    rgb: 0,
    hex: '#000000',
    r: 0,
    g: 0,
    b: 0,
    processName: '—',
  });
  const isFrozenRef = useRef(false);
  isFrozenRef.current = isFrozen;

  const copyPayload = useCallback(() => {
    const hexFormatted = sample.hex.replace('#', '').toUpperCase().padStart(6, '0');
    const text = `${sample.x}, ${sample.y} 0x${hexFormatted}`;
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      void navigator.clipboard.writeText(text);
    }
  }, [sample]);

  // Global keys: Ctrl freezes, F6 copies, Escape closes
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Control') {
        setIsFrozen(true);
      } else if (e.key === 'F6') {
        e.preventDefault();
        copyPayload();
      } else if (e.key === 'Escape' && onClose) {
        e.preventDefault();
        onClose();
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (!e.ctrlKey) {
        setIsFrozen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [copyPayload, onClose]);

  const captureNow = useCallback(async () => {
    if (isFrozenRef.current) return;
    try {
      // Capture cursor coordinates and color via pixel/windows inspect
      const res = await api.invoke(IpcChannels.WINDOWS_INSPECT, {
        requestId: `pix-inspect-${Date.now()}`,
        followMouse: true,
      });
      if (res.success && res.data?.snapshot) {
        const snap = res.data.snapshot;
        const rgb = snap.rgb >= 0 ? snap.rgb : 0;
        const r = (rgb >> 16) & 0xff;
        const g = (rgb >> 8) & 0xff;
        const b = rgb & 0xff;
        const hex = `#${rgb.toString(16).padStart(6, '0').toUpperCase()}`;
        setSample({
          x: snap.mouseScreenX,
          y: snap.mouseScreenY,
          rgb,
          hex,
          r,
          g,
          b,
          processName: snap.processName || '—',
        });
      }
    } catch {
      // Best effort live pixel polling
    }
  }, [api]);

  useEffect(() => {
    if (!isOpen) return;
    void captureNow();
    const timer = setInterval(() => {
      void captureNow();
    }, refreshIntervalMs);
    return () => clearInterval(timer);
  }, [isOpen, captureNow, refreshIntervalMs]);

  if (!isOpen) return null;

  return (
    <div
      role="region"
      aria-label="Pixel and coordinates"
      className="w-full p-5 bg-[var(--color-surface)] text-[var(--color-text-primary)] select-none text-[13px]"
    >
      <div className="flex flex-col gap-4">
        {/* Header */}
        <div className="flex items-center justify-between pb-2 border-b border-[var(--color-border-subtle)]">
          <div>
            <h3 className="text-[16px] font-semibold text-[var(--color-text-primary)]">
              Pixel under cursor
            </h3>
            <p className="text-[12px] text-[var(--color-text-muted)] mt-0.5">
              F6 — copy. Hold Ctrl to freeze.
            </p>
          </div>
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

        {/* Swatch & Hex / RGB */}
        <div className="flex items-center gap-4">
          <div
            className="w-[72px] h-[72px] rounded-[8px] border border-[var(--color-border)] shadow-inner flex-shrink-0"
            style={{ backgroundColor: sample.hex }}
          />
          <div className="flex flex-col gap-1 min-w-0">
            <span className="font-mono text-[20px] font-semibold tracking-wide">
              {sample.hex}
            </span>
            <span className="text-[12px] text-[var(--color-text-secondary)] font-mono">
              R {sample.r}   G {sample.g}   B {sample.b}
            </span>
          </div>
        </div>

        {/* Coordinates Row */}
        <div className="flex items-center justify-between py-1 border-t border-[var(--color-border-subtle)]">
          <span className="text-[var(--color-text-secondary)]">Coordinates (screen)</span>
          <span className="font-mono font-semibold text-[14px]">
            {sample.x}, {sample.y}
          </span>
        </div>

        {/* Window Process Row */}
        <div className="flex items-center justify-between py-1 border-t border-[var(--color-border-subtle)]">
          <span className="text-[var(--color-text-secondary)]">Window under cursor</span>
          <span className="font-mono text-[13px] text-[var(--color-text-primary)] truncate max-w-[180px]">
            {sample.processName}
          </span>
        </div>

        {/* Bottom Actions & Frozen Status */}
        <div className="flex items-center justify-between pt-2 border-t border-[var(--color-border-subtle)]">
          {isFrozen ? (
            <span className="font-semibold text-[var(--color-warning)]">Frozen</span>
          ) : (
            <span />
          )}
          <Button variant="accent" onClick={copyPayload} className="min-w-[110px]">
            Copy (F6)
          </Button>
        </div>
      </div>
    </div>
  );
}
