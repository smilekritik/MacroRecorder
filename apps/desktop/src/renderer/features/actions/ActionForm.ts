/**
 * Comprehensive Action Form component for adding and editing all 19 macro action types.
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useLocalization } from '../../hooks/useLocalization.js';
import {
  GamepadAxis,
  GamepadButton,
  type MacroEvent,
  MouseButton,
  type OpenWindowInfo,
} from '../../../../../../packages/contracts/src/index.js';
import {
  getMouseButtonName,
  getVirtualKeyName,
} from '../../../../../../packages/domain/src/model/index.js';
import { ManualActionType } from '../../../../../../packages/domain/src/timeline/types.js';
import { IpcChannels } from '../../../../../../packages/contracts/src/index.js';
import { useApi } from '../../hooks/useApi.js';
import { Button } from '../../design-system/Button.js';
import { Input } from '../../design-system/Input.js';
import { Checkbox } from '../../design-system/Checkbox.js';
import {
  ACTION_OPTIONS,
  createDefaultActionFormData,
  GAMEPAD_AXIS_OPTIONS,
  GAMEPAD_BUTTON_OPTIONS,
  MOUSE_BUTTON_OPTIONS,
} from './action-categories.js';
import {
  buildEventsFromFormData,
  formatRgbHex,
  parseRgbHex,
  validateActionFormData,
} from './ActionFormValidation.js';
import type { ActionDialogSubmitResult, ActionFormData } from './types.js';

export interface ActionFormProps {
  readonly mode?: 'add' | 'edit' | undefined;
  readonly initialEvent?: MacroEvent | undefined;
  readonly suggestedTimeMs?: number | undefined;
  readonly availableMacroNames?: ReadonlyArray<string> | undefined;
  readonly onCancel: () => void;
  readonly onSubmit: (result: ActionDialogSubmitResult, keepOpen: boolean) => void;
}

export function ActionForm({
  mode = 'add',
  initialEvent,
  suggestedTimeMs = 0,
  availableMacroNames = [],
  onCancel,
  onSubmit,
}: ActionFormProps) {
  const api = useApi();
  const [formData, setFormData] = useState<ActionFormData>(() =>
    createDefaultActionFormData(suggestedTimeMs, initialEvent),
  );
  const [validationError, setValidationError] = useState<string>('');
  const [isCapturingKey, setIsCapturingKey] = useState<boolean>(false);
  const [isCapturingWaitKey, setIsCapturingWaitKey] = useState<boolean>(false);
  const [openWindows, setOpenWindows] = useState<ReadonlyArray<OpenWindowInfo>>([]);

  const isEdit = mode === 'edit';
  const { t } = useLocalization();
  const keyCaptureRef = useRef<HTMLInputElement>(null);
  const continueAfterSubmit = useRef(false);
  const [addedCount, setAddedCount] = useState(0);
  const isKeyAction = formData.type === ManualActionType.KeyPress
    || formData.type === ManualActionType.KeyDown
    || formData.type === ManualActionType.KeyUp;

  useEffect(() => {
    if (isKeyAction && !isEdit) keyCaptureRef.current?.focus();
  }, [isKeyAction, isEdit, addedCount]);

  const updateField = useCallback(
    <K extends keyof ActionFormData>(field: K, value: ActionFormData[K]) => {
      setFormData((prev) => ({ ...prev, [field]: value }));
      setValidationError('');
    },
    [],
  );

  // Load windows if available via global window.macroRecorderApi
  const refreshWindows = useCallback(async () => {
    if (typeof window !== 'undefined' && window.macroRecorderApi) {
      try {
        const res = await window.macroRecorderApi.invoke('windows:get-open', {
          requestId: crypto.randomUUID(),
        });
        if (res.success && res.data && Array.isArray((res.data as unknown as { windows: OpenWindowInfo[] }).windows)) {
          setOpenWindows((res.data as unknown as { windows: OpenWindowInfo[] }).windows);
        }
      } catch {
        // Suppress IPC errors in isolated environments
      }
    }
  }, []);

  useEffect(() => {
    if (formData.type === ManualActionType.WaitForWindow) {
      void refreshWindows();
    }
  }, [formData.type, refreshWindows]);

  const selectActionType = (selected: ManualActionType) => {
    setFormData((prev) => {
      const next = { ...prev, type: selected };
      if (selected === ManualActionType.Delay) {
        next.durationMs = '100';
      } else if (
        selected === ManualActionType.KeyPress ||
        selected === ManualActionType.MouseClick ||
        selected === ManualActionType.GamepadPress
      ) {
        next.durationMs = '50';
      }
      if (selected === ManualActionType.WaitForPixelGone) {
        next.waitTimeoutMs = '0';
      } else if (selected === ManualActionType.PixelColorTrigger) {
        next.triggerCooldownMs = '3000';
      }
      return next;
    });
    setValidationError('');
  };

  const handleKeyCaptureKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    e.stopPropagation();
    const vk = e.keyCode || e.which;
    updateField('virtualKey', vk);
    updateField('capturedMouseButton', MouseButton.None);
    setIsCapturingKey(false);
  };

  const handleKeyCaptureMouseDown = (e: React.MouseEvent<HTMLInputElement>) => {
    let button: MouseButton = MouseButton.None;
    if (e.button === 3) button = MouseButton.X1;
    else if (e.button === 4) button = MouseButton.X2;

    if (button !== MouseButton.None) {
      e.preventDefault();
      e.stopPropagation();
      updateField('virtualKey', 0);
      updateField('capturedMouseButton', button);
      setIsCapturingKey(false);
    }
  };

  const handleWaitKeyCaptureKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    e.stopPropagation();
    const vk = e.keyCode || e.which;
    updateField('waitKeyVirtualKey', vk);
    setIsCapturingWaitKey(false);
  };

  // The capture bind works from anywhere on screen, so the form need not have focus.
  useEffect(() => {
    const hotkeys = (api as unknown as {
      hotkeys?: { onTriggered?: (listener: (event: { id: number }) => void) => () => void };
    }).hotkeys;
    return hotkeys?.onTriggered?.((event) => {
      if (event.id !== 5) return;
      void api.invoke(IpcChannels.WINDOWS_INSPECT, { requestId: `pixel-${Date.now()}`, followMouse: true }).then((result) => {
        const snapshot = result.success ? result.data?.snapshot : undefined;
        if (!snapshot) return;
        updateField('pixelX', String(snapshot.mouseScreenX));
        updateField('pixelY', String(snapshot.mouseScreenY));
        updateField('pixelColorHex', `#${Math.max(0, snapshot.rgb).toString(16).padStart(6, '0').toUpperCase()}`);
      });
    });
  }, [api]);

  const handleColorChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.toUpperCase();
    updateField('pixelColorHex', val);
  };

  const copyColorHex = () => {
    const hex = formData.pixelColorHex.startsWith('#')
      ? formData.pixelColorHex
      : `#${formData.pixelColorHex}`;
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      void navigator.clipboard.writeText(hex);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const validation = validateActionFormData(formData);
    if (!validation.isValid) {
      setValidationError(validation.errorMessage ?? 'Validation failed.');
      return;
    }

    const result = buildEventsFromFormData(formData, initialEvent);
    const keepOpen = continueAfterSubmit.current;
    continueAfterSubmit.current = false;
    onSubmit(result, keepOpen);
    if (keepOpen) {
      // The next action starts where this one ends, which is what a sequence usually wants.
      const start = Number(formData.startTimeMs) || 0;
      const held = formData.type === ManualActionType.KeyPress
        || formData.type === ManualActionType.MouseClick
        || formData.type === ManualActionType.GamepadPress
        || formData.type === ManualActionType.Delay;
      setFormData((previous) => ({
        ...previous,
        startTimeMs: String(start + (held ? Number(formData.durationMs) || 0 : 0)),
        virtualKey: 0,
        capturedMouseButton: MouseButton.None,
        actionComment: '',
      }));
      setAddedCount((count) => count + 1);
    }
  };

  // Color swatch style
  const parsedRgb = parseRgbHex(formData.pixelColorHex);
  const swatchBg = parsedRgb.success ? formatRgbHex(parsedRgb.color) : 'transparent';

  // Duration label
  const durationLabel =
    formData.type === ManualActionType.Delay ? t('Pause duration') : t('Hold duration');

  // Categories rendering
  const categories = Array.from(new Set(ACTION_OPTIONS.map((opt) => opt.category)));
  const activeOption = ACTION_OPTIONS.find((option) => option.type === formData.type);
  const activeCategory = activeOption?.category ?? categories[0];

  return React.createElement(
    'form',
    {
      onSubmit: handleSubmit,
      className: 'flex flex-col gap-4 text-[var(--color-text-primary)] select-none text-[14px]',
    },
    // Action Type & Start Time Row
    React.createElement(
      'div',
      { className: 'flex flex-col gap-4' },
      React.createElement(
        'div',
        { className: 'flex flex-col gap-2' },
        React.createElement(
          'span',
          { className: 'text-[var(--color-text-secondary)] font-medium' },
          t('Action type'),
        ),
        React.createElement(
          'div',
          { role: 'tablist', 'aria-label': t('Action type'), className: 'flex flex-wrap gap-1' },
          categories.map((category) =>
            React.createElement(
              'button',
              {
                key: category,
                type: 'button',
                role: 'tab',
                'aria-selected': category === activeCategory,
                onClick: () => {
                  const first = ACTION_OPTIONS.find((option) => option.category === category);
                  if (first) selectActionType(first.type);
                },
                className: `action-picker-category ${category === activeCategory ? 'is-active' : ''}`,
              },
              t(category),
            ),
          ),
        ),
        React.createElement(
          'div',
          { 'data-testid': 'action-type-picker', className: 'flex flex-wrap gap-1.5' },
          ACTION_OPTIONS.filter((option) => option.category === activeCategory).map((option) =>
            React.createElement(
              'button',
              {
                key: option.type,
                type: 'button',
                'aria-pressed': option.type === formData.type,
                onClick: () => selectActionType(option.type),
                className: `action-picker-option ${option.type === formData.type ? 'is-active' : ''}`,
              },
              t(option.label),
            ),
          ),
        ),
        activeOption &&
          React.createElement(
            'span',
            { className: 'text-[12px] text-[var(--color-text-muted)]' },
            t(activeOption.description ?? ''),
          ),
      ),
      React.createElement(
        'div',
        { className: 'grid grid-cols-2 gap-4' },
      React.createElement(
        'div',
        { className: 'flex flex-col gap-1.5' },
        React.createElement(Input, {
          label: t('Start time, ms'),
          value: formData.startTimeMs,
          onChange: (e) => updateField('startTimeMs', e.target.value),
          helperText: t('From the start of the macro.'),
        }),
      ),
    (formData.type === ManualActionType.KeyPress ||
      formData.type === ManualActionType.MouseClick ||
      formData.type === ManualActionType.GamepadPress ||
      formData.type === ManualActionType.Delay) &&
      React.createElement(
        'div',
        { className: 'flex flex-col gap-1.5' },
        React.createElement(Input, {
          label: durationLabel,
          value: formData.durationMs,
          onChange: (e) => updateField('durationMs', e.target.value),
          helperText: t('Value in milliseconds.'),
        }),
      ),
      ),
    ),

    // Keyboard Category Panel (KeyPress, KeyDown, KeyUp)
    (formData.type === ManualActionType.KeyPress ||
      formData.type === ManualActionType.KeyDown ||
      formData.type === ManualActionType.KeyUp) &&
      React.createElement(
        'div',
        {
          className:
            'p-4 rounded-[8px] bg-[var(--color-surface-raised)] border border-[var(--color-border-subtle)] flex flex-col gap-3',
        },
        React.createElement(
          'div',
          { className: 'flex flex-col gap-1.5' },
          React.createElement(
            'label',
            { className: 'text-[var(--color-text-secondary)]' },
            t('Press a key in the field'),
          ),
          React.createElement('input', {
            type: 'text',
            readOnly: true,
            value: isCapturingKey
              ? t('Press any key or extra mouse button...')
              : formData.capturedMouseButton !== MouseButton.None
                ? getMouseButtonName(formData.capturedMouseButton)
                : formData.virtualKey !== 0
                  ? getVirtualKeyName(formData.virtualKey)
                  : t('Field not selected'),
            'aria-label': t('Press a key in the field'),
            ref: keyCaptureRef,
            onFocus: () => setIsCapturingKey(true),
            onClick: () => setIsCapturingKey(true),
            onBlur: () => setIsCapturingKey(false),
            onKeyDown: handleKeyCaptureKeyDown,
            onMouseDown: handleKeyCaptureMouseDown,
            className:
              'min-h-[40px] px-3 py-2 rounded-[6px] bg-[var(--color-input-background)] border border-[var(--color-border)] text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-accent)]',
          }),
          React.createElement(
            'span',
            { className: 'text-[12px] text-[var(--color-text-muted)]' },
            t('Press the key you need. Extra mouse buttons work too.'),
          ),
        ),
      ),

    // Mouse Button Panel (MouseClick, MouseDown, MouseUp)
    (formData.type === ManualActionType.MouseClick ||
      formData.type === ManualActionType.MouseDown ||
      formData.type === ManualActionType.MouseUp) &&
      React.createElement(
        'div',
        {
          className:
            'p-4 rounded-[8px] bg-[var(--color-surface-raised)] border border-[var(--color-border-subtle)] flex flex-col gap-3',
        },
        React.createElement('h3', { className: 'text-[15px] font-semibold' }, t('Mouse button')),
        React.createElement(
          'select',
          {
            value: formData.mouseButton,
            onChange: (e: React.ChangeEvent<HTMLSelectElement>) =>
              updateField('mouseButton', e.target.value as MouseButton),
            className:
              'min-h-[40px] px-3 py-2 rounded-[6px] bg-[var(--color-input-background)] border border-[var(--color-border)] text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-accent)]',
          },
          MOUSE_BUTTON_OPTIONS.map((opt) =>
            React.createElement('option', { key: opt.button, value: opt.button }, opt.label),
          ),
        ),
        React.createElement(
          'span',
          { className: 'text-[12px] text-[var(--color-text-muted)]' },
          t('The click occurs at the current cursor position. Coordinates are not stored.'),
        ),
      ),

    // Mouse Move Panel
    formData.type === ManualActionType.MouseMove &&
      React.createElement(
        'div',
        {
          className:
            'p-4 rounded-[8px] bg-[var(--color-surface-raised)] border border-[var(--color-border-subtle)] flex flex-col gap-3',
        },
        React.createElement('h3', { className: 'text-[15px] font-semibold' }, t('Mouse movement')),
        React.createElement(
          'div',
          { className: 'grid grid-cols-2 gap-4' },
          React.createElement(Input, {
            label: t('X offset'),
            value: formData.deltaX,
            onChange: (e) => updateField('deltaX', e.target.value),
          }),
          React.createElement(Input, {
            label: t('Y offset'),
            value: formData.deltaY,
            onChange: (e) => updateField('deltaY', e.target.value),
          }),
        ),
      ),

    // Wheel & Horizontal Wheel Panel
    (formData.type === ManualActionType.Wheel ||
      formData.type === ManualActionType.HorizontalWheel) &&
      React.createElement(
        'div',
        {
          className:
            'p-4 rounded-[8px] bg-[var(--color-surface-raised)] border border-[var(--color-border-subtle)] flex flex-col gap-3',
        },
        React.createElement('h3', { className: 'text-[15px] font-semibold' }, t('Scrolling')),
        React.createElement(Input, {
          label: t('Wheel delta'),
          value: formData.wheelDelta,
          onChange: (e) => updateField('wheelDelta', e.target.value),
          helperText: t('120 is one step up or right; −120 is down or left.'),
        }),
      ),

    // Gamepad Button Panel
    (formData.type === ManualActionType.GamepadPress ||
      formData.type === ManualActionType.GamepadButtonDown ||
      formData.type === ManualActionType.GamepadButtonUp) &&
      React.createElement(
        'div',
        {
          className:
            'p-4 rounded-[8px] bg-[var(--color-surface-raised)] border border-[var(--color-border-subtle)] flex flex-col gap-3',
        },
        React.createElement('h3', { className: 'text-[15px] font-semibold' }, t('Gamepad button')),
        React.createElement(
          'select',
          {
            value: formData.gamepadButton,
            onChange: (e: React.ChangeEvent<HTMLSelectElement>) =>
              updateField('gamepadButton', e.target.value as GamepadButton),
            className:
              'min-h-[40px] px-3 py-2 rounded-[6px] bg-[var(--color-input-background)] border border-[var(--color-border)] text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-accent)]',
          },
          GAMEPAD_BUTTON_OPTIONS.map((opt) =>
            React.createElement('option', { key: opt.button, value: opt.button }, opt.label),
          ),
        ),
        React.createElement(
          'span',
          { className: 'text-[12px] text-[var(--color-text-muted)]' },
          t('Sent to a virtual gamepad (requires the ViGEmBus driver).'),
        ),
      ),

    // Gamepad Axis Panel
    formData.type === ManualActionType.GamepadAxis &&
      React.createElement(
        'div',
        {
          className:
            'p-4 rounded-[8px] bg-[var(--color-surface-raised)] border border-[var(--color-border-subtle)] flex flex-col gap-3',
        },
        React.createElement('h3', { className: 'text-[15px] font-semibold' }, t('Gamepad axis')),
        React.createElement(
          'div',
          { className: 'grid grid-cols-1 md:grid-cols-2 gap-4' },
          React.createElement(
            'div',
            { className: 'flex flex-col gap-1.5' },
            React.createElement('label', { className: 'text-[var(--color-text-secondary)]' }, 'Axis'),
            React.createElement(
              'select',
              {
                value: formData.gamepadAxis,
                onChange: (e: React.ChangeEvent<HTMLSelectElement>) =>
                  updateField('gamepadAxis', e.target.value as GamepadAxis),
                className:
                  'min-h-[40px] px-3 py-2 rounded-[6px] bg-[var(--color-input-background)] border border-[var(--color-border)] text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-accent)]',
              },
              GAMEPAD_AXIS_OPTIONS.map((opt) =>
                React.createElement('option', { key: opt.axis, value: opt.axis }, opt.label),
              ),
            ),
          ),
          React.createElement(Input, {
            label: t('Axis value'),
            value: formData.axisValue,
            onChange: (e) => updateField('axisValue', e.target.value),
          }),
        ),
        React.createElement(
          'span',
          { className: 'text-[12px] text-[var(--color-text-muted)]' },
          t('Stick: −32768 to 32767 (0 is center). Trigger: 0 to 255.'),
        ),
      ),

    // Type Text Panel
    formData.type === ManualActionType.TypeText &&
      React.createElement(
        'div',
        {
          className:
            'p-4 rounded-[8px] bg-[var(--color-surface-raised)] border border-[var(--color-border-subtle)] flex flex-col gap-3',
        },
        React.createElement('h3', { className: 'text-[15px] font-semibold' }, t('Type text')),
        React.createElement(
          'span',
          { className: 'text-[12px] text-[var(--color-text-muted)]' },
          t('The string is typed into the active window as Unicode characters, independent of the keyboard layout.'),
        ),
        React.createElement(
          'textarea',
          {
            value: formData.typeText,
            onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) =>
              updateField('typeText', e.target.value),
            placeholder: t('Text to type...'),
            rows: 4,
            className:
              'w-full p-3 rounded-[6px] bg-[var(--color-input-background)] border border-[var(--color-border)] text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-accent)] resize-y',
          },
        ),
      ),

    // Overlay Text Panel
    formData.type === ManualActionType.OverlayText &&
      React.createElement(
        'div',
        {
          className:
            'p-4 rounded-[8px] bg-[var(--color-surface-raised)] border border-[var(--color-border-subtle)] flex flex-col gap-3',
        },
        React.createElement('h3', { className: 'text-[15px] font-semibold' }, t('Overlay text')),
        React.createElement(
          'textarea',
          {
            maxLength: 240,
            value: formData.overlayText,
            onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) =>
              updateField('overlayText', e.target.value),
            placeholder: t('Prompt text to display in overlay...'),
            rows: 3,
            className:
              'w-full p-3 rounded-[6px] bg-[var(--color-input-background)] border border-[var(--color-border)] text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-accent)] resize-y',
          },
        ),
        React.createElement(Input, {
          label: t('End time, ms'),
          value: formData.overlayEndTimeMs,
          onChange: (e) => updateField('overlayEndTimeMs', e.target.value),
        }),
        React.createElement(Checkbox, {
          label: t('Show countdown until hidden'),
          checked: formData.showOverlayTiming,
          onChange: (checked) => updateField('showOverlayTiming', checked),
        }),
        React.createElement(
          'span',
          { className: 'text-[12px] text-[var(--color-text-muted)]' },
          t('A prompt does not press anything. It is displayed from the start time until this point and can show the remaining time.'),
        ),
      ),

    // Pixel Trigger & WaitForPixelGone Panel
    (formData.type === ManualActionType.PixelColorTrigger ||
      formData.type === ManualActionType.WaitForPixelGone) &&
      React.createElement(
        'div',
        {
          className:
            'p-4 rounded-[8px] bg-[var(--color-surface-raised)] border border-[var(--color-border-subtle)] flex flex-col gap-3',
        },
        React.createElement(
          'h3',
          { className: 'text-[15px] font-semibold' },
          formData.type === ManualActionType.WaitForPixelGone
            ? 'Wait for color to disappear'
            : 'Pixel color trigger',
        ),
        React.createElement(
          'span',
          { className: 'text-[12px] text-[var(--color-text-muted)]' },
          formData.type === ManualActionType.WaitForPixelGone
            ? "The macro pauses on this step and resumes when the selected pixel's color no longer matches."
            : 'The macro pauses at this action and continues when the selected pixel color matches.',
        ),
        React.createElement(
          'div',
          { className: 'grid grid-cols-2 gap-4' },
          React.createElement(Input, {
            label: t('X'),
            value: formData.pixelX,
            onChange: (e) => updateField('pixelX', e.target.value),
          }),
          React.createElement(Input, {
            label: t('Y'),
            value: formData.pixelY,
            onChange: (e) => updateField('pixelY', e.target.value),
          }),
        ),
        React.createElement(
          'div',
          { className: 'flex flex-col gap-1.5' },
          React.createElement(
            'label',
            { className: 'text-[var(--color-text-secondary)] font-medium' },
            t('Pixel color'),
          ),
          React.createElement(
            'div',
            { className: 'flex items-center gap-3' },
            React.createElement('div', {
              className: 'w-12 h-10 rounded-[6px] border border-[var(--color-border)] shadow-sm shrink-0',
              style: { backgroundColor: swatchBg },
            }),
            React.createElement('input', {
              type: 'text',
              value: formData.pixelColorHex,
              onChange: handleColorChange,
              maxLength: 7,
              placeholder: t('#000000'),
              className:
                'flex-1 min-h-[40px] px-3 py-2 uppercase rounded-[6px] bg-[var(--color-input-background)] border border-[var(--color-border)] text-[var(--color-text-primary)] font-mono focus:outline-none focus:border-[var(--color-accent)]',
            }),
            React.createElement(
              Button,
              { size: 'sm', variant: 'base', onClick: copyColorHex },
              'Copy code',
            ),
          ),
        ),
        React.createElement(Input, {
          label:
            formData.type === ManualActionType.WaitForPixelGone
              ? 'Wait timeout, ms (0 = no limit)'
              : 'Rearm delay, ms',
          value:
            formData.type === ManualActionType.WaitForPixelGone
              ? formData.waitTimeoutMs
              : formData.triggerCooldownMs,
          onChange: (e) =>
            updateField(
              formData.type === ManualActionType.WaitForPixelGone
                ? 'waitTimeoutMs'
                : 'triggerCooldownMs',
              e.target.value,
            ),
          helperText:
            formData.type === ManualActionType.WaitForPixelGone
              ? 'If the color does not disappear within this time, the macro continues anyway. 0 waits forever.'
              : 'After execution, the macro will resume checking the color after this delay.',
        }),
      ),

    // Wait for Window Panel
    formData.type === ManualActionType.WaitForWindow &&
      React.createElement(
        'div',
        {
          className:
            'p-4 rounded-[8px] bg-[var(--color-surface-raised)] border border-[var(--color-border-subtle)] flex flex-col gap-3',
        },
        React.createElement('h3', { className: 'text-[15px] font-semibold' }, t('Wait for a window')),
        React.createElement(
          'span',
          { className: 'text-[12px] text-[var(--color-text-muted)]' },
          t('The macro pauses on this step and resumes when the selected window becomes active.'),
        ),
        React.createElement(
          'div',
          { className: 'flex items-center gap-2' },
          React.createElement(
            'select',
            {
              value: formData.waitProcessName || formData.waitWindowTitle,
              onChange: (e: React.ChangeEvent<HTMLSelectElement>) => {
                const win = openWindows.find(
                  (w) => w.processName === e.target.value || w.title === e.target.value,
                );
                if (win) {
                  updateField('waitProcessName', win.processName);
                  updateField('waitWindowTitle', win.title);
                } else {
                  updateField('waitProcessName', e.target.value);
                  updateField('waitWindowTitle', '');
                }
              },
              className:
                'flex-1 min-h-[40px] px-3 py-2 rounded-[6px] bg-[var(--color-input-background)] border border-[var(--color-border)] text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-accent)]',
            },
            React.createElement('option', { value: '' }, '-- Select window --'),
            openWindows.map((win, idx) =>
              React.createElement(
                'option',
                { key: idx, value: win.processName },
                win.title ? `${win.title} — ${win.processName}` : win.processName,
              ),
            ),
          ),
          React.createElement(
            Button,
            { size: 'sm', variant: 'base', onClick: refreshWindows },
            'Refresh list',
          ),
        ),
        formData.waitProcessName &&
          React.createElement(
            'span',
            { className: 'text-[12px] text-[var(--color-text-muted)]' },
            `Selected: ${formData.waitWindowTitle ? `${formData.waitWindowTitle} — ` : ''}${formData.waitProcessName}`,
          ),
        React.createElement(Input, {
          label: t('Wait timeout, ms (0 = no limit)'),
          value: formData.waitTimeoutMs,
          onChange: (e) => updateField('waitTimeoutMs', e.target.value),
          helperText:
            t('If the window does not appear within this time, the macro continues anyway. 0 waits forever.'),
        }),
      ),

    // Wait for Key Panel
    formData.type === ManualActionType.WaitForKey &&
      React.createElement(
        'div',
        {
          className:
            'p-4 rounded-[8px] bg-[var(--color-surface-raised)] border border-[var(--color-border-subtle)] flex flex-col gap-3',
        },
        React.createElement('h3', { className: 'text-[15px] font-semibold' }, t('Wait for a key press')),
        React.createElement(
          'span',
          { className: 'text-[12px] text-[var(--color-text-muted)]' },
          t('The macro pauses on this step and resumes when the user presses the specified key.'),
        ),
        React.createElement(
          'div',
          { className: 'flex flex-col gap-1.5' },
          React.createElement('label', { className: 'text-[var(--color-text-secondary)]' }, 'Press a key in the field'),
          React.createElement('input', {
            type: 'text',
            readOnly: true,
            value: isCapturingWaitKey
              ? 'Press any key...'
              : formData.waitKeyVirtualKey !== 0
                ? getVirtualKeyName(formData.waitKeyVirtualKey)
                : t('Field not selected'),
            'aria-label': t('Press a key in the field'),
            onFocus: () => setIsCapturingWaitKey(true),
            onBlur: () => setIsCapturingWaitKey(false),
            onKeyDown: handleWaitKeyCaptureKeyDown,
            className:
              'min-h-[40px] px-3 py-2 rounded-[6px] bg-[var(--color-input-background)] border border-[var(--color-border)] text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-accent)]',
          }),
        ),
        React.createElement(Input, {
          label: t('Wait timeout, ms (0 = no limit)'),
          value: formData.waitTimeoutMs,
          onChange: (e) => updateField('waitTimeoutMs', e.target.value),
        }),
      ),

    // Run Macro Panel
    formData.type === ManualActionType.RunMacro &&
      React.createElement(
        'div',
        {
          className:
            'p-4 rounded-[8px] bg-[var(--color-surface-raised)] border border-[var(--color-border-subtle)] flex flex-col gap-3',
        },
        React.createElement('h3', { className: 'text-[15px] font-semibold' }, t('Run macro')),
        React.createElement(
          'span',
          { className: 'text-[12px] text-[var(--color-text-muted)]' },
          t('The selected macro plays in full at this moment with its own settings (speed, repeat, randomization), then the current macro continues.'),
        ),
        React.createElement(
          'select',
          {
            value: formData.subMacroName,
            onChange: (e: React.ChangeEvent<HTMLSelectElement>) =>
              updateField('subMacroName', e.target.value),
            className:
              'min-h-[40px] px-3 py-2 rounded-[6px] bg-[var(--color-input-background)] border border-[var(--color-border)] text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-accent)]',
          },
          React.createElement('option', { value: '' }, '-- Select macro to run --'),
          availableMacroNames.map((name) =>
            React.createElement('option', { key: name, value: name }, name),
          ),
        ),
      ),

    // Comment Row Panel (Notes)
    formData.type === ManualActionType.Comment &&
      React.createElement(
        'div',
        {
          className:
            'p-4 rounded-[8px] bg-[var(--color-surface-raised)] border border-[var(--color-border-subtle)] flex flex-col gap-3',
        },
        React.createElement('h3', { className: 'text-[15px] font-semibold' }, t('Comment row')),
        React.createElement(
          'span',
          { className: 'text-[12px] text-[var(--color-text-muted)]' },
          t('An empty timeline row: it presses nothing and takes no time. You can leave the text empty and type it later directly in the table.'),
        ),
        React.createElement(Input, {
          label: t('Text'),
          maxLength: 240,
          value: formData.commentRowText,
          onChange: (e) => updateField('commentRowText', e.target.value),
        }),
      ),

    // Action Comment (for non-comment rows)
    formData.type !== ManualActionType.Comment &&
      React.createElement(Input, {
        label: t('Action comment'),
        maxLength: 240,
        value: formData.actionComment,
        onChange: (e) => updateField('actionComment', e.target.value),
      }),

    // Validation Error Text
    validationError &&
      React.createElement(
        'div',
        { className: 'text-[var(--color-danger)] font-medium text-[13px] px-1 py-0.5' },
        validationError,
      ),

    // Dialog Footer Action Buttons
    React.createElement(
      'div',
      { className: 'sticky bottom-0 -mx-6 -mb-6 px-6 py-3 flex items-center justify-between border-t border-[var(--color-border-subtle)] bg-[var(--color-surface)]' },
      React.createElement(
        Button,
        {
          type: 'button',
          variant: 'base',
          onClick: onCancel,
          className: 'min-w-[110px]',
        },
        t('Cancel'),
      ),
      React.createElement(
        'div',
        { className: 'flex items-center gap-2' },
        addedCount > 0 &&
          React.createElement(
            'span',
            { className: 'text-[12px] text-[var(--color-text-secondary)]' },
            `${t('Added')}: ${addedCount}`,
          ),
        !isEdit &&
          React.createElement(
            Button,
            {
              type: 'submit',
              variant: 'base',
              onClick: () => {
                continueAfterSubmit.current = true;
              },
            },
            t('Add and continue'),
          ),
        React.createElement(
          Button,
          {
            type: 'submit',
            variant: 'accent',
            className: 'min-w-[160px]',
          },
          isEdit ? t('Save action') : t('Add to timeline'),
        ),
      ),
    ),
  );
}
