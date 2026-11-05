import React, { forwardRef } from 'react';
import type { ButtonSize, ButtonVariant } from './types.js';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  readonly variant?: ButtonVariant | undefined;
  readonly size?: ButtonSize | undefined;
  readonly fullWidth?: boolean | undefined;
  readonly children?: React.ReactNode;
}

const VARIANT_STYLES: Record<ButtonVariant, string> = {
  base: 'bg-[var(--color-surface-raised)] border border-[var(--color-border)] text-[var(--color-text-primary)] hover:opacity-90 active:opacity-80',
  accent:
    'bg-[var(--color-accent)] border border-[var(--color-accent)] text-[var(--color-accent-foreground)] hover:bg-[var(--color-accent-hover)] hover:border-[var(--color-accent-hover)] active:bg-[var(--color-accent-pressed)]',
  'soft-accent':
    'bg-[var(--color-selection)] border border-[var(--color-accent)] text-[var(--color-text-primary)] hover:bg-[var(--color-surface-hover)]',
  danger:
    'bg-[var(--color-danger-surface)] border border-[var(--color-danger)] text-[var(--color-danger)] hover:bg-[var(--color-danger-hover)]',
  'soft-danger':
    'bg-[var(--color-danger-surface)] border-[1.5px] border-[var(--color-danger)] text-[var(--color-danger)] hover:bg-[var(--color-danger-hover)]',
  'critical-danger':
    'bg-[var(--color-danger-strong)] border border-[var(--color-danger-strong)] text-[var(--color-danger-strong-foreground)] hover:bg-[var(--color-danger-strong-hover)] hover:border-[var(--color-danger-strong-hover)]',
  save: 'bg-[var(--color-save)] border border-[var(--color-save)] text-[var(--color-save-foreground)] px-5 hover:bg-[var(--color-save-hover)] hover:border-[var(--color-save-hover)] active:bg-[var(--color-save-pressed)] active:border-[var(--color-save-pressed)]',
  icon: 'w-11 min-w-[44px] h-11 p-0 flex items-center justify-center bg-[var(--color-surface-raised)] border border-[var(--color-border)] text-[var(--color-text-primary)] hover:opacity-90 active:opacity-80',
  stepper:
    'w-10 min-w-[40px] h-10 p-0 flex items-center justify-center text-[19px] leading-none bg-[var(--color-surface-raised)] border border-[var(--color-border)] text-[var(--color-text-primary)] hover:opacity-90 active:opacity-80',
  'bind-key':
    'p-[2px_1px] text-[13px] bg-[var(--color-surface-raised)] border border-[var(--color-border-subtle)] text-[var(--color-text-secondary)] rounded-[6px] hover:opacity-80',
  'bind-menu-item':
    'bg-transparent border-0 text-[var(--color-text-primary)] w-full text-left p-[10px_7px] rounded-[6px] hover:bg-[var(--color-surface-hover)]',
  ghost:
    'bg-transparent border-transparent text-[var(--color-text-primary)] hover:bg-[var(--color-surface-hover)]',
};

const SIZE_STYLES: Record<ButtonSize, string> = {
  sm: 'min-h-[32px] px-3 py-1 text-[13px]',
  md: 'min-h-[44px] px-4 py-2 text-[14px]',
  lg: 'min-h-[48px] px-6 py-3 text-[15px]',
};

/**
 * Accessible button component implementing all button styles and keyboard focus behavior.
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'base',
    size = 'md',
    fullWidth = false,
    disabled = false,
    className = '',
    type = 'button',
    children,
    ...rest
  },
  ref,
) {
  const isCustomSizeVariant =
    variant === 'icon' ||
    variant === 'stepper' ||
    variant === 'bind-key' ||
    variant === 'bind-menu-item';
  const sizeClasses = isCustomSizeVariant ? '' : SIZE_STYLES[size];
  const variantClasses = VARIANT_STYLES[variant];

  return React.createElement(
    'button',
    {
      ref,
      type,
      disabled,
      'aria-disabled': disabled,
      'data-button-variant': variant,
      className: `inline-flex items-center justify-center rounded-[6px] font-semibold transition-colors select-none
        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-focus)] focus-visible:ring-offset-1
        disabled:opacity-[0.62] disabled:text-[var(--color-text-disabled)]
        ${fullWidth ? 'w-full' : ''}
        ${sizeClasses}
        ${variantClasses}
        ${className}`,
      ...rest,
    },
    children,
  );
});
