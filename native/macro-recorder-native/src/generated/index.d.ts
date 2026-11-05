/**
 * Strongly-typed N-API bindings for @macro-recorder/native.
 * Generated to match shared contracts in @macro-recorder/contracts.
 */

// ============================================================================
// Command Contracts
// ============================================================================

export interface InjectKeyboardCommand {
  virtualKey: number;
  scanCode: number;
  extended: boolean;
  isUp: boolean;
  isUnicode?: boolean | undefined;
  unicodeChar?: string | undefined;
  targetWindow?: number | undefined;
}

export interface InjectMouseCommand {
  deltaX: number;
  deltaY: number;
  flags: number;
  wheelDelta: number;
  isAbsolute: boolean;
  button?: string | undefined;
  targetWindow?: number | undefined;
}

export interface InjectTargetedWindowMessageCommand {
  hwnd: number;
  msg: number;
  wParam: number;
  lParam: number;
}

export interface ReleaseAllInputsCommand {
  hwnd?: number | undefined;
}

export interface RegisterNativeHotkeyCommand {
  id: number;
  virtualKey: number;
  modifiers: number;
}

export interface UnregisterNativeHotkeyCommand {
  id: number;
}

export interface SamplePixelColorCommand {
  x: number;
  y: number;
}

export interface GamepadSnapshotPayload {
  connected: boolean;
  buttons: number;
  leftX: number;
  leftY: number;
  rightX: number;
  rightY: number;
  leftTrigger: number;
  rightTrigger: number;
}

export interface UpdateVirtualGamepadCommand {
  outputType: string;
  snapshot: GamepadSnapshotPayload;
}

export interface SetHidHideStateCommand {
  hide: boolean;
}

// ============================================================================
// Event Contracts
// ============================================================================

export interface NativeKeyboardHookEvent {
  eventType: string;
  virtualKey: number;
  scanCode: number;
  extended: boolean;
  timestampMicroseconds: number;
  isInjected: boolean;
}

export interface NativeMouseHookEvent {
  eventType: string;
  button: string;
  x: number;
  y: number;
  wheelDelta: number;
  timestampMicroseconds: number;
  isInjected: boolean;
}

export interface NativeRawInputEvent {
  deltaX: number;
  deltaY: number;
  buttonFlags: number;
  timestampMicroseconds: number;
}

export interface NativeGamepadStateEvent {
  slot: number;
  connected: boolean;
  buttons: number;
  leftX: number;
  leftY: number;
  rightX: number;
  rightY: number;
  leftTrigger: number;
  rightTrigger: number;
  timestampMicroseconds: number;
}

export interface NativeEmergencyStopEvent {
  timestampMicroseconds: number;
  reason: string;
}

export interface NativeLifecycleEvent {
  type: string;
  timestampMicroseconds: number;
}

// ============================================================================
// Callback Contracts
// ============================================================================

export interface NativeHotkeyTriggerCallback {
  kind: 'hotkeyTrigger';
  id: number;
  virtualKey: number;
  modifiers: number;
  timestampMicroseconds: number;
}

export interface NativeCallbackPayload {
  kind: string;
  eventType?: string | undefined;
  virtualKey?: number | undefined;
  scanCode?: number | undefined;
  extended?: boolean | undefined;
  isInjected?: boolean | undefined;
  button?: string | undefined;
  x?: number | undefined;
  y?: number | undefined;
  wheelDelta?: number | undefined;
  deltaX?: number | undefined;
  deltaY?: number | undefined;
  buttonFlags?: number | undefined;
  slot?: number | undefined;
  connected?: boolean | undefined;
  buttons?: number | undefined;
  leftX?: number | undefined;
  leftY?: number | undefined;
  rightX?: number | undefined;
  rightY?: number | undefined;
  leftTrigger?: number | undefined;
  rightTrigger?: number | undefined;
  id?: number | undefined;
  modifiers?: number | undefined;
  reason?: string | undefined;
  type?: string | undefined;
  timestampMicroseconds: number;
}

// ============================================================================
// Descriptors and Diagnostics
// ============================================================================

export interface QueueStatsPayload {
  capacity: number;
  currentLen: number;
  totalEnqueued: number;
  totalDropped: number;
  isClosed: boolean;
}

export interface NativeDispatchReceipt {
  id: string;
  scheduledMicroseconds: number;
  startedMicroseconds: number;
  completedMicroseconds: number;
  confirmedMicroseconds?: number | null | undefined;
  success: boolean;
  error?: string | null | undefined;
}

export interface OpenWindowInfo {
  handle: number;
  title: string;
  processName: string;
  processId: number;
  className?: string | undefined;
}

export interface WindowInspectionSnapshot {
  isSelf: boolean;
  title: string;
  className: string;
  processName: string;
  processId: number;
  mouseScreenX: number;
  mouseScreenY: number;
  mouseWindowX: number;
  mouseWindowY: number;
  mouseClientX: number;
  mouseClientY: number;
  rgb: number;
  windowX: number;
  windowY: number;
  windowWidth: number;
  windowHeight: number;
  clientWidth: number;
  clientHeight: number;
  controlClass: string;
  controlX: number;
  controlY: number;
  controlWidth: number;
  controlHeight: number;
  hex: string;
}

export interface ForegroundWindowSnapshot {
  handle: number;
  title: string;
  processName: string;
  processId: number;
  className: string;
}

export interface IntegrityCheckResult {
  canInject: boolean;
  targetIsHigher: boolean;
  currentIntegrity: number;
  targetIntegrity?: number | undefined;
  warningMessage?: string | undefined;
}

export interface WindowThemeOptions {
  darkMode: boolean;
  captionRgb: number;
  textRgb: number;
}

export interface ScreenRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
}

export interface MonitorInfo {
  handle: number;
  bounds: ScreenRect;
  workArea: ScreenRect;
  isPrimary: boolean;
  dpi: number;
  scaleFactor: number;
  deviceName: string;
}

export interface ScreenPixelSample {
  x: number;
  y: number;
  rgb: number;
  hex: string;
  r: number;
  g: number;
  b: number;
}

export interface GamepadPadReading {
  source: string;
  pressed: string[];
  leftX: number;
  leftY: number;
  rightX: number;
  rightY: number;
  leftTrigger: number;
  rightTrigger: number;
  rawAxes?: string | null | undefined;
}

export interface GpuAdapterInfo {
  name: string;
  vendorId: number;
  deviceId: number;
  dedicatedVideoMemory: number;
  isDiscrete: boolean;
  luidLow: number;
  luidHigh: number;
}

export interface RamMetrics {
  totalPhysicalBytes: number;
  availablePhysicalBytes: number;
  usedPhysicalBytes: number;
  memoryLoadPercentage: number;
  processWorkingSetBytes: number;
  processPrivateBytes: number;
}

export interface SystemLoadSnapshot {
  cpuUtilization: number;
  gpuUtilization: number;
  ramMetrics: RamMetrics;
  timestampMicroseconds: number;
}

// ============================================================================
// Native Foundation Session Class
// ============================================================================

export class NativeFoundationSession {
  constructor();
  initialize(): void;
  registerEventCallback(callback: (payload: NativeCallbackPayload) => void): void;
  emitEvent(payload: NativeCallbackPayload): void;
  getQueueStats(): QueueStatsPayload;
  isRunning(): boolean;
  shutdown(): void;
}

// ============================================================================
// Centralized Runtime Lifecycle and Audited N-API Functions
// ============================================================================

export function initializeNativeRuntime(callback?: ((payload: NativeCallbackPayload) => void) | null | undefined): void;
export function shutdownNativeRuntime(): void;
export function isNativeRuntimeRunning(): boolean;
export function registerRuntimeEventCallback(callback: (payload: NativeCallbackPayload) => void): void;
export function getRuntimeQueueStats(): QueueStatsPayload;

// Input Injection
export function injectKeyboard(command: InjectKeyboardCommand): NativeDispatchReceipt;
export function injectMouse(command: InjectMouseCommand): NativeDispatchReceipt;
export function injectTargetedWindowMessage(command: InjectTargetedWindowMessageCommand): void;
export function releaseAllInputs(command?: ReleaseAllInputsCommand | null | undefined): void;

// Hotkeys
export function registerNativeHotkey(command: RegisterNativeHotkeyCommand): number;
export function unregisterNativeHotkey(command: UnregisterNativeHotkeyCommand): void;
export function isKeyDown(virtualKey: number): boolean;

// Pixels
export function samplePixelColor(command: SamplePixelColorCommand): ScreenPixelSample;
export function capturePixelAt(x: number, y: number): ScreenPixelSample;
export function capturePixelAtCursor(): ScreenPixelSample;

// Gamepad
export function updateVirtualGamepad(command: UpdateVirtualGamepadCommand): void;
export function setHidHideState(command: SetHidHideStateCommand): boolean;
export function getGamepadReadings(): GamepadPadReading[];
export function isVigemDriverAvailable(): boolean;
export function isHidhideDriverAvailable(): boolean;

// Windows Services
export function getOpenWindows(excludedPid?: number | null | undefined): OpenWindowInfo[];
export function inspectWindow(followMouse: boolean, selfHandle?: number | null | undefined, ownerHandle?: number | null | undefined): WindowInspectionSnapshot;
export function getForegroundWindow(): ForegroundWindowSnapshot | null;
export function activateWindow(hwnd: number): boolean;
export function activateWindowByName(processName: string, windowTitle: string): boolean;
export function findWindowHandle(processName: string, windowTitle: string): number | null;
export function windowIgnoresPostedInput(processName: string, windowTitle: string): boolean;
export function checkWindowIntegrity(hwnd: number): IntegrityCheckResult;
export function applyWindowTheme(options: WindowThemeOptions): boolean;

// Displays and DPI
export function getAllMonitors(): MonitorInfo[];
export function getEffectiveSystemDpi(): number;
export function getDpiForWindow(hwnd: number): number;
export function getDpiForPoint(x: number, y: number): number;

// Performance Telemetry
export function sampleCpuUtilization(): number;
export function sampleGpuUtilization(): number;
export function sampleMemoryStatus(): RamMetrics;
export function getSystemLoadSnapshot(): SystemLoadSnapshot;
export function findStrongestGpuAdapter(): GpuAdapterInfo | null;
export function enumerateGpuAdapters(): GpuAdapterInfo[];

// Monotonic Timing and Clock
export function getMonotonicTimestamp(): number;
export function getMonotonicMicroseconds(): number;
export function waitPrecisionMicroseconds(targetMicroseconds: number): boolean;
