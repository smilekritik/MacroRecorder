import React, { forwardRef, useId } from 'react';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  readonly label?: string | undefined;
  readonly helperText?: string | undefined;
  readonly errorMessage?: string | undefined;
  readonly isError?: boolean | undefined;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  {
    label,
    helperText,
    errorMessage,
    isError = false,
    disabled = false,
    id: customId,
    className = '',
    'aria-describedby': customDescribedBy,
    ...rest
  },
  ref,
) {
  const generatedId = useId();
  const inputId = customId ?? generatedId;
  const helperId = `${inputId}-helper`;
  const errorId = `${inputId}-error`;

  const hasError = isError || !!errorMessage;
  const describedByIds = [
    hasError && errorMessage ? errorId : null,
    helperText ? helperId : null,
    customDescribedBy,
  ]
    .filter(Boolean)
    .join(' ');

  const children: React.ReactNode[] = [];

  if (label) {
    children.push(
      React.createElement(
        'label',
        {
          key: 'label',
          htmlFor: inputId,
          className: 'text-[14px] text-[var(--color-text-secondary)] font-normal select-none',
        },
        label,
      ),
    );
  }

  children.push(
    React.createElement('input', {
      key: 'input',
      ref,
      id: inputId,
      disabled,
      'aria-invalid': hasError,
      'aria-describedby': describedByIds || undefined,
      className: `w-full min-h-[40px] px-3 py-2 text-[14px] rounded-[5px]
        bg-[var(--color-input-bg)] text-[var(--color-text-primary)]
        border ${hasError ? 'border-[var(--color-danger)]' : 'border-[var(--color-border)]'}
        caret-[var(--color-text-primary)]
        focus-visible:outline-none focus-visible:border-[var(--color-focus)] focus-visible:ring-2 focus-visible:ring-[var(--color-focus)]
        disabled:opacity-[0.65] disabled:text-[var(--color-text-disabled)]
        transition-colors
        ${className}`,
      ...rest,
    }),
  );

  if (errorMessage) {
    children.push(
      React.createElement(
        'span',
        {
          key: 'error',
          id: errorId,
          role: 'alert',
          className: 'text-[12px] text-[var(--color-danger)]',
        },
        errorMessage,
      ),
    );
  } else if (helperText) {
    children.push(
      React.createElement(
        'span',
        {
          key: 'helper',
          id: helperId,
          className: 'text-[12px] text-[var(--color-text-muted)]',
        },
        helperText,
      ),
    );
  }

  return React.createElement('div', { className: 'flex flex-col gap-1 w-full text-left' }, ...children);
});
