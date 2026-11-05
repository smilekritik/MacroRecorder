import { describe, it, expect } from 'vitest';
import {
  buildEventsFromFormData,
  formatRgbHex,
  parseRgbHex,
  validateActionFormData,
} from '../ActionFormValidation.js';
import { createDefaultActionFormData } from '../action-categories.js';
import { ManualActionType } from '../../../../../../../packages/domain/src/timeline/types.js';
import {
  GamepadButton,
  MacroEventType,
  MouseButton,
} from '../../../../../../../packages/contracts/src/index.js';

describe('Action form validation and event synthesis', () => {
  it('parses and formats RGB hex codes accurately', () => {
    expect(parseRgbHex('#57E06A')).toEqual({ success: true, color: 0x57e06a });
    expect(parseRgbHex('57E06A')).toEqual({ success: true, color: 0x57e06a });
    expect(parseRgbHex('#000000')).toEqual({ success: true, color: 0 });
    expect(parseRgbHex('#FFFFFF')).toEqual({ success: true, color: 0xffffff });
    expect(parseRgbHex('invalid').success).toBe(false);
    expect(parseRgbHex('#12345').success).toBe(false);

    expect(formatRgbHex(0x57e06a)).toBe('#57E06A');
    expect(formatRgbHex(0)).toBe('#000000');
  });

  it('rejects invalid or negative start times', () => {
    const data = { ...createDefaultActionFormData(), startTimeMs: '-10' };
    const res = validateActionFormData(data);
    expect(res.isValid).toBe(false);
    expect(res.errorMessage).toBe('Enter a valid start time: zero or a positive number.');
  });

  it('rejects key actions without selected key or button', () => {
    const data = { ...createDefaultActionFormData(), type: ManualActionType.KeyPress, virtualKey: 0 };
    const res = validateActionFormData(data);
    expect(res.isValid).toBe(false);
    expect(res.errorMessage).toBe('Select a key or an extra mouse button first.');
  });

  it('rejects press actions with non-positive duration', () => {
    const data = {
      ...createDefaultActionFormData(),
      type: ManualActionType.KeyPress,
      virtualKey: 0x41,
      durationMs: '0',
    };
    const res = validateActionFormData(data);
    expect(res.isValid).toBe(false);
    expect(res.errorMessage).toBe('Duration must be greater than zero.');
  });

  it('synthesizes KeyPress pair with hold duration', () => {
    const data = {
      ...createDefaultActionFormData(),
      type: ManualActionType.KeyPress,
      startTimeMs: '100',
      durationMs: '50',
      virtualKey: 0x41,
      actionComment: 'my key',
    };
    expect(validateActionFormData(data).isValid).toBe(true);

    const submit = buildEventsFromFormData(data);
    expect(submit.events.length).toBe(2);
    expect(submit.events[0]!.type).toBe(MacroEventType.KeyDown);
    expect(submit.events[0]!.timeMicroseconds).toBe(100_000);
    expect(submit.events[0]!.comment).toBe('my key');

    expect(submit.events[1]!.type).toBe(MacroEventType.KeyUp);
    expect(submit.events[1]!.timeMicroseconds).toBe(150_000);
    expect(submit.shiftAfterMicroseconds).toBe(100_000);
    expect(submit.shiftDurationMicroseconds).toBe(50_000);
  });

  it('synthesizes MouseClick pair with hold duration', () => {
    const data = {
      ...createDefaultActionFormData(),
      type: ManualActionType.MouseClick,
      startTimeMs: '200',
      durationMs: '40',
      mouseButton: MouseButton.Right,
    };
    expect(validateActionFormData(data).isValid).toBe(true);

    const submit = buildEventsFromFormData(data);
    expect(submit.events.length).toBe(2);
    expect(submit.events[0]!.type).toBe(MacroEventType.MouseButtonDown);
    expect(submit.events[0]!.timeMicroseconds).toBe(200_000);
    expect(submit.events[1]!.type).toBe(MacroEventType.MouseButtonUp);
    expect(submit.events[1]!.timeMicroseconds).toBe(240_000);
  });

  it('synthesizes GamepadPress pair with hold duration', () => {
    const data = {
      ...createDefaultActionFormData(),
      type: ManualActionType.GamepadPress,
      startTimeMs: '50',
      durationMs: '60',
      gamepadButton: GamepadButton.X,
    };
    expect(validateActionFormData(data).isValid).toBe(true);

    const submit = buildEventsFromFormData(data);
    expect(submit.events.length).toBe(2);
    expect(submit.events[0]!.type).toBe(MacroEventType.GamepadButtonDown);
    expect(submit.events[0]!.timeMicroseconds).toBe(50_000);
    expect(submit.events[1]!.type).toBe(MacroEventType.GamepadButtonUp);
    expect(submit.events[1]!.timeMicroseconds).toBe(110_000);
  });

  it('synthesizes PixelColorTrigger with validated coordinates and cooldown', () => {
    const data = {
      ...createDefaultActionFormData(),
      type: ManualActionType.PixelColorTrigger,
      startTimeMs: '0',
      pixelX: '120',
      pixelY: '340',
      pixelColorHex: '#57E06A',
      triggerCooldownMs: '3000',
    };
    expect(validateActionFormData(data).isValid).toBe(true);

    const submit = buildEventsFromFormData(data);
    expect(submit.events.length).toBe(1);
    const ev = submit.events[0]!;
    expect(ev.type).toBe(MacroEventType.PixelColorTrigger);
    expect((ev as { pixelX?: number }).pixelX).toBe(120);
    expect((ev as { pixelY?: number }).pixelY).toBe(340);
    expect((ev as { pixelColor?: number }).pixelColor).toBe(0x57e06a);
    expect((ev as { triggerCooldownMilliseconds?: number }).triggerCooldownMilliseconds).toBe(3000);
  });

  it('synthesizes Delay and Comment rows accurately', () => {
    const delayData = {
      ...createDefaultActionFormData(),
      type: ManualActionType.Delay,
      startTimeMs: '100',
      durationMs: '200',
    };
    expect(validateActionFormData(delayData).isValid).toBe(true);
    const delaySubmit = buildEventsFromFormData(delayData);
    expect(delaySubmit.events.length).toBe(1);
    expect(delaySubmit.events[0]!.type).toBe(MacroEventType.Delay);
    expect(delaySubmit.events[0]!.timeMicroseconds).toBe(300_000);

    const commentData = {
      ...createDefaultActionFormData(),
      type: ManualActionType.Comment,
      startTimeMs: '100',
      commentRowText: 'My checkpoint',
    };
    expect(validateActionFormData(commentData).isValid).toBe(true);
    const commentSubmit = buildEventsFromFormData(commentData);
    expect(commentSubmit.events.length).toBe(1);
    expect(commentSubmit.events[0]!.type).toBe(MacroEventType.Comment);
    expect((commentSubmit.events[0] as { text?: string }).text).toBe('My checkpoint');
    expect(commentSubmit.shiftDurationMicroseconds).toBe(0);
  });
});
