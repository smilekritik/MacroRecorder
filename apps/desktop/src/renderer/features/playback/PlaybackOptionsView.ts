import React from 'react';
import { PlaybackTimingView } from './PlaybackTimingView.js';
import { PlaybackTargetingView } from './PlaybackTargetingView.js';
import type { PlaybackOptionsViewProps } from './types.js';

/**
 * Arranges PlaybackTimingView (Column 1) and PlaybackTargetingView (Column 2) side by side.
 */
export function PlaybackOptionsView({
  options,
  onChange,
  openWindows,
  isAppElevated = false,
  onRefreshWindows,
  disabled = false,
  className = '',
}: PlaybackOptionsViewProps) {
  return React.createElement(
    'div',
    {
      className: `w-full h-full overflow-y-auto p-4 sm:p-6 select-none ${className}`,
    },
    React.createElement(
      'div',
      {
        className: 'max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-7 items-start',
      },
      // Column 1: Playback timing
      React.createElement(PlaybackTimingView, {
        options,
        onChange,
        disabled,
      }),
      // Column 2: Input mode & targeting
      React.createElement(PlaybackTargetingView, {
        options,
        onChange,
        openWindows,
        isAppElevated,
        onRefreshWindows,
        disabled,
      }),
    ),
  );
}
