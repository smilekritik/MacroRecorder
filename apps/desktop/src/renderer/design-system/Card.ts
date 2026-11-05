import React from 'react';

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  readonly children?: React.ReactNode;
  readonly className?: string | undefined;
}

/**
 * GroupCard: A nested group card.
 * SurfaceRaised, BorderSubtle (1px), CornerRadius 10px, Padding 16px 14px, Margin bottom 14px.
 */
export function GroupCard({ children, className = '', ...rest }: CardProps) {
  return React.createElement(
    'div',
    {
      className: `rounded-[10px] p-[14px_16px] mb-[14px]
        bg-[var(--color-surface-raised)] border border-[var(--color-border-subtle)] text-[var(--color-text-primary)]
        ${className}`,
      ...rest,
    },
    children,
  );
}

/**
 * InsetPanel: A compact nested panel inside a group card.
 * Surface, BorderSubtle (1px), CornerRadius 7px, Padding 12px 8px.
 */
export function InsetPanel({ children, className = '', ...rest }: CardProps) {
  return React.createElement(
    'div',
    {
      className: `rounded-[7px] p-[8px_12px]
        bg-[var(--color-surface)] border border-[var(--color-border-subtle)] text-[var(--color-text-primary)]
        ${className}`,
      ...rest,
    },
    children,
  );
}

/**
 * CardBorder: Standard card container.
 * SurfaceRaised, BorderSubtle (1px), CornerRadius 8px, Padding 20px.
 */
export function CardBorder({ children, className = '', ...rest }: CardProps) {
  return React.createElement(
    'div',
    {
      className: `rounded-[8px] p-5
        bg-[var(--color-surface-raised)] border border-[var(--color-border-subtle)] text-[var(--color-text-primary)]
        ${className}`,
      ...rest,
    },
    children,
  );
}
