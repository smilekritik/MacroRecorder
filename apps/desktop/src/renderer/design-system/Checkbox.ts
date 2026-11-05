import React, { forwardRef, useId } from 'react';

export interface CheckboxProps {
  readonly checked: boolean;
  readonly onChange: (checked: boolean) => void;
  readonly label?: React.ReactNode | undefined;
  readonly disabled?: boolean | undefined;
  readonly id?: string | undefined;
  readonly className?: string | undefined;
  readonly 'aria-label'?: string | undefined;
}

export const Checkbox = forwardRef<HTMLButtonElement, CheckboxProps>(function Checkbox(
  {
    checked,
    onChange,
    label,
    disabled = false,
    id: customId,
    className = '',
    'aria-label': customAriaLabel,
  },
  ref,
) {
  const generatedId = useId();
  const boxId = customId ?? generatedId;
  const labelText = typeof label === 'string' ? label : undefined;
  const accessibleLabel = customAriaLabel ?? labelText;

  const handleClick = () => {
    if (!disabled) {
      onChange(!checked);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (disabled) return;
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      onChange(!checked);
    }
  };

  const checkSvg = checked
    ? React.createElement(
        'svg',
        {
          className: 'w-3 h-3 text-[var(--color-accent-foreground)]',
          viewBox: '0 0 16 16',
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: '2.5',
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
        },
        React.createElement('polyline', { points: '3 8 7 12 14 4' }),
      )
    : null;

  const buttonElement = React.createElement(
    'button',
    {
      ref,
      id: boxId,
      type: 'button',
      role: 'checkbox',
      'aria-checked': checked,
      'aria-label': accessibleLabel,
      disabled,
      onKeyDown: handleKeyDown,
      className: `w-[18px] h-[18px] rounded-[4px] border-[1.5px] flex items-center justify-center transition-colors
        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-focus)]
        ${
          checked
            ? 'bg-[var(--color-accent)] border-[var(--color-accent)]'
            : 'bg-[var(--color-input-bg)] border-[var(--color-border)] hover:border-[var(--color-focus)]'
        }`,
    },
    checkSvg,
  );

  const labelElement = label
    ? React.createElement(
        'label',
        {
          htmlFor: boxId,
          className: 'text-[14px] text-[var(--color-text-primary)]',
          onClick: (e: React.MouseEvent) => {
            e.stopPropagation();
            handleClick();
          },
        },
        label,
      )
    : null;

  return React.createElement(
    'div',
    {
      className: `inline-flex items-center gap-2 select-none min-h-[36px]
        ${disabled ? 'opacity-[0.68]' : ''}
        ${className}`,
      onClick: handleClick,
    },
    buttonElement,
    labelElement,
  );
});
