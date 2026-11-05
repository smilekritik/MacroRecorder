/**
 * Basic primitive types, branding, and result containers.
 */

/**
 * 64-bit integer timestamp or duration in microseconds.
 * Invariance rule: Stored as integer microseconds to prevent floating-point rounding drift.
 */
export type Microseconds = number;

/**
 * Milliseconds duration or timestamp representation (primarily for display or external APIs).
 */
export type Milliseconds = number;

/**
 * Standard RFC 4122 UUID representation.
 */
export type Guid = string;

/**
 * ISO 8601 formatted date-time string (e.g. 2026-08-06T20:00:00+00:00).
 */
export type ISODateTimeString = string;

/**
 * Generic Result type for operations that can fail without throwing exceptions.
 */
export type Result<T, E = Error> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: E };

export function ok<T>(value: T): Result<T, never> {
  return { ok: true, value };
}

export function err<E>(error: E): Result<never, E> {
  return { ok: false, error };
}

/**
 * Asserts that a number is a safe non-negative integer representation of microseconds.
 */
export function isIntegerMicroseconds(value: unknown): value is Microseconds {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

/**
 * Asserts that a string is a valid UUID/GUID format.
 */
const GUID_REGEX =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$|^[0-9a-fA-F]{32}$/;

export function isGuid(value: unknown): value is Guid {
  return typeof value === 'string' && GUID_REGEX.test(value);
}
