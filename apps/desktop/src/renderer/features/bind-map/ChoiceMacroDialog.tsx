/**
 * @macro-recorder/desktop - Choice Macro Dialog for Right-Click Tile Deletion
 * Multi-macro selection modal.
 */

import React from 'react';
import type { MacroDefinition } from '../../../../../../packages/contracts/src/index.js';
import { formatHotkeyDisplay } from '../../../../../../packages/contracts/src/index.js';
import { Modal } from '../../design-system/Modal.js';
import { Button } from '../../design-system/Button.js';

export interface ChoiceMacroDialogProps {
  readonly isOpen: boolean;
  readonly macros: readonly MacroDefinition[];
  readonly onSelect: (macro: MacroDefinition) => void;
  readonly onCancel: () => void;
  readonly t?: ((k: string) => string) | undefined;
  readonly format?: ((k: string, ...args: unknown[]) => string) | undefined;
}

export const ChoiceMacroDialog: React.FC<ChoiceMacroDialogProps> = ({
  isOpen,
  macros,
  onSelect,
  onCancel,
  t = (k) => k,
  format = (k, ...args) => k.replace(/{(\d+)}/g, (_, i) => String(args[Number(i)] ?? '')),
}) => {
  if (!isOpen || macros.length === 0) return null;

  const displayMacros = macros.slice(0, 4);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onCancel}
      title="Macro Recorder"
      maxWidth="max-w-md"
      closeOnEscape={true}
      closeOnBackdropClick={true}
    >
      <div className="flex flex-col gap-4 select-none" data-testid="bind-map-delete-choice-dialog">
        <div className="flex flex-col gap-1.5">
          <h3 className="text-[18px] font-semibold text-[var(--color-text-primary)] leading-snug">
            {t('This key holds several macros')}
          </h3>
          <p className="text-[13.5px] text-[var(--color-text-secondary)] leading-relaxed">
            {t('Choose which one to delete.')}
          </p>
        </div>

        {/* Option Cards */}
        <div className="flex flex-col gap-2">
          {displayMacros.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => onSelect(m)}
              data-testid={`choice-delete-${m.id}`}
              className="w-full flex items-center justify-between p-3 rounded-[8px] bg-[var(--color-surface)] hover:bg-[var(--color-surface-hover)] border border-[var(--color-border-subtle)] border-l-4 border-l-[var(--color-danger)] text-left transition-colors group"
            >
              <div className="flex flex-col min-w-0 pr-2">
                <span className="text-[14px] font-medium text-[var(--color-text-primary)] group-hover:text-[var(--color-danger)] transition-colors truncate">
                  {format('Delete “{0}”', m.name)}
                </span>
                <span className="text-[12px] text-[var(--color-text-muted)] font-mono">
                  {formatHotkeyDisplay(m.hotkey)}
                </span>
              </div>
            </button>
          ))}
        </div>

        {/* Cancel Button */}
        <div className="flex justify-end pt-2">
          <Button variant="base" size="md" onClick={onCancel}>
            {t('Cancel')}
          </Button>
        </div>
      </div>
    </Modal>
  );
};
