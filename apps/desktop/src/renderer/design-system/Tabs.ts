import React, { useId, useRef } from 'react';

export interface TabItemDefinition {
  readonly id: string;
  readonly label: React.ReactNode;
  readonly content: React.ReactNode;
  readonly disabled?: boolean | undefined;
}

export interface TabsProps {
  readonly items: ReadonlyArray<TabItemDefinition>;
  readonly activeTabId: string;
  readonly onTabChange: (id: string) => void;
  readonly className?: string | undefined;
  readonly 'aria-label'?: string | undefined;
}

/**
 * Accessible Tabs component:
 * Rounded tab strip (SurfaceRaised, 8px radius, 4px padding)
 * Tab content panel (Surface, BorderSubtle 1px, 10px radius, 20px padding)
 * Full ARIA tablist/tab/tabpanel support with keyboard navigation
 */
export function Tabs({
  items,
  activeTabId,
  onTabChange,
  className = '',
  'aria-label': customAriaLabel,
}: TabsProps) {
  const baseId = useId();
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  const activeIndex = items.findIndex((item) => item.id === activeTabId);
  const activeItem = activeIndex >= 0 ? items[activeIndex] : items[0];

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (items.length === 0) return;

    let targetIndex = activeIndex;
    switch (e.key) {
      case 'ArrowRight': {
        targetIndex = (activeIndex + 1) % items.length;
        break;
      }
      case 'ArrowLeft': {
        targetIndex = (activeIndex - 1 + items.length) % items.length;
        break;
      }
      case 'Home': {
        targetIndex = 0;
        break;
      }
      case 'End': {
        targetIndex = items.length - 1;
        break;
      }
      default:
        return;
    }

    e.preventDefault();
    const nextItem = items[targetIndex];
    if (nextItem && !nextItem.disabled) {
      onTabChange(nextItem.id);
      tabRefs.current[nextItem.id]?.focus();
    }
  };

  const tabButtons = items.map((item) => {
    const isSelected = item.id === activeTabId;
    const tabId = `${baseId}-tab-${item.id}`;
    const panelId = `${baseId}-panel-${item.id}`;

    return React.createElement(
      'button',
      {
        key: item.id,
        ref: (el: HTMLButtonElement | null) => {
          tabRefs.current[item.id] = el;
        },
        id: tabId,
        type: 'button',
        role: 'tab',
        'aria-selected': isSelected,
        'aria-controls': panelId,
        disabled: item.disabled,
        tabIndex: isSelected ? 0 : -1,
        onClick: () => onTabChange(item.id),
        className: `min-h-[38px] px-4 py-2 text-[14px] font-semibold rounded-[5px] transition-colors select-none
          focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-focus)]
          ${item.disabled ? 'opacity-50 text-[var(--color-text-disabled)]' : ''}
          ${
            isSelected
              ? 'bg-[var(--color-surface)] text-[var(--color-text-primary)] shadow-sm'
              : 'bg-transparent text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'
          }`,
      },
      item.label,
    );
  });

  const tabList = React.createElement(
    'div',
    {
      role: 'tablist',
      'aria-label': customAriaLabel,
      onKeyDown: handleKeyDown,
      className:
        'inline-flex items-center rounded-[8px] p-1 mb-4 bg-[var(--color-surface-raised)] self-start select-none',
    },
    ...tabButtons,
  );

  const tabPanel = activeItem
    ? React.createElement(
        'div',
        {
          id: `${baseId}-panel-${activeItem.id}`,
          role: 'tabpanel',
          'aria-labelledby': `${baseId}-tab-${activeItem.id}`,
          className:
            'rounded-[10px] p-5 bg-[var(--color-surface)] border border-[var(--color-border-subtle)] text-[var(--color-text-primary)] w-full',
        },
        activeItem.content,
      )
    : null;

  return React.createElement('div', { className: `flex flex-col w-full ${className}` }, tabList, tabPanel);
}
