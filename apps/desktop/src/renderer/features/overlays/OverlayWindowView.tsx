/**
 * @macro-recorder/desktop - Desktop Overlay Window Main View
 * Full transparent, non-activating, click-through desktop overlay surface.
 * Displays stacked multi-macro status cards, custom text annotations, and centered countdown.
 */

import React, { useEffect, useState } from 'react';
import { AnnotationCard } from './AnnotationCard.js';
import { CountdownBadge } from './CountdownBadge.js';
import { StatusCard } from './StatusCard.js';
import type { OverlayWindowViewProps } from './types.js';
import { clamp } from './utils.js';

export const OverlayWindowView: React.FC<OverlayWindowViewProps> = ({
  macros = [],
  annotations = [],
  countdownNumber = null,
  isCountdownVisible = false,
  placement = { infoX: 1.0, infoY: 0.0, annotationX: 1.0, annotationY: 0.0 },
  scalePercent = 100,
  transparencyPercent = 0,
  annotationScalePercent = 100,
  annotationTransparencyPercent = 0,
  fieldConfig = {},
  showMacroInformation = true,
  showOverlayAnnotations = true,
  showOverlayAnnotationTiming = true,
  theme = 'dark',
  t = (k) => k,
  className = '',
}) => {

  // Track viewport / canvas dimensions
  const [viewport, setViewport] = useState({
    width: typeof window !== 'undefined' ? window.innerWidth || 1920 : 1920,
    height: typeof window !== 'undefined' ? window.innerHeight || 1080 : 1080,
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleResize = () => {
      setViewport({
        width: window.innerWidth || 1920,
        height: window.innerHeight || 1080,
      });
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Filter visible macros and annotations
  const visibleMacros = showMacroInformation
    ? macros.filter((m) => m.visible !== false && m.state !== 'Idle')
    : [];

  const visibleAnnotations = showOverlayAnnotations
    ? annotations.filter((a) => a.visible !== false)
    : [];

  const infoScale = clamp(scalePercent, 25, 200) / 100;
  const annScale = clamp(annotationScalePercent, 25, 200) / 100;

  const cardWidth = 430;
  const effectiveInfoWidth = cardWidth * infoScale;
  const effectiveAnnWidth = cardWidth * annScale;

  // Approximate card heights for panel positioning
  const estimatedInfoHeight = 150 * infoScale;
  const estimatedAnnHeight = 150 * annScale;

  const availableInfoWidth = Math.max(0, viewport.width - effectiveInfoWidth);
  const availableInfoHeight = Math.max(0, viewport.height - estimatedInfoHeight);

  const availableAnnWidth = Math.max(0, viewport.width - effectiveAnnWidth);
  const availableAnnHeight = Math.max(0, viewport.height - estimatedAnnHeight);

  const infoLeft = Math.round(availableInfoWidth * clamp(placement.infoX, 0, 1));
  const infoTop = Math.round(availableInfoHeight * clamp(placement.infoY, 0, 1));

  const annLeft = Math.round(availableAnnWidth * clamp(placement.annotationX, 0, 1));
  const annTop = Math.round(availableAnnHeight * clamp(placement.annotationY, 0, 1));

  return (
    <div
      data-testid="overlay-window-view"
      role="region"
      aria-label={t('Macro Recorder Overlay')}
      className={`fixed inset-0 pointer-events-none select-none overflow-hidden bg-transparent ${className}`}
    >
      {/* Macro Information Cards Panel */}
      {visibleMacros.length > 0 && (
        <div
          data-testid="overlay-macro-info-list"
          style={{
            position: 'absolute',
            left: infoLeft,
            top: infoTop,
            width: cardWidth,
          }}
          className="flex flex-col gap-2"
        >
          {visibleMacros.map((macro) => (
            <StatusCard
              key={macro.macroId}
              card={macro}
              scalePercent={scalePercent}
              transparencyPercent={transparencyPercent}
              fieldConfig={fieldConfig}
              theme={theme}
              t={t}
            />
          ))}
        </div>
      )}

      {/* Custom Text Annotation Cards Panel */}
      {visibleAnnotations.length > 0 && (
        <div
          data-testid="overlay-annotation-list"
          style={{
            position: 'absolute',
            left: annLeft,
            top: annTop,
            width: cardWidth,
          }}
          className="flex flex-col gap-2"
        >
          {visibleAnnotations.map((annotation) => (
            <AnnotationCard
              key={annotation.annotationId}
              card={annotation}
              scalePercent={annotationScalePercent}
              transparencyPercent={annotationTransparencyPercent}
              showTiming={showOverlayAnnotationTiming}
              theme={theme}
              t={t}
            />
          ))}
        </div>
      )}

      {/* Recording Countdown Badge */}
      {isCountdownVisible && countdownNumber !== null && (
        <div className="fixed inset-0 flex items-center justify-center">
          <CountdownBadge
            number={countdownNumber}
            visible={isCountdownVisible}
            theme={theme}
          />
        </div>
      )}
    </div>
  );
};
