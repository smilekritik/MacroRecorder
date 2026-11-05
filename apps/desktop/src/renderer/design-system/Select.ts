import React, {
  useState,
  useRef,
  useId,
  useEffect,
  forwardRef,
  useImperativeHandle,
} from 'react';
import { clampToWindowBounds, WindowSafePortal, Z_INDEX } from './Portal.js';

export interface SelectOption<T = string> {
  readonly value: T;
  readonly label: string;
  readonly disabled?: boolean | undefined;
}

export interface SelectProps<T = string> {
  readonly options: ReadonlyArray<SelectOption<T>>;
  readonly value: T;
  readonly onChange: (value: T) => void;
  readonly label?: string | undefined;
  readonly disabled?: boolean | undefined;
  readonly placeholder?: string | undefined;
  readonly className?: string | undefined;
  readonly 'aria-label'?: string | undefined;
}

export interface SelectHandle {
  readonly focus: () => void;
}

/**
 * Accessible ComboBox / Select:
 * MinHeight: 40px, padding: 12px 8px
 * Dropdown popup: SurfaceRaised, Border, cornerRadius 6px
 * Full keyboard navigation: ArrowUp/Down, Enter, Space, Escape, Home, End
 */
export const Select = forwardRef(function Select<T extends string | number>(
  {
    options,
    value,
    onChange,
    label,
    disabled = false,
    placeholder = 'Select...',
    className = '',
    'aria-label': customAriaLabel,
  }: SelectProps<T>,
  ref: React.Ref<SelectHandle>,
) {
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState<number>(-1);
  const [coords, setCoords] = useState<{ top: number; left: number; width: number }>({
    top: 0,
    left: 0,
    width: 200,
  });

  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const listboxRef = useRef<HTMLDivElement | null>(null);
  const generatedId = useId();
  const listboxId = `${generatedId}-listbox`;
  const accessibleLabel = customAriaLabel ?? label;

  const selectedIndex = options.findIndex((opt) => opt.value === value);
  const selectedOption = selectedIndex >= 0 ? options[selectedIndex] : undefined;

  useImperativeHandle(ref, () => ({
    focus: () => {
      buttonRef.current?.focus();
    },
  }));

  const updatePosition = () => {
    if (!buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    const dropdownHeight = Math.min(options.length * 38 + 12, 280);
    const clamped = clampToWindowBounds({
      x: rect.left,
      y: rect.bottom + 4,
      width: rect.width,
      height: dropdownHeight,
    });
    setCoords({
      top: clamped.top,
      left: clamped.left,
      width: rect.width,
    });
  };

  const openDropdown = () => {
    if (disabled) return;
    updatePosition();
    setHighlightedIndex(selectedIndex >= 0 ? selectedIndex : 0);
    setIsOpen(true);
  };

  const closeDropdown = () => {
    setIsOpen(false);
    buttonRef.current?.focus();
  };

  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (e: PointerEvent) => {
      const target = e.target as Node | null;
      if (
        buttonRef.current?.contains(target) ||
        listboxRef.current?.contains(target)
      ) {
        return;
      }
      setIsOpen(false);
    };

    window.addEventListener('pointerdown', handlePointerDown);
    return () => window.removeEventListener('pointerdown', handlePointerDown);
  }, [isOpen]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (disabled) return;

    if (!isOpen) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        openDropdown();
      }
      return;
    }

    switch (e.key) {
      case 'ArrowDown': {
        e.preventDefault();
        setHighlightedIndex((prev) => (prev + 1 < options.length ? prev + 1 : 0));
        break;
      }
      case 'ArrowUp': {
        e.preventDefault();
        setHighlightedIndex((prev) => (prev - 1 >= 0 ? prev - 1 : options.length - 1));
        break;
      }
      case 'Home': {
        e.preventDefault();
        setHighlightedIndex(0);
        break;
      }
      case 'End': {
        e.preventDefault();
        setHighlightedIndex(options.length - 1);
        break;
      }
      case 'Enter':
      case ' ': {
        e.preventDefault();
        const highlighted = options[highlightedIndex];
        if (highlighted && !highlighted.disabled) {
          onChange(highlighted.value);
          closeDropdown();
        }
        break;
      }
      case 'Escape':
      case 'Tab': {
        setIsOpen(false);
        break;
      }
    }
  };

  const chevronSvg = React.createElement(
    'svg',
    {
      className: `w-3.5 h-3.5 ml-2 text-[var(--color-text-secondary)] transition-transform ${
        isOpen ? 'rotate-180' : ''
      }`,
      viewBox: '0 0 14 10',
      fill: 'none',
      stroke: 'currentColor',
      strokeWidth: '2',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
    React.createElement('polyline', { points: '2 4 7 9 12 4' }),
  );

  const labelSpan = React.createElement(
    'span',
    { className: 'truncate' },
    selectedOption ? selectedOption.label : placeholder,
  );

  const triggerButton = React.createElement(
    'button',
    {
      ref: buttonRef,
      id: generatedId,
      type: 'button',
      role: 'combobox',
      'aria-expanded': isOpen,
      'aria-haspopup': 'listbox',
      'aria-controls': listboxId,
      'aria-label': accessibleLabel,
      disabled,
      onClick: () => (isOpen ? closeDropdown() : openDropdown()),
      onKeyDown: handleKeyDown,
      className: `w-full min-h-[40px] px-3 py-2 text-[14px] rounded-[5px]
        bg-[var(--color-input-bg)] text-[var(--color-text-primary)]
        border border-[var(--color-border)]
        hover:border-[var(--color-focus)]
        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-focus)] focus-visible:border-[var(--color-focus)]
        disabled:opacity-[0.65] disabled:text-[var(--color-text-disabled)]
        flex items-center justify-between transition-colors`,
    },
    labelSpan,
    chevronSvg,
  );

  let portalElement: React.ReactNode = null;

  if (isOpen) {
    const optionElements = options.map((option, index) => {
      const isSelected = option.value === value;
      const isHighlighted = index === highlightedIndex;

      return React.createElement(
        'div',
        {
          key: String(option.value),
          id: `${listboxId}-opt-${index}`,
          role: 'option',
          'aria-selected': isSelected,
          'aria-disabled': option.disabled,
          onClick: () => {
            if (option.disabled) return;
            onChange(option.value);
            closeDropdown();
          },
          onMouseEnter: () => setHighlightedIndex(index),
          className: `min-h-[38px] px-3 py-2 rounded-[4px] text-[14px] flex items-center transition-colors
            ${option.disabled ? 'opacity-50 text-[var(--color-text-disabled)]' : ''}
            ${
              isSelected
                ? 'bg-[var(--color-selection)] font-semibold text-[var(--color-text-primary)]'
                : isHighlighted
                  ? 'bg-[var(--color-surface-hover)]'
                  : 'bg-transparent'
            }`,
        },
        React.createElement('span', { className: 'truncate' }, option.label),
      );
    });

    const listboxDiv = React.createElement(
      'div',
      {
        ref: listboxRef,
        id: listboxId,
        role: 'listbox',
        'aria-label': accessibleLabel,
        className: `fixed rounded-[6px] p-1 shadow-lg overflow-y-auto max-h-[280px]
          bg-[var(--color-surface-raised)] border border-[var(--color-border)] text-[var(--color-text-primary)]`,
        style: {
          top: `${coords.top}px`,
          left: `${coords.left}px`,
          width: `${coords.width}px`,
          zIndex: Z_INDEX.dropdown,
        },
      },
      ...optionElements,
    );

    portalElement = React.createElement(WindowSafePortal, null, listboxDiv);
  }

  const containerChildren: React.ReactNode[] = [];
  if (label) {
    containerChildren.push(
      React.createElement(
        'label',
        {
          key: 'label',
          htmlFor: generatedId,
          className: 'text-[14px] text-[var(--color-text-secondary)] font-normal',
        },
        label,
      ),
    );
  }
  containerChildren.push(triggerButton);
  if (portalElement) {
    containerChildren.push(portalElement);
  }

  return React.createElement(
    'div',
    { className: `flex flex-col gap-1 w-full text-left select-none ${className}` },
    ...containerChildren,
  );
}) as <T extends string | number>(
  props: SelectProps<T> & { ref?: React.Ref<SelectHandle> },
) => React.ReactElement;
