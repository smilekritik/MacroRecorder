/**
 * @macro-recorder/desktop - Pixel Picker Tool
 * Compact floating bar displaying pixel color and coordinates under cursor during capture.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { IpcChannels } from '../../../../../../packages/contracts/src/index.js';
import { Button } from '../../design-system/Button.js';
import { useApi } from '../../hooks/useApi.js';
import type { PixelPickerProps } from './types.js';

export function PixelPicker({
  isOpen = true,
  hotkeyLabel = 'F5',
  onCapture,
  onCancel,
  apiOverride,
}: PixelPickerProps): React.ReactElement | null {
  const defaultApi = useApi();
  const api = apiOverride ?? defaultApi;

  const [sample, setSample] = useState({
    x: 0,
    y: 0,
    hex: '#000000',
    rgb: 0,
  });

  const pollCursor = useCallback(async () => {
    try {
      const res = await api.invoke(IpcChannels.WINDOWS_INSPECT, {
        requestId: `picker-inspect-${Date.now()}`,
        followMouse: true,
      });
      if (res.success && res.data?.snapshot) {
        const snap = res.data.snapshot;
        const rgb = snap.rgb >= 0 ? snap.rgb : 0;
        const hex = `#${rgb.toString(16).padStart(6, '0').toUpperCase()}`;
        setSample({
          x: snap.mouseScreenX,
          y: snap.mouseScreenY,
          hex,
          rgb,
        });
      }
    } catch {
      // Best effort cursor polling
    }
  }, [api]);

  useEffect(() => {
    if (!isOpen) return;
    void pollCursor();
    const timer = setInterval(() => {
      void pollCursor();
    }, 33);
    return () => clearInterval(timer);
  }, [isOpen, pollCursor]);

  // Handle hotkey capture & Escape cancel
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCancel?.();
      } else if (e.key === hotkeyLabel || e.code === hotkeyLabel) {
        e.preventDefault();
        onCapture?.(sample);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, hotkeyLabel, onCapture, onCancel, sample]);

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-label="Pixel picker"
      className="w-full p-3 bg-[var(--color-surface-raised)] border border-[var(--color-accent)] text-[var(--color-text-primary)] select-none"
    >
      <div className="flex items-start gap-4">
        {/* Swatch */}
        <div
          className="w-16 h-16 rounded-[8px] border border-[var(--color-border)] shadow-inner flex-shrink-0"
          style={{ backgroundColor: sample.hex }}
        />

        <div className="flex flex-col gap-1 min-w-0 flex-1">
          <span className="font-semibold text-[15px]">Pixel color picker</span>
          <span className="font-mono text-[13px] text-[var(--color-text-secondary)]">
            X {sample.x}   Y {sample.y}
          </span>
          <span className="font-mono font-semibold text-[14px] text-[var(--color-text-primary)]">
            {sample.hex}
          </span>
          <p className="text-[11px] text-[var(--color-text-muted)] leading-tight mt-1">
            Point at a pixel and press {hotkeyLabel}. Left click does not select a pixel.
          </p>
          <div className="flex items-center gap-2 pt-2">
            <Button variant="base" size="sm" onClick={onCancel}>
              Cancel
            </Button>
            <Button
              variant="accent"
              size="sm"
              onClick={() => onCapture?.(sample)}
            >
              Capture
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
