/**
 * @macro-recorder/desktop - Recording Feature Types
 * and ChoiceWindow dialog.
 */

import type {
  MacroDefinition,
  MacroEvent,
  RecordingChoice,
  RecordingOptions,
} from '../../../../../../packages/contracts/src/index.js';

/**
 * Tone for choice dialog option stripe.
 */
export type ChoiceOptionTone = 'neutral' | 'danger' | 'accent';

/**
 * A single selectable card option in the RecordingChoiceDialog.
 */
export interface RecordingChoiceOptionItem {
  readonly choice: RecordingChoice;
  readonly title: string;
  readonly description: string;
  readonly tone: ChoiceOptionTone;
  readonly enabled: boolean;
}

/**
 * Props for the RecordingSourceToggles component.
 */
export interface RecordingSourceTogglesProps {
  readonly options: RecordingOptions;
  readonly onChange: (updated: RecordingOptions) => void;
  readonly disabled?: boolean | undefined;
  readonly className?: string | undefined;
}

/**
 * Props for the full RecordingOptionsView tab panel.
 */
export interface RecordingOptionsViewProps {
  readonly options: RecordingOptions;
  readonly onChange: (updated: RecordingOptions) => void;
  readonly disabled?: boolean | undefined;
  readonly className?: string | undefined;
}

/**
 * Props for the overwrite/continue/append RecordingChoiceDialog.
 */
export interface RecordingChoiceDialogProps {
  readonly isOpen: boolean;
  readonly eventCount: number;
  readonly macroDurationMs: number;
  readonly selectedActionTimeMs: number | null;
  readonly onSelectChoice: (choice: RecordingChoice) => void;
  readonly onCancel: () => void;
}

/**
 * Props for the proactive Gamepad driver installation prompt dialog.
 */
export interface GamepadDriverDialogProps {
  readonly isOpen: boolean;
  readonly onInstallNow: () => void;
  readonly onDismiss: () => void;
}

/**
 * Current recording execution phase and status.
 */
export interface RecordingStatusState {
  readonly isRecording: boolean;
  readonly isPaused: boolean;
  readonly isCountdown: boolean;
  readonly countdownRemaining: number;
  readonly elapsedMicroseconds: number;
  readonly recordedCount: number;
  readonly lastEventDisplay: string | null;
  readonly statusText: string;
}

/**
 * Props for RecordingStatusBar component.
 */
export interface RecordingStatusBarProps {
  readonly status: RecordingStatusState;
  readonly onPause?: () => void;
  readonly onResume?: () => void;
  readonly onStop?: () => void;
  readonly onCancelCountdown?: () => void;
  readonly className?: string | undefined;
}

/**
 * State returned by the useRecordingController hook.
 */
export interface RecordingController {
  readonly isRecording: boolean;
  readonly isPaused: boolean;
  readonly isCountdown: boolean;
  readonly countdownRemaining: number;
  readonly elapsedMicroseconds: number;
  readonly recordedCount: number;
  readonly lastEventDisplay: string | null;
  readonly statusText: string;
  readonly isChoiceDialogOpen: boolean;
  readonly isGamepadDialogOpen: boolean;
  readonly choiceDialogProps: {
    readonly eventCount: number;
    readonly macroDurationMs: number;
    readonly selectedActionTimeMs: number | null;
  };
  readonly startRecording: (targetMacro: MacroDefinition, selectedEventTimeMs?: number | null) => Promise<void>;
  readonly handleChoiceSelected: (choice: RecordingChoice) => Promise<void>;
  readonly handleChoiceCancelled: () => void;
  readonly cancelCountdown: () => void;
  readonly pauseRecording: () => Promise<void>;
  readonly resumeRecording: () => Promise<void>;
  readonly stopRecording: () => Promise<readonly MacroEvent[] | null>;
  readonly handleInstallGamepadDriver: () => Promise<void>;
  readonly handleDismissGamepadDriver: () => void;
}
