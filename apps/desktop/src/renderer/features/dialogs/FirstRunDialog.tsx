/**
 * @macro-recorder/desktop - First Run Onboarding Dialog
 * Modal setup wizard prompting for language, theme, and explaining defaults.
 */

import React, { useState } from 'react';
import { AppTheme } from '../../../../../../packages/contracts/src/domain/enums.js';
import { Modal } from '../../design-system/Modal.js';
import { Button } from '../../design-system/Button.js';
import { Select } from '../../design-system/Select.js';
import type { FirstRunDialogProps } from './types.js';

const LANGUAGE_OPTIONS = [
  { value: 'en', label: 'English' },
  { value: 'ru', label: 'Русский' },
];

export function FirstRunDialog({
  isOpen,
  initialLanguage = 'ru',
  initialTheme = AppTheme.Dark,
  onComplete,
  onCancel,
}: FirstRunDialogProps): React.ReactElement | null {
  const [selectedTheme, setSelectedTheme] = useState<AppTheme>(initialTheme);
  const [selectedLanguage, setSelectedLanguage] = useState<string>(initialLanguage);

  if (!isOpen) return null;

  const isDark = selectedTheme === AppTheme.Dark;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onCancel ?? (() => {})}
      title="First launch — Macro Recorder"
      maxWidth="max-w-2xl"
      closeOnEscape={false}
      closeOnBackdropClick={false}
      className="p-8"
    >
      <div className="flex flex-col gap-6 select-none">
        {/* Header Introduction */}
        <div>
          <h2 className="text-[22px] font-semibold text-[var(--color-text-primary)]">
            Macro Recorder
          </h2>
          <h3 className="text-[17px] font-semibold text-[var(--color-text-primary)] mt-1">
            Choose how the application should look
          </h3>
          <p className="text-[13px] text-[var(--color-text-secondary)] mt-1.5 leading-relaxed">
            You can change the language and theme later in application settings.
          </p>
        </div>

        {/* Language Selection Card */}
        <div className="p-4 rounded-[10px] bg-[var(--color-surface)] border border-[var(--color-border-subtle)] flex items-center justify-between gap-6">
          <div className="flex flex-col gap-1">
            <span className="text-[15px] font-semibold text-[var(--color-text-primary)]">
              Application language
            </span>
            <span className="text-[13px] text-[var(--color-text-secondary)]">
              The interface updates as soon as you choose.
            </span>
          </div>
          <div className="w-[220px]">
            <Select
              options={LANGUAGE_OPTIONS}
              value={selectedLanguage}
              onChange={(val) => setSelectedLanguage(String(val))}
              aria-label="Application language"
            />
          </div>
        </div>

        {/* Appearance Theme Selector */}
        <div className="flex flex-col gap-3">
          <span className="text-[15px] font-semibold text-[var(--color-text-primary)]">
            Appearance
          </span>
          <div className="grid grid-cols-2 gap-4">
            {/* Dark Theme Card */}
            <button
              type="button"
              onClick={() => setSelectedTheme(AppTheme.Dark)}
              aria-label="Use dark theme"
              className={`p-4 rounded-[10px] text-left transition-all bg-[var(--color-surface-raised)] border-2 ${
                isDark
                  ? 'border-[var(--color-accent)] ring-1 ring-[var(--color-accent)]'
                  : 'border-[var(--color-border)] hover:border-[var(--color-border-hover)]'
              }`}
            >
              <div className="h-[96px] rounded-[7px] p-3 bg-[#0D1117] border border-[#687A91] flex flex-col justify-between">
                <div className="h-[20px] rounded-[4px] bg-[#1B2330]" />
                <div className="flex gap-2 items-center">
                  <div className="w-[46px] h-[40px] rounded-[4px] bg-[#151B23]" />
                  <div className="flex-1 flex flex-col gap-1.5">
                    <div className="h-[12px] w-3/4 rounded-[3px] bg-[#66E06F]" />
                    <div className="h-[8px] w-1/2 rounded-[2px] bg-[#687A91]" />
                    <div className="h-[8px] w-2/3 rounded-[2px] bg-[#2B3544]" />
                  </div>
                </div>
              </div>
              <div className="mt-3 font-semibold text-[15px] text-[var(--color-text-primary)]">
                Dark
              </div>
              <div className="h-5 mt-0.5">
                {isDark && (
                  <span className="text-[13px] font-semibold text-[var(--color-accent)]">
                    ✓ Selected
                  </span>
                )}
              </div>
            </button>

            {/* Light Theme Card */}
            <button
              type="button"
              onClick={() => setSelectedTheme(AppTheme.Light)}
              aria-label="Use light theme"
              className={`p-4 rounded-[10px] text-left transition-all bg-[var(--color-surface-raised)] border-2 ${
                !isDark
                  ? 'border-[var(--color-accent)] ring-1 ring-[var(--color-accent)]'
                  : 'border-[var(--color-border)] hover:border-[var(--color-border-hover)]'
              }`}
            >
              <div className="h-[96px] rounded-[7px] p-3 bg-[#F3F6F9] border border-[#718096] flex flex-col justify-between">
                <div className="h-[20px] rounded-[4px] bg-[#E8EEF4]" />
                <div className="flex gap-2 items-center">
                  <div className="w-[46px] h-[40px] rounded-[4px] bg-[#FFFFFF] border border-[#CBD5E1]" />
                  <div className="flex-1 flex flex-col gap-1.5">
                    <div className="h-[12px] w-3/4 rounded-[3px] bg-[#18752A]" />
                    <div className="h-[8px] w-1/2 rounded-[2px] bg-[#718096]" />
                    <div className="h-[8px] w-2/3 rounded-[2px] bg-[#CBD5E1]" />
                  </div>
                </div>
              </div>
              <div className="mt-3 font-semibold text-[15px] text-[var(--color-text-primary)]">
                Light
              </div>
              <div className="h-5 mt-0.5">
                {!isDark && (
                  <span className="text-[13px] font-semibold text-[var(--color-accent)]">
                    ✓ Selected
                  </span>
                )}
              </div>
            </button>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="pt-2 flex items-center justify-between border-t border-[var(--color-border-subtle)]">
          <span className="text-[12px] text-[var(--color-text-muted)] max-w-sm">
            Default shortcuts: record F7, stop F8, emergency stop F10, bind map F11.
          </span>
          <Button
            variant="accent"
            size="md"
            onClick={() => onComplete(selectedTheme, selectedLanguage)}
            className="min-w-[132px]"
          >
            Continue
          </Button>
        </div>
      </div>
    </Modal>
  );
}
