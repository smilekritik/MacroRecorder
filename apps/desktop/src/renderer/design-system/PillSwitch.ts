import React, { forwardRef, useId } from 'react';

export interface PillSwitchProps {
  readonly checked: boolean;
  readonly onChange: (checked: boolean) => void;
  readonly label?: React.ReactNode | undefined;
  readonly disabled?: boolean | undefined;
  readonly id?: string | undefined;
  readonly className?: string | undefined;
  readonly 'aria-label'?: string | undefined;
}

/**
 * Accessible toggle switch:
 * Track: 42x24px, CornerRadius: 12px
 * Thumb: 18x18px, 2px margin
 */
export const PillSwitch = forwardRef<HTMLButtonElement, PillSwitchProps>(function PillSwitch(
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
  const switchId = customId ?? generatedId;
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

  const thumbElement = React.createElement('span', {
    className: `w-[18px] h-[18px] rounded-full transition-transform duration-150 ease-out inline-block
      ${
        checked
          ? 'translate-x-[20px] bg-[var(--color-accent-foreground)]'
          : 'translate-x-[2px] bg-[var(--color-text-primary)]'
      }`,
  });

  const buttonElement = React.createElement(
    'button',
    {
      ref,
      id: switchId,
      type: 'button',
      role: 'switch',
      'aria-checked': checked,
      'aria-label': accessibleLabel,
      disabled,
      onKeyDown: handleKeyDown,
      className: `relative w-[42px] h-[24px] rounded-[12px] border transition-colors flex items-center
        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-focus)]
        ${
          checked
            ? 'bg-[var(--color-accent)] border-[var(--color-accent)]'
            : 'bg-[var(--color-border)] border-[var(--color-border)] hover:border-[var(--color-focus)]'
        }`,
    },
    thumbElement,
  );

  const labelElement = label
    ? React.createElement(
        'label',
        {
          htmlFor: switchId,
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
      className: `inline-flex items-center gap-3 select-none min-h-[36px]
        ${disabled ? 'opacity-[0.55]' : ''}
        ${className}`,
      onClick: handleClick,
    },
    buttonElement,
    labelElement,
  );
});
