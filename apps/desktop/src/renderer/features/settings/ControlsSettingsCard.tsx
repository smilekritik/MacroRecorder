/**
 * @macro-recorder/desktop - Controls Settings Card
 * Global application shortcuts configuration with clearable intent,
 * conflict validation, direct jump focus from bind map, and gamepad settings.
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  DEFAULT_HOTKEY_BINDING,
  formatHotkeyDisplay,
  isEmptyHotkey,
  sameGesture,
  type HotkeyBinding,
} from '../../../../../../packages/contracts/src/domain/hotkey.js';
import { GamepadOutputType } from '../../../../../../packages/contracts/src/domain/enums.js';
import { Button } from '../../design-system/Button.js';
import { Checkbox } from '../../design-system/Checkbox.js';
import type { GlobalHotkeyTag, HotkeyFormState } from './types.js';

export interface ControlsSettingsCardProps {
  readonly hotkeys: HotkeyFormState;
  readonly onChangeHotkeys: (hotkeys: HotkeyFormState) => void;
  readonly macroHotkeys?: readonly HotkeyBinding[] | undefined;
  readonly probeAvailability?: ((bindings: readonly HotkeyBinding[]) => boolean[]) | undefined;
  readonly focusHotkeyTag?: string | undefined;
  readonly gamepadOutput: GamepadOutputType;
  readonly onChangeGamepadOutput: (type: GamepadOutputType) => void;
  readonly hideRealGamepad: boolean;
  readonly onChangeHideRealGamepad: (hide: boolean) => void;
  readonly onOpenGamepadTester?: (() => void) | undefined;
}

const SHORTCUT_ROWS: ReadonlyArray<{ tag: GlobalHotkeyTag; label: string; name: string }> = [
  { tag: 'start', label: 'Start recording', name: 'Start recording shortcut' },
  { tag: 'stop', label: 'Stop recording', name: 'Stop recording shortcut' },
  { tag: 'pause', label: 'Pause / resume playback', name: 'Pause and resume playback shortcut' },
  { tag: 'emergency', label: 'Emergency stop', name: 'Emergency stop shortcut' },
  { tag: 'pixel', label: 'Capture pixel color', name: 'Pixel color capture shortcut' },
  { tag: 'bindmap', label: 'Bind map', name: 'Bind map shortcut' },
];

export function ControlsSettingsCard({
  hotkeys,
  onChangeHotkeys,
  macroHotkeys = [],
  probeAvailability,
  focusHotkeyTag,
  gamepadOutput,
  onChangeGamepadOutput,
  hideRealGamepad,
  onChangeHideRealGamepad,
  onOpenGamepadTester,
}: ControlsSettingsCardProps): React.ReactElement {
  const [validationError, setValidationError] = useState<string>('');
  const [warningNotice, setWarningNotice] = useState<string>('');
  const [activeListeningTag, setActiveListeningTag] = useState<GlobalHotkeyTag | null>(null);

  const inputRefs = useRef<Record<GlobalHotkeyTag, HTMLInputElement | null>>({
    start: null,
    stop: null,
    pause: null,
    emergency: null,
    pixel: null,
    bindmap: null,
  });

  // Direct Jump from BindMap or other windows
  useEffect(() => {
    if (!focusHotkeyTag) return;
    const tag = focusHotkeyTag.toLowerCase() as GlobalHotkeyTag;
    const inputEl = inputRefs.current[tag];
    if (inputEl) {
      inputEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      inputEl.focus();
    }
  }, [focusHotkeyTag]);

  const assignHotkey = useCallback(
    (tag: GlobalHotkeyTag, binding: HotkeyBinding) => {
      setValidationError('');
      setWarningNotice('');

      const nextHotkeys: HotkeyFormState = {
        ...hotkeys,
        [tag]: binding,
      };

      // Empty binds do not conflict with each other
      if (!isEmptyHotkey(binding)) {
        // Conflict check against other global shortcuts
        const otherEntries = Object.entries(nextHotkeys).filter(([k]) => k !== tag);
        for (const [, otherBinding] of otherEntries) {
          if (!isEmptyHotkey(otherBinding) && sameGesture(binding, otherBinding)) {
            setValidationError('This shortcut is already used by another application command.');
            return;
          }
        }

        // Conflict check against user's macro shortcuts
        for (const macroBinding of macroHotkeys) {
          if (!isEmptyHotkey(macroBinding) && sameGesture(binding, macroBinding)) {
            setValidationError('This shortcut is already assigned to a macro.');
            return;
          }
        }

        // Probe if held by external app
        if (probeAvailability) {
          try {
            const results = probeAvailability([binding]);
            if (results[0] === false) {
              setWarningNotice(
                `Another application already holds ${formatHotkeyDisplay(binding)} — this command may not work.`,
              );
            }
          } catch {
            // Ignore probe errors
          }
        }
      }

      onChangeHotkeys(nextHotkeys);
    },
    [hotkeys, macroHotkeys, onChangeHotkeys, probeAvailability],
  );

  const handleClearHotkey = (tag: GlobalHotkeyTag) => {
    assignHotkey(tag, { ...DEFAULT_HOTKEY_BINDING });
  };

  const handleKeyDownOnInput = (e: React.KeyboardEvent<HTMLInputElement>, tag: GlobalHotkeyTag) => {
    e.preventDefault();
    if (e.key === 'Escape') {
      setActiveListeningTag(null);
      return;
    }

    if (['Control', 'Alt', 'Shift', 'Meta'].includes(e.key)) {
      return;
    }

    const binding: HotkeyBinding = {
      virtualKey: e.keyCode,
      mouseButton: 'None',
      wheel: 'None',
      control: e.ctrlKey,
      alt: e.altKey,
      shift: e.shiftKey,
      windows: e.metaKey,
    };

    assignHotkey(tag, binding);
    setActiveListeningTag(null);
  };

  return (
    <section id="section-controls" aria-label="Controls" className="flex flex-col gap-4 select-none">
      <h3 className="text-[17px] font-semibold text-[var(--color-text-primary)]">
        Controls
      </h3>

      {/* Global Shortcuts Card */}
      <div className="p-4 rounded-[10px] bg-[var(--color-surface)] border border-[var(--color-border-subtle)] flex flex-col gap-3">
        <div className="flex flex-col gap-0.5">
          <span className="text-[15px] font-semibold text-[var(--color-text-primary)]">
            Global application shortcuts
          </span>
          <span className="text-[13px] text-[var(--color-text-secondary)] leading-relaxed">
            Select a field and press the desired key combination. Shortcuts must be unique. “Delete” leaves the command without a shortcut — it stays available from the interface.
          </span>
        </div>

        <div className="flex flex-col gap-2.5 mt-2">
          {SHORTCUT_ROWS.map(({ tag, label, name }) => {
            const currentBinding = hotkeys[tag];
            const isListening = activeListeningTag === tag;
            const isJumpTarget = focusHotkeyTag?.toLowerCase() === tag;
            const displayText = isListening
              ? 'Press keys...'
              : formatHotkeyDisplay(currentBinding);

            return (
              <div key={tag} className="grid grid-cols-[180px_1fr_auto] items-center gap-3">
                <span className="text-[13px] text-[var(--color-text-primary)] font-medium">
                  {label}
                </span>

                <input
                  ref={(el) => {
                    inputRefs.current[tag] = el;
                  }}
                  type="text"
                  readOnly
                  value={displayText}
                  aria-label={name}
                  onFocus={() => setActiveListeningTag(tag)}
                  onBlur={() => setActiveListeningTag(null)}
                  onKeyDown={(e) => handleKeyDownOnInput(e, tag)}
                  className={`w-full min-h-[38px] px-3 py-1.5 text-[13px] font-mono rounded-[5px] bg-[var(--color-input-bg)] text-[var(--color-text-primary)] border transition-colors outline-none ${
                    isJumpTarget
                      ? 'border-[var(--color-accent)] ring-2 ring-[var(--color-accent)]'
                      : isListening
                        ? 'border-[var(--color-focus)] ring-2 ring-[var(--color-focus)]'
                        : 'border-[var(--color-border)] hover:border-[var(--color-border-hover)]'
                  }`}
                />

                <Button
                  variant="base"
                  size="sm"
                  onClick={() => handleClearHotkey(tag)}
                  aria-label={`Clear ${label}`}
                  className="px-3"
                >
                  Delete
                </Button>
              </div>
            );
          })}
        </div>

        {validationError && (
          <span className="text-[13px] font-semibold text-[var(--color-danger)] pt-1">
            {validationError}
          </span>
        )}

        {warningNotice && (
          <span className="text-[13px] font-semibold text-[var(--color-warning)] pt-1">
            {warningNotice}
          </span>
        )}
      </div>

      {/* Gamepad Card */}
      <div className="p-4 rounded-[10px] bg-[var(--color-surface)] border border-[var(--color-border-subtle)] flex flex-col gap-3">
        <div className="flex flex-col gap-0.5">
          <span className="text-[15px] font-semibold text-[var(--color-text-primary)]">
            Gamepad
          </span>
          <span className="text-[13px] text-[var(--color-text-secondary)] leading-relaxed">
            The ViGEmBus driver is installed — gamepad output is available.
          </span>
        </div>

        <div className="flex items-center gap-2 pt-1">
          <Button variant="base" size="sm" onClick={onOpenGamepadTester}>
            Gamepad test
          </Button>
        </div>

        <div className="flex flex-col gap-1.5 pt-2">
          <span className="text-[13px] font-semibold text-[var(--color-text-secondary)]">
            Output pad type
          </span>
          <div className="flex items-center gap-5 text-[14px]">
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="padType"
                checked={gamepadOutput === GamepadOutputType.Xbox360}
                onChange={() => onChangeGamepadOutput(GamepadOutputType.Xbox360)}
                className="accent-[var(--color-accent)]"
              />
              Xbox 360
            </label>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="padType"
                checked={gamepadOutput === GamepadOutputType.DualShock4}
                onChange={() => onChangeGamepadOutput(GamepadOutputType.DualShock4)}
                className="accent-[var(--color-accent)]"
              />
              DualShock 4
            </label>
          </div>
          <span className="text-[12px] text-[var(--color-text-muted)]">
            How the virtual pad appears to the game. Recorded events do not depend on this choice.
          </span>
        </div>

        <div className="pt-2">
          <Checkbox
            checked={hideRealGamepad}
            onChange={onChangeHideRealGamepad}
            label={
              <span className="flex flex-col">
                <span>Hide the physical pad during playback</span>
                <span className="text-[12px] text-[var(--color-text-secondary)]">
                  HidHide is installed. During playback the physical controller is hidden from games (except this app). XInput Xbox pads can't be hidden this way.
                </span>
              </span>
            }
          />
        </div>
      </div>
    </section>
  );
}
