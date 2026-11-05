/**
 * @macro-recorder/desktop - Settings Section Navigation
 * Fixed sidebar list for jumping between settings sections.
 * Note: Reset section is deliberately absent from section navigation.
 */

import React from 'react';
import type { SettingsSectionId, SettingsSectionItem } from './types.js';

export const SETTINGS_SECTIONS: readonly SettingsSectionItem[] = [
  { id: 'interface', title: 'Interface' },
  { id: 'startup', title: 'Application startup' },
  { id: 'storage', title: 'Macro storage' },
  { id: 'controls', title: 'Controls' },
  { id: 'overlay', title: 'Overlay' },
];

/** A section counts as current once its top is within this distance of the viewport top. */
const ACTIVE_SECTION_OFFSET_PX = 60;

/**
 * Picks the last section whose top has reached the top of the scroll viewport.
 * @param readTop Distance from the viewport top to a section's top; null if it is not rendered.
 */
export function resolveActiveSection(
  readTop: (id: SettingsSectionId) => number | null,
): SettingsSectionId | null {
  for (let i = SETTINGS_SECTIONS.length - 1; i >= 0; i--) {
    const { id } = SETTINGS_SECTIONS[i]!;
    const top = readTop(id);
    if (top !== null && top <= ACTIVE_SECTION_OFFSET_PX) return id;
  }
  return null;
}

export interface SectionNavigationProps {
  readonly activeSection: SettingsSectionId;
  readonly onSelectSection: (id: SettingsSectionId) => void;
  readonly className?: string | undefined;
}

export function SectionNavigation({
  activeSection,
  onSelectSection,
  className = '',
}: SectionNavigationProps): React.ReactElement {
  return (
    <nav
      aria-label="Settings sections"
      className={`w-[210px] flex-shrink-0 p-2 rounded-[10px] bg-[var(--color-surface)] border border-[var(--color-border-subtle)] select-none ${className}`}
    >
      <ul className="flex flex-col gap-1 list-none pl-0 m-0">
        {SETTINGS_SECTIONS.map((section) => {
          const isSelected = activeSection === section.id;
          return (
            <li key={section.id}>
              <button
                type="button"
                onClick={() => onSelectSection(section.id)}
                className={`w-full text-left px-3 py-2 rounded-[6px] text-[14px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-focus)] ${
                  isSelected
                    ? 'bg-[var(--color-selection)] font-semibold text-[var(--color-text-primary)]'
                    : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)]'
                }`}
              >
                {section.title}
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
