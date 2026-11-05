import { useState, useCallback, useRef } from 'react';

export interface ConfirmDialogState {
  readonly isOpen: boolean;
  readonly title: string;
  readonly message: string;
  readonly confirmLabel?: string | undefined;
  readonly cancelLabel?: string | undefined;
  readonly isDanger?: boolean | undefined;
}

export function useConfirmDialog() {
  const [state, setState] = useState<ConfirmDialogState>({
    isOpen: false,
    title: '',
    message: '',
  });

  const resolverRef = useRef<((value: boolean) => void) | null>(null);

  const confirm = useCallback(
    (options: {
      title: string;
      message: string;
      confirmLabel?: string | undefined;
      cancelLabel?: string | undefined;
      isDanger?: boolean | undefined;
    }): Promise<boolean> => {
      return new Promise<boolean>((resolve) => {
        resolverRef.current = resolve;
        setState({
          isOpen: true,
          ...options,
        });
      });
    },
    [],
  );

  const handleConfirm = useCallback(() => {
    setState((prev) => ({ ...prev, isOpen: false }));
    resolverRef.current?.(true);
    resolverRef.current = null;
  }, []);

  const handleCancel = useCallback(() => {
    setState((prev) => ({ ...prev, isOpen: false }));
    resolverRef.current?.(false);
    resolverRef.current = null;
  }, []);

  return {
    state,
    confirm,
    handleConfirm,
    handleCancel,
  };
}
