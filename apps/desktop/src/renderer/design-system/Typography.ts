import React from 'react';

export interface TypographyProps extends React.HTMLAttributes<HTMLElement> {
  readonly children?: React.ReactNode;
  readonly className?: string | undefined;
}

/**
 * PageTitleText: 22px, font-semibold, textPrimary.
 * Matching Style x:Key="PageTitleText".
 */
export function PageTitleText({ children, className = '', ...rest }: TypographyProps) {
  return React.createElement(
    'h1',
    {
      className: `text-[22px] font-semibold text-[var(--color-text-primary)] leading-[28px] m-0 ${className}`,
      ...rest,
    },
    children,
  );
}

/**
 * SectionTitleText: 16px, font-semibold, textPrimary.
 * Matching Style x:Key="SectionTitleText".
 */
export function SectionTitleText({ children, className = '', ...rest }: TypographyProps) {
  return React.createElement(
    'h2',
    {
      className: `text-[16px] font-semibold text-[var(--color-text-primary)] leading-[22px] m-0 ${className}`,
      ...rest,
    },
    children,
  );
}

/**
 * FieldLabelText: 14px, textSecondary, mb-2.
 * Matching Style x:Key="FieldLabelText".
 */
export function FieldLabelText({ children, className = '', ...rest }: TypographyProps) {
  return React.createElement(
    'label',
    {
      className: `block text-[14px] text-[var(--color-text-secondary)] mb-2 font-normal ${className}`,
      ...rest,
    },
    children,
  );
}

/**
 * HelperText: 13px, textMuted, wrapping.
 * Matching Style x:Key="HelperText".
 */
export function HelperText({ children, className = '', ...rest }: TypographyProps) {
  return React.createElement(
    'p',
    {
      className: `text-[13px] text-[var(--color-text-muted)] leading-[18px] m-0 break-words ${className}`,
      ...rest,
    },
    children,
  );
}

/**
 * ColumnHeader: 12px, font-semibold, textMuted, uppercase, mb-3.
 * Matching Style x:Key="ColumnHeader".
 */
export function ColumnHeader({ children, className = '', ...rest }: TypographyProps) {
  return React.createElement(
    'h3',
    {
      className: `text-[12px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)] mb-3 m-0 ${className}`,
      ...rest,
    },
    children,
  );
}
