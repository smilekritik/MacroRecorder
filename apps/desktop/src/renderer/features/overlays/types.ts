/**
 * @macro-recorder/desktop - Renderer Overlays Feature Types
 * View models, component props, and configuration interfaces for
 * desktop overlay status cards, custom text annotations, placement preview,
 * and the floating recording toolbar.
 *
 * and FloatingToolbarWindow (
 */

import type { EngineState, OverlayCardOverride } from '../../../../../../packages/contracts/src/index.js';

export type { EngineState, OverlayCardOverride };

export type ResolvedTheme = 'dark' | 'light';

export interface OverlayCardPlacement {
  readonly x: number; // Normalized [0, 1]
  readonly y: number; // Normalized [0, 1]
}

export interface OverlayPlacementState {
  readonly infoX: number;
  readonly infoY: number;
  readonly annotationX: number;
  readonly annotationY: number;
}

export interface StatusCardFieldConfig {
  readonly showState?: boolean | undefined;
  readonly showMacroName?: boolean | undefined;
  readonly showCurrentAction?: boolean | undefined;
  readonly showSchedule?: boolean | undefined;
  readonly showLatency?: boolean | undefined;
}

export interface StatusCardData {
  readonly macroId: string;
  readonly macroName: string;
  readonly state: EngineState;
  readonly actionText?: string | undefined;
  readonly scheduleText?: string | undefined;
  readonly latencyText?: string | undefined;
  readonly infoOverride?: OverlayCardOverride | undefined;
  readonly visible?: boolean | undefined;
}

export interface AnnotationCardData {
  readonly annotationId: string;
  readonly macroId: string;
  readonly macroName: string;
  readonly text: string;
  readonly remainingSeconds: number;
  readonly totalSeconds?: number | undefined;
  readonly endMilliseconds?: number | undefined;
  readonly showTiming?: boolean | undefined;
  readonly isPaused?: boolean | undefined;
  readonly customTextOverride?: OverlayCardOverride | undefined;
  readonly visible?: boolean | undefined;
}

export interface StatusCardProps {
  readonly card: StatusCardData;
  readonly scalePercent?: number | undefined;
  readonly transparencyPercent?: number | undefined;
  readonly fieldConfig?: StatusCardFieldConfig | undefined;
  readonly theme?: ResolvedTheme | undefined;
  readonly t?: ((key: string) => string) | undefined;
  readonly className?: string | undefined;
}

export interface AnnotationCardProps {
  readonly card: AnnotationCardData;
  readonly scalePercent?: number | undefined;
  readonly transparencyPercent?: number | undefined;
  readonly showTiming?: boolean | undefined;
  readonly theme?: ResolvedTheme | undefined;
  readonly t?: ((key: string) => string) | undefined;
  readonly className?: string | undefined;
}

export interface CountdownBadgeProps {
  readonly number: number;
  readonly visible?: boolean | undefined;
  readonly theme?: ResolvedTheme | undefined;
  readonly className?: string | undefined;
}

export interface FloatingToolbarProps {
  readonly engineState?: EngineState | string | undefined;
  readonly isRecording?: boolean | undefined;
  readonly isPaused?: boolean | undefined;
  readonly onRecord?: (() => void) | undefined;
  readonly onPause?: (() => void) | undefined;
  readonly onStop?: (() => void) | undefined;
  readonly onClose?: (() => void) | undefined;
  readonly onDragStart?: ((e: React.MouseEvent) => void) | undefined;
  readonly theme?: ResolvedTheme | undefined;
  readonly t?: ((key: string) => string) | undefined;
  readonly className?: string | undefined;
}

export interface OverlayPlacementPreviewProps {
  readonly placement: OverlayPlacementState;
  readonly onPlacementChanged: (placement: OverlayPlacementState) => void;
  readonly scalePercent?: number | undefined;
  readonly transparencyPercent?: number | undefined;
  readonly annotationScalePercent?: number | undefined;
  readonly annotationTransparencyPercent?: number | undefined;
  readonly fieldConfig?: StatusCardFieldConfig | undefined;
  readonly showMacroInformation?: boolean | undefined;
  readonly showOverlayAnnotations?: boolean | undefined;
  readonly showOverlayAnnotationTiming?: boolean | undefined;
  readonly theme?: ResolvedTheme | undefined;
  readonly t?: ((key: string) => string) | undefined;
  readonly className?: string | undefined;
}

export interface OverlayWindowViewProps {
  readonly macros?: readonly StatusCardData[] | undefined;
  readonly annotations?: readonly AnnotationCardData[] | undefined;
  readonly countdownNumber?: number | null | undefined;
  readonly isCountdownVisible?: boolean | undefined;
  readonly placement?: OverlayPlacementState | undefined;
  readonly scalePercent?: number | undefined;
  readonly transparencyPercent?: number | undefined;
  readonly annotationScalePercent?: number | undefined;
  readonly annotationTransparencyPercent?: number | undefined;
  readonly fieldConfig?: StatusCardFieldConfig | undefined;
  readonly showMacroInformation?: boolean | undefined;
  readonly showOverlayAnnotations?: boolean | undefined;
  readonly showOverlayAnnotationTiming?: boolean | undefined;
  readonly theme?: ResolvedTheme | undefined;
  readonly t?: ((key: string) => string) | undefined;
  readonly className?: string | undefined;
}
