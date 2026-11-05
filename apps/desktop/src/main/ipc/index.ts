/**
 * Public exports for Electron Main IPC infrastructure.
 * Provides typed handlers, sender authentication, path capability validation,
 * cancellation management, push subscription tracking, error redaction, and WebContents security policies.
 */

export * from './channels.js';
export * from './types.js';
export * from './sender.js';
export * from './path-security.js';
export * from './error-redaction.js';
export * from './cancellation.js';
export * from './subscriptions.js';
export * from './security.js';
export * from './validation.js';
export * from './registry.js';
