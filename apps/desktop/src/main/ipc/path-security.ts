/**
 * Path security enforcement for Electron Main IPC.
 * Strictly verifies path capabilities, rejecting path traversal, null bytes,
 * system directory tampering, and unauthorized file extensions.
 */

import path from 'node:path';

const MAX_PATH_LENGTH = 1024;
const MAX_RELATIVE_PATH_LENGTH = 260;

const FORBIDDEN_CHARACTERS_REGEX = /[<>:"|?*]/;

function hasControlCharacters(str: string): boolean {
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);
    if (code < 32 || code === 127) {
      return true;
    }
  }
  return false;
}

const RESERVED_DEVICE_NAMES = new Set([
  'CON', 'PRN', 'AUX', 'NUL',
  'COM1', 'COM2', 'COM3', 'COM4', 'COM5', 'COM6', 'COM7', 'COM8', 'COM9',
  'LPT1', 'LPT2', 'LPT3', 'LPT4', 'LPT5', 'LPT6', 'LPT7', 'LPT8', 'LPT9',
]);

const SENSITIVE_SYSTEM_PREFIXES = [
  'c:/windows',
  'c:/winnt',
  'c:/program files',
  'c:/program files (x86)',
  '/windows/',
  '/etc/',
  '/bin/',
  '/usr/',
];

export interface PathSecurityResult {
  readonly valid: boolean;
  readonly sanitizedPath?: string | undefined;
  readonly error?: string | undefined;
}

/**
 * Validates a library folder relative path.
 * Must stay strictly relative to the library root and contain no traversal sequences.
 */
export function validateMainRelativePath(relativePath: string): PathSecurityResult {
  if (typeof relativePath !== 'string') {
    return { valid: false, error: 'Folder relative path must be a string' };
  }

  const trimmed = relativePath.trim();
  if (trimmed.length === 0) {
    return { valid: true, sanitizedPath: '' };
  }

  if (trimmed.length > MAX_RELATIVE_PATH_LENGTH) {
    return {
      valid: false,
      error: `Folder path length (${trimmed.length}) exceeds maximum allowed (${MAX_RELATIVE_PATH_LENGTH})`,
    };
  }

  if (hasControlCharacters(trimmed)) {
    return { valid: false, error: 'Folder path contains illegal control characters or null bytes' };
  }

  // Reject absolute paths
  if (path.isAbsolute(trimmed) || trimmed.startsWith('/') || trimmed.startsWith('\\') || /^[a-zA-Z]:/.test(trimmed)) {
    return { valid: false, error: 'Folder path must be relative, not absolute' };
  }

  const normalized = path.normalize(trimmed).replace(/\\/g, '/');

  // Verify normalized path does not escape root
  if (normalized.startsWith('..') || normalized.includes('/../')) {
    return { valid: false, error: 'Path traversal sequence ".." is strictly rejected' };
  }

  const segments = normalized.split('/').filter(Boolean);
  for (const segment of segments) {
    if (FORBIDDEN_CHARACTERS_REGEX.test(segment)) {
      return { valid: false, error: `Folder segment "${segment}" contains invalid characters` };
    }

    const baseName = segment.split('.')[0]?.toUpperCase() ?? '';
    if (RESERVED_DEVICE_NAMES.has(baseName)) {
      return { valid: false, error: `Folder segment "${segment}" uses a reserved DOS device name` };
    }
  }

  return { valid: true, sanitizedPath: segments.join('/') };
}

/**
 * Validates an absolute or canonical file path for imports, exports, or backups.
 */
export function validateMainFilePath(
  filePath: string,
  options: {
    readonly allowedExtensions?: readonly string[] | undefined;
    readonly disallowSystemDirs?: boolean | undefined;
  } = {},
): PathSecurityResult {
  if (typeof filePath !== 'string' || filePath.trim().length === 0) {
    return { valid: false, error: 'File path cannot be empty' };
  }

  const trimmed = filePath.trim();

  if (trimmed.length > MAX_PATH_LENGTH) {
    return {
      valid: false,
      error: `File path length (${trimmed.length}) exceeds maximum limit of ${MAX_PATH_LENGTH}`,
    };
  }

  if (hasControlCharacters(trimmed)) {
    return { valid: false, error: 'File path contains illegal control characters or null bytes' };
  }

  const normalized = path.normalize(trimmed);

  // Check for traversal that remains after normalization
  if (trimmed.includes('..') && normalized !== path.resolve(trimmed)) {
    return { valid: false, error: 'Path contains illegal directory traversal sequences' };
  }

  // Check for DOS devices
  const fileName = path.basename(normalized);
  const baseName = fileName.split('.')[0]?.toUpperCase() ?? '';
  if (RESERVED_DEVICE_NAMES.has(baseName)) {
    return { valid: false, error: `File path references reserved device "${baseName}"` };
  }

  // Block sensitive OS and system directory paths
  const lowerNormalized = normalized.toLowerCase().replace(/\\/g, '/');
  const disallowSystem = options.disallowSystemDirs ?? true;
  if (disallowSystem) {
    for (const prefix of SENSITIVE_SYSTEM_PREFIXES) {
      if (lowerNormalized.startsWith(prefix) || lowerNormalized.includes(prefix)) {
        return { valid: false, error: `Access to sensitive operating system directory "${prefix}" is denied` };
      }
    }
  }

  // Verify extension if whitelist is provided
  if (options.allowedExtensions && options.allowedExtensions.length > 0) {
    const ext = path.extname(normalized).toLowerCase();
    const isAllowed = options.allowedExtensions.some((allowed) => allowed.toLowerCase() === ext);
    if (!isAllowed) {
      return {
        valid: false,
        error: `File extension "${ext}" is not permitted. Allowed: ${options.allowedExtensions.join(', ')}`,
      };
    }
  }

  return { valid: true, sanitizedPath: normalized };
}
