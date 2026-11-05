/**
 * @macro-recorder/desktop - Inspector Tools Types
 */

import type { WindowInspectionSnapshot } from '../../../../../../packages/contracts/src/descriptors/window.js';
import type { GamepadPadReading } from '../../../../../../packages/contracts/src/descriptors/controller.js';
import type { MacroRecorderApi } from '../../hooks/useApi.js';

export interface WindowInspectorProps {
  readonly isOpen?: boolean | undefined;
  readonly onClose?: (() => void) | undefined;
  readonly refreshIntervalMs?: number | undefined;
  readonly apiOverride?: MacroRecorderApi | undefined;
}

export interface PixelInspectorProps {
  readonly isOpen?: boolean | undefined;
  readonly onClose?: (() => void) | undefined;
  readonly refreshIntervalMs?: number | undefined;
  readonly apiOverride?: MacroRecorderApi | undefined;
}

export interface PixelPickerProps {
  readonly isOpen?: boolean | undefined;
  readonly hotkeyLabel?: string | undefined;
  readonly onCapture?: ((sample: { x: number; y: number; hex: string; rgb: number }) => void) | undefined;
  readonly onCancel?: (() => void) | undefined;
  readonly apiOverride?: MacroRecorderApi | undefined;
}

export interface KeyCodeInspectorProps {
  readonly isOpen?: boolean | undefined;
  readonly onClose?: (() => void) | undefined;
  readonly apiOverride?: MacroRecorderApi | undefined;
}

export interface GamepadTesterProps {
  readonly isOpen?: boolean | undefined;
  readonly onClose?: (() => void) | undefined;
  readonly refreshIntervalMs?: number | undefined;
  readonly apiOverride?: MacroRecorderApi | undefined;
}

export type { WindowInspectionSnapshot, GamepadPadReading };
