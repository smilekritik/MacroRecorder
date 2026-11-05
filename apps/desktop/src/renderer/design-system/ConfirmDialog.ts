import React, { useState } from 'react';
import { Modal } from './Modal.js';
import { Button } from './Button.js';
import { Input } from './Input.js';

export interface ConfirmDialogProps {
  readonly isOpen: boolean;
  readonly title: string;
  readonly message: React.ReactNode;
  readonly confirmLabel?: string | undefined;
  readonly cancelLabel?: string | undefined;
  readonly isDanger?: boolean | undefined;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
}

/**
 * Standard confirmation dialog.
 */
export function ConfirmDialog({
  isOpen,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  isDanger = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const messageElement = React.createElement(
    'div',
    { className: 'text-[14px] text-[var(--color-text-secondary)] mb-6' },
    message,
  );

  const actionsElement = React.createElement(
    'div',
    { className: 'flex items-center justify-end gap-3' },
    React.createElement(Button, { variant: 'base', onClick: onCancel }, cancelLabel),
    React.createElement(
      Button,
      {
        variant: isDanger ? 'critical-danger' : 'accent',
        onClick: onConfirm,
        autoFocus: true,
      },
      confirmLabel,
    ),
  );

  return React.createElement(
    Modal,
    { isOpen, onClose: onCancel, title },
    messageElement,
    actionsElement,
  );
}

export interface TextPromptDialogProps {
  readonly isOpen: boolean;
  readonly title: string;
  readonly message?: string | undefined;
  readonly initialValue?: string | undefined;
  readonly placeholder?: string | undefined;
  readonly confirmLabel?: string | undefined;
  readonly cancelLabel?: string | undefined;
  readonly onConfirm: (value: string) => void;
  readonly onCancel: () => void;
}

/**
 * Text prompt dialog.
 */
export function TextPromptDialog({
  isOpen,
  title,
  message,
  initialValue = '',
  placeholder = '',
  confirmLabel = 'OK',
  cancelLabel = 'Cancel',
  onConfirm,
  onCancel,
}: TextPromptDialogProps) {
  const [value, setValue] = useState(initialValue);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onConfirm(value);
  };

  const formChildren: React.ReactNode[] = [];

  if (message) {
    formChildren.push(
      React.createElement(
        'div',
        { key: 'msg', className: 'text-[14px] text-[var(--color-text-secondary)] mb-3' },
        message,
      ),
    );
  }

  formChildren.push(
    React.createElement(
      'div',
      { key: 'input-wrap', className: 'mb-6' },
      React.createElement(Input, {
        value,
        onChange: (e: React.ChangeEvent<HTMLInputElement>) => setValue(e.target.value),
        placeholder,
        autoFocus: true,
      }),
    ),
  );

  formChildren.push(
    React.createElement(
      'div',
      { key: 'actions', className: 'flex items-center justify-end gap-3' },
      React.createElement(Button, { variant: 'base', onClick: onCancel }, cancelLabel),
      React.createElement(Button, { variant: 'accent', type: 'submit' }, confirmLabel),
    ),
  );

  const formElement = React.createElement('form', { onSubmit: handleSubmit }, ...formChildren);

  return React.createElement(Modal, { isOpen, onClose: onCancel, title }, formElement);
}

export interface ChoiceDialogOption<T = string> {
  readonly key: T;
  readonly title: string;
  readonly description?: string | undefined;
}

export interface ChoiceDialogProps<T = string> {
  readonly isOpen: boolean;
  readonly title: string;
  readonly message?: string | undefined;
  readonly options: ReadonlyArray<ChoiceDialogOption<T>>;
  readonly onSelect: (choice: T) => void;
  readonly onCancel: () => void;
}

/**
 * Choice dialog (e.g. Overwrite, Continue, Append).
 */
export function ChoiceDialog<T extends string>({
  isOpen,
  title,
  message,
  options,
  onSelect,
  onCancel,
}: ChoiceDialogProps<T>) {
  const children: React.ReactNode[] = [];

  if (message) {
    children.push(
      React.createElement(
        'div',
        { key: 'msg', className: 'text-[14px] text-[var(--color-text-secondary)] mb-4' },
        message,
      ),
    );
  }

  const optionButtons = options.map((opt) =>
    React.createElement(
      'button',
      {
        key: opt.key,
        type: 'button',
        onClick: () => onSelect(opt.key),
        className: `flex flex-col items-start p-3 rounded-[8px] text-left transition-colors
          bg-[var(--color-surface-raised)] border border-[var(--color-border-subtle)]
          hover:border-[var(--color-focus)] hover:bg-[var(--color-surface-hover)]
          focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-focus)]`,
      },
      React.createElement(
        'span',
        { className: 'font-semibold text-[14px] text-[var(--color-text-primary)]' },
        opt.title,
      ),
      opt.description
        ? React.createElement(
            'span',
            { className: 'text-[12px] text-[var(--color-text-muted)] mt-1' },
            opt.description,
          )
        : null,
    ),
  );

  children.push(
    React.createElement(
      'div',
      { key: 'options', className: 'flex flex-col gap-3 mb-6' },
      ...optionButtons,
    ),
  );

  children.push(
    React.createElement(
      'div',
      { key: 'actions', className: 'flex justify-end' },
      React.createElement(Button, { variant: 'base', onClick: onCancel }, 'Cancel'),
    ),
  );

  return React.createElement(
    Modal,
    { isOpen, onClose: onCancel, title, maxWidth: 'max-w-md' },
    ...children,
  );
}
