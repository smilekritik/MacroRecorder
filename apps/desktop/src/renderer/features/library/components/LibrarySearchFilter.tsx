/**
 * @macro-recorder/desktop - Library Search and Filter Bar
 * Accessible search input for macro name, tags, and descriptions with quick tag filter pills.
 */

import React from 'react';
import { Input } from '../../../design-system/Input.js';

export interface LibrarySearchFilterProps {
  readonly searchQuery: string;
  readonly onSearchChange: (query: string) => void;
  readonly tags: readonly string[];
  readonly selectedTag: string | null;
  readonly onSelectTag: (tag: string | null) => void;
  readonly className?: string | undefined;
}

export function LibrarySearchFilter({
  searchQuery,
  onSearchChange,
  tags,
  selectedTag,
  onSelectTag,
  className = '',
}: LibrarySearchFilterProps) {
  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      {/* Search Input */}
      <div className="relative">
        <Input
          type="text"
          value={searchQuery}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => onSearchChange(e.target.value)}
          placeholder="Search by name and tags"
          aria-label="Search by name and tags"
          className="w-full text-[13px] py-1.5 pl-3 pr-8"
        />
        {searchQuery.length > 0 && (
          <button
            type="button"
            onClick={() => onSearchChange('')}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[14px] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
            aria-label="Clear search"
          >
            ×
          </button>
        )}
      </div>

      {/* Tag filter pills (if tags exist) */}
      {tags.length > 0 && (
        <div className="flex items-center gap-1.5 overflow-x-auto py-0.5 no-scrollbar">
          <button
            type="button"
            onClick={() => onSelectTag(null)}
            className={`px-2 py-0.5 rounded-[12px] text-[11px] font-medium whitespace-nowrap transition-colors ${
              selectedTag === null
                ? 'bg-[var(--color-accent)] text-[var(--color-accent-foreground)]'
                : 'bg-[var(--color-surface-raised)] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]'
            }`}
          >
            All
          </button>
          {tags.map((t) => {
            const isSelected = selectedTag === t;
            return (
              <button
                key={t}
                type="button"
                onClick={() => onSelectTag(isSelected ? null : t)}
                className={`px-2 py-0.5 rounded-[12px] text-[11px] font-medium whitespace-nowrap transition-colors ${
                  isSelected
                    ? 'bg-[var(--color-accent)] text-[var(--color-accent-foreground)]'
                    : 'bg-[var(--color-surface-raised)] border border-[var(--color-border-subtle)] text-[var(--color-text-secondary)] hover:border-[var(--color-border-strong)] hover:text-[var(--color-text-primary)]'
                }`}
              >
                {`#${t}`}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
