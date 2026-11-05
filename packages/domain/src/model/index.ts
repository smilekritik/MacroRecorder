/**
 * @macro-recorder/domain/model
 *
 * Core macro model, immutable helpers, display semantics.
 */

// Types & Contracts
export * from './types.js';

// Key, Gamepad, and Mouse Button Names
export * from './key-names.js';

// Human-Readable Display Formatting
export * from './display.js';

// Hotkey Binding
export * from './hotkey.js';

// Options & Repeat Forever Policy
export * from './options.js';

// Overlay Override Resolution
export * from './overlay.js';

// Macro Events & Factories
export * from './event.js';

// Diagnostics & Timing Summary
export * from './diagnostics.js';

// Timeline Processing & Compression
export * from './processing.js';

// Macro Definition & Duration
export * from './macro.js';

// Legacy class-compatible constructor aliases
export { MacroModel as MacroDefinition } from './macro.js';
export { MacroEventModel as MacroEvent } from './event.js';
export { HotkeyBindingModel as HotkeyBinding } from './hotkey.js';
export { PlaybackOptionsModel as PlaybackOptions } from './options.js';
export { RecordingOptionsModel as RecordingOptions } from './options.js';
export { DispatchReceiptModel as DispatchReceipt } from './diagnostics.js';
