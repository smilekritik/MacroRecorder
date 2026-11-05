/**
 * @macro-recorder/desktop - Key Code Inspector Tool
 * Live key press inspector capturing virtual key codes, hardware scan codes,
 * extended flags, and human-readable names.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { getVirtualKeyName } from '../../../../../../packages/contracts/src/domain/key-constants.js';
import { useSystemCommands } from '../../hooks/systemCommands.js';
import { Button } from '../../design-system/Button.js';
import { Input } from '../../design-system/Input.js';
import { Checkbox } from '../../design-system/Checkbox.js';
import type { KeyCodeInspectorProps } from './types.js';

export function KeyCodeInspector({
  isOpen = true,
  onClose,
}: KeyCodeInspectorProps): React.ReactElement | null {
  const system = useSystemCommands();
  const [mode, setMode] = useState<'get' | 'by-code'>('get');

  // Mode 1: Get code state
  const [capturedName, setCapturedName] = useState('Press a key');
  const [lastVk, setLastVk] = useState(0);
  const [lastSc, setLastSc] = useState(0);
  const [lastExtended, setLastExtended] = useState(false);

  // Mode 2: Key by code state
  const [codeKind, setCodeKind] = useState<'vk' | 'sc'>('vk');
  const [codeInput, setCodeInput] = useState('');
  const [extendedChecked, setExtendedChecked] = useState(false);
  const [resolvedName, setResolvedName] = useState('—');

  // Mode 1: Listen for key presses
  useEffect(() => {
    if (!isOpen || mode !== 'get') return;

    const handleKeyDown = (e: KeyboardEvent) => {
      e.preventDefault();
      if (e.key === 'Escape' && onClose) {
        onClose();
        return;
      }

      const vk = e.keyCode;
      // Scan code approximation in browser from KeyboardEvent.code if available
      void system.keyInfo(vk).then((info) => {
        setLastSc(info.scanCode ?? 0);
        setLastExtended(info.extended ?? false);
      });

      const name = getVirtualKeyName(vk) || e.key;

      setLastVk(vk);
      setCapturedName(name);
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, mode, onClose, system]);

  // Mode 2: Resolve key name from code
  const resolveName = useCallback(
    (input: string, kind: 'vk' | 'sc', _isExt: boolean) => {
      let raw = input.trim();
      if (raw.toLowerCase().startsWith('0x')) raw = raw.slice(2);
      else if (raw.toLowerCase().startsWith('vk')) raw = raw.slice(2);
      else if (raw.toLowerCase().startsWith('sc')) raw = raw.slice(2);

      if (!raw) {
        setResolvedName('—');
        return;
      }

      const parsedCode = parseInt(raw, 16);
      if (Number.isNaN(parsedCode) || parsedCode < 0) {
        setResolvedName('—');
        return;
      }

      if (kind === 'vk') {
        const name = getVirtualKeyName(parsedCode);
        setResolvedName(name || 'No such key');
      } else {
        // Scan code resolution fallback
        const name = getVirtualKeyName(parsedCode);
        setResolvedName(name || `Scan code 0x${parsedCode.toString(16).toUpperCase()}`);
      }
    },
    [],
  );

  useEffect(() => {
    if (mode === 'by-code') {
      resolveName(codeInput, codeKind, extendedChecked);
    }
  }, [mode, codeInput, codeKind, extendedChecked, resolveName]);

  const copyText = (text: string) => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      void navigator.clipboard.writeText(text);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      role="region"
      aria-label="Key codes"
      className="w-full p-5 bg-[var(--color-surface)] border border-[var(--color-border-subtle)] text-[var(--color-text-primary)] select-none text-[13px]"
    >
      <div className="flex flex-col gap-4">
        {/* Header */}
        <div className="flex items-center justify-between pb-2 border-b border-[var(--color-border-subtle)]">
          <span className="font-semibold text-[16px]">Key codes</span>
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

        {/* Mode Switcher */}
        <div className="grid grid-cols-2 gap-2">
          <Button
            variant={mode === 'get' ? 'accent' : 'base'}
            onClick={() => setMode('get')}
          >
            Get code
          </Button>
          <Button
            variant={mode === 'by-code' ? 'accent' : 'base'}
            onClick={() => setMode('by-code')}
          >
            Key by code
          </Button>
        </div>

        {/* Mode 1: Get Code */}
        {mode === 'get' && (
          <div className="flex flex-col gap-3">
            <div className="p-4 rounded-[8px] bg-[var(--color-surface-raised)] border border-[var(--color-border-subtle)] flex flex-col items-center gap-3">
              <span className="text-[20px] font-semibold text-center truncate max-w-full">
                {capturedName}
              </span>

              <div className="grid grid-cols-3 w-full text-center gap-2 pt-2 border-t border-[var(--color-border-subtle)]">
                <div className="flex flex-col">
                  <span className="text-[11px] text-[var(--color-text-muted)]">vk</span>
                  <span className="font-mono font-semibold text-[15px]">
                    {lastVk > 0 ? `0x${lastVk.toString(16).toUpperCase().padStart(2, '0')}` : '—'}
                  </span>
                </div>

                <div className="flex flex-col">
                  <span className="text-[11px] text-[var(--color-text-muted)]">sc</span>
                  <span className="font-mono font-semibold text-[15px]">
                    {lastSc > 0 ? `0x${lastSc.toString(16).toUpperCase().padStart(2, '0')}` : '—'}
                  </span>
                </div>

                <div className="flex flex-col">
                  <span className="text-[11px] text-[var(--color-text-muted)]">ext.</span>
                  <span className="font-semibold text-[15px]">
                    {lastExtended ? '✓' : '—'}
                  </span>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <Button
                variant="base"
                disabled={lastVk === 0}
                onClick={() => copyText(`vk${lastVk.toString(16).toUpperCase().padStart(2, '0')}`)}
              >
                Copy vk
              </Button>
              <Button
                variant="base"
                disabled={lastSc === 0}
                onClick={() => copyText(`sc${lastSc.toString(16).toUpperCase().padStart(3, '0')}`)}
              >
                Copy sc
              </Button>
            </div>

            <p className="text-[11px] text-[var(--color-text-muted)] leading-normal mt-1">
              Capture runs while the window is open, even if focus is in another application.
            </p>
          </div>
        )}

        {/* Mode 2: Key by Code */}
        {mode === 'by-code' && (
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-1.5 text-[14px]">
                <input
                  type="radio"
                  name="codeKind"
                  checked={codeKind === 'vk'}
                  onChange={() => setCodeKind('vk')}
                  className="accent-[var(--color-accent)]"
                />
                vk
              </label>
              <label className="flex items-center gap-1.5 text-[14px]">
                <input
                  type="radio"
                  name="codeKind"
                  checked={codeKind === 'sc'}
                  onChange={() => setCodeKind('sc')}
                  className="accent-[var(--color-accent)]"
                />
                sc
              </label>
            </div>

            <div className="flex flex-col gap-1">
              <span className="text-[12px] text-[var(--color-text-muted)]">
                Enter the code in hexadecimal, without the 0x prefix
              </span>
              <Input
                value={codeInput}
                maxLength={6}
                onChange={(e) => setCodeInput(e.target.value.toUpperCase())}
                placeholder="e.g. 74 or 20"
                className="font-mono text-[16px]"
              />
            </div>

            {codeKind === 'sc' && (
              <Checkbox
                checked={extendedChecked}
                onChange={setExtendedChecked}
                label="Extended (0xE0 prefix)"
              />
            )}

            <div className="p-4 rounded-[8px] bg-[var(--color-surface-raised)] border border-[var(--color-border-subtle)] flex items-center justify-center min-h-[64px]">
              <span className="text-[18px] font-semibold text-center">
                {resolvedName}
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
