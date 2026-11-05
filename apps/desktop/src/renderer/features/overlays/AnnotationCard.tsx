/**
 * @macro-recorder/desktop - Custom Text Annotation Overlay Card
 * Displays text prompts created by OverlayText events during macro playback.
 *
 * OverlayPlacementWindow AnnotationCard.
 * Follows the high-resolution playback clock without frame drift.
 */

import React from 'react';
import type { AnnotationCardProps } from './types.js';
import { clamp, formatAnnotationTiming, getOverlayCardBackground } from './utils.js';

export const AnnotationCard: React.FC<AnnotationCardProps> = ({
  card,
  scalePercent = 100,
  transparencyPercent = 0,
  showTiming = true,
  theme = 'dark',
  t = (k) => k,
  className = '',
}) => {

  if (card.visible === false) {
    return null;
  }

  const scale = clamp(scalePercent, 25, 200) / 100;
  const background = getOverlayCardBackground(theme, transparencyPercent);
  const timingText = formatAnnotationTiming(
    card.remainingSeconds,
    card.endMilliseconds ?? 0,
    t,
  );

  const headerPattern = t('PROMPT · {0}');
  const header = headerPattern.includes('{0}')
    ? headerPattern.replace('{0}', card.macroName)
    : `PROMPT · ${card.macroName}`;

  return (
    <div
      data-testid={`annotation-card-${card.annotationId}`}
      role="note"
      aria-label={`${header}: ${card.text}`}
      style={{
        width: 430,
        backgroundColor: background,
        transform: scale !== 1.0 ? `scale(${scale})` : undefined,
        transformOrigin: 'top left',
      }}
      className={`relative rounded-[10px] border border-[var(--color-focus)] p-4 shadow-lg select-none ${className}`}
    >
      <div className="flex flex-col gap-1.5">
        <span
          data-testid="annotation-card-header"
          className="font-mono text-[12px] font-bold tracking-wider text-[var(--color-focus)] uppercase leading-tight"
        >
          {header}
        </span>

        <p
          data-testid="annotation-card-text"
          className="text-[16px] font-semibold text-[var(--color-text-primary)] break-words leading-normal"
        >
          {card.text}
        </p>

        {showTiming && card.showTiming !== false && (
          <span
            data-testid="annotation-card-timing"
            className="font-mono text-[13px] text-[var(--color-text-secondary)] break-words leading-tight"
          >
            {timingText}
          </span>
        )}
      </div>
    </div>
  );
};
