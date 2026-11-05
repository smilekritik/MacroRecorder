/**
 * Privacy classifications, redaction rules, and diagnostic bundle validation.
 * Ensures diagnostic bundles never leak user keystrokes, virtual keys, or macro event payloads.
 */

import {
  type DiagnosticBundleSummary,
  type PrivacyAuditResult,
  type PrivacyClassification,
  type ResourcePeak,
  type TimingSummary,
} from './types.js';

/**
 * Standard privacy notice embedded in diagnostic bundles.
 * Covers:
 * "Macro names, key codes and recorded events are intentionally excluded."
 */
export const PRIVACY_DISCLAIMER =
  'Macro names, key codes and recorded events are intentionally excluded.';

/**
 * Forbidden token substrings that must NEVER appear anywhere in diagnostic bundle output.
 */
export const FORBIDDEN_DIAGNOSTIC_TOKENS = [
  'VirtualKey',
  'MacroEvent',
  'ScanCode',
  'keystroke',
  'key_code',
  'rawPayload',
  'inputPayload',
] as const;

/**
 * Property names that are strictly excluded from diagnostic bundles.
 */
const EXCLUDED_PROPERTIES = new Set([
  'virtualkey',
  'virtual_key',
  'scancode',
  'scan_code',
  'extended',
  'events',
  'macroevent',
  'macroevents',
  'recordedevents',
  'deltax',
  'deltay',
  'wheeldelta',
  'absolutemove',
  'text',
  'comment',
  'pixelx',
  'pixely',
  'pixelcolor',
  'button',
  'waitkeyvirtualkey',
  'keystrokes',
  'inputpayload',
  'rawpayload',
]);

/**
 * Property names that contain sensitive personal or environment information.
 */
const SENSITIVE_PROPERTIES = new Set([
  'macroname',
  'macro_name',
  'filepath',
  'file_path',
  'folderpath',
  'folder_path',
  'windowtitle',
  'waitwindowtitle',
  'processname',
  'waitprocessname',
]);

/**
 * Classifies a property name into safe, sensitive, or excluded tier.
 */
export function classifyProperty(propertyName: string): PrivacyClassification {
  const normalized = propertyName.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (EXCLUDED_PROPERTIES.has(normalized)) {
    return 'excluded';
  }
  if (SENSITIVE_PROPERTIES.has(normalized)) {
    return 'sensitive';
  }
  return 'safe';
}

/**
 * Error thrown when diagnostic data contains restricted or forbidden user data.
 */
export class PrivacyViolationError extends Error {
  public readonly violations: readonly string[];

  public constructor(violations: readonly string[]) {
    super(
      `Diagnostic bundle privacy violation: forbidden tokens or properties detected: ${violations.join(
        ', ',
      )}`,
    );
    this.name = 'PrivacyViolationError';
    this.violations = violations;
  }
}

/**
 * Recursively audits any object, string, or payload to verify privacy compliance.
 * Checks property names and serialized content against forbidden diagnostic tokens.
 */
export function validatePrivacySafety(payload: unknown): PrivacyAuditResult {
  const violations: string[] = [];
  let checkedCount = 0;

  function inspect(val: unknown, path: string): void {
    if (val === null || val === undefined) {
      return;
    }

    if (typeof val === 'string') {
      checkedCount++;
      for (const token of FORBIDDEN_DIAGNOSTIC_TOKENS) {
        if (val.includes(token)) {
          violations.push(`Forbidden token "${token}" found at ${path || 'root'}`);
        }
      }
      return;
    }

    if (typeof val === 'number' || typeof val === 'boolean') {
      checkedCount++;
      return;
    }

    if (Array.isArray(val)) {
      for (let i = 0; i < val.length; i++) {
        inspect(val[i], `${path}[${i}]`);
      }
      return;
    }

    if (typeof val === 'object') {
      const record = val as Record<string, unknown>;
      for (const key of Object.keys(record)) {
        checkedCount++;
        const currentPath = path ? `${path}.${key}` : key;
        const classification = classifyProperty(key);

        if (classification === 'excluded') {
          violations.push(`Excluded property "${key}" found at ${currentPath}`);
        }

        // Also check if key name itself matches forbidden tokens
        for (const token of FORBIDDEN_DIAGNOSTIC_TOKENS) {
          if (key.includes(token)) {
            violations.push(
              `Key name "${key}" contains forbidden token "${token}" at ${currentPath}`,
            );
          }
        }

        inspect(record[key], currentPath);
      }
    }
  }

  inspect(payload, '');

  return {
    safe: violations.length === 0,
    violations,
    checkedPropertiesCount: checkedCount,
  };
}

/**
 * Asserts that a diagnostic payload is safe for export.
 * Throws PrivacyViolationError if any forbidden tokens or properties are found.
 */
export function assertPrivacySafe(payload: unknown): void {
  const audit = validatePrivacySafety(payload);
  if (!audit.safe) {
    throw new PrivacyViolationError(audit.violations);
  }
}

/**
 * Strips all excluded and sensitive properties from an object, leaving only safe diagnostic fields.
 */
export function sanitizeForDiagnostics(input: unknown): unknown {
  if (input === null || input === undefined) {
    return input;
  }

  if (typeof input !== 'object') {
    return input;
  }

  if (Array.isArray(input)) {
    return input.map((item) => sanitizeForDiagnostics(item));
  }

  const result: Record<string, unknown> = {};
  const record = input as Record<string, unknown>;

  for (const [key, value] of Object.entries(record)) {
    const tier = classifyProperty(key);
    if (tier === 'safe') {
      result[key] = sanitizeForDiagnostics(value);
    }
  }

  return result;
}

/**
 * Creates a valid, privacy-safe DiagnosticBundleSummary structure.
 * Automatically verifies that zero forbidden tokens or user inputs are present.
 */
export function createDiagnosticBundleSummary(params: {
  readonly timing: TimingSummary;
  readonly appVersion?: string | undefined;
  readonly os?: string | undefined;
  readonly runtime?: string | undefined;
  readonly architecture?: string | undefined;
  readonly generatedAt?: string | undefined;
  readonly peak?: ResourcePeak | undefined;
  readonly privacyDisclaimer?: string | undefined;
}): DiagnosticBundleSummary {
  const generatedAt = params.generatedAt ?? new Date().toISOString();
  const appVersion = params.appVersion ?? '1.0.0.0';
  const os =
    params.os ??
    (typeof process !== 'undefined' ? `${process.platform} ${process.arch}` : 'Windows');
  const runtime =
    params.runtime ?? (typeof process !== 'undefined' ? `Node.js ${process.version}` : 'Node.js');
  const architecture =
    params.architecture ?? (typeof process !== 'undefined' ? process.arch.toUpperCase() : 'X64');

  const summary: DiagnosticBundleSummary = {
    generatedAt,
    appVersion,
    os,
    runtime,
    architecture,
    timing: params.timing,
    ...(params.peak ? { peak: params.peak } : {}),
    privacy: params.privacyDisclaimer ?? PRIVACY_DISCLAIMER,
  };

  // Enforce zero-leakage guarantee
  assertPrivacySafe(summary);

  return summary;
}
