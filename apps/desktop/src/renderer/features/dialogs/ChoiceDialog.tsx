/**
 * @macro-recorder/desktop - Multi-Option Choice Dialog
 * Multi-option dialog.
 * Used for recording conflict choices (Overwrite, Continue, Append) and backup restore mode (Merge, Replace).
 */

import React from 'react';
import { Modal } from '../../design-system/Modal.js';
import { Button } from '../../design-system/Button.js';
import type { ChoiceDialogProps, ChoiceTone } from './types.js';

function getStripeColor(tone?: ChoiceTone): string {
  switch (tone) {
    case 'danger':
      return 'bg-[var(--color-danger)]';
    case 'accent':
      return 'bg-[var(--color-accent)]';
    case 'neutral':
    default:
      return 'bg-[var(--color-border)]';
  }
}

export function ChoiceDialog({
  isOpen,
  question,
  description,
  details,
  options,
  showCancel = true,
  onSelect,
  onCancel,
}: ChoiceDialogProps): React.ReactElement | null {
  if (!isOpen) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onCancel}
      title="Macro Recorder"
      maxWidth="max-w-lg"
      closeOnEscape={true}
      closeOnBackdropClick={true}
    >
      <div className="flex flex-col gap-5 select-none">
        {/* Question & Description */}
        <div className="flex flex-col gap-2">
          <h3 className="text-[19px] font-semibold text-[var(--color-text-primary)] leading-snug">
            {question}
          </h3>
          {description && (
            <p className="text-[14px] text-[var(--color-text-secondary)] leading-relaxed">
              {description}
            </p>
          )}
        </div>

        {/* Optional scrollable details panel */}
        {details && (
          <div className="max-h-[160px] overflow-y-auto p-3 rounded-[6px] bg-[var(--color-surface-sunken)] border border-[var(--color-border-subtle)] text-[13px] text-[var(--color-text-primary)] font-mono whitespace-pre-wrap">
            {details}
          </div>
        )}

        {/* Option Cards */}
        <div className="flex flex-col gap-2.5">
          {options.map((option, index) => {
            const stripeClass = getStripeColor(option.tone);
            const isEnabled = option.enabled !== false;

            return (
              <button
                key={index}
                type="button"
                disabled={!isEnabled}
                onClick={() => onSelect(index)}
                className={`flex items-stretch text-left rounded-[8px] p-3 transition-colors border bg-[var(--color-surface-raised)] border-[var(--color-border-subtle)] hover:bg-[var(--color-surface-hover)] hover:border-[var(--color-border)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-focus)] disabled:opacity-50`}
              >
                {/* Colored left stripe */}
                <div className={`w-1.5 rounded-full flex-shrink-0 mr-3 ${stripeClass}`} />
                <div className="flex flex-col gap-0.5 flex-1 min-w-0">
                  <span className="font-semibold text-[15px] text-[var(--color-text-primary)]">
                    {option.title}
                  </span>
                  {option.description && (
                    <span className="text-[13px] text-[var(--color-text-secondary)] leading-normal">
                      {option.description}
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>

        {/* Cancel Action */}
        {showCancel && (
          <div className="flex justify-end pt-2 border-t border-[var(--color-border-subtle)]">
            <Button variant="base" onClick={onCancel} autoFocus>
              Cancel
            </Button>
          </div>
        )}
      </div>
    </Modal>
  );
}
