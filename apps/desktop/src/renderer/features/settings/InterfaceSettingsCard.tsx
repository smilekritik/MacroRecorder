/**
 * @macro-recorder/desktop - Interface Settings Card
 * Language selection and Dark/Light visual theme cards.
 */

import React from 'react';
import { AppTheme } from '../../../../../../packages/contracts/src/domain/enums.js';
import { Select } from '../../design-system/Select.js';

export interface InterfaceSettingsCardProps {
  readonly currentLanguage: string;
  readonly currentTheme: AppTheme;
  readonly onLanguageChange: (code: string) => void;
  readonly onThemeChange: (theme: AppTheme) => void;
}

const LANGUAGES = [
  { value: 'en', label: 'English' },
  { value: 'ru', label: 'Русский' },
];

export function InterfaceSettingsCard({
  currentLanguage,
  currentTheme,
  onLanguageChange,
  onThemeChange,
}: InterfaceSettingsCardProps): React.ReactElement {
  const isDark = currentTheme === AppTheme.Dark;

  return (
    <section id="section-interface" aria-label="Interface" className="flex flex-col gap-3 select-none">
      <h3 className="text-[17px] font-semibold text-[var(--color-text-primary)]">
        Interface
      </h3>

      {/* Language Card */}
      <div className="p-4 rounded-[10px] bg-[var(--color-surface)] border border-[var(--color-border-subtle)] flex items-center justify-between gap-6">
        <div className="flex flex-col gap-0.5">
          <span className="text-[15px] font-semibold text-[var(--color-text-primary)]">
            Application language
          </span>
          <span className="text-[13px] text-[var(--color-text-secondary)]">
            The interface changes immediately, without restarting.
          </span>
        </div>
        <div className="w-[240px]">
          <Select
            options={LANGUAGES}
            value={currentLanguage}
            onChange={(val) => onLanguageChange(String(val))}
            aria-label="Application language"
          />
        </div>
      </div>

      {/* Theme Cards Grid */}
      <div className="grid grid-cols-2 gap-4">
        {/* Dark Theme Button */}
        <button
          type="button"
          onClick={() => onThemeChange(AppTheme.Dark)}
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

        {/* Light Theme Button */}
        <button
          type="button"
          onClick={() => onThemeChange(AppTheme.Light)}
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
    </section>
  );
}
