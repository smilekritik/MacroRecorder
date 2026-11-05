/**
 * Preload-side path validation guard.
 * Prevents path traversal, null-byte injection, and dangerous path formats before requests cross the IPC boundary.
 */

const MAX_PATH_LENGTH = 1024;
const MAX_RELATIVE_PATH_LENGTH = 260;

// Windows forbidden filename characters (excluding directory separators for paths)
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

// Dangerous DOS device names on Windows
const RESERVED_DEVICE_NAMES = new Set([
  'CON', 'PRN', 'AUX', 'NUL',
  'COM1', 'COM2', 'COM3', 'COM4', 'COM5', 'COM6', 'COM7', 'COM8', 'COM9',
  'LPT1', 'LPT2', 'LPT3', 'LPT4', 'LPT5', 'LPT6', 'LPT7', 'LPT8', 'LPT9',
]);

export interface PathValidationResult {
  readonly ok: boolean;
  readonly sanitizedPath?: string | undefined;
  readonly error?: string | undefined;
}

/**
 * Validates a relative folder path (e.g. "Workflows/Finance").
 * Strict rejection of path traversal and absolute path injection.
 */
export function validatePreloadRelativePath(relativePath: string): PathValidationResult {
  if (typeof relativePath !== 'string') {
    return { ok: false, error: 'Folder path must be a string' };
  }

  const trimmed = relativePath.trim();
  // An empty relative path is allowed to designate the library root
  if (trimmed.length === 0) {
    return { ok: true, sanitizedPath: '' };
  }

  if (trimmed.length > MAX_RELATIVE_PATH_LENGTH) {
    return {
      ok: false,
      error: `Folder path exceeds maximum length of ${MAX_RELATIVE_PATH_LENGTH} characters`,
    };
  }

  if (hasControlCharacters(trimmed)) {
    return { ok: false, error: 'Folder path contains forbidden control characters or null bytes' };
  }

  // Reject absolute paths
  if (trimmed.startsWith('/') || trimmed.startsWith('\\') || /^[a-zA-Z]:/.test(trimmed)) {
    return { ok: false, error: 'Folder path must be relative, not absolute' };
  }

  // Normalize separators to forward slash for segmentation
  const normalized = trimmed.replace(/\\/g, '/');
  const segments = normalized.split('/');

  for (const segment of segments) {
    if (segment === '..') {
      return { ok: false, error: 'Path traversal sequence ".." is strictly forbidden' };
    }
    if (segment === '.' || segment === '') {
      // Empty segments like "a//b" or current directory "."
      continue;
    }

    if (FORBIDDEN_CHARACTERS_REGEX.test(segment)) {
      return {
        ok: false,
        error: `Folder segment "${segment}" contains invalid characters (< > : " | ? * or null)`,
      };
    }

    const upperBase = segment.split('.')[0]?.toUpperCase() ?? '';
    if (RESERVED_DEVICE_NAMES.has(upperBase)) {
      return { ok: false, error: `Folder name "${segment}" uses a reserved DOS device name` };
    }
  }

  // Re-join sanitized clean segments with forward slash
  const cleanSegments = segments.filter((s) => s !== '' && s !== '.');
  return { ok: true, sanitizedPath: cleanSegments.join('/') };
}

/**
 * Validates an import or export file path.
 */
export function validatePreloadFilePath(
  filePath: string,
  allowedExtensions?: readonly string[],
): PathValidationResult {
  if (typeof filePath !== 'string' || filePath.trim().length === 0) {
    return { ok: false, error: 'File path cannot be empty' };
  }

  const trimmed = filePath.trim();

  if (trimmed.length > MAX_PATH_LENGTH) {
    return {
      ok: false,
      error: `File path exceeds maximum length of ${MAX_PATH_LENGTH} characters`,
    };
  }

  if (hasControlCharacters(trimmed)) {
    return { ok: false, error: 'File path contains control characters or null bytes' };
  }

  // Check for path traversal sequences
  if (trimmed.includes('/../') || trimmed.includes('\\..\\') || trimmed.endsWith('/..') || trimmed.endsWith('\\..')) {
    return { ok: false, error: 'File path cannot contain path traversal sequences' };
  }

  // Check for reserved Windows device names
  const fileName = trimmed.split(/[/\\]/).pop() ?? '';
  const baseName = fileName.split('.')[0]?.toUpperCase() ?? '';
  if (RESERVED_DEVICE_NAMES.has(baseName)) {
    return { ok: false, error: `File path uses a reserved Windows device name "${baseName}"` };
  }

  // Check allowed extensions if specified
  if (allowedExtensions && allowedExtensions.length > 0) {
    const ext = fileName.includes('.') ? `.${fileName.split('.').pop()!.toLowerCase()}` : '';
    const isAllowed = allowedExtensions.some((allowed) => allowed.toLowerCase() === ext);
    if (!isAllowed) {
      return {
        ok: false,
        error: `File extension "${ext}" is not permitted. Allowed: ${allowedExtensions.join(', ')}`,
      };
    }
  }

  return { ok: true, sanitizedPath: trimmed };
}
