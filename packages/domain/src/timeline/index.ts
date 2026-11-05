/**
 * @macro-recorder/domain/timeline
 *
 * Timeline editing, normalization, stable simultaneous ordering, mouse compression,
 * scaling, rebasing, insertion, pause synthesis, press-release pairs, drag reordering,
 * delete compaction, comments, cross-macro copy/paste, selection restoration,
 * dirty state, and per-macro bounded undo/redo histories.
 */

// Types & Interfaces
export * from './types.js';

// Normalization & Processing
export * from './processing.js';

// Press-Release Pair Synthesis & Manual Actions
export * from './press-release.js';

// Timeline Editor & Observable Rows
export * from './editor.js';
