/**
 * @macro-recorder/domain/recording
 *
 * Platform-neutral recording policy, session coordinator, source filtering,
 * time origin tracking, monotonic conversions, pause/resume policy,
 * overwrite/continue/append transformations, mouse bucketing, and native event converters.
 */

// Types, Enums & States
export * from './types.js';

// Monotonic Clocks
export * from './clock.js';

// Source Filtering & Press State Tracking
export * from './source-filter.js';

// Management Hotkeys & Control Modifiers Cleanup
export * from './control-hotkeys.js';

// Native Hooks & Hardware Event Converters
export * from './event-conversion.js';

// Overwrite, Continue, and Append Timeline Transformations
export * from './timeline-transformations.js';

// Recording Session Coordinator
export * from './session.js';
