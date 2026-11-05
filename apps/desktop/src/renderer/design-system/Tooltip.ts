import React, { useState, useRef, useId, useEffect } from 'react';
import { clampToWindowBounds, WindowSafePortal, Z_INDEX } from './Portal.js';

export interface TooltipProps {
  readonly content: React.ReactNode;
  readonly children: React.ReactElement;
  readonly delayMs?: number | undefined;
  readonly disabled?: boolean | undefined;
}

/**
 * Accessible tooltip:
 * SurfaceRaised, Border, CornerRadius 6px, Padding 10px 7px, MaxWidth 420px, FontSize 13px
 * Displays on hover and keyboard focus; automatically clamped to window bounds.
 */
export function Tooltip({
  content,
  children,
  delayMs = 300,
  disabled = false,
}: TooltipProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const triggerRef = useRef<HTMLElement | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tooltipId = useId();

  const clearTimer = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  useEffect(() => {
    return () => clearTimer();
  }, []);

  if (disabled || !content) {
    return children;
  }

  const updatePosition = () => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const desired = {
      x: rect.left + rect.width / 2 - 100,
      y: rect.bottom + 6,
      width: 260,
      height: 60,
    };
    const clamped = clampToWindowBounds(desired, 8);
    setCoords({ top: clamped.top, left: clamped.left });
  };

  const show = () => {
    clearTimer();
    timerRef.current = setTimeout(() => {
      updatePosition();
      setIsVisible(true);
    }, delayMs);
  };

  const hide = () => {
    clearTimer();
    setIsVisible(false);
  };

  const childProps = children.props as {
    onPointerEnter?: (e: React.PointerEvent) => void;
    onPointerLeave?: (e: React.PointerEvent) => void;
    onFocus?: (e: React.FocusEvent) => void;
    onBlur?: (e: React.FocusEvent) => void;
    'aria-describedby'?: string;
  };

  const clonedChild = React.cloneElement(children, {
    onPointerEnter: (e: React.PointerEvent) => {
      childProps.onPointerEnter?.(e);
      show();
    },
    onPointerLeave: (e: React.PointerEvent) => {
      childProps.onPointerLeave?.(e);
      hide();
    },
    onFocus: (e: React.FocusEvent) => {
      childProps.onFocus?.(e);
      show();
    },
    onBlur: (e: React.FocusEvent) => {
      childProps.onBlur?.(e);
      hide();
    },
    'aria-describedby': isVisible ? tooltipId : childProps['aria-describedby'],
  });

  const portalContent = isVisible
    ? React.createElement(
        WindowSafePortal,
        null,
        React.createElement(
          'div',
          {
            id: tooltipId,
            role: 'tooltip',
            className: `fixed max-w-[420px] rounded-[6px] p-[7px_10px] text-[13px] leading-[18px] select-none pointer-events-none break-words
              bg-[var(--color-surface-raised)] border border-[var(--color-border)] text-[var(--color-text-primary)] shadow-md`,
            style: {
              top: `${coords.top}px`,
              left: `${coords.left}px`,
              zIndex: Z_INDEX.tooltip,
            },
          },
          content,
        ),
      )
    : null;

  return React.createElement(React.Fragment, null, clonedChild, portalContent);
}
