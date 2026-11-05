/**
 * @macro-recorder/desktop - Gamepad Tester Tool
 * Live gamepad monitor displaying connections, buttons, sticks, triggers, and raw axes.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { IpcChannels } from '../../../../../../packages/contracts/src/index.js';
import { getGamepadButtonName } from '../../../../../../packages/contracts/src/domain/key-constants.js';
import type { GamepadPadReading } from '../../../../../../packages/contracts/src/descriptors/controller.js';
import { useApi } from '../../hooks/useApi.js';
import type { GamepadTesterProps } from './types.js';

export function GamepadTester({
  isOpen = true,
  onClose,
  refreshIntervalMs = 50,
  apiOverride,
}: GamepadTesterProps): React.ReactElement | null {
  const defaultApi = useApi();
  const api = apiOverride ?? defaultApi;

  const [readings, setReadings] = useState<readonly GamepadPadReading[]>([]);

  const pollGamepads = useCallback(async () => {
    try {
      const res = await api.invoke(IpcChannels.GAMEPAD_GET_READINGS, {
        requestId: `pad-test-${Date.now()}`,
      });
      if (res.success && res.data?.readings) {
        setReadings(res.data.readings);
      }
    } catch {
      // Best effort gamepad poll
    }
  }, [api]);

  useEffect(() => {
    if (!isOpen) return;
    void pollGamepads();
    const timer = setInterval(() => {
      void pollGamepads();
    }, refreshIntervalMs);
    return () => clearInterval(timer);
  }, [isOpen, pollGamepads, refreshIntervalMs]);

  // Handle Escape key to close
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && onClose) {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      role="region"
      aria-label="Gamepad test"
      className="w-full min-h-[460px] max-h-[90vh] overflow-y-auto p-5 bg-[var(--color-surface)] border border-[var(--color-border-subtle)] text-[var(--color-text-primary)] select-none text-[13px]"
    >
      <div className="flex flex-col gap-4">
        {/* Header */}
        <div className="flex items-center justify-between pb-2 border-b border-[var(--color-border-subtle)]">
          <div>
            <h3 className="text-[16px] font-semibold">Gamepad test</h3>
            <p className="text-[12px] text-[var(--color-text-muted)] mt-0.5">
              Live state of connected pads (Xbox and DualShock 4). Handy while recording.
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

        {/* Empty State */}
        {readings.length === 0 && (
          <div className="py-12 flex flex-col items-center justify-center text-center gap-2 text-[var(--color-text-muted)]">
            <span className="font-mono text-[14px]">No pad connected</span>
            <span className="text-[12px]">Connect a controller via USB or Bluetooth</span>
          </div>
        )}

        {/* Controllers List */}
        <div className="flex flex-col gap-3 font-mono">
          {readings.map((pad, index) => {
            const pressedLabels =
              pad.pressed && pad.pressed.length > 0
                ? pad.pressed.map((btn) => getGamepadButtonName(btn) || btn).join(', ')
                : '—';

            return (
              <div
                key={index}
                className="p-4 rounded-[8px] bg-[var(--color-surface-raised)] border border-[var(--color-border-subtle)] flex flex-col gap-2.5"
              >
                <div className="font-sans font-semibold text-[14px] text-[var(--color-text-primary)]">
                  {pad.source}
                </div>

                <div className="flex flex-col gap-0.5">
                  <span className="font-sans text-[11px] uppercase tracking-wider text-[var(--color-text-muted)]">
                    Pressed buttons
                  </span>
                  <span className="text-[13px] text-[var(--color-text-primary)] break-words">
                    {pressedLabels}
                  </span>
                </div>

                <div className="flex flex-col gap-0.5">
                  <span className="font-sans text-[11px] uppercase tracking-wider text-[var(--color-text-muted)]">
                    Sticks
                  </span>
                  <span className="text-[13px] text-[var(--color-text-secondary)]">
                    LS: {pad.leftX}, {pad.leftY}    RS: {pad.rightX}, {pad.rightY}
                  </span>
                </div>

                <div className="flex flex-col gap-0.5">
                  <span className="font-sans text-[11px] uppercase tracking-wider text-[var(--color-text-muted)]">
                    Triggers
                  </span>
                  <span className="text-[13px] text-[var(--color-text-secondary)]">
                    LT: {pad.leftTrigger}    RT: {pad.rightTrigger}
                  </span>
                </div>

                {pad.rawAxes && (
                  <div className="flex flex-col gap-0.5">
                    <span className="font-sans text-[11px] uppercase tracking-wider text-[var(--color-text-muted)]">
                      Raw axes (WGI)
                    </span>
                    <span className="text-[11px] text-[var(--color-text-muted)] break-all">
                      {pad.rawAxes}
                    </span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
