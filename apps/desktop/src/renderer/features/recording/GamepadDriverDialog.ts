import React from 'react';
import { Modal } from '../../design-system/Modal.js';
import { Button } from '../../design-system/Button.js';
import type { GamepadDriverDialogProps } from './types.js';

export interface GamepadDriverContentProps {
  readonly onInstallNow: () => void;
  readonly onDismiss: () => void;
}

/**
 * Inner content layout for Gamepad driver installer prompt.
 */
export function GamepadDriverContent({
  onInstallNow,
  onDismiss,
}: GamepadDriverContentProps) {
  return React.createElement(
    'div',
    { className: 'flex flex-col gap-1' },
    React.createElement(
      'h2',
      {
        className: 'text-[20px] font-semibold text-[var(--color-text-primary)] mb-1',
      },
      'Install the gamepad driver?',
    ),
    React.createElement(
      'p',
      { className: 'text-[14px] text-[var(--color-text-secondary)] mb-5 leading-relaxed' },
      'Playing back gamepad actions requires the ViGEmBus driver. Recording and building macros work without it.',
    ),

    // Options
    React.createElement(
      'div',
      {
        className:
          'flex flex-col gap-2.5 bg-[var(--color-surface)] border border-[var(--color-border-subtle)] rounded-xl p-4',
      },
      // Install Now option
      React.createElement(
        'button',
        {
          type: 'button',
          onClick: onInstallNow,
          className:
            'group relative flex items-start gap-3.5 p-3.5 text-left rounded-lg bg-[var(--color-surface-raised)] border border-[var(--color-border-subtle)] hover:bg-[var(--color-surface-hover)] hover:border-[var(--color-border)] active:opacity-90 transition-all',
          'aria-label':
            'Install now. Runs the ViGEmBus installer (administrator rights required).',
        },
        React.createElement('span', {
          className: 'w-1 self-stretch rounded-sm shrink-0 bg-[var(--color-accent)]',
        }),
        React.createElement(
          'div',
          { className: 'flex flex-col gap-1 pr-2' },
          React.createElement(
            'span',
            { className: 'text-[15px] font-semibold text-[var(--color-text-primary)]' },
            'Install now',
          ),
          React.createElement(
            'span',
            { className: 'text-[13px] text-[var(--color-text-secondary)] leading-snug' },
            'Runs the ViGEmBus installer (administrator rights required).',
          ),
        ),
      ),

      // Not Now option
      React.createElement(
        'button',
        {
          type: 'button',
          onClick: onDismiss,
          className:
            'group relative flex items-start gap-3.5 p-3.5 text-left rounded-lg bg-[var(--color-surface-raised)] border border-[var(--color-border-subtle)] hover:bg-[var(--color-surface-hover)] hover:border-[var(--color-border)] active:opacity-90 transition-all',
          'aria-label': "Not now. Don't ask again. You can install it in Settings.",
        },
        React.createElement('span', {
          className: 'w-1 self-stretch rounded-sm shrink-0 bg-[var(--color-border)]',
        }),
        React.createElement(
          'div',
          { className: 'flex flex-col gap-1 pr-2' },
          React.createElement(
            'span',
            { className: 'text-[15px] font-semibold text-[var(--color-text-primary)]' },
            'Not now',
          ),
          React.createElement(
            'span',
            { className: 'text-[13px] text-[var(--color-text-secondary)] leading-snug' },
            "Don't ask again. You can install it in Settings.",
          ),
        ),
      ),
    ),

    // Dismiss button
    React.createElement(
      'div',
      { className: 'flex justify-end pt-5' },
      React.createElement(
        Button,
        {
          variant: 'base',
          size: 'md',
          onClick: onDismiss,
          autoFocus: true,
        },
        'Close',
      ),
    ),
  );
}

/**
 * Proactive Gamepad driver installer dialog.
 */
export function GamepadDriverDialog({
  isOpen,
  onInstallNow,
  onDismiss,
}: GamepadDriverDialogProps) {
  if (!isOpen) return null;

  return React.createElement(
    Modal,
    {
      isOpen,
      onClose: onDismiss,
      title: 'Macro Recorder',
      maxWidth: 'max-w-[560px]',
      closeOnEscape: true,
      closeOnBackdropClick: false,
    },
    React.createElement(GamepadDriverContent, {
      onInstallNow,
      onDismiss,
    }),
  );
}
