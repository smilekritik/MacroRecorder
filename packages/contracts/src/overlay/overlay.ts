/**
 * Overlay view models, placement, and runtime state contracts.
 */

import {
  array,
  boolean,
  integer,
  nullable,
  number,
  object,
  optional,
  string,
  type Schema,
} from '../common/validation.js';
import { type DispatchReceipt, dispatchReceiptSchema } from '../domain/diagnostics.js';
import {
  EngineState,
  engineStateSchema,
  OverlayCardOverride,
  overlayCardOverrideSchema,
} from '../domain/enums.js';
import { type MacroEvent, macroEventSchema } from '../domain/event.js';

export interface OverlayMacroView {
  readonly macroId: string;
  readonly macroName: string;
  readonly state: EngineState;
  readonly receipt?: DispatchReceipt | null | undefined;
  readonly currentAction?: MacroEvent | null | undefined;
  readonly infoOverride: OverlayCardOverride;
  readonly customTextOverride: OverlayCardOverride;
}

export const overlayMacroViewSchema: Schema<OverlayMacroView> = object({
  macroId: string({ min: 1 }),
  macroName: string(),
  state: engineStateSchema,
  receipt: optional(nullable(dispatchReceiptSchema)),
  currentAction: optional(nullable(macroEventSchema)),
  infoOverride: overlayCardOverrideSchema,
  customTextOverride: overlayCardOverrideSchema,
});

export interface OverlayAnnotationView {
  readonly annotationId: string;
  readonly macroId: string;
  readonly macroName: string;
  readonly text: string;
  readonly remainingSeconds: number;
  readonly totalSeconds: number;
  readonly showTiming: boolean;
  readonly isPaused: boolean;
}

export const overlayAnnotationViewSchema: Schema<OverlayAnnotationView> = object({
  annotationId: string({ min: 1 }),
  macroId: string({ min: 1 }),
  macroName: string(),
  text: string(),
  remainingSeconds: number({ min: 0 }),
  totalSeconds: number({ min: 0 }),
  showTiming: boolean(),
  isPaused: boolean(),
});

export interface OverlayPlacement {
  readonly infoX: number;
  readonly infoY: number;
  readonly annotationX: number;
  readonly annotationY: number;
}

export const overlayPlacementSchema: Schema<OverlayPlacement> = object({
  infoX: number({ min: 0, max: 1 }),
  infoY: number({ min: 0, max: 1 }),
  annotationX: number({ min: 0, max: 1 }),
  annotationY: number({ min: 0, max: 1 }),
});

export interface OverlayState {
  readonly macros: readonly OverlayMacroView[];
  readonly annotations: readonly OverlayAnnotationView[];
  readonly countdownNumber?: number | null | undefined;
  readonly isCountdownVisible: boolean;
}

export const overlayStateSchema: Schema<OverlayState> = object({
  macros: array(overlayMacroViewSchema),
  annotations: array(overlayAnnotationViewSchema),
  countdownNumber: optional(nullable(integer({ min: 0 }))),
  isCountdownVisible: boolean(),
});
