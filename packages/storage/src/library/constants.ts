/**
 * Constants for macro library storage and folder hierarchy.
 */

export const MAXIMUM_FOLDER_DEPTH = 8;
export const MAXIMUM_NAME_LENGTH = 96;
export const MAXIMUM_EVENT_COUNT = 1_000_000;
export const MAXIMUM_BACKUP_MACROS = 100_000;

export const MACRO_EXTENSION = '.macro.json';
export const PORTABLE_EXTENSION = '.mrmacro';
export const BACKUP_EXTENSION = '.mrbackup';

export const RESERVED_FILE_NAMES = [
  'CON',
  'PRN',
  'AUX',
  'NUL',
  'COM1',
  'COM2',
  'COM3',
  'COM4',
  'COM5',
  'COM6',
  'COM7',
  'COM8',
  'COM9',
  'LPT1',
  'LPT2',
  'LPT3',
  'LPT4',
  'LPT5',
  'LPT6',
  'LPT7',
  'LPT8',
  'LPT9',
] as const;
