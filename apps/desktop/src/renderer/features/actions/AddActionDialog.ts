/**
 * Modal dialog hosting the ActionForm for adding and editing timeline events.
 */

import React from 'react';
import { Modal } from '../../design-system/Modal.js';
import { useLocalization } from '../../hooks/useLocalization.js';
import { ActionForm } from './ActionForm.js';
import type { AddActionDialogProps } from './types.js';

export function AddActionDialog({
  isOpen,
  mode = 'add',
  initialEvent,
  suggestedTimeMs = 0,
  availableMacroNames = [],
  onClose,
  onSubmit,
}: AddActionDialogProps) {
  const { t } = useLocalization();
  const title = mode === 'edit' ? t('Edit action') : t('Add action');
  const description =
    mode === 'edit'
      ? t('Change the selected event parameters. After confirmation, it will be replaced in the timeline.')
      : t('The action will be added to the timeline of the selected macro.');

  return React.createElement(
    Modal,
    {
      isOpen,
      onClose,
      title,
      description,
      maxWidth: 'max-w-2xl',
      closeOnEscape: true,
      closeOnBackdropClick: false, // Don't lose form changes by clicking outside accidentally
    },
    React.createElement(ActionForm, {
      mode,
      initialEvent,
      suggestedTimeMs,
      availableMacroNames,
      onCancel: onClose,
      onSubmit: (result, keepOpen) => {
        onSubmit(result);
        if (!keepOpen) onClose();
      },
    }),
  );
}
