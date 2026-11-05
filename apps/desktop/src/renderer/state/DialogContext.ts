import React, { createContext, useContext, useState, useCallback, useRef } from 'react';
import {
  ConfirmDialog,
  TextPromptDialog,
  ChoiceDialog,
  type ChoiceDialogOption,
} from '../design-system/ConfirmDialog.js';

export interface ConfirmOptions {
  readonly title: string;
  readonly message: string;
  readonly confirmLabel?: string | undefined;
  readonly cancelLabel?: string | undefined;
  readonly isDanger?: boolean | undefined;
}

export interface PromptOptions {
  readonly title: string;
  readonly message?: string | undefined;
  readonly initialValue?: string | undefined;
  readonly placeholder?: string | undefined;
  readonly confirmLabel?: string | undefined;
  readonly cancelLabel?: string | undefined;
}

export interface ChoiceOptions<T extends string = string> {
  readonly title: string;
  readonly message?: string | undefined;
  readonly options: ReadonlyArray<ChoiceDialogOption<T>>;
}

export interface DialogContextValue {
  readonly confirm: (options: ConfirmOptions) => Promise<boolean>;
  readonly prompt: (options: PromptOptions) => Promise<string | null>;
  readonly choose: <T extends string>(options: ChoiceOptions<T>) => Promise<T | null>;
}

const DialogContext = createContext<DialogContextValue | null>(null);

type ActiveModal =
  | {
      readonly type: 'confirm';
      readonly options: ConfirmOptions;
      readonly resolve: (value: boolean) => void;
    }
  | {
      readonly type: 'prompt';
      readonly options: PromptOptions;
      readonly resolve: (value: string | null) => void;
    }
  | {
      readonly type: 'choice';
      readonly options: ChoiceOptions<string>;
      readonly resolve: (value: string | null) => void;
    };

export function DialogProvider({
  children,
}: {
  readonly children?: React.ReactNode | undefined;
}) {
  const [activeModal, setActiveModal] = useState<ActiveModal | null>(null);
  const queueRef = useRef<ActiveModal[]>([]);

  const processNext = useCallback(() => {
    if (queueRef.current.length > 0) {
      const next = queueRef.current.shift()!;
      setActiveModal(next);
    } else {
      setActiveModal(null);
    }
  }, []);

  const confirm = useCallback(
    (options: ConfirmOptions): Promise<boolean> => {
      return new Promise<boolean>((resolve) => {
        const item: ActiveModal = { type: 'confirm', options, resolve };
        if (activeModal === null) {
          setActiveModal(item);
        } else {
          queueRef.current.push(item);
        }
      });
    },
    [activeModal],
  );

  const prompt = useCallback(
    (options: PromptOptions): Promise<string | null> => {
      return new Promise<string | null>((resolve) => {
        const item: ActiveModal = { type: 'prompt', options, resolve };
        if (activeModal === null) {
          setActiveModal(item);
        } else {
          queueRef.current.push(item);
        }
      });
    },
    [activeModal],
  );

  const choose = useCallback(
    <T extends string>(options: ChoiceOptions<T>): Promise<T | null> => {
      return new Promise<T | null>((resolve) => {
        const item: ActiveModal = {
          type: 'choice',
          options: options as ChoiceOptions<string>,
          resolve: resolve as (value: string | null) => void,
        };
        if (activeModal === null) {
          setActiveModal(item);
        } else {
          queueRef.current.push(item);
        }
      });
    },
    [activeModal],
  );

  let renderedModal: React.ReactNode = null;

  if (activeModal?.type === 'confirm') {
    renderedModal = React.createElement(ConfirmDialog, {
      isOpen: true,
      title: activeModal.options.title,
      message: activeModal.options.message,
      confirmLabel: activeModal.options.confirmLabel,
      cancelLabel: activeModal.options.cancelLabel,
      isDanger: activeModal.options.isDanger,
      onConfirm: () => {
        activeModal.resolve(true);
        processNext();
      },
      onCancel: () => {
        activeModal.resolve(false);
        processNext();
      },
    });
  } else if (activeModal?.type === 'prompt') {
    renderedModal = React.createElement(TextPromptDialog, {
      isOpen: true,
      title: activeModal.options.title,
      message: activeModal.options.message,
      initialValue: activeModal.options.initialValue,
      placeholder: activeModal.options.placeholder,
      confirmLabel: activeModal.options.confirmLabel,
      cancelLabel: activeModal.options.cancelLabel,
      onConfirm: (val) => {
        activeModal.resolve(val);
        processNext();
      },
      onCancel: () => {
        activeModal.resolve(null);
        processNext();
      },
    });
  } else if (activeModal?.type === 'choice') {
    renderedModal = React.createElement(ChoiceDialog, {
      isOpen: true,
      title: activeModal.options.title,
      message: activeModal.options.message,
      options: activeModal.options.options,
      onSelect: (choice) => {
        activeModal.resolve(choice);
        processNext();
      },
      onCancel: () => {
        activeModal.resolve(null);
        processNext();
      },
    });
  }

  const contextValue: DialogContextValue = {
    confirm,
    prompt,
    choose,
  };

  return React.createElement(
    DialogContext.Provider,
    { value: contextValue },
    children,
    renderedModal,
  );
}

export function useDialogContext(): DialogContextValue {
  const ctx = useContext(DialogContext);
  if (!ctx) {
    throw new Error('useDialogContext must be used within a DialogProvider');
  }
  return ctx;
}
