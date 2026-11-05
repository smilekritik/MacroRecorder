/**
 * @macro-recorder/desktop - Overlay Placement Preview View
 * Interactive preview window displayed during Settings calibration.
 * Allows users to drag sample status and custom text cards across the desktop;
 * coordinates are reported and persisted automatically.
 */

import React, { useState } from 'react';
import { AnnotationCard } from './AnnotationCard.js';
import { StatusCard } from './StatusCard.js';
import type { OverlayPlacementPreviewProps } from './types.js';
import { useDraggablePlacement } from './useDraggablePlacement.js';

export const OverlayPlacementPreview: React.FC<OverlayPlacementPreviewProps> = ({
  placement,
  onPlacementChanged,
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
  const [activeCard, setActiveCard] = useState<'info' | 'annotation'>('info');

  const infoDraggable = useDraggablePlacement({
    initialNormalizedX: placement.infoX,
    initialNormalizedY: placement.infoY,
    cardWidth: 430 * (scalePercent / 100),
    cardHeight: 150 * (scalePercent / 100),
    containerWidth: typeof window !== 'undefined' ? window.innerWidth || 1920 : 1920,
    containerHeight: typeof window !== 'undefined' ? window.innerHeight || 1080 : 1080,
    onPositionChange: (x, y) => {
      onPlacementChanged({
        ...placement,
        infoX: x,
        infoY: y,
      });
    },
  });

  const annotationDraggable = useDraggablePlacement({
    initialNormalizedX: placement.annotationX,
    initialNormalizedY: placement.annotationY,
    cardWidth: 430 * (annotationScalePercent / 100),
    cardHeight: 150 * (annotationScalePercent / 100),
    containerWidth: typeof window !== 'undefined' ? window.innerWidth || 1920 : 1920,
    containerHeight: typeof window !== 'undefined' ? window.innerHeight || 1080 : 1080,
    onPositionChange: (x, y) => {
      onPlacementChanged({
        ...placement,
        annotationX: x,
        annotationY: y,
      });
    },
  });

  const sampleStatusCard = {
    macroId: 'sample-macro',
    macroName: t('Sample macro'),
    state: 'Playing' as const,
    actionText: t('Event: key E ↓'),
    scheduleText: t('Scheduled: 1250 ms'),
    latencyText: t('Jitter: +0.180 ms · confirmation: 0.420 ms'),
    visible: showMacroInformation,
  };

  const sampleAnnotationCard = {
    annotationId: 'sample-annotation',
    macroId: 'sample-macro',
    macroName: 'SAMPLE',
    text: t('Press E after the signal appears'),
    remainingSeconds: 1.8,
    totalSeconds: 3.2,
    endMilliseconds: 3200,
    showTiming: showOverlayAnnotationTiming,
    visible: showOverlayAnnotations,
  };

  return (
    <div
      data-testid="overlay-placement-preview"
      role="region"
      aria-label={t('Overlay placement preview')}
      className={`fixed inset-0 pointer-events-none select-none overflow-hidden ${className}`}
    >
      {/* Sample Info Card */}
      {showMacroInformation && (
        <div
          data-testid="preview-info-container"
          style={{
            position: 'absolute',
            left: infoDraggable.pixelX,
            top: infoDraggable.pixelY,
          }}
          className="pointer-events-auto cursor-move"
          onMouseDown={(e) => {
            setActiveCard('info');
            infoDraggable.handleMouseDown(e);
          }}
          title={t('Macro information — drag to the desired position')}
        >
          <StatusCard
            card={sampleStatusCard}
            scalePercent={scalePercent}
            transparencyPercent={transparencyPercent}
            fieldConfig={fieldConfig}
            theme={theme}
            t={t}
            className={
              activeCard === 'info'
                ? 'ring-2 ring-[var(--color-accent)] ring-offset-2 ring-offset-black/50'
                : ''
            }
          />
        </div>
      )}

      {/* Sample Annotation Card */}
      {showOverlayAnnotations && (
        <div
          data-testid="preview-annotation-container"
          style={{
            position: 'absolute',
            left: annotationDraggable.pixelX,
            top: annotationDraggable.pixelY,
          }}
          className="pointer-events-auto cursor-move"
          onMouseDown={(e) => {
            setActiveCard('annotation');
            annotationDraggable.handleMouseDown(e);
          }}
          title={t('Custom text — drag to the desired position')}
        >
          <AnnotationCard
            card={sampleAnnotationCard}
            scalePercent={annotationScalePercent}
            transparencyPercent={annotationTransparencyPercent}
            showTiming={showOverlayAnnotationTiming}
            theme={theme}
            t={t}
            className={
              activeCard === 'annotation'
                ? 'ring-2 ring-[var(--color-focus)] ring-offset-2 ring-offset-black/50'
                : ''
            }
          />
        </div>
      )}
    </div>
  );
};
