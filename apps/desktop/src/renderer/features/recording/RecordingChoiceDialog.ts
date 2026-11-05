import React from 'react';
import { Modal } from '../../design-system/Modal.js';
import { Button } from '../../design-system/Button.js';
import type { RecordingChoiceDialogProps, RecordingChoiceOptionItem } from './types.js';

const TONE_STRIPE_CLASSES: Record<string, string> = {
  danger: 'bg-[var(--color-danger)]',
  accent: 'bg-[var(--color-accent)]',
  neutral: 'bg-[var(--color-border)]',
};

export interface RecordingChoiceContentProps {
  readonly eventCount: number;
  readonly macroDurationMs: number;
  readonly selectedActionTimeMs: number | null;
  readonly onSelectChoice: (choice: import('../../../../../../packages/contracts/src/index.js').RecordingChoice) => void;
  readonly onCancel: () => void;
}

/**
 * Inner content layout for the RecordingChoiceDialog.
 * Can be rendered directly or embedded inside a Modal.
 */
export function RecordingChoiceContent({
  eventCount,
  macroDurationMs,
  selectedActionTimeMs,
  onSelectChoice,
  onCancel,
}: RecordingChoiceContentProps) {
  const hasSelection = selectedActionTimeMs !== null && selectedActionTimeMs >= 0;

  const options: readonly RecordingChoiceOptionItem[] = [
    {
      choice: 'Overwrite',
      title: 'Record from scratch',
      description: `Deletes all ${eventCount} actions and starts the timeline over.`,
      tone: 'danger',
      enabled: true,
    },
    {
      choice: 'Continue',
      title: 'Continue from the selected action',
      description: hasSelection
        ? `The recording is inserted at ${selectedActionTimeMs} ms; later actions shift down.`
        : 'Select a timeline row first — the recording is inserted at its time and everything below shifts down.',
      tone: 'neutral',
      enabled: hasSelection,
    },
    {
      choice: 'Append',
      title: 'Append to the end',
      description: `Recording starts after ${macroDurationMs} ms; existing actions stay untouched.`,
      tone: 'accent',
      enabled: true,
    },
  ];

  return React.createElement(
    'div',
    { className: 'flex flex-col gap-1' },
    // Question & Description
    React.createElement(
      'h2',
      {
        id: 'choice-dialog-question',
        className: 'text-[20px] font-semibold text-[var(--color-text-primary)] mb-1',
      },
      'This macro already has actions',
    ),
    React.createElement(
      'p',
      { className: 'text-[14px] text-[var(--color-text-secondary)] mb-5 leading-relaxed' },
      'Choose what to do with the new recording.',
    ),

    // Options Stack
    React.createElement(
      'div',
      {
        className:
          'flex flex-col gap-2.5 bg-[var(--color-surface)] border border-[var(--color-border-subtle)] rounded-xl p-4',
      },
      options.map((opt) => {
        const stripeClass = TONE_STRIPE_CLASSES[opt.tone] ?? 'bg-[var(--color-border)]';

        return React.createElement(
          'button',
          {
            key: opt.choice,
            type: 'button',
            disabled: !opt.enabled,
            onClick: () => {
              if (opt.enabled) {
                onSelectChoice(opt.choice);
              }
            },
            className: `group relative flex items-start gap-3.5 p-3.5 text-left rounded-lg bg-[var(--color-surface-raised)] border border-[var(--color-border-subtle)] transition-all ${
              opt.enabled
                ? 'hover:bg-[var(--color-surface-hover)] hover:border-[var(--color-border)] active:opacity-90'
                : 'opacity-50'
            }`,
            'aria-label': `${opt.title}. ${opt.description}`,
          },
          // Left color stripe
          React.createElement('span', {
            className: `w-1 self-stretch rounded-sm shrink-0 ${stripeClass}`,
          }),
          // Content
          React.createElement(
            'div',
            { className: 'flex flex-col gap-1 pr-2' },
            React.createElement(
              'span',
              { className: 'text-[15px] font-semibold text-[var(--color-text-primary)]' },
              opt.title,
            ),
            React.createElement(
              'span',
              { className: 'text-[13px] text-[var(--color-text-secondary)] leading-snug' },
              opt.description,
            ),
          ),
        );
      }),
    ),

    // Footer with Cancel button
    React.createElement(
      'div',
      { className: 'flex justify-end pt-5' },
      React.createElement(
        Button,
        {
          variant: 'base',
          size: 'md',
          onClick: onCancel,
          autoFocus: true,
        },
        'Cancel',
      ),
    ),
  );
}

/**
 * Multi-option Choice Dialog for recording over existing actions:
 * Overwrite (Record from scratch), Continue from selection, Append to end.
 */
export function RecordingChoiceDialog({
  isOpen,
  eventCount,
  macroDurationMs,
  selectedActionTimeMs,
  onSelectChoice,
  onCancel,
}: RecordingChoiceDialogProps) {
  if (!isOpen) return null;

  return React.createElement(
    Modal,
    {
      isOpen,
      onClose: onCancel,
      title: 'Macro Recorder',
      maxWidth: 'max-w-[560px]',
      closeOnEscape: true,
      closeOnBackdropClick: true,
    },
    React.createElement(RecordingChoiceContent, {
      eventCount,
      macroDurationMs,
      selectedActionTimeMs,
      onSelectChoice,
      onCancel,
    }),
  );
}
