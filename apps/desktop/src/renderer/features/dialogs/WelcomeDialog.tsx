/**
 * @macro-recorder/desktop - Welcome Onboarding Dialog
 * Post-initial-setup tour of basic shortcuts and features.
 */

import React from 'react';
import { Modal } from '../../design-system/Modal.js';
import { Button } from '../../design-system/Button.js';
import type { WelcomeDialogProps } from './types.js';

export function WelcomeDialog({
  isOpen,
  shortcuts = {},
  onClose,
}: WelcomeDialogProps): React.ReactElement | null {
  if (!isOpen) return null;

  const startKey = shortcuts.start ?? 'F7';
  const stopKey = shortcuts.stop ?? 'F8';
  const pauseKey = shortcuts.pause ?? 'F9';
  const bindMapKey = shortcuts.bindmap ?? 'F11';
  const emergencyKey = shortcuts.emergency ?? 'F10';

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Welcome — Macro Recorder"
      maxWidth="max-w-2xl"
      closeOnEscape={true}
      closeOnBackdropClick={true}
      className="p-8"
    >
      <div className="flex flex-col gap-6 select-none">
        <div>
          <h2 className="text-[24px] font-semibold text-[var(--color-text-primary)]">
            Welcome to Macro Recorder
          </h2>
          <p className="text-[14px] text-[var(--color-text-secondary)] mt-1.5">
            A quick tour of the essentials. You can change everything later in Settings.
          </p>
        </div>

        {/* Basic Shortcuts Card */}
        <div className="p-5 rounded-[10px] bg-[var(--color-surface)] border border-[var(--color-border-subtle)] flex flex-col gap-4">
          <span className="text-[15px] font-semibold text-[var(--color-text-primary)]">
            Basic shortcuts
          </span>
          <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-[14px]">
            <div className="flex items-center justify-between">
              <span className="text-[var(--color-text-secondary)]">Start recording</span>
              <kbd className="px-2.5 py-1 rounded-[5px] bg-[var(--color-surface-sunken)] border border-[var(--color-border)] font-semibold text-[13px] text-[var(--color-text-primary)]">
                {startKey}
              </kbd>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-[var(--color-text-secondary)]">Stop recording</span>
              <kbd className="px-2.5 py-1 rounded-[5px] bg-[var(--color-surface-sunken)] border border-[var(--color-border)] font-semibold text-[13px] text-[var(--color-text-primary)]">
                {stopKey}
              </kbd>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-[var(--color-text-secondary)]">Pause / resume playback</span>
              <kbd className="px-2.5 py-1 rounded-[5px] bg-[var(--color-surface-sunken)] border border-[var(--color-border)] font-semibold text-[13px] text-[var(--color-text-primary)]">
                {pauseKey}
              </kbd>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-[var(--color-text-secondary)]">Bind map</span>
              <kbd className="px-2.5 py-1 rounded-[5px] bg-[var(--color-surface-sunken)] border border-[var(--color-border)] font-semibold text-[13px] text-[var(--color-text-primary)]">
                {bindMapKey}
              </kbd>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-[var(--color-text-secondary)]">Emergency stop</span>
              <kbd className="px-2.5 py-1 rounded-[5px] bg-[var(--color-danger-surface)] border border-[var(--color-danger)] font-semibold text-[13px] text-[var(--color-danger)]">
                {emergencyKey}
              </kbd>
            </div>
          </div>
          <span className="text-[12px] text-[var(--color-text-muted)] pt-1">
            Change any of these in Settings → Controls.
          </span>
        </div>

        {/* Feature Highlights Card */}
        <div className="p-5 rounded-[10px] bg-[var(--color-surface)] border border-[var(--color-border-subtle)] flex flex-col gap-3">
          <span className="text-[15px] font-semibold text-[var(--color-text-primary)]">
            What you can do
          </span>
          <ul className="flex flex-col gap-2 list-none pl-0 text-[13px] text-[var(--color-text-secondary)] leading-relaxed">
            <li className="flex items-start gap-2">
              <span className="text-[var(--color-accent)] font-bold">•</span>
              <span>Record a whole session, or build a macro action by action on the timeline.</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-[var(--color-accent)] font-bold">•</span>
              <span>Give each macro a shortcut, or start it automatically on a pixel colour.</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-[var(--color-accent)] font-bold">•</span>
              <span>Play back with precise timing — to the active window, or straight into one chosen window.</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-[var(--color-accent)] font-bold">•</span>
              <span>The app lives in the tray. Emergency stop instantly releases every held key and button.</span>
            </li>
          </ul>
        </div>

        {/* Footer */}
        <div className="pt-2 flex items-center justify-between border-t border-[var(--color-border-subtle)]">
          <span className="text-[12px] text-[var(--color-text-muted)] max-w-sm">
            The two example macros are disabled — open one to see how it is built.
          </span>
          <Button variant="accent" onClick={onClose} className="min-w-[140px]" autoFocus>
            Get started
          </Button>
        </div>
      </div>
    </Modal>
  );
}
