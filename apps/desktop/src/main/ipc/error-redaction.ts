/**
 * Error redaction and sanitization for Electron Main IPC.
 * Prevents system internals, local user directory paths, memory pointers,
 * and credentials from leaking unredacted to the renderer.
 */

import { IpcErrorCode, type AppError, type IpcResult } from './types.js';

// Regex matching Windows and Unix local user paths
const USER_PATH_REGEX = /([a-zA-Z]:\\(?:Users|Documents and Settings)\\[^\s:;,"]+|\/(?:home|Users)\/[^\s:;,"]+)/gi;
// Memory pointer pattern: 0x00007FF...
const POINTER_REGEX = /\b0x[0-9a-fA-F]{8,16}\b/g;

/**
 * Redacts sensitive paths and memory addresses from a message string.
 */
export function redactMessage(message: string): string {
  return message
    .replace(USER_PATH_REGEX, '<redacted-user-path>')
    .replace(POINTER_REGEX, '<redacted-ptr>');
}

/**
 * Translates an unknown error into a sanitized, typed AppError envelope.
 */
export function redactError(error: unknown, isProduction = process.env.NODE_ENV === 'production'): AppError {
  if (error && typeof error === 'object' && 'code' in error && typeof (error as { code: unknown }).code === 'string') {
    const typed = error as {
      code: string;
      message?: unknown;
      details?: Readonly<Record<string, unknown>>;
      stack?: unknown;
    };
    const code = Object.values(IpcErrorCode).includes(typed.code as IpcErrorCode)
      ? (typed.code as IpcErrorCode)
      : IpcErrorCode.INTERNAL;

    const rawMessage = typeof typed.message === 'string' ? typed.message : 'Application error occurred';
    const message = redactMessage(rawMessage);

    return {
      code,
      message,
      ...(typed.details !== undefined ? { details: typed.details } : {}),
      ...(isProduction || typeof typed.stack !== 'string' ? {} : { stack: redactMessage(typed.stack) }),
    };
  }

  if (error instanceof Error) {
    const message = redactMessage(error.message || 'Internal system error');
    return {
      code: IpcErrorCode.INTERNAL,
      message,
      ...(isProduction || !error.stack ? {} : { stack: redactMessage(error.stack) }),
    };
  }

  return {
    code: IpcErrorCode.INTERNAL,
    message: redactMessage(String(error ?? 'Unknown error occurred')),
  };
}

/**
 * Creates an error response result envelope.
 */
export function createErrorResult<T = never>(
  code: IpcErrorCode,
  message: string,
  requestId: string,
  details?: Readonly<Record<string, unknown>>,
): IpcResult<T> {
  return {
    success: false,
    error: {
      code,
      message: redactMessage(message),
      ...(details !== undefined ? { details } : {}),
    },
    requestId,
  };
}
