import React, { forwardRef, useRef, useId, useCallback } from 'react';

export interface SliderProps {
  readonly value: number;
  readonly onChange: (value: number) => void;
  readonly min?: number | undefined;
  readonly max?: number | undefined;
  readonly step?: number | undefined;
  readonly largeStep?: number | undefined;
  readonly disabled?: boolean | undefined;
  readonly label?: string | undefined;
  readonly valueText?: string | undefined;
  readonly className?: string | undefined;
  readonly 'aria-label'?: string | undefined;
}

/**
 * Accessible slider:
 * Track height: 4px
 * Thumb: 18x18px circle with accent fill and accentForeground stroke (2.5px)
 * Supports full keyboard navigation: ArrowLeft/Right/Down/Up, PageDown/Up, Home, End
 */
export const Slider = forwardRef<HTMLDivElement, SliderProps>(function Slider(
  {
    value,
    onChange,
    min = 0,
    max = 100,
    step = 1,
    largeStep,
    disabled = false,
    label,
    valueText,
    className = '',
    'aria-label': customAriaLabel,
  },
  ref,
) {
  const generatedId = useId();
  const trackRef = useRef<HTMLDivElement | null>(null);
  const effectiveLargeStep = largeStep ?? (max - min) / 10;
  const clampedValue = Math.min(Math.max(value, min), max);
  const percentage = max > min ? ((clampedValue - min) / (max - min)) * 100 : 0;
  const accessibleLabel = customAriaLabel ?? label;

  const updateFromPosition = useCallback(
    (clientX: number) => {
      if (disabled || !trackRef.current) return;
      const rect = trackRef.current.getBoundingClientRect();
      const relativeX = Math.max(0, Math.min(clientX - rect.left, rect.width));
      const ratio = rect.width > 0 ? relativeX / rect.width : 0;
      const rawValue = min + ratio * (max - min);
      const steppedValue = Math.round(rawValue / step) * step;
      const finalValue = Math.min(Math.max(Number(steppedValue.toFixed(4)), min), max);
      onChange(finalValue);
    },
    [disabled, min, max, step, onChange],
  );

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (disabled) return;
    const track = e.currentTarget;
    track.setPointerCapture(e.pointerId);
    updateFromPosition(e.clientX);

    const onPointerMove = (moveEvent: PointerEvent) => {
      updateFromPosition(moveEvent.clientX);
    };

    const onPointerUp = (upEvent: PointerEvent) => {
      try {
        track.releasePointerCapture(upEvent.pointerId);
      } catch {
        // ignore if capture was already released
      }
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (disabled) return;
    let newValue = clampedValue;
    switch (e.key) {
      case 'ArrowRight':
      case 'ArrowUp':
        newValue = Math.min(clampedValue + step, max);
        break;
      case 'ArrowLeft':
      case 'ArrowDown':
        newValue = Math.max(clampedValue - step, min);
        break;
      case 'PageUp':
        newValue = Math.min(clampedValue + effectiveLargeStep, max);
        break;
      case 'PageDown':
        newValue = Math.max(clampedValue - effectiveLargeStep, min);
        break;
      case 'Home':
        newValue = min;
        break;
      case 'End':
        newValue = max;
        break;
      default:
        return;
    }
    e.preventDefault();
    onChange(Number(newValue.toFixed(4)));
  };

  const trackBar = React.createElement('div', {
    className: 'h-full bg-[var(--color-accent)]',
    style: { width: `${percentage}%` },
  });

  const trackContainer = React.createElement(
    'div',
    {
      ref: trackRef,
      className: 'relative w-full h-[4px] rounded-[2px] bg-[var(--color-border)] overflow-hidden',
    },
    trackBar,
  );

  const thumbElement = React.createElement('div', {
    id: generatedId,
    role: 'slider',
    tabIndex: disabled ? -1 : 0,
    'aria-valuemin': min,
    'aria-valuemax': max,
    'aria-valuenow': clampedValue,
    'aria-valuetext': valueText ?? String(clampedValue),
    'aria-label': accessibleLabel,
    'aria-disabled': disabled,
    onKeyDown: handleKeyDown,
    className: `absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-[18px] h-[18px] rounded-full
      bg-[var(--color-accent)] border-[2.5px] border-[var(--color-accent-foreground)]
      focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-focus)]
      shadow-sm`,
    style: { left: `${percentage}%` },
  });

  return React.createElement(
    'div',
    {
      ref,
      className: `relative flex items-center h-[22px] w-full select-none
        ${disabled ? 'opacity-[0.55]' : ''}
        ${className}`,
      onPointerDown: handlePointerDown,
    },
    trackContainer,
    thumbElement,
  );
});
