/**
 * Action categories, action descriptors, and option enumerations.
 */

import {
  GamepadAxis,
  GamepadButton,
  type MacroEvent,
  MacroEventType,
  MouseButton,
} from '../../../../../../packages/contracts/src/index.js';
import { ManualActionType } from '../../../../../../packages/domain/src/timeline/types.js';
import {
  type ActionFormData,
  type ActionOptionItem,
  type GamepadAxisOption,
  type GamepadButtonOption,
  ManualActionCategory,
  type MouseButtonOption,
} from './types.js';

/**
 * Complete list of manual action options across the 8 categories.
 */
export const ACTION_OPTIONS: ReadonlyArray<ActionOptionItem> = [
  // Keyboard
  {
    type: ManualActionType.KeyPress,
    label: 'Key press',
    category: ManualActionCategory.Keyboard,
    description: 'Press and release a keyboard key or extra mouse button with hold duration.',
  },
  {
    type: ManualActionType.KeyDown,
    label: 'Key down',
    category: ManualActionCategory.Keyboard,
    description: 'Press down a keyboard key or extra mouse button without releasing it.',
  },
  {
    type: ManualActionType.KeyUp,
    label: 'Key up',
    category: ManualActionCategory.Keyboard,
    description: 'Release a previously pressed keyboard key or extra mouse button.',
  },
  {
    type: ManualActionType.TypeText,
    label: 'Type text (string)',
    category: ManualActionCategory.Keyboard,
    description: 'Type Unicode text directly into the focused window.',
  },

  // Mouse
  {
    type: ManualActionType.MouseClick,
    label: 'Mouse click',
    category: ManualActionCategory.Mouse,
    description: 'Click a mouse button at the current cursor position.',
  },
  {
    type: ManualActionType.MouseDown,
    label: 'Mouse button down',
    category: ManualActionCategory.Mouse,
    description: 'Press down a mouse button at the current cursor position.',
  },
  {
    type: ManualActionType.MouseUp,
    label: 'Mouse button up',
    category: ManualActionCategory.Mouse,
    description: 'Release a mouse button at the current cursor position.',
  },
  {
    type: ManualActionType.MouseMove,
    label: 'Move mouse',
    category: ManualActionCategory.Mouse,
    description: 'Move mouse by relative X and Y pixel offsets.',
  },
  {
    type: ManualActionType.Wheel,
    label: 'Scroll up/down',
    category: ManualActionCategory.Mouse,
    description: 'Scroll vertical mouse wheel (positive is up, negative is down).',
  },
  {
    type: ManualActionType.HorizontalWheel,
    label: 'Scroll left/right',
    category: ManualActionCategory.Mouse,
    description: 'Scroll horizontal mouse wheel (positive is right, negative is left).',
  },

  // Gamepad
  {
    type: ManualActionType.GamepadPress,
    label: 'Gamepad button press',
    category: ManualActionCategory.Gamepad,
    description: 'Press and release a virtual gamepad button with hold duration.',
  },
  {
    type: ManualActionType.GamepadButtonDown,
    label: 'Press gamepad button',
    category: ManualActionCategory.Gamepad,
    description: 'Press down a virtual gamepad button.',
  },
  {
    type: ManualActionType.GamepadButtonUp,
    label: 'Release gamepad button',
    category: ManualActionCategory.Gamepad,
    description: 'Release a virtual gamepad button.',
  },
  {
    type: ManualActionType.GamepadAxis,
    label: 'Gamepad axis (stick/trigger)',
    category: ManualActionCategory.Gamepad,
    description: 'Set analog stick or trigger value on the virtual controller.',
  },

  // Triggers & Conditions
  {
    type: ManualActionType.PixelColorTrigger,
    label: 'Pixel color trigger',
    category: ManualActionCategory.TriggersAndConditions,
    description: 'Pause execution until screen pixel color matches the specified RGB value.',
  },
  {
    type: ManualActionType.WaitForPixelGone,
    label: 'Wait for color to disappear',
    category: ManualActionCategory.TriggersAndConditions,
    description: 'Pause execution until screen pixel color no longer matches.',
  },
  {
    type: ManualActionType.WaitForWindow,
    label: 'Wait for a window',
    category: ManualActionCategory.TriggersAndConditions,
    description: 'Pause execution until target window becomes active.',
  },
  {
    type: ManualActionType.WaitForKey,
    label: 'Wait for a key press',
    category: ManualActionCategory.TriggersAndConditions,
    description: 'Pause execution until the specified physical key is pressed.',
  },

  // Flow control
  {
    type: ManualActionType.RunMacro,
    label: 'Run macro…',
    category: ManualActionCategory.FlowControl,
    description: 'Invoke another macro as a sub-routine and resume upon completion.',
  },

  // Pause and timing
  {
    type: ManualActionType.Delay,
    label: 'Pause',
    category: ManualActionCategory.PauseAndTiming,
    description: 'Insert an explicit delay pause into playback.',
  },

  // Text & Overlay
  {
    type: ManualActionType.OverlayText,
    label: 'Overlay text',
    category: ManualActionCategory.TextAndOverlay,
    description: 'Display an on-screen prompt on the desktop overlay with optional countdown.',
  },

  // Notes
  {
    type: ManualActionType.Comment,
    label: 'Comment (empty row)',
    category: ManualActionCategory.Notes,
    description: 'A separator row with centered text; does not affect playback.',
  },
];

/**
 * Standard mouse buttons supported by Macro Recorder.
 */
export const MOUSE_BUTTON_OPTIONS: ReadonlyArray<MouseButtonOption> = [
  { button: MouseButton.Left, label: 'Left' },
  { button: MouseButton.Right, label: 'Right' },
  { button: MouseButton.Middle, label: 'Middle' },
  { button: MouseButton.X1, label: 'Extra X1' },
  { button: MouseButton.X2, label: 'Extra X2' },
];

/**
 * Standard gamepad buttons matching controller hardware.
 */
export const GAMEPAD_BUTTON_OPTIONS: ReadonlyArray<GamepadButtonOption> = [
  { button: GamepadButton.A, label: 'A' },
  { button: GamepadButton.B, label: 'B' },
  { button: GamepadButton.X, label: 'X' },
  { button: GamepadButton.Y, label: 'Y' },
  { button: GamepadButton.LeftBumper, label: 'Left Bumper (LB)' },
  { button: GamepadButton.RightBumper, label: 'Right Bumper (RB)' },
  { button: GamepadButton.LeftStick, label: 'Left Stick (LS)' },
  { button: GamepadButton.RightStick, label: 'Right Stick (RS)' },
  { button: GamepadButton.Back, label: 'Back / View' },
  { button: GamepadButton.Start, label: 'Start / Menu' },
  { button: GamepadButton.Guide, label: 'Guide / Xbox' },
  { button: GamepadButton.DPadUp, label: 'D-Pad Up' },
  { button: GamepadButton.DPadDown, label: 'D-Pad Down' },
  { button: GamepadButton.DPadLeft, label: 'D-Pad Left' },
  { button: GamepadButton.DPadRight, label: 'D-Pad Right' },
];

/**
 * Standard gamepad axes.
 */
export const GAMEPAD_AXIS_OPTIONS: ReadonlyArray<GamepadAxisOption> = [
  { axis: GamepadAxis.LeftStickX, label: 'Left Stick X' },
  { axis: GamepadAxis.LeftStickY, label: 'Left Stick Y' },
  { axis: GamepadAxis.RightStickX, label: 'Right Stick X' },
  { axis: GamepadAxis.RightStickY, label: 'Right Stick Y' },
  { axis: GamepadAxis.LeftTrigger, label: 'Left Trigger (LT)' },
  { axis: GamepadAxis.RightTrigger, label: 'Right Trigger (RT)' },
];

/**
 * Determines ManualActionType corresponding to an existing MacroEvent.
 */
export function getManualActionTypeFromEvent(event: MacroEvent): ManualActionType {
  switch (event.type) {
    case MacroEventType.KeyDown:
      return ManualActionType.KeyDown;
    case MacroEventType.KeyUp:
      return ManualActionType.KeyUp;
    case MacroEventType.MouseButtonDown:
      return ManualActionType.MouseDown;
    case MacroEventType.MouseButtonUp:
      return ManualActionType.MouseUp;
    case MacroEventType.MouseMove:
      return ManualActionType.MouseMove;
    case MacroEventType.Wheel:
      return ManualActionType.Wheel;
    case MacroEventType.HorizontalWheel:
      return ManualActionType.HorizontalWheel;
    case MacroEventType.TypeText:
      return ManualActionType.TypeText;
    case MacroEventType.OverlayText:
      return ManualActionType.OverlayText;
    case MacroEventType.PixelColorTrigger:
      return ManualActionType.PixelColorTrigger;
    case MacroEventType.WaitForPixelGone:
      return ManualActionType.WaitForPixelGone;
    case MacroEventType.WaitForWindow:
      return ManualActionType.WaitForWindow;
    case MacroEventType.WaitForKey:
      return ManualActionType.WaitForKey;
    case MacroEventType.RunMacro:
      return ManualActionType.RunMacro;
    case MacroEventType.Comment:
      return ManualActionType.Comment;
    case MacroEventType.GamepadButtonDown:
      return ManualActionType.GamepadButtonDown;
    case MacroEventType.GamepadButtonUp:
      return ManualActionType.GamepadButtonUp;
    case MacroEventType.GamepadAxis:
      return ManualActionType.GamepadAxis;
    case MacroEventType.Delay:
    default:
      return ManualActionType.Delay;
  }
}

/**
 * Creates default initial form data, optionally seeded from an existing event or suggested time.
 */
export function createDefaultActionFormData(
  suggestedTimeMs = 0,
  existingEvent?: MacroEvent,
): ActionFormData {
  if (existingEvent) {
    const type = getManualActionTypeFromEvent(existingEvent);
    const startMs = Math.max(0, Math.round(existingEvent.timeMicroseconds / 1000)).toString();
    const comment = existingEvent.comment ?? '';
    const rec = existingEvent as unknown as Record<string, unknown>;

    let virtualKey = 0;
    let scanCode = 0;
    let extended = false;
    const capturedMouseButton: MouseButton = MouseButton.None;
    let mouseButton: MouseButton = MouseButton.Left;
    let deltaX = '0';
    let deltaY = '0';
    let wheelDelta = '120';
    let gamepadButton: GamepadButton = GamepadButton.A;
    let gamepadAxis: GamepadAxis = GamepadAxis.LeftStickX;
    let axisValue = '32767';
    let typeText = '';
    let overlayText = '';
    let overlayEndTimeMs = (Number(startMs) + 1000).toString();
    let showOverlayTiming = true;
    let pixelX = '0';
    let pixelY = '0';
    let pixelColorHex = '#000000';
    let triggerCooldownMs = '3000';
    let waitTimeoutMs = '0';
    let waitProcessName = '';
    let waitWindowTitle = '';
    let waitKeyVirtualKey = 0;
    let subMacroName = '';
    let commentRowText = '';
    let durationMs = '50';

    if (existingEvent.type === MacroEventType.KeyDown || existingEvent.type === MacroEventType.KeyUp) {
      virtualKey = (rec.virtualKey as number) ?? (rec.VirtualKey as number) ?? 0;
      scanCode = (rec.scanCode as number) ?? (rec.ScanCode as number) ?? 0;
      extended = (rec.extended as boolean) ?? (rec.Extended as boolean) ?? false;
    } else if (
      existingEvent.type === MacroEventType.MouseButtonDown ||
      existingEvent.type === MacroEventType.MouseButtonUp
    ) {
      mouseButton = (rec.button as MouseButton) ?? (rec.Button as MouseButton) ?? MouseButton.Left;
    } else if (existingEvent.type === MacroEventType.MouseMove) {
      deltaX = String((rec.deltaX as number) ?? (rec.DeltaX as number) ?? 0);
      deltaY = String((rec.deltaY as number) ?? (rec.DeltaY as number) ?? 0);
    } else if (
      existingEvent.type === MacroEventType.Wheel ||
      existingEvent.type === MacroEventType.HorizontalWheel
    ) {
      wheelDelta = String((rec.wheelDelta as number) ?? (rec.WheelDelta as number) ?? 120);
    } else if (
      existingEvent.type === MacroEventType.GamepadButtonDown ||
      existingEvent.type === MacroEventType.GamepadButtonUp
    ) {
      gamepadButton =
        (rec.gamepadButton as GamepadButton) ??
        (rec.GamepadButton as GamepadButton) ??
        GamepadButton.A;
    } else if (existingEvent.type === MacroEventType.GamepadAxis) {
      gamepadAxis =
        (rec.gamepadAxis as GamepadAxis) ??
        (rec.GamepadAxis as GamepadAxis) ??
        GamepadAxis.LeftStickX;
      axisValue = String((rec.axisValue as number) ?? (rec.AxisValue as number) ?? 32767);
    } else if (existingEvent.type === MacroEventType.TypeText) {
      typeText = (rec.text as string) ?? (rec.Text as string) ?? '';
    } else if (existingEvent.type === MacroEventType.OverlayText) {
      overlayText = (rec.text as string) ?? (rec.Text as string) ?? '';
      const durUs =
        (rec.durationMicroseconds as number) ?? (rec.DurationMicroseconds as number) ?? 1_000_000;
      overlayEndTimeMs = String(Math.round((existingEvent.timeMicroseconds + durUs) / 1000));
      showOverlayTiming =
        (rec.showOverlayTiming as boolean) ?? (rec.ShowOverlayTiming as boolean) ?? true;
    } else if (existingEvent.type === MacroEventType.PixelColorTrigger) {
      pixelX = String((rec.pixelX as number) ?? (rec.PixelX as number) ?? 0);
      pixelY = String((rec.pixelY as number) ?? (rec.PixelY as number) ?? 0);
      const colorNum =
        ((rec.pixelColor as number) ?? (rec.PixelColor as number) ?? 0) & 0xffffff;
      pixelColorHex = `#${colorNum.toString(16).padStart(6, '0').toUpperCase()}`;
      triggerCooldownMs = String(
        Math.max(
          0,
          (rec.triggerCooldownMilliseconds as number) ??
            (rec.TriggerCooldownMilliseconds as number) ??
            3000,
        ),
      );
    } else if (existingEvent.type === MacroEventType.WaitForPixelGone) {
      pixelX = String((rec.pixelX as number) ?? (rec.PixelX as number) ?? 0);
      pixelY = String((rec.pixelY as number) ?? (rec.PixelY as number) ?? 0);
      const colorNum =
        ((rec.pixelColor as number) ?? (rec.PixelColor as number) ?? 0) & 0xffffff;
      pixelColorHex = `#${colorNum.toString(16).padStart(6, '0').toUpperCase()}`;
      waitTimeoutMs = String(
        Math.max(
          0,
          (rec.waitTimeoutMilliseconds as number) ??
            (rec.WaitTimeoutMilliseconds as number) ??
            0,
        ),
      );
    } else if (existingEvent.type === MacroEventType.WaitForWindow) {
      waitProcessName =
        (rec.waitProcessName as string) ?? (rec.WaitProcessName as string) ?? '';
      waitWindowTitle =
        (rec.waitWindowTitle as string) ?? (rec.WaitWindowTitle as string) ?? '';
      waitTimeoutMs = String(
        Math.max(
          0,
          (rec.waitTimeoutMilliseconds as number) ??
            (rec.WaitTimeoutMilliseconds as number) ??
            0,
        ),
      );
    } else if (existingEvent.type === MacroEventType.WaitForKey) {
      waitKeyVirtualKey =
        (rec.waitKeyVirtualKey as number) ?? (rec.WaitKeyVirtualKey as number) ?? 0;
      waitTimeoutMs = String(
        Math.max(
          0,
          (rec.waitTimeoutMilliseconds as number) ??
            (rec.WaitTimeoutMilliseconds as number) ??
            0,
        ),
      );
    } else if (existingEvent.type === MacroEventType.RunMacro) {
      subMacroName = (rec.subMacroName as string) ?? (rec.SubMacroName as string) ?? '';
    } else if (existingEvent.type === MacroEventType.Comment) {
      commentRowText = (rec.text as string) ?? (rec.Text as string) ?? '';
    } else if (existingEvent.type === MacroEventType.Delay) {
      const durUs =
        (rec.durationMicroseconds as number) ?? (rec.DurationMicroseconds as number) ?? 100_000;
      durationMs = String(Math.round(durUs / 1000));
    }

    return {
      type,
      startTimeMs: startMs,
      durationMs,
      actionComment: comment,
      commentRowText,
      virtualKey,
      scanCode,
      extended,
      capturedMouseButton,
      mouseButton,
      deltaX,
      deltaY,
      wheelDelta,
      gamepadButton,
      gamepadAxis,
      axisValue,
      typeText,
      overlayText,
      overlayEndTimeMs,
      showOverlayTiming,
      pixelX,
      pixelY,
      pixelColorHex,
      triggerCooldownMs,
      waitTimeoutMs,
      waitProcessName,
      waitWindowTitle,
      waitKeyVirtualKey,
      subMacroName,
    };
  }

  return {
    type: ManualActionType.KeyPress,
    startTimeMs: Math.max(0, Math.round(suggestedTimeMs)).toString(),
    durationMs: '50',
    actionComment: '',
    commentRowText: '',
    virtualKey: 0,
    scanCode: 0,
    extended: false,
    capturedMouseButton: MouseButton.None,
    mouseButton: MouseButton.Left,
    deltaX: '0',
    deltaY: '0',
    wheelDelta: '120',
    gamepadButton: GamepadButton.A,
    gamepadAxis: GamepadAxis.LeftStickX,
    axisValue: '32767',
    typeText: '',
    overlayText: '',
    overlayEndTimeMs: (Math.max(0, Math.round(suggestedTimeMs)) + 1000).toString(),
    showOverlayTiming: true,
    pixelX: '0',
    pixelY: '0',
    pixelColorHex: '#000000',
    triggerCooldownMs: '3000',
    waitTimeoutMs: '0',
    waitProcessName: '',
    waitWindowTitle: '',
    waitKeyVirtualKey: 0,
    subMacroName: '',
  };
}
