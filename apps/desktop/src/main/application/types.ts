/**
 * Core interfaces, contracts, and state machine types for
 * the Electron Main Process Application Composition Root.
 *
 * Fully typed, deterministic, and compatible with both Node/Electron runtimes and fake environments.
 */

export type {
  AppError,
  AppPreferences,
  EngineState,
  GamepadPadReading,
  IpcErrorCode,
  LibraryBackupMode,
  MacroDefinition,
  MacroEvent,
  MacroExportFormat,
  MacroImportResult,
  LibraryBackupResult,
  OpenWindowInfo,
  OverlayPlacement,
  RecordingChoice,
  RecordingOptions,
  RunHistoryEntry,
  WindowInspectionSnapshot,
} from '../ipc/types.js';
import type { DispatchReceipt as ContractDispatchReceipt } from '../../../../../packages/contracts/src/index.js';
import type {
  AppPreferences,
  EngineState,
  GamepadPadReading,
  MacroDefinition,
  MacroEvent,
  OpenWindowInfo,
  RecordingOptions,
  RunHistoryEntry,
  WindowInspectionSnapshot,
} from '../ipc/types.js';

// ============================================================================
// Timing & Identity Constants
// ============================================================================

export type Microseconds = number;
export type Milliseconds = number;

export interface DispatchReceipt extends ContractDispatchReceipt {
  /** Compatibility aliases retained for existing main-process diagnostics and overlays. */
  readonly id: string;
  readonly startedMicroseconds: Microseconds;
  readonly completedMicroseconds: Microseconds;
  readonly confirmedMicroseconds?: Microseconds | null | undefined;
}

export type OverlayCardOverride = 'Inherit' | 'ForceShow' | 'ForceHide';

export interface OverlayCardState {
  readonly macroId: string;
  readonly macroName: string;
  readonly state: EngineState;
  readonly activeActionText?: string | undefined;
  readonly countdownSeconds?: number | undefined;
  readonly visible: boolean;
  readonly infoX: number;
  readonly infoY: number;
  readonly scalePercent: number;
  readonly transparencyPercent: number;
}

// ============================================================================
// Hardware & Privileged Operation Adapters
// ============================================================================

export interface IInputInjectorAdapter {
  sendAsync(
    item: MacroEvent,
    scheduledMicroseconds: Microseconds,
    clockStartTimestamp: number,
    preferScanCodes: boolean,
    targetWindow: number,
    token?: AbortSignal,
  ): Promise<DispatchReceipt>;

  releaseAll(hwnd?: number): void;
  releaseInputs?(events: readonly MacroEvent[], targetWindow: number): void;
  isKeyDown(virtualKey: number): boolean;
  getHeldInputsCount(): number;
  trackInputState(virtualKey: number, isDown: boolean, hwnd?: number): void;
  trackMouseState(button: string, isDown: boolean, hwnd?: number): void;
}

export interface HotkeyRegistration {
  readonly id: number;
  readonly virtualKey: number;
  readonly modifiers: number;
  readonly description?: string | undefined;
  readonly isMacroHotkey?: boolean | undefined;
  readonly macroId?: string | undefined;
  readonly passThrough?: boolean | undefined;
  readonly targetWindowOnly?: boolean | undefined;
  readonly targetHwnd?: number | undefined;
  readonly mouseButton?: string | undefined;
  readonly wheel?: string | undefined;
  /** Restricts the bind to this window: elsewhere the key passes through and nothing fires. */
  readonly scopeProcess?: string | undefined;
  readonly scopeTitle?: string | undefined;
  /** Handled natively, so it keeps working while JavaScript is busy. */
  readonly emergency?: boolean | undefined;
}

export type HotkeyTriggerCallback = (registration: HotkeyRegistration) => void;

export interface IHotkeyAdapter {
  registerHotkey(registration: HotkeyRegistration): boolean;
  unregisterHotkey(id: number): boolean;
  unregisterAll(): void;
  isRegistered(id: number): boolean;
  probeAvailability(virtualKey: number, modifiers: number): boolean;
  onTrigger(callback: HotkeyTriggerCallback): () => void;
  getRegisteredHotkeys(): readonly HotkeyRegistration[];
}

export interface IPixelColorAdapter {
  getPixelColorRgb(x: number, y: number): number;
  samplePixelColor(x: number, y: number): {
    rgb: number;
    hex: string;
    r: number;
    g: number;
    b: number;
  };
}

export interface IWindowTargetingAdapter {
  getOpenWindows(excludedProcessId?: number): OpenWindowInfo[];
  inspectWindow(
    followMouse: boolean,
    selfHandle?: number | undefined,
    ownerHandle?: number | undefined,
  ): WindowInspectionSnapshot;
  getForegroundWindow(): {
    handle: number;
    title: string;
    processName: string;
    processId: number;
  } | null;
  activateWindow(handle: number): boolean;
  activateWindowByName(processName: string, windowTitle: string): boolean;
  checkWindowIntegrity(hwnd: number): {
    canInject: boolean;
    targetIsHigher: boolean;
    currentIntegrity: number;
    targetIntegrity?: number | undefined;
    warningMessage?: string | undefined;
  };
  isChromiumOrElevated(hwnd: number): {
    isChromium: boolean;
    isElevated: boolean;
    warning?: string | undefined;
  };
}

export interface IGamepadAdapter {
  getReadings(): readonly GamepadPadReading[];
  updateVirtualGamepad(outputType: string, snapshot: unknown): void;
  setHidHideState(hide: boolean): boolean;
  isVigemAvailable(): boolean;
  isHidhideAvailable(): boolean;
}

export interface IWindowOrchestratorAdapter {
  minimizeMainWindow(): void;
  restoreMainWindow(): void;
  isMainWindowMinimized(): boolean;
  openWindow(windowId: string, params?: Readonly<Record<string, unknown>>): boolean;
  closeWindow(windowId: string): boolean;
  isWindowOpen(windowId: string): boolean;
  updateOverlay(state: OverlayCardState): void;
  clearOverlay(): void;
}

// ============================================================================
// Storage & Persistence Interfaces
// ============================================================================

export interface ILibraryStore {
  readonly rootPath: string;
  loadAll(): Promise<MacroDefinition[]>;
  save(macro: MacroDefinition, options?: { touchModified?: boolean | undefined }): Promise<void>;
  delete(macro: { id?: string; name: string; folder?: string; storagePath?: string }): Promise<string>;
  restoreMacro(token: string, folderRelativePath: string, macroName: string): Promise<boolean>;
  restoreFolder(token: string, relativePath: string): Promise<boolean>;
  moveToFolder(macro: MacroDefinition, folderRelativePath: string): Promise<void>;
  loadFolders(): Promise<string[]>;
  createFolder(parentRelativePath: string, name: string): Promise<string>;
  deleteFolder(relativePath: string): Promise<string>;
  moveFolder(relativePath: string, newParentRelativePath: string): Promise<string>;
  cleanupTrash(keepMaxAgeMs: number): Promise<number>;
  importMacro(macro: MacroDefinition, folderRelativePath?: string): Promise<{ macro: MacroDefinition; warning?: string }>;
  getFolderTreeInfo(): Promise<{ folders: string[]; macroCounts: Record<string, number> }>;
  resolveUniqueName(desiredName: string, owner?: { storagePath?: string }): string;
}

export interface IPreferencesStore {
  load(): AppPreferences;
  save(newPrefs?: AppPreferences): void;
  saveAsync(newPrefs?: AppPreferences): Promise<void>;
  reset(): void;
  getPreferences(): AppPreferences;
  updatePreferences(partial: Partial<AppPreferences>, save?: boolean): AppPreferences;
  subscribe(listener: (prefs: AppPreferences) => void): () => void;
}

export interface IRunHistoryStore {
  record(
    macro: { id: string; name?: string } | string,
    receipts: readonly DispatchReceipt[],
    activation: string,
    durationMs: number,
    runAt?: string,
  ): RunHistoryEntry;
  loadAll(): RunHistoryEntry[];
  clear(): void;
  get(macroId: string): RunHistoryEntry | null;
}

// ============================================================================
// Execution State & Session Models
// ============================================================================

export interface MacroExecutionContext {
  readonly sessionId: string;
  readonly macroId: string;
  readonly macroName: string;
  readonly abortController: AbortController;
  readonly startedAtMicroseconds: Microseconds;
  readonly overlayState: OverlayCardState;
  state: EngineState;
  speed: number;
  targetWindowHandle: number;
  receipts: DispatchReceipt[];
}

export interface PlaybackSessionStatus {
  readonly sessionId: string;
  readonly macroId: string;
  readonly macroName: string;
  readonly state: EngineState;
  readonly elapsedMicroseconds: Microseconds;
  readonly currentActionIndex: number;
  readonly totalActions: number;
  readonly receiptsCount: number;
}

export interface RecordingSessionStatus {
  readonly isRecording: boolean;
  readonly isPaused: boolean;
  readonly isCountdown: boolean;
  readonly countdownSeconds: number;
  readonly elapsedMicroseconds: Microseconds;
  readonly recordedCount: number;
  readonly options: RecordingOptions;
  readonly lastEvent?: MacroEvent | null | undefined;
}

// ============================================================================
// Progress & Notification Callbacks
// ============================================================================

export interface TypedProgress<T = unknown> {
  readonly current: number;
  readonly total: number;
  readonly percentage: number;
  readonly message?: string | undefined;
  readonly data?: T | undefined;
}

export type ProgressCallback<T = unknown> = (progress: TypedProgress<T>) => void;
