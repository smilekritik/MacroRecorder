/**
 * @macro-recorder/desktop - Tag Manager
 * Accessible tag chip badges, inline tag creation, tag removal, and tag-click filtering.
 */

import React, { useState, useCallback } from 'react';
import { sanitizeName } from '../utils/naming.js';

export interface TagManagerProps {
  readonly tags: readonly string[];
  readonly onAddTag: (tag: string) => void;
  readonly onRemoveTag: (tag: string) => void;
  readonly onTagClick?: ((tag: string) => void) | undefined;
  readonly activeFilterTag?: string | null | undefined;
  readonly readOnly?: boolean | undefined;
  readonly className?: string | undefined;
}

export function TagManager({
  tags,
  onAddTag,
  onRemoveTag,
  onTagClick,
  activeFilterTag = null,
  readOnly = false,
  className = '',
}: TagManagerProps) {
  const [isAdding, setIsAdding] = useState(false);
  const [inputValue, setInputValue] = useState('');

  const commitAdd = useCallback(() => {
    const clean = sanitizeName(inputValue, '').trim();
    if (clean && !tags.includes(clean)) {
      onAddTag(clean);
    }
    setInputValue('');
    setIsAdding(false);
  }, [inputValue, tags, onAddTag]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter' || e.key === ',') {
        e.preventDefault();
        commitAdd();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        setInputValue('');
        setIsAdding(false);
      }
    },
    [commitAdd],
  );

  return (
    <div className={`flex flex-wrap items-center gap-1.5 ${className}`}>
      {tags.map((tag) => {
        const isActive = activeFilterTag === tag;
        return (
          <span
            key={tag}
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-[12px] text-[12px] font-medium transition-colors ${
              isActive
                ? 'bg-[var(--color-accent)] text-[var(--color-accent-foreground)]'
                : 'bg-[var(--color-surface-raised)] border border-[var(--color-border-subtle)] text-[var(--color-text-secondary)] hover:border-[var(--color-border-strong)]'
            }`}
          >
            <button
              type="button"
              onClick={() => onTagClick?.(tag)}
              className="hover:underline focus:outline-none"
              title={`Filter by tag "${tag}"`}
            >
              {`#${tag}`}
            </button>
            {!readOnly && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onRemoveTag(tag);
                }}
                className="w-3.5 h-3.5 flex items-center justify-center rounded-full opacity-70 hover:opacity-100 hover:bg-black/10 dark:hover:bg-white/10"
                aria-label={`Remove tag ${tag}`}
              >
                ×
              </button>
            )}
          </span>
        );
      })}

      {!readOnly && (
        <>
          {isAdding ? (
            <input
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              onBlur={commitAdd}
              autoFocus
              placeholder="Tag name"
              className="w-20 px-2 py-0.5 text-[12px] rounded-[12px] border border-[var(--color-accent)] bg-[var(--color-surface-raised)] text-[var(--color-text-primary)] outline-none"
            />
          ) : (
            <button
              type="button"
              onClick={() => setIsAdding(true)}
              className="inline-flex items-center px-2 py-0.5 rounded-[12px] text-[12px] text-[var(--color-text-muted)] border border-dashed border-[var(--color-border)] hover:border-[var(--color-border-strong)] hover:text-[var(--color-text-primary)]"
            >
              + Tag
            </button>
          )}
        </>
      )}
    </div>
  );
}
