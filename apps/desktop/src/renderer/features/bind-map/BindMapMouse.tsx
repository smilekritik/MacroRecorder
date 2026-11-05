/**
 * @macro-recorder/desktop - Vector Mouse Component
 * Exact vector mouse silhouette and interactive zones (L, R, M, Wheel, X1, X2).
 */

import React, { useRef, useState } from 'react';
import type { BindMapTile } from './types.js';
import { MOUSE_BODY_GEOMETRY, MOUSE_ORIGIN_X } from './keyboard-layout.js';

export interface BindMapMouseProps {
  readonly tiles: readonly BindMapTile[];
  readonly onClick?: ((tile: BindMapTile, anchorEl: SVGGraphicsElement) => void) | undefined;
  readonly onContextMenu?: ((tile: BindMapTile, event: React.MouseEvent) => void) | undefined;
  readonly onMouseEnter?: ((tile: BindMapTile) => void) | undefined;
  readonly onMouseLeave?: ((tile: BindMapTile) => void) | undefined;
}

export const BindMapMouse: React.FC<BindMapMouseProps> = ({
  tiles,
  onClick,
  onContextMenu,
  onMouseEnter,
  onMouseLeave,
}) => {
  return (
    <g
      transform={`translate(${MOUSE_ORIGIN_X}, 0)`}
      data-testid="bind-map-mouse-group"
      className="select-none"
    >
      {/* Header text */}
      <text
        x={2}
        y={16}
        fill="var(--color-text-secondary)"
        fontSize={13}
        fontWeight={600}
        letterSpacing="0.01em"
      >
        Mouse
      </text>

      {/* Mouse silhouette outer body */}
      <path
        d={MOUSE_BODY_GEOMETRY}
        fill="var(--color-surface)"
        stroke="var(--color-border-subtle)"
        strokeWidth={1.5}
        pointerEvents="none"
      />

      {/* Interactive mouse zones and caps */}
      {tiles.map((tile) => (
        <MouseElement
          key={tile.id}
          tile={tile}
          onClick={onClick}
          onContextMenu={onContextMenu}
          onMouseEnter={onMouseEnter}
          onMouseLeave={onMouseLeave}
        />
      ))}
    </g>
  );
};

interface MouseElementProps {
  readonly tile: BindMapTile;
  readonly onClick?: ((tile: BindMapTile, anchorEl: SVGGraphicsElement) => void) | undefined;
  readonly onContextMenu?: ((tile: BindMapTile, event: React.MouseEvent) => void) | undefined;
  readonly onMouseEnter?: ((tile: BindMapTile) => void) | undefined;
  readonly onMouseLeave?: ((tile: BindMapTile) => void) | undefined;
}

const MouseElement: React.FC<MouseElementProps> = ({
  tile,
  onClick,
  onContextMenu,
  onMouseEnter,
  onMouseLeave,
}) => {
  const gRef = useRef<SVGGElement | null>(null);
  const [isHovered, setIsHovered] = useState(false);

  const {
    label,
    style,
    isInteractive,
    tooltipText,
    geometry,
    x,
    y,
    width,
    height,
    labelX,
    labelY,
  } = tile;

  const isHighlighted =
    tile.primary.length > 0 || tile.systemPrimary.length > 0 || tile.conflicts.length > 0;
  const textColor = isHighlighted ? 'var(--color-text-primary)' : 'var(--color-text-secondary)';
  const opacity = isHovered ? 0.82 : 1.0;

  const handleClick = (e: React.MouseEvent<SVGGElement>) => {
    e.stopPropagation();
    if (!isInteractive) return;
    if (gRef.current && onClick) {
      onClick(tile, gRef.current);
    }
  };

  const handleContextMenu = (e: React.MouseEvent<SVGGElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isInteractive) return;
    if (onContextMenu) {
      onContextMenu(tile, e);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<SVGGElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      e.stopPropagation();
      if (!isInteractive) return;
      if (gRef.current && onClick) {
        onClick(tile, gRef.current);
      }
    }
  };

  const handleMouseEnter = () => {
    setIsHovered(true);
    onMouseEnter?.(tile);
  };

  const handleMouseLeave = () => {
    setIsHovered(false);
    onMouseLeave?.(tile);
  };

  if (geometry) {
    // Curved zone (Left, Right, Middle button)
    return (
      <g
        ref={gRef}
        role="button"
        tabIndex={isInteractive ? 0 : -1}
        aria-label={label}
        data-testid={`bind-map-mouse-${tile.id}`}
        data-priority={style.priority}
        data-interactive={isInteractive}
        className={`outline-none transition-opacity duration-75 ${
          isInteractive ? 'focus-visible:ring-2 focus-visible:ring-[var(--color-focus)]' : 'cursor-default'
        }`}
        opacity={opacity}
        onClick={handleClick}
        onContextMenu={handleContextMenu}
        onKeyDown={handleKeyDown}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        <title>{tooltipText}</title>
        <path
          d={geometry}
          fill={style.fill}
          stroke={style.stroke}
          strokeWidth={style.strokeThickness}
        />
        {labelX !== undefined && labelY !== undefined && (
          <text
            x={labelX}
            y={labelY}
            fill={textColor}
            fontSize={11}
            fontWeight={500}
            textAnchor="middle"
            dominantBaseline="central"
            pointerEvents="none"
          >
            {label}
          </text>
        )}
      </g>
    );
  }

  // Rectangular button cap (Wheel up, Wheel down, X1, X2)
  return (
    <g
      ref={gRef}
      role="button"
      tabIndex={isInteractive ? 0 : -1}
      aria-label={label}
      data-testid={`bind-map-mouse-${tile.id}`}
      data-priority={style.priority}
      data-interactive={isInteractive}
      className={`outline-none transition-opacity duration-75 ${
        isInteractive ? 'focus-visible:ring-2 focus-visible:ring-[var(--color-focus)]' : 'cursor-default'
      }`}
      opacity={opacity}
      onClick={handleClick}
      onContextMenu={handleContextMenu}
      onKeyDown={handleKeyDown}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <title>{tooltipText}</title>
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        rx={6}
        ry={6}
        fill={style.fill}
        stroke={style.stroke}
        strokeWidth={style.strokeThickness}
      />
      <text
        x={x + width / 2}
        y={y + height / 2}
        fill={textColor}
        fontSize={11}
        fontWeight={500}
        textAnchor="middle"
        dominantBaseline="central"
        pointerEvents="none"
      >
        {label}
      </text>
    </g>
  );
};
