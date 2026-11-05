/**
 * Standard typed application, domain, IPC, and native errors.
 */

import { enumValues, object, optional, string, type Schema } from './validation.js';

export const IpcErrorCode = {
  INVALID_ARGUMENT: 'INVALID_ARGUMENT',
  NOT_FOUND: 'NOT_FOUND',
  ALREADY_EXISTS: 'ALREADY_EXISTS',
  PERMISSION_DENIED: 'PERMISSION_DENIED',
  RESOURCE_EXHAUSTED: 'RESOURCE_EXHAUSTED',
  FAILED_PRECONDITION: 'FAILED_PRECONDITION',
  ABORTED: 'ABORTED',
  CANCELLED: 'CANCELLED',
  UNAVAILABLE: 'UNAVAILABLE',
  INTERNAL: 'INTERNAL',
  UNSUPPORTED_VERSION: 'UNSUPPORTED_VERSION',
  CHECKSUM_MISMATCH: 'CHECKSUM_MISMATCH',
  CORRUPT_DATA: 'CORRUPT_DATA',
  HOTKEY_CONFLICT: 'HOTKEY_CONFLICT',
  RECURSION_LIMIT_EXCEEDED: 'RECURSION_LIMIT_EXCEEDED',
  CYCLE_DETECTED: 'CYCLE_DETECTED',
  DRIVER_NOT_FOUND: 'DRIVER_NOT_FOUND',
  NATIVE_HOOK_ERROR: 'NATIVE_HOOK_ERROR',
  WINDOW_NOT_FOUND: 'WINDOW_NOT_FOUND',
} as const;

export type IpcErrorCode = (typeof IpcErrorCode)[keyof typeof IpcErrorCode];

export interface AppError {
  readonly code: IpcErrorCode;
  readonly message: string;
  readonly details?: Readonly<Record<string, unknown>> | undefined;
  readonly stack?: string | undefined;
}

export class MacroRecorderError extends Error implements AppError {
  public readonly code: IpcErrorCode;
  public readonly details?: Readonly<Record<string, unknown>> | undefined;

  constructor(
    code: IpcErrorCode,
    message: string,
    details?: Readonly<Record<string, unknown>> | undefined,
  ) {
    super(message);
    this.name = 'MacroRecorderError';
    this.code = code;
    this.details = details;
  }

  public toJSON(): AppError {
    return {
      code: this.code,
      message: this.message,
      ...(this.details !== undefined ? { details: this.details } : {}),
      ...(this.stack !== undefined ? { stack: this.stack } : {}),
    };
  }
}

export const appErrorSchema: Schema<AppError> = object({
  code: enumValues(Object.values(IpcErrorCode)),
  message: string({ min: 1 }),
  details: optional(object({}, { passthrough: true })),
  stack: optional(string()),
});
