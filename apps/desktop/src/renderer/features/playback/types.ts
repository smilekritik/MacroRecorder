/**
 * @macro-recorder/desktop - Playback Feature Types
 * Playback tab and header controls.
 */

import type {
  ActivationMode,
  DispatchReceipt,
  EngineState,
  MacroDefinition,
  MacroEvent,
  OpenWindowInfo,
  PlaybackOptions,
} from '../../../../../../packages/contracts/src/index.js';

/**
 * Enriched descriptor for an open window inspected for targeting.
 */
export interface TargetWindowItem extends OpenWindowInfo {
  readonly isChromiumOrUwp?: boolean | undefined;
  readonly isElevated?: boolean | undefined;
  readonly displayName: string;
}

/**
 * Props for the playback timing settings section.
 */
export interface PlaybackTimingViewProps {
  readonly options: PlaybackOptions;
  readonly onChange: (updated: PlaybackOptions) => void;
  readonly disabled?: boolean | undefined;
  readonly className?: string | undefined;
}

/**
 * Props for the target window picker and compatibility warnings.
 */
export interface TargetWindowPickerProps {
  readonly selectedProcessName: string;
  readonly selectedWindowTitle: string;
  readonly hotkeyScopedToTarget: boolean;
  readonly preferScanCodes: boolean;
  readonly openWindows: readonly TargetWindowItem[];
  readonly isAppElevated?: boolean | undefined;
  readonly disabled?: boolean | undefined;
  readonly onSelectWindow: (processName: string, windowTitle: string) => void;
  readonly onToggleScopedToTarget: (scoped: boolean) => void;
  readonly onTogglePreferScanCodes: (prefer: boolean) => void;
  readonly onRefreshWindows: () => void;
  readonly className?: string | undefined;
}

/**
 * Props for the input delivery mode and targeting section.
 */
export interface PlaybackTargetingViewProps {
  readonly options: PlaybackOptions;
  readonly onChange: (updated: PlaybackOptions) => void;
  readonly openWindows: readonly TargetWindowItem[];
  readonly isAppElevated?: boolean | undefined;
  readonly onRefreshWindows: () => void;
  readonly disabled?: boolean | undefined;
  readonly className?: string | undefined;
}

/**
 * Props for the entire PlaybackOptionsView tab panel.
 */
export interface PlaybackOptionsViewProps {
  readonly options: PlaybackOptions;
  readonly onChange: (updated: PlaybackOptions) => void;
  readonly openWindows: readonly TargetWindowItem[];
  readonly isAppElevated?: boolean | undefined;
  readonly onRefreshWindows: () => void;
  readonly disabled?: boolean | undefined;
  readonly className?: string | undefined;
}

/**
 * Props for the primary header playback and recording controls.
 */
export interface PlaybackHeaderControlsProps {
  readonly selectedMacro: MacroDefinition | null;
  readonly engineState: EngineState;
  readonly playbackBanner: string;
  readonly isMacroEnabled: boolean;
  readonly isAutomaticTrigger: boolean;
  readonly onRecordClick: () => void;
  readonly onPlayClick: () => void;
  readonly onPauseClick: () => void;
  readonly onStopClick: () => void;
  readonly onToggleMacroEnabled: (enabled: boolean) => void;
  readonly onChangeActivationMode: (mode: ActivationMode) => void;
  readonly onOpenSettings?: () => void;
  readonly emergencyStopHotkeyText?: string | undefined;
  readonly className?: string | undefined;
}

/**
 * Props for the real-time action progress and diagnostics card.
 */
export interface CurrentActionProgressProps {
  readonly macroName: string;
  readonly engineState: EngineState;
  readonly elapsedMicroseconds: number;
  readonly totalDurationMicroseconds?: number | undefined;
  readonly currentEvent?: MacroEvent | null | undefined;
  readonly lastReceipt?: DispatchReceipt | null | undefined;
  readonly playbackSpeed?: number | undefined;
  readonly className?: string | undefined;
}

/**
 * Playback execution state and controller returned by usePlaybackController.
 */
export interface PlaybackController {
  readonly engineState: EngineState;
  readonly activeMacroId: string | null;
  readonly elapsedMicroseconds: number;
  readonly playbackBanner: string;
  readonly currentEvent: MacroEvent | null;
  readonly lastReceipt: DispatchReceipt | null;
  readonly openWindows: readonly TargetWindowItem[];
  readonly isTargetIncompatible: boolean;
  readonly isElevationMismatch: boolean;
  readonly isAutomaticTrigger: boolean;
  readonly automaticTriggerStatus: 'idle' | 'monitoring' | 'cooldown';
  readonly statusText: string;
  readonly refreshOpenWindows: () => Promise<void>;
  readonly play: (macro?: MacroDefinition) => Promise<boolean>;
  readonly pause: () => Promise<void>;
  readonly resume: () => Promise<void>;
  readonly stop: (reason?: string) => Promise<void>;
  readonly emergencyStop: (reason?: string) => Promise<void>;
}
