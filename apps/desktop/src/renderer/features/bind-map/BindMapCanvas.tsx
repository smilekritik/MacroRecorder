/**
 * @macro-recorder/desktop - Scalable Binding Map Canvas
 * Uniform vector canvas hosting keyboard and mouse.
 */

import React from 'react';
import type { BindMapTile } from './types.js';
import { TOTAL_CANVAS_WIDTH, TOTAL_CANVAS_HEIGHT } from './keyboard-layout.js';
import { BindMapKey } from './BindMapKey.js';
import { BindMapMouse } from './BindMapMouse.js';

export interface BindMapCanvasProps {
  readonly keyboardTiles: readonly BindMapTile[];
  readonly mouseTiles: readonly BindMapTile[];
  readonly hoveredTileId?: string | undefined;
  readonly onClickTile?: ((tile: BindMapTile, anchorEl: SVGGraphicsElement) => void) | undefined;
  readonly onContextMenuTile?: ((tile: BindMapTile, event: React.MouseEvent) => void) | undefined;
  readonly onMouseEnterTile?: ((tile: BindMapTile) => void) | undefined;
  readonly onMouseLeaveTile?: ((tile: BindMapTile) => void) | undefined;
  readonly className?: string | undefined;
}

export const BindMapCanvas: React.FC<BindMapCanvasProps> = ({
  keyboardTiles,
  mouseTiles,
  hoveredTileId,
  onClickTile,
  onContextMenuTile,
  onMouseEnterTile,
  onMouseLeaveTile,
  className = '',
}) => {
  return (
    <div
      className={`flex items-center justify-center w-full h-full p-2 overflow-hidden ${className}`}
      data-testid="bind-map-canvas-container"
    >
      <svg
        viewBox={`0 0 ${TOTAL_CANVAS_WIDTH} ${TOTAL_CANVAS_HEIGHT}`}
        preserveAspectRatio="xMidYMid meet"
        className="w-full h-full max-w-[1360px] max-h-[420px] select-none drop-shadow-sm"
        data-testid="bind-map-svg"
      >
        {/* Keyboard block */}
        <g data-testid="bind-map-keyboard-group">
          {keyboardTiles.map((tile) => (
            <BindMapKey
              key={tile.id}
              tile={tile}
              isHovered={tile.id === hoveredTileId}
              onClick={onClickTile}
              onContextMenu={onContextMenuTile}
              onMouseEnter={onMouseEnterTile}
              onMouseLeave={onMouseLeaveTile}
            />
          ))}
        </g>

        {/* Mouse block */}
        <BindMapMouse
          tiles={mouseTiles}
          onClick={onClickTile}
          onContextMenu={onContextMenuTile}
          onMouseEnter={onMouseEnterTile}
          onMouseLeave={onMouseLeaveTile}
        />
      </svg>
    </div>
  );
};
