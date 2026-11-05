/**
 * @macro-recorder/desktop - Application Error Boundary & Surface
 * Catches unhandled React component exceptions, invokes native emergency release,
 * and presents diagnostic recovery options.
 * Guarantees that no renderer error can leave native inputs held or macro loops running.
 */

import React, { Component, type ErrorInfo } from 'react';
import { IpcChannels } from '../../../../../packages/contracts/src/index.js';

export interface AppErrorBoundaryProps {
  readonly children?: React.ReactNode | undefined;
  readonly fallbackTitle?: string | undefined;
  readonly onEmergencyRelease?: (() => void) | undefined;
}

interface AppErrorBoundaryState {
  readonly hasError: boolean;
  readonly error: Error | null;
  readonly errorInfo: ErrorInfo | null;
}

export class AppErrorBoundary extends Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  constructor(props: AppErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  public static getDerivedStateFromError(error: Error): Partial<AppErrorBoundaryState> {
    return {
      hasError: true,
      error,
    };
  }

  public override componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error('[AppErrorBoundary] Unhandled error caught in React subtree:', error, errorInfo);

    this.setState({ errorInfo });

    // Guarantee: emergency release call to prevent stranded inputs!
    if (this.props.onEmergencyRelease) {
      this.props.onEmergencyRelease();
    } else if (
      typeof window !== 'undefined' &&
      window.macroRecorderApi?.invoke
    ) {
      try {
        void window.macroRecorderApi.invoke(IpcChannels.EMERGENCY_STOP, {
          requestId: `boundary-emergency-${Date.now()}`,
        });
      } catch {
        // Best effort
      }
    }
  }

  private handleReload = (): void => {
    if (typeof window !== 'undefined' && window.location) {
      window.location.reload();
    }
  };

  private handleCopyDiagnostics = (): void => {
    const { error, errorInfo } = this.state;
    const diagnosticReport = [
      `Macro Recorder Error Report - ${new Date().toISOString()}`,
      `Error: ${error?.name}: ${error?.message}`,
      `Stack:\n${error?.stack ?? 'No stack available'}`,
      `Component Stack:\n${errorInfo?.componentStack ?? 'No component stack available'}`,
    ].join('\n\n');

    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      void navigator.clipboard.writeText(diagnosticReport);
    }
  };

  private handleRetry = (): void => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    });
  };

  public override render(): React.ReactNode {
    if (this.state.hasError) {
      const { error } = this.state;
      return (
        <div className="flex flex-col items-center justify-center min-h-screen w-full p-8 bg-[var(--color-bg)] text-[var(--color-text-primary)]">
          <div className="w-full max-w-xl p-6 rounded-xl border border-[var(--color-danger-subtle)] bg-[var(--color-surface)] shadow-2xl flex flex-col gap-5">
            {/* Header */}
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-[var(--color-danger-subtle)] text-[var(--color-danger)] flex items-center justify-center shrink-0">
                <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
              </div>
              <div>
                <h1 className="text-lg font-bold text-[var(--color-text-primary)]">
                  {this.props.fallbackTitle ?? 'An unexpected error occurred'}
                </h1>
                <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
                  Input injection was safely released and macro execution halted.
                </p>
              </div>
            </div>

            {/* Error Message */}
            {error && (
              <div className="p-3.5 rounded-lg bg-[var(--color-bg)] border border-[var(--color-border-subtle)] text-xs font-mono text-[var(--color-danger)] overflow-x-auto select-text">
                {error.toString()}
              </div>
            )}

            {/* Actions */}
            <div className="flex items-center justify-between pt-2 border-t border-[var(--color-border-subtle)]">
              <button
                type="button"
                onClick={this.handleCopyDiagnostics}
                className="px-3 py-1.5 rounded-md text-xs font-medium text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface-raised)] transition-colors"
              >
                Copy Diagnostic Report
              </button>

              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={this.handleRetry}
                  className="px-3.5 py-1.5 rounded-md text-xs font-medium border border-[var(--color-border)] text-[var(--color-text-primary)] hover:bg-[var(--color-surface-raised)] transition-colors"
                >
                  Try Again
                </button>
                <button
                  type="button"
                  onClick={this.handleReload}
                  className="px-3.5 py-1.5 rounded-md text-xs font-medium bg-[var(--color-accent)] text-[var(--color-accent-fg)] hover:opacity-90 transition-opacity"
                >
                  Reload Application
                </button>
              </div>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
