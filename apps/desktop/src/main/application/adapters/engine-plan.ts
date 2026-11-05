/**
 * Translates stored macros into the plans executed by the native engine.
 * Ordering matches the reference: stable by time, with blocking waits first within a moment.
 */

import type { MacroDefinition, MacroEvent } from '../../ipc/types.js';

export interface EnginePlanEvent {
  readonly id: string;
  readonly kind: string;
  readonly timeMicroseconds: number;
  readonly virtualKey?: number | undefined;
  readonly scanCode?: number | undefined;
  readonly extended?: boolean | undefined;
  readonly button?: string | undefined;
  readonly deltaX?: number | undefined;
  readonly deltaY?: number | undefined;
  readonly absolute?: boolean | undefined;
  readonly wheelDelta?: number | undefined;
  readonly text?: string | undefined;
  readonly durationMicroseconds?: number | undefined;
  readonly showTiming?: boolean | undefined;
  readonly pixelX?: number | undefined;
  readonly pixelY?: number | undefined;
  readonly pixelColor?: number | undefined;
  readonly cooldownMilliseconds?: number | undefined;
  readonly timeoutMilliseconds?: number | undefined;
  readonly waitProcess?: string | undefined;
  readonly waitTitle?: string | undefined;
  readonly waitKey?: number | undefined;
  readonly subMacro?: string | undefined;
  readonly gamepadButton?: string | undefined;
  readonly gamepadAxis?: string | undefined;
  readonly axisValue?: number | undefined;
}

export interface EnginePlan {
  readonly macroId: string;
  readonly name: string;
  readonly speed: number;
  readonly repeatCount: number;
  readonly repeatDelayMilliseconds: number;
  readonly randomizeTiming: boolean;
  readonly jitterMilliseconds: number;
  readonly preferScanCodes: boolean;
  readonly activationMode: string;
  readonly targetMode: string;
  readonly focusLoss: string;
  readonly targetProcess: string;
  readonly targetTitle: string;
  readonly durationMicroseconds: number;
  readonly isAutomatic: boolean;
  readonly enabled: boolean;
  readonly hotkeyVirtualKey: number;
  readonly hotkeyButton?: string | undefined;
  readonly hotkeyModifiers: number;
  readonly events: readonly EnginePlanEvent[];
}

const BLOCKING_WAITS = new Set(['PixelColorTrigger', 'WaitForPixelGone', 'WaitForWindow', 'WaitForKey']);

export const MOD_ALT = 0x0001;
export const MOD_CONTROL = 0x0002;
export const MOD_SHIFT = 0x0004;
export const MOD_WIN = 0x0008;

/** Reads a stored binding, which keeps its modifiers as separate flags. */
export function hotkeyModifiers(binding: Readonly<Record<string, unknown>>): number {
  if (typeof binding['modifiers'] === 'number') return binding['modifiers'];
  return (binding['alt'] ? MOD_ALT : 0)
    | (binding['control'] ? MOD_CONTROL : 0)
    | (binding['shift'] ? MOD_SHIFT : 0)
    | (binding['windows'] ? MOD_WIN : 0);
}

function kindOf(event: MacroEvent): string {
  return String(event.type ?? event['eventType'] ?? '');
}

function numberOr(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function overlayDurationMicroseconds(event: MacroEvent): number {
  const micro = event['durationMicroseconds'];
  if (typeof micro === 'number') return Math.max(0, micro);
  return Math.max(0, numberOr(event['durationMilliseconds'], 2000) * 1000);
}

/** True when the first real action is a pixel trigger: such a macro runs as a background monitor. */
export function isAutomaticMacro(macro: MacroDefinition): boolean {
  const first = (macro.events ?? []).find((event) => kindOf(event) !== 'Comment');
  return first !== undefined && kindOf(first) === 'PixelColorTrigger';
}

function toPlanEvent(event: MacroEvent): EnginePlanEvent {
  const kind = kindOf(event);
  const base = {
    id: String(event.id ?? ''),
    kind,
    timeMicroseconds: Math.max(0, Math.round(numberOr(event.timeMicroseconds, 0))),
  };
  switch (kind) {
    case 'KeyDown':
    case 'KeyUp':
      return {
        ...base,
        virtualKey: numberOr(event['virtualKey'], 0),
        scanCode: numberOr(event['scanCode'], 0),
        extended: Boolean(event['extended']),
      };
    case 'MouseButtonDown':
    case 'MouseButtonUp':
      return { ...base, button: String(event['button'] ?? 'Left') };
    case 'MouseMove':
      return {
        ...base,
        deltaX: numberOr(event['deltaX'], 0),
        deltaY: numberOr(event['deltaY'], 0),
        absolute: Boolean(event['absoluteMove']),
      };
    case 'Wheel':
    case 'HorizontalWheel':
      return { ...base, wheelDelta: numberOr(event['wheelDelta'], 0) };
    case 'TypeText':
      return { ...base, text: String(event['text'] ?? '') };
    case 'OverlayText':
      return {
        ...base,
        text: String(event['text'] ?? ''),
        durationMicroseconds: overlayDurationMicroseconds(event),
        showTiming: event['showOverlayTiming'] !== false,
      };
    case 'PixelColorTrigger':
    case 'WaitForPixelGone':
      return {
        ...base,
        pixelX: numberOr(event['pixelX'], 0),
        pixelY: numberOr(event['pixelY'], 0),
        pixelColor: numberOr(event['pixelColor'], 0) & 0xffffff,
        cooldownMilliseconds: numberOr(event['triggerCooldownMilliseconds'], 3000),
        timeoutMilliseconds: numberOr(event['waitTimeoutMilliseconds'], 5000),
      };
    case 'WaitForWindow':
      return {
        ...base,
        waitProcess: String(event['waitProcessName'] ?? ''),
        waitTitle: String(event['waitWindowTitle'] ?? ''),
        timeoutMilliseconds: numberOr(event['waitTimeoutMilliseconds'], 5000),
      };
    case 'WaitForKey':
      return {
        ...base,
        waitKey: numberOr(event['waitKeyVirtualKey'], 0),
        timeoutMilliseconds: numberOr(event['waitTimeoutMilliseconds'], 5000),
      };
    case 'RunMacro':
      return { ...base, subMacro: String(event['subMacroName'] ?? '') };
    case 'GamepadButtonDown':
    case 'GamepadButtonUp':
      return { ...base, gamepadButton: String(event['gamepadButton'] ?? '') };
    case 'GamepadAxis':
      return {
        ...base,
        gamepadAxis: String(event['gamepadAxis'] ?? ''),
        axisValue: numberOr(event['axisValue'], 0),
      };
    default:
      return base;
  }
}

export function buildEnginePlan(macro: MacroDefinition): EnginePlan {
  const playback = (macro.playback ?? {}) as Readonly<Record<string, unknown>>;
  const hotkey = (macro['hotkey'] ?? {}) as Readonly<Record<string, unknown>>;
  const stored = (macro.events ?? []).filter((event) => kindOf(event) !== 'Comment');
  const ordered = stored
    .map((event, index) => ({ event, index }))
    .sort((left, right) => {
      const byTime = numberOr(left.event.timeMicroseconds, 0) - numberOr(right.event.timeMicroseconds, 0);
      if (byTime !== 0) return byTime;
      const leftWait = BLOCKING_WAITS.has(kindOf(left.event)) ? 0 : 1;
      const rightWait = BLOCKING_WAITS.has(kindOf(right.event)) ? 0 : 1;
      return leftWait - rightWait || left.index - right.index;
    })
    .map(({ event }) => event);

  let durationMicroseconds = 0;
  for (const event of ordered) {
    const time = Math.max(0, numberOr(event.timeMicroseconds, 0));
    const extra = kindOf(event) === 'OverlayText' ? overlayDurationMicroseconds(event) : 0;
    durationMicroseconds = Math.max(durationMicroseconds, time + extra);
  }

  const button = String(hotkey['mouseButton'] ?? 'None');
  return {
    macroId: macro.id,
    name: macro.name,
    speed: numberOr(playback['speed'], 1),
    repeatCount: Math.max(0, Math.trunc(numberOr(playback['repeatCount'], 1))),
    repeatDelayMilliseconds: Math.max(0, Math.trunc(numberOr(playback['repeatDelayMilliseconds'], 0))),
    randomizeTiming: Boolean(playback['randomizeTiming']),
    jitterMilliseconds: Math.max(0, Math.trunc(numberOr(playback['timingJitterMilliseconds'], 0))),
    preferScanCodes: Boolean(playback['preferScanCodes']),
    activationMode: String(playback['activationMode'] ?? 'Once'),
    targetMode: String(playback['targetMode'] ?? 'ForegroundAtStart'),
    focusLoss: String(playback['focusLossBehavior'] ?? 'Continue'),
    targetProcess: String(playback['targetProcessName'] ?? ''),
    targetTitle: String(playback['targetWindowTitle'] ?? ''),
    durationMicroseconds: Math.round(durationMicroseconds),
    isAutomatic: isAutomaticMacro(macro),
    enabled: macro.isEnabled !== false,
    hotkeyVirtualKey: numberOr(hotkey['virtualKey'], 0),
    hotkeyButton: button !== 'None' ? button : undefined,
    hotkeyModifiers: hotkeyModifiers(hotkey),
    events: ordered.map(toPlanEvent),
  };
}
