/**
 * @macro-recorder/desktop - Bind Map Key Tile Component
 * Renders an individual keyboard key.
 */

import React, { useRef, useState } from 'react';
import type { BindMapTile } from './types.js';

export interface BindMapKeyProps {
  readonly tile: BindMapTile;
  readonly isHovered?: boolean | undefined;
  readonly onClick?: ((tile: BindMapTile, anchorEl: SVGGraphicsElement) => void) | undefined;
  readonly onContextMenu?: ((tile: BindMapTile, event: React.MouseEvent) => void) | undefined;
  readonly onMouseEnter?: ((tile: BindMapTile) => void) | undefined;
  readonly onMouseLeave?: ((tile: BindMapTile) => void) | undefined;
}

export const BindMapKey: React.FC<BindMapKeyProps> = ({
  tile,
  isHovered = false,
  onClick,
  onContextMenu,
  onMouseEnter,
  onMouseLeave,
}) => {
  const gRef = useRef<SVGGElement | null>(null);
  const [isLocalHovered, setIsLocalHovered] = useState(false);

  const { x, y, width, height, label, style, isInteractive, tooltipText } = tile;

  // Text color precedence:
  // Primary macros, system commands, or conflicts use primary text color; others use secondary
  const isHighlighted =
    tile.primary.length > 0 || tile.systemPrimary.length > 0 || tile.conflicts.length > 0;
  const textColor = isHighlighted ? 'var(--color-text-primary)' : 'var(--color-text-secondary)';

  const fontSize = label.length > 4 ? 11.5 : 13;
  const isEffectiveHovered = isHovered || isLocalHovered;
  const opacity = isEffectiveHovered ? 0.82 : 1.0;

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
    setIsLocalHovered(true);
    onMouseEnter?.(tile);
  };

  const handleMouseLeave = () => {
    setIsLocalHovered(false);
    onMouseLeave?.(tile);
  };

  return (
    <g
      ref={gRef}
      role="button"
      tabIndex={isInteractive ? 0 : -1}
      aria-label={label}
      data-testid={`bind-map-key-${tile.id}`}
      data-vk={tile.virtualKey}
      data-priority={style.priority}
      data-interactive={isInteractive}
      className={`select-none outline-none transition-opacity duration-75 ${
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
        fontSize={fontSize}
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
