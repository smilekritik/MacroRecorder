/**
 * What an empty macro shows instead of an empty table: the three ways to fill it.
 */

import React from 'react';
import { useLocalization } from '../../hooks/useLocalization.js';

export interface EmptyMacroStartProps {
  readonly onRecord?: (() => void) | undefined;
  readonly onAddAction: () => void;
  readonly onImport?: (() => void) | undefined;
}

export function EmptyMacroStart({ onRecord, onAddAction, onImport }: EmptyMacroStartProps): React.ReactElement {
  const { t } = useLocalization();
  const choices = [
    {
      key: 'record',
      title: t('Record it'),
      text: t('Perform the actions once. Keys, mouse and timing are captured for you.'),
      onClick: onRecord,
      primary: true,
    },
    {
      key: 'build',
      title: t('Build it step by step'),
      text: t('Add key presses, clicks, text and pauses one at a time.'),
      onClick: onAddAction,
      primary: false,
    },
    {
      key: 'import',
      title: t('Import a file'),
      text: t('Bring in a macro from AutoHotkey, TinyTask, Razer Synapse and others.'),
      onClick: onImport,
      primary: false,
    },
  ];

  return (
    <div className="reference-start" data-testid="empty-macro-start">
      <h2>{t('How do you want to create this macro?')}</h2>
      <div className="reference-start-grid">
        {choices.filter((choice) => choice.onClick).map((choice) => (
          <button
            key={choice.key}
            type="button"
            data-testid={`empty-macro-${choice.key}`}
            className={`reference-start-card ${choice.primary ? 'is-primary' : ''}`}
            onClick={choice.onClick}
          >
            <strong>{choice.title}</strong>
            <span>{choice.text}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
