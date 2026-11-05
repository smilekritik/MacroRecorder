/**
 * @macro-recorder/contracts
 *
 * Unified versioned domain, IPC, native, and presentation contracts
 * for Macro Recorder.
 */

// Common
export * from './common/types.js';
export * from './common/validation.js';
export * from './common/errors.js';

// Domain
export * from './domain/enums.js';
export * from './domain/key-constants.js';
export * from './domain/hotkey.js';
export * from './domain/options.js';
export * from './domain/event.js';
export * from './domain/macro.js';
export * from './domain/legacy-macros.js';
export * from './domain/packages.js';
export * from './domain/diagnostics.js';
export * from './domain/import-export.js';

// Preferences
export * from './preferences/preferences.js';

// Descriptors
export * from './descriptors/window.js';
export * from './descriptors/controller.js';

// Overlay
export * from './overlay/overlay.js';

// Native
export * from './native/events.js';
export * from './native/commands.js';
export * from './native/callbacks.js';

// IPC
export * from './ipc/channels.js';
export * from './ipc/requests.js';
export * from './ipc/responses.js';
export * from './ipc/contracts.js';
export * from './ipc/validators.js';
