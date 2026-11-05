/**
 * @macro-recorder/desktop - Macro Details Header
 * Editor header with inline editable name, inline multiline description,
 * enable/disable toggle, "edited" dirty badge, tag chips, and hotkey assignment.
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import type {
  MacroDefinition,
  HotkeyBinding,
} from '../../../../../../../packages/contracts/src/index.js';
import { HotkeyAssignmentBox } from './HotkeyAssignmentBox.js';
import { useLocalization } from '../../../hooks/useLocalization.js';

export interface MacroDetailsHeaderProps {
  readonly startRenaming?: boolean | undefined;
  readonly onRenameStarted?: (() => void) | undefined;
  readonly macro: MacroDefinition | null;
  readonly allMacros?: readonly MacroDefinition[] | undefined;
  readonly isModified?: boolean | undefined;
  readonly onUpdateName: (newName: string) => void;
  readonly onUpdateDescription: (newDescription: string) => void;
  readonly onToggleEnabled: (enabled: boolean) => void;
  readonly onAssignHotkey: (hotkey: HotkeyBinding) => void;
  readonly onAddTag: (tag: string) => void;
  readonly onRemoveTag: (tag: string) => void;
  readonly onTagClick?: ((tag: string) => void) | undefined;
  readonly activeFilterTag?: string | null | undefined;
  readonly className?: string | undefined;
}

export function MacroDetailsHeader({
  macro,
  allMacros = [],
  isModified = false,
  onUpdateName,
  onUpdateDescription,
  onAssignHotkey,
  startRenaming = false,
  onRenameStarted,
  className = '',
}: MacroDetailsHeaderProps) {
  const { t } = useLocalization();
  const [isEditingName, setIsEditingName] = useState(false);
  const [nameValue, setNameValue] = useState(macro?.name ?? '');

  const [isEditingDescription, setIsEditingDescription] = useState(false);
  const [descriptionValue, setDescriptionValue] = useState(macro?.description ?? '');

  const nameInputRef = useRef<HTMLInputElement>(null);
  const descriptionInputRef = useRef<HTMLTextAreaElement>(null);

  // Sync state when macro changes
  useEffect(() => {
    setNameValue(macro?.name ?? '');
    setIsEditingName(false);
    setDescriptionValue(macro?.description ?? '');
    setIsEditingDescription(false);
  }, [macro?.id]);

  // A macro just created wants a name first, so the field is ready with its text selected.
  useEffect(() => {
    if (!startRenaming) return;
    setIsEditingName(true);
    onRenameStarted?.();
    const frame = requestAnimationFrame(() => {
      nameInputRef.current?.focus();
      nameInputRef.current?.select();
    });
    return () => cancelAnimationFrame(frame);
  }, [startRenaming, onRenameStarted]);

  const commitName = useCallback(() => {
    if (!macro) return;
    const trimmed = nameValue.trim();
    if (trimmed && trimmed !== macro.name) {
      onUpdateName(trimmed);
    } else {
      setNameValue(macro.name);
    }
    setIsEditingName(false);
  }, [macro, nameValue, onUpdateName]);

  const cancelName = useCallback(() => {
    if (!macro) return;
    setNameValue(macro.name);
    setIsEditingName(false);
  }, [macro]);

  const handleNameKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        commitName();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        cancelName();
      }
    },
    [commitName, cancelName],
  );

  const commitDescription = useCallback(() => {
    if (!macro) return;
    const trimmed = descriptionValue.trim();
    if (trimmed !== (macro.description ?? '')) {
      onUpdateDescription(trimmed);
    } else {
      setDescriptionValue(macro.description ?? '');
    }
    setIsEditingDescription(false);
  }, [macro, descriptionValue, onUpdateDescription]);

  const cancelDescription = useCallback(() => {
    if (!macro) return;
    setDescriptionValue(macro.description ?? '');
    setIsEditingDescription(false);
  }, [macro]);

  const handleDescriptionKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        commitDescription();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        cancelDescription();
      }
    },
    [commitDescription, cancelDescription],
  );

  if (!macro) {
    return null;
  }

  return (
    <div className={`reference-macro-details ${className}`}>
      <div className="reference-macro-name">
        {isEditingName ? <input ref={nameInputRef} value={nameValue} onChange={event => setNameValue(event.target.value)} onKeyDown={handleNameKeyDown} onBlur={commitName} autoFocus aria-label={t('Editing macro name')} /> :
          <button type="button" onDoubleClick={() => setIsEditingName(true)} onKeyDown={event => { if (event.key === 'F2') { event.preventDefault(); setIsEditingName(true); } }} title={t('Double-click or press F2 to edit the name')} aria-label={t('Macro name. Double-click to edit')}>{macro.name}</button>}
        {isModified && <span className="reference-edited-label">{t('edited')}</span>}
      </div>
      <div className="reference-macro-description">
        {isEditingDescription ? <textarea ref={descriptionInputRef} value={descriptionValue} onChange={event => setDescriptionValue(event.target.value)} onKeyDown={handleDescriptionKeyDown} onBlur={commitDescription} rows={3} autoFocus aria-label={t('Editing macro description')} /> :
          <button type="button" className={macro.description ? '' : 'is-placeholder'} onDoubleClick={() => setIsEditingDescription(true)} onKeyDown={event => { if (event.key === 'F2') { event.preventDefault(); setIsEditingDescription(true); } }} title={t('Double-click or press F2 to edit the description')} aria-label={t('Macro description. Double-click to edit')}>{macro.description || t('No description (double-click to add)')}</button>}
      </div>
      <HotkeyAssignmentBox macro={macro} allMacros={allMacros} onAssignHotkey={onAssignHotkey} className="reference-shortcut" />
    </div>
  );
}
