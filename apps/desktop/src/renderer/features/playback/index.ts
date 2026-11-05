/**
 * @macro-recorder/desktop - Playback Feature
 * Rebuilt playback, timing, targeting, and header execution controls.
 * Playback tab and header controls.
 */

export * from './types.js';
export * from './target-window-utils.js';
export { TargetWindowPicker } from './TargetWindowPicker.js';
export { PlaybackTimingView } from './PlaybackTimingView.js';
export { PlaybackTargetingView } from './PlaybackTargetingView.js';
export { PlaybackOptionsView } from './PlaybackOptionsView.js';
export { PlaybackHeaderControls } from './PlaybackHeaderControls.js';
export {
  CurrentActionProgress,
  CurrentActionProgressContent,
} from './CurrentActionProgress.js';
export {
  usePlaybackController,
  type UsePlaybackControllerOptions,
} from './usePlaybackController.js';
