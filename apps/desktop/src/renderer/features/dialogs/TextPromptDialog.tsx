/**
 * @macro-recorder/desktop - Text Prompt Dialog
 * Input prompt dialog for creating folders, renaming macros, etc.
 */

import React, { useState } from 'react';
import { Modal } from '../../design-system/Modal.js';
import { Button } from '../../design-system/Button.js';
import { Input } from '../../design-system/Input.js';
import type { TextPromptDialogProps } from './types.js';

export function TextPromptDialog({
  isOpen,
  question,
  description,
  initialValue = '',
  confirmText = 'Done',
  maxLength = 96,
  onConfirm,
  onCancel,
}: TextPromptDialogProps): React.ReactElement | null {
  const [value, setValue] = useState(initialValue);
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = value.trim();
    if (trimmed.length === 0) {
      setError('Enter a name.');
      return;
    }
    setError('');
    onConfirm(trimmed);
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onCancel}
      title="Macro Recorder"
      maxWidth="max-w-md"
      closeOnEscape={true}
      closeOnBackdropClick={true}
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4 select-none">
        <div className="flex flex-col gap-1">
          <h3 className="text-[18px] font-semibold text-[var(--color-text-primary)]">
            {question}
          </h3>
          {description && (
            <p className="text-[13px] text-[var(--color-text-secondary)] leading-relaxed">
              {description}
            </p>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <Input
            value={value}
            maxLength={maxLength}
            onChange={(e) => {
              setValue(e.target.value);
              if (error) setError('');
            }}
            placeholder="Name"
            autoFocus
            aria-label="Name"
          />
          {error && (
            <span className="text-[12px] font-semibold text-[var(--color-danger)]">
              {error}
            </span>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 pt-3 border-t border-[var(--color-border-subtle)]">
          <Button variant="base" onClick={onCancel}>
            Cancel
          </Button>
          <Button variant="accent" type="submit" className="min-w-[120px]">
            {confirmText}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
