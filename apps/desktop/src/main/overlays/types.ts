/**
 * @macro-recorder/desktop - Main Process Overlays Types
 * Contracts, display bounds, window interfaces, and state types for
 * desktop overlays, placement calibration, and floating controls.
 *
 * and FloatingToolbarWindow (
 */

import type { DispatchReceipt, EngineState, OverlayCardOverride } from '../application/types.js';

export type { EngineState, OverlayCardOverride };

export interface DisplayWorkArea {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly scaleFactor?: number | undefined;
}

export interface CardDimensions {
  readonly width: number;
  readonly height: number;
}

export interface NormalizedCoordinates {
  readonly x: number;
  readonly y: number;
}

export interface OverlayPlacementPreferences {
  readonly infoX: number;
  readonly infoY: number;
  readonly annotationX: number;
  readonly annotationY: number;
}

export interface OverlayAppearancePreferences {
  readonly overlayScalePercent: number;
  readonly overlayInfoTransparencyPercent: number;
  readonly overlayAnnotationScalePercent: number;
  readonly overlayAnnotationTransparencyPercent: number;
  readonly showMacroInformation: boolean;
  readonly showOverlayState: boolean;
  readonly showOverlayMacroName: boolean;
  readonly showOverlayCurrentAction: boolean;
  readonly showOverlaySchedule: boolean;
  readonly showOverlayLatency: boolean;
  readonly showOverlayAnnotations: boolean;
  readonly showOverlayAnnotationTiming: boolean;
}

export interface OverlayMacroCardData {
  readonly macroId: string;
  readonly macroName: string;
  readonly state: EngineState;
  readonly actionText?: string | undefined;
  readonly receipt?: DispatchReceipt | null | undefined;
  readonly infoOverride: OverlayCardOverride;
  readonly customTextOverride: OverlayCardOverride;
  readonly speed?: number | undefined;
  readonly visible: boolean;
}

export interface OverlayAnnotationCardData {
  readonly annotationId: string;
  readonly macroId: string;
  readonly macroName: string;
  readonly text: string;
  readonly remainingSeconds: number;
  readonly totalSeconds: number;
  readonly remainingMicroseconds: number;
  readonly durationMicroseconds: number;
  readonly showTiming: boolean;
  readonly isPaused: boolean;
  readonly customTextOverride: OverlayCardOverride;
  readonly visible: boolean;
}

export interface OverlayFullState {
  readonly macros: readonly OverlayMacroCardData[];
  readonly annotations: readonly OverlayAnnotationCardData[];
  readonly countdownNumber?: number | null | undefined;
  readonly isCountdownVisible: boolean;
  readonly placement: OverlayPlacementPreferences;
  readonly appearance: OverlayAppearancePreferences;
}

export interface IPlaybackClock {
  readonly nowMicroseconds: () => number;
  readonly isPaused: boolean;
  start(durationMicroseconds: number, speed?: number): void;
  pause(): void;
  resume(): void;
  stop(): void;
  getRemainingMicroseconds(): number;
  getRemainingSeconds(): number;
  isExpired(): boolean;
}

export interface IOverlayWindowAdapter {
  isDestroyed(): boolean;
  isVisible(): boolean;
  showInactive(): void;
  hide(): void;
  close(): void;
  setBounds(bounds: { x: number; y: number; width: number; height: number }): void;
  getBounds(): { x: number; y: number; width: number; height: number };
  send(channel: string, payload: unknown): void;
  setIgnoreMouseEvents(ignore: boolean, options?: { forward: boolean }): void;
  setAlwaysOnTop(flag: boolean, level?: string): void;
}

export interface OverlayWindowCallbacks {
  readonly onPlacementChanged?: ((placement: OverlayPlacementPreferences) => void) | undefined;
  readonly onRecordClicked?: (() => void) | undefined;
  readonly onPauseClicked?: (() => void) | undefined;
  readonly onStopClicked?: (() => void) | undefined;
  readonly onCloseToolbarClicked?: (() => void) | undefined;
}
