import React, { useEffect, useRef, useId } from 'react';
import { WindowSafePortal, Z_INDEX } from './Portal.js';

const DIALOG_WINDOWS = new Set([
  'FirstRunWindow', 'WelcomeWindow', 'AlreadyRunningWindow', 'ChoiceWindow', 'ConfirmDeleteWindow',
  'ConfirmImportWindow', 'ImportReportWindow', 'TextPromptWindow', 'AddActionWindow',
]);

/** A dialog that is the whole content of its own window has no page to float over. */
const IS_DIALOG_WINDOW = typeof window !== 'undefined'
  && DIALOG_WINDOWS.has(new URLSearchParams(window.location?.search ?? '').get('windowId') ?? '');

export interface ModalProps {
  readonly isOpen: boolean;
  readonly onClose: () => void;
  readonly title?: React.ReactNode | undefined;
  readonly description?: React.ReactNode | undefined;
  readonly children?: React.ReactNode | undefined;
  readonly maxWidth?: string | undefined;
  readonly className?: string | undefined;
  readonly closeOnEscape?: boolean | undefined;
  readonly closeOnBackdropClick?: boolean | undefined;
}

/**
 * Accessible Modal dialog:
 * - Traps Tab and Shift+Tab keyboard focus inside dialog
 * - Dismisses on Escape (if closeOnEscape is true)
 * - Restores focus to the triggering element on close
 * - Renders through WindowSafePortal with backdrop blur
 * - ARIA: role="dialog", aria-modal="true", aria-labelledby, aria-describedby
 */
export function Modal({
  isOpen,
  onClose,
  title,
  description,
  children,
  maxWidth = 'max-w-lg',
  className = '',
  closeOnEscape = true,
  closeOnBackdropClick = true,
}: ModalProps) {
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const embedded = IS_DIALOG_WINDOW;
  const baseId = useId();
  const titleId = `${baseId}-title`;
  const descId = `${baseId}-desc`;

  useEffect(() => {
    if (isOpen) {
      previousFocusRef.current = document.activeElement as HTMLElement | null;

      const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      if (focusable && focusable.length > 0) {
        focusable[0]?.focus();
      } else {
        dialogRef.current?.focus();
      }
    } else {
      previousFocusRef.current?.focus();
    }
  }, [isOpen]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape' && closeOnEscape) {
      e.stopPropagation();
      e.preventDefault();
      onClose();
      return;
    }

    if (e.key === 'Tab' && dialogRef.current) {
      const focusable = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      );

      if (focusable.length === 0) {
        e.preventDefault();
        return;
      }

      const firstElement = focusable[0];
      const lastElement = focusable[focusable.length - 1];

      if (e.shiftKey) {
        if (document.activeElement === firstElement || document.activeElement === dialogRef.current) {
          e.preventDefault();
          lastElement?.focus();
        }
      } else {
        if (document.activeElement === lastElement) {
          e.preventDefault();
          firstElement?.focus();
        }
      }
    }
  };

  if (!isOpen) return null;

  const titleElement = title
    ? React.createElement(
        'h2',
        { id: titleId, className: 'text-[18px] font-semibold mb-2' },
        title,
      )
    : null;

  const descElement = description
    ? React.createElement(
        'div',
        { id: descId, className: 'text-[14px] text-[var(--color-text-secondary)] mb-4' },
        description,
      )
    : null;

  const dialogBox = React.createElement(
    'div',
    {
      ref: dialogRef,
      role: 'dialog',
      'aria-modal': true,
      'aria-labelledby': title ? titleId : undefined,
      'aria-describedby': description ? descId : undefined,
      tabIndex: -1,
      onKeyDown: handleKeyDown,
      onClick: (e: React.MouseEvent) => e.stopPropagation(),
      className: `w-full ${embedded ? '' : `${maxWidth} rounded-[10px] shadow-2xl max-h-[92vh] overflow-y-auto`} p-6 outline-none
        bg-[var(--color-surface)] border border-[var(--color-border-subtle)] text-[var(--color-text-primary)]
        ${className}`,
      style: { zIndex: Z_INDEX.modal },
    },
    titleElement,
    descElement,
    children,
  );

  if (embedded) return dialogBox;

  const backdrop = React.createElement(
    'div',
    {
      className: 'fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4',
      style: { zIndex: Z_INDEX.modalBackdrop },
      onClick: closeOnBackdropClick ? onClose : undefined,
    },
    dialogBox,
  );

  return React.createElement(WindowSafePortal, null, backdrop);
}
