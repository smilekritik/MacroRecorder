/**
 * Decision dialog when navigating away from a macro with unsaved changes.
 * Guarantees that unsaved changes cannot be lost through selection, close, or import flows.
 */

import React from 'react';
import { Modal } from '../../design-system/Modal.js';
import { Button } from '../../design-system/Button.js';
import type { SaveDiscardPromptDialogProps } from './types.js';

export function SaveDiscardPromptDialog({
  isOpen,
  macroName,
  onSave,
  onDiscard,
  onCancel,
}: SaveDiscardPromptDialogProps) {
  return React.createElement(
    Modal,
    {
      isOpen,
      onClose: onCancel,
      title: 'Unsaved changes',
      description: `You have unsaved changes in macro “${macroName || 'Untitled'}”. Do you want to save them before continuing?`,
      maxWidth: 'max-w-md',
      closeOnEscape: true,
      closeOnBackdropClick: false,
    },
    React.createElement(
      'div',
      { className: 'flex flex-col gap-4 pt-2' },
      React.createElement(
        'div',
        { className: 'flex items-center justify-end gap-2' },
        React.createElement(
          Button,
          {
            variant: 'base',
            size: 'sm',
            onClick: onCancel,
          },
          'Cancel',
        ),
        React.createElement(
          Button,
          {
            variant: 'danger',
            size: 'sm',
            onClick: onDiscard,
          },
          'Discard changes',
        ),
        React.createElement(
          Button,
          {
            variant: 'save',
            size: 'sm',
            onClick: onSave,
          },
          'Save changes',
        ),
      ),
    ),
  );
}
