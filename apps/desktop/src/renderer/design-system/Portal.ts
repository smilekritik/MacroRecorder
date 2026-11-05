import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

export const Z_INDEX = {
  dropdown: 500,
  tooltip: 700,
  toast: 900,
  modalBackdrop: 1000,
  modal: 1001,
} as const;

export interface WindowSafePortalProps {
  readonly children: React.ReactNode;
  readonly containerId?: string | undefined;
}

/**
 * Window-safe portal layer that renders children at the root portal container.
 * Guaranteed to be safe during SSR or test environments where DOM may not be initialized.
 */
export function WindowSafePortal({
  children,
  containerId = 'macro-recorder-portal-root',
}: WindowSafePortalProps): React.ReactPortal | null {
  const [container, setContainer] = useState<HTMLElement | null>(null);

  useEffect(() => {
    if (typeof document === 'undefined') return;

    let target = document.getElementById(containerId);
    if (!target) {
      target = document.createElement('div');
      target.id = containerId;
      target.style.position = 'relative';
      target.style.zIndex = String(Z_INDEX.modalBackdrop);
      document.body.appendChild(target);
    }
    setContainer(target);
  }, [containerId]);

  if (!container) return null;
  return createPortal(children, container);
}

export interface RectBounds {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface ClampedPosition {
  readonly top: number;
  readonly left: number;
}

/**
 * Clamps floating element coordinates to remain completely within the window viewport.
 * Prevents dropdown menus, tooltips, and popups from running off-screen.
 */
export function clampToWindowBounds(
  desired: RectBounds,
  viewportPadding = 8,
  windowWidth = typeof window !== 'undefined' ? window.innerWidth : 1400,
  windowHeight = typeof window !== 'undefined' ? window.innerHeight : 900,
): ClampedPosition {
  let left = desired.x;
  let top = desired.y;

  // Horizontal clamping
  if (left + desired.width > windowWidth - viewportPadding) {
    left = Math.max(viewportPadding, windowWidth - viewportPadding - desired.width);
  }
  if (left < viewportPadding) {
    left = viewportPadding;
  }

  // Vertical clamping
  if (top + desired.height > windowHeight - viewportPadding) {
    top = Math.max(viewportPadding, windowHeight - viewportPadding - desired.height);
  }
  if (top < viewportPadding) {
    top = viewportPadding;
  }

  return { top, left };
}
