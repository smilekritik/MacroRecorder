/**
 * Default constants, path resolvers, and normalization helpers for application preferences.
 */

import * as os from 'node:os';
import * as path from 'node:path';

/**
 * Resolves the default MacroRecorder application data directory.
 */
export function getDefaultSettingsDirectory(): string {
  const localAppData = process.env['LOCALAPPDATA'];
  if (localAppData && localAppData.trim().length > 0) {
    return path.join(localAppData, 'MacroRecorder');
  }
  return path.join(os.homedir(), 'AppData', 'Local', 'MacroRecorder');
}

/**
 * Default absolute path to settings.json.
 */
export function getDefaultSettingsPath(): string {
  return path.join(getDefaultSettingsDirectory(), 'settings.json');
}

/**
 * Default macro library path (empty string in settings represents this directory).
 */
export function getDefaultMacroLibraryPath(): string {
  return getDefaultSettingsDirectory();
}

/**
 * Detects the system language for first-run default.
 * Defaults to 'ru' if Russian environment/locale is detected, otherwise 'en'.
 */
export function detectSystemLanguage(): string {
  try {
    const envLang =
      process.env['LC_ALL'] ??
      process.env['LC_MESSAGES'] ??
      process.env['LANG'] ??
      process.env['LANGUAGE'];
    if (envLang && envLang.toLowerCase().startsWith('ru')) {
      return 'ru';
    }

    const defaultLocale = Intl.DateTimeFormat().resolvedOptions().locale;
    if (defaultLocale && defaultLocale.toLowerCase().startsWith('ru')) {
      return 'ru';
    }
  } catch {
    // ignore
  }
  return 'en';
}

/**
 * Clamps a number to [min, max] range.
 */
export function clamp(val: number, min: number, max: number): number {
  if (!Number.isFinite(val)) return min;
  return Math.max(min, Math.min(max, val));
}

/**
 * Clamps unit values to [0.0, 1.0].
 */
export function clampUnit(val: number): number {
  if (!Number.isFinite(val)) return 0;
  return Math.max(0, Math.min(1, val));
}

/**
 * Normalizes macro library path:
 * An empty string or path identical to the default folder normalizes to empty string "".
 */
export function normalizeMacroLibraryPath(
  inputPath: string | null | undefined,
  defaultPath = getDefaultMacroLibraryPath(),
): string {
  if (!inputPath) return '';
  const trimmed = inputPath.trim();
  if (trimmed.length === 0) return '';

  const stripTrailingSeparators = (p: string) => p.replace(/[/\\]+$/, '');
  const normInput = path.normalize(stripTrailingSeparators(trimmed));
  const normDefault = path.normalize(stripTrailingSeparators(defaultPath));

  if (normInput.toLowerCase() === normDefault.toLowerCase()) {
    return '';
  }
  return trimmed;
}

/**
 * Resolves the effective macro library path.
 * If empty or whitespace, returns the default macro library path.
 */
export function resolveEffectiveLibraryPath(
  configuredPath: string | null | undefined,
  defaultPath = getDefaultMacroLibraryPath(),
): string {
  const normalized = normalizeMacroLibraryPath(configuredPath, defaultPath);
  return normalized.length === 0 ? defaultPath : normalized;
}
