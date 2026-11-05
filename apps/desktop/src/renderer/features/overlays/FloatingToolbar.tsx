/**
 * @macro-recorder/desktop - Floating Recording Toolbar Component
 * Compact always-on-top floating toolbar providing Record, Pause, Stop, and Close buttons.
 *
 * Prevents focus-theft on button clicks to protect target application focus.
 */

import React from 'react';
import type { FloatingToolbarProps } from './types.js';

export const FloatingToolbar: React.FC<FloatingToolbarProps> = ({
  engineState = 'Idle',
  isRecording = false,
  isPaused = false,
  onRecord,
  onPause,
  onStop,
  onClose,
  onDragStart,
  t = (k) => k,
  className = '',
}) => {

  const recordingActive = isRecording || engineState === 'Recording';
  const pausedActive = isPaused || engineState === 'Paused';

  // Prevent focus steal when clicking buttons
  const handleButtonMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
  };

  return (
    <div
      data-testid="floating-toolbar"
      role="toolbar"
      aria-label={t('Macro Recorder')}
      className={`inline-flex items-center p-[6px] rounded-[10px] bg-[var(--color-surface-raised)] border border-[var(--color-border)] shadow-2xl select-none text-[var(--color-text-primary)] ${className}`}
    >
      {/* Drag Grip Handle */}
      <div
        data-testid="toolbar-drag-handle"
        role="button"
        tabIndex={0}
        aria-label={t('Drag to move')}
        title={t('Drag to move')}
        onMouseDown={onDragStart}
        className="w-[18px] h-[34px] flex items-center justify-center cursor-move text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] transition-colors"
      >
        <span className="text-[16px] leading-none" aria-hidden="true">
          ⠿
        </span>
      </div>

      {/* Record Button */}
      <button
        type="button"
        data-testid="toolbar-record-button"
        aria-label={t('Record')}
        title={t('Start or stop recording')}
        onMouseDown={handleButtonMouseDown}
        onClick={onRecord}
        style={{ width: 40, height: 34 }}
        className={`ml-1 flex items-center justify-center rounded-[6px] text-white transition-transform active:scale-95 ${
          recordingActive
            ? 'bg-[var(--color-danger)] animate-pulse'
            : 'bg-[var(--color-accent)] hover:opacity-90'
        }`}
      >
        <span className="text-[15px] leading-none" aria-hidden="true">
          ●
        </span>
      </button>

      {/* Pause Button */}
      <button
        type="button"
        data-testid="toolbar-pause-button"
        aria-label={t('Pause')}
        title={t('Pause and resume')}
        onMouseDown={handleButtonMouseDown}
        onClick={onPause}
        style={{ width: 40, height: 34 }}
        className={`ml-1 flex items-center justify-center rounded-[6px] bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-text-primary)] hover:bg-[var(--color-surface-hover)] transition-transform active:scale-95 ${
          pausedActive ? 'border-[var(--color-warning)] text-[var(--color-warning)]' : ''
        }`}
      >
        <span className="text-[12px] font-bold leading-none" aria-hidden="true">
          {pausedActive ? '▶' : '❚❚'}
        </span>
      </button>

      {/* Stop Button */}
      <button
        type="button"
        data-testid="toolbar-stop-button"
        aria-label={t('Stop')}
        title={t('Emergency stop')}
        onMouseDown={handleButtonMouseDown}
        onClick={onStop}
        style={{ width: 40, height: 34 }}
        className="ml-1 flex items-center justify-center rounded-[6px] bg-[var(--color-danger)] text-white hover:opacity-90 transition-transform active:scale-95"
      >
        <span className="text-[14px] leading-none" aria-hidden="true">
          ■
        </span>
      </button>

      {/* Close Button */}
      <button
        type="button"
        data-testid="toolbar-close-button"
        aria-label={t('Close')}
        title={t('Hide the floating toolbar')}
        onMouseDown={handleButtonMouseDown}
        onClick={onClose}
        style={{ width: 26, height: 34 }}
        className="ml-1.5 flex items-center justify-center rounded-[6px] bg-transparent text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] transition-colors"
      >
        <svg
          className="w-3.5 h-3.5 stroke-current"
          strokeWidth="1.6"
          viewBox="0 0 14 14"
          fill="none"
          aria-hidden="true"
        >
          <path d="M3 3L11 11M11 3L3 11" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  );
};
