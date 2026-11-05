/**
 * Types and interfaces for action creation, inspection, and editing forms.
 */

import type {
  GamepadAxis,
  GamepadButton,
  MacroEvent,
  Microseconds,
  MouseButton,
} from '../../../../../../packages/contracts/src/index.js';
import { ManualActionType } from '../../../../../../packages/domain/src/timeline/types.js';

/**
 * 8 action categories defined by legacy Macro Recorder AddActionWindow.
 */
export enum ManualActionCategory {
  Keyboard = 'Keyboard',
  Mouse = 'Mouse',
  Gamepad = 'Gamepad',
  TriggersAndConditions = 'Triggers and conditions',
  FlowControl = 'Flow control',
  PauseAndTiming = 'Pause and timing',
  TextAndOverlay = 'Text and overlay',
  Notes = 'Notes',
}

/**
 * Action option descriptor with display label and group category.
 */
export interface ActionOptionItem {
  readonly type: ManualActionType;
  readonly label: string;
  readonly category: ManualActionCategory;
  readonly description?: string | undefined;
}

/**
 * Options for selecting mouse buttons.
 */
export interface MouseButtonOption {
  readonly button: MouseButton;
  readonly label: string;
}

/**
 * Options for selecting gamepad buttons.
 */
export interface GamepadButtonOption {
  readonly button: GamepadButton;
  readonly label: string;
}

/**
 * Options for selecting gamepad axes.
 */
export interface GamepadAxisOption {
  readonly axis: GamepadAxis;
  readonly label: string;
}

/**
 * Form state for all 19 action types across the 8 categories.
 */
export interface ActionFormData {
  readonly type: ManualActionType;
  readonly startTimeMs: string;
  readonly durationMs: string;
  readonly actionComment: string;
  readonly commentRowText: string;

  // Keyboard
  readonly virtualKey: number;
  readonly scanCode: number;
  readonly extended: boolean;
  readonly capturedMouseButton: MouseButton;

  // Mouse
  readonly mouseButton: MouseButton;
  readonly deltaX: string;
  readonly deltaY: string;
  readonly wheelDelta: string;

  // Gamepad
  readonly gamepadButton: GamepadButton;
  readonly gamepadAxis: GamepadAxis;
  readonly axisValue: string;

  // Text & Overlay
  readonly typeText: string;
  readonly overlayText: string;
  readonly overlayEndTimeMs: string;
  readonly showOverlayTiming: boolean;

  // Triggers & Conditions
  readonly pixelX: string;
  readonly pixelY: string;
  readonly pixelColorHex: string;
  readonly triggerCooldownMs: string;
  readonly waitTimeoutMs: string;
  readonly waitProcessName: string;
  readonly waitWindowTitle: string;
  readonly waitKeyVirtualKey: number;

  // Flow control
  readonly subMacroName: string;
}

/**
 * Validation result for action form fields.
 */
export interface ActionValidationResult {
  readonly isValid: boolean;
  readonly errorMessage?: string | undefined;
  readonly field?: string | undefined;
}

/**
 * Result returned when an action form is submitted.
 */
export interface ActionDialogSubmitResult {
  readonly events: readonly MacroEvent[];
  readonly shiftAfterMicroseconds: Microseconds;
  readonly shiftDurationMicroseconds: Microseconds;
  readonly originalEvent?: MacroEvent | undefined;
}

/**
 * Props for AddActionDialog and EditActionDialog.
 */
export interface AddActionDialogProps {
  readonly isOpen: boolean;
  readonly mode?: 'add' | 'edit' | undefined;
  readonly initialEvent?: MacroEvent | undefined;
  readonly suggestedTimeMs?: number | undefined;
  readonly anchorEvent?: MacroEvent | null | undefined;
  readonly availableMacroNames?: ReadonlyArray<string> | undefined;
  readonly onClose: () => void;
  readonly onSubmit: (result: ActionDialogSubmitResult) => void;
}
