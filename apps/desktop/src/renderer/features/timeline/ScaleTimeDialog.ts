/**
 * Scale Time Dialog for scaling timeline action timestamps and durations by a factor.
 */

import React, { useState } from 'react';
import { Modal } from '../../design-system/Modal.js';
import { Button } from '../../design-system/Button.js';
import { Input } from '../../design-system/Input.js';
import type { ScaleTimeDialogProps } from './types.js';

export function ScaleTimeDialog({ isOpen, onClose, onScale }: ScaleTimeDialogProps) {
  const [factorText, setFactorText] = useState('1.0');
  const [errorText, setErrorText] = useState('');

  const handlePreset = (factor: number) => {
    onScale(factor);
    onClose();
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const factor = Number(factorText);
    if (!Number.isFinite(factor) || factor < 0.1 || factor > 10.0) {
      setErrorText('Enter a scaling factor between 0.1 and 10.0.');
      return;
    }
    setErrorText('');
    onScale(factor);
    onClose();
  };

  return React.createElement(
    Modal,
    {
      isOpen,
      onClose,
      title: 'Scale timeline timings',
      description:
        'Multiplies all timestamps and overlay durations by the specified factor. Values below 1.0 make the macro faster; values above 1.0 make it slower.',
      maxWidth: 'max-w-md',
      closeOnEscape: true,
      closeOnBackdropClick: false,
    },
    React.createElement(
      'form',
      { onSubmit: handleSubmit, className: 'flex flex-col gap-4 pt-2 text-[14px]' },
      // Quick preset buttons
      React.createElement(
        'div',
        { className: 'flex flex-col gap-1.5' },
        React.createElement(
          'span',
          { className: 'text-[var(--color-text-secondary)] font-medium text-[13px]' },
          'Quick presets',
        ),
        React.createElement(
          'div',
          { className: 'grid grid-cols-2 gap-2' },
          React.createElement(
            Button,
            {
              type: 'button',
              variant: 'base',
              size: 'sm',
              onClick: () => handlePreset(0.5),
            },
            '0.5x (Double speed)',
          ),
          React.createElement(
            Button,
            {
              type: 'button',
              variant: 'base',
              size: 'sm',
              onClick: () => handlePreset(2.0),
            },
            '2.0x (Half speed)',
          ),
        ),
      ),

      // Custom factor input
      React.createElement(
        'div',
        { className: 'flex flex-col gap-1' },
        React.createElement(Input, {
          label: 'Custom scale factor (0.1 — 10.0)',
          value: factorText,
          onChange: (e) => {
            setFactorText(e.target.value);
            setErrorText('');
          },
          errorMessage: errorText,
          placeholder: '1.0',
        }),
      ),

      // Actions
      React.createElement(
        'div',
        { className: 'flex items-center justify-end gap-2 pt-2 border-t border-[var(--color-border-subtle)]' },
        React.createElement(
          Button,
          {
            type: 'button',
            variant: 'base',
            size: 'sm',
            onClick: onClose,
          },
          'Cancel',
        ),
        React.createElement(
          Button,
          {
            type: 'submit',
            variant: 'accent',
            size: 'sm',
          },
          'Apply scaling',
        ),
      ),
    ),
  );
}
