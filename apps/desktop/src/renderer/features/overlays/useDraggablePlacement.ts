/**
 * @macro-recorder/desktop - Draggable Placement Hook
 * Manages dragging interaction for positioning preview cards on the desktop
 * and calculates clamped normalized coordinates in the range [0.0, 1.0].
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { clamp } from './utils.js';

export interface DragPosition {
  readonly x: number;
  readonly y: number;
}

export interface UseDraggablePlacementOptions {
  readonly initialNormalizedX?: number | undefined;
  readonly initialNormalizedY?: number | undefined;
  readonly cardWidth?: number | undefined;
  readonly cardHeight?: number | undefined;
  readonly containerWidth?: number | undefined;
  readonly containerHeight?: number | undefined;
  /** Reports where a drag settled; moves in between stay local to this hook. */
  readonly onPositionChange?: ((normalizedX: number, normalizedY: number) => void) | undefined;
}

export function useDraggablePlacement({
  initialNormalizedX = 1.0,
  initialNormalizedY = 0.0,
  cardWidth = 430,
  cardHeight = 150,
  containerWidth = 1920,
  containerHeight = 1080,
  onPositionChange,
}: UseDraggablePlacementOptions = {}) {
  const [normalizedX, setNormalizedX] = useState(clamp(initialNormalizedX, 0, 1));
  const [normalizedY, setNormalizedY] = useState(clamp(initialNormalizedY, 0, 1));
  const [isDragging, setIsDragging] = useState(false);

  // Read through refs so that a re-render never tears down the listeners of a running drag.
  const latest = useRef({ cardWidth, cardHeight, containerWidth, containerHeight, onPositionChange });
  latest.current = { cardWidth, cardHeight, containerWidth, containerHeight, onPositionChange };

  const dragStartRef = useRef({
    startX: 0,
    startY: 0,
    startNormX: initialNormalizedX,
    startNormY: initialNormalizedY,
  });

  useEffect(() => {
    if (isDragging) return;
    setNormalizedX(clamp(initialNormalizedX, 0, 1));
    setNormalizedY(clamp(initialNormalizedY, 0, 1));
    // A drag owns the position until it ends.
  }, [initialNormalizedX, initialNormalizedY, isDragging]);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      // Left click only
      if (e.button !== 0) return;
      e.preventDefault();
      setIsDragging(true);

      dragStartRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        startNormX: normalizedX,
        startNormY: normalizedY,
      };
    },
    [normalizedX, normalizedY],
  );

  useEffect(() => {
    if (!isDragging) return;

    const start = dragStartRef.current;
    let position: DragPosition = { x: start.startNormX, y: start.startNormY };
    let moved = false;

    const finish = () => {
      setIsDragging(false);
      if (moved) latest.current.onPositionChange?.(position.x, position.y);
    };

    const handleMouseMove = (e: MouseEvent) => {
      // The release can happen where this window never hears of it; the card must not stick.
      if (e.buttons === 0) {
        finish();
        return;
      }
      const { cardWidth: w, cardHeight: h, containerWidth: cw, containerHeight: ch } = latest.current;
      position = {
        x: clamp(start.startNormX + (e.clientX - start.startX) / Math.max(1, cw - w), 0, 1),
        y: clamp(start.startNormY + (e.clientY - start.startY) / Math.max(1, ch - h), 0, 1),
      };
      moved = true;
      setNormalizedX(position.x);
      setNormalizedY(position.y);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', finish);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', finish);
    };
  }, [isDragging]);

  const availableWidth = Math.max(0, containerWidth - cardWidth);
  const availableHeight = Math.max(0, containerHeight - cardHeight);
  const pixelX = Math.round(availableWidth * normalizedX);
  const pixelY = Math.round(availableHeight * normalizedY);

  return {
    normalizedX,
    normalizedY,
    pixelX,
    pixelY,
    isDragging,
    handleMouseDown,
    setNormalizedPosition: (x: number, y: number) => {
      const clampedX = clamp(x, 0, 1);
      const clampedY = clamp(y, 0, 1);
      setNormalizedX(clampedX);
      setNormalizedY(clampedY);
      onPositionChange?.(clampedX, clampedY);
    },
  };
}
