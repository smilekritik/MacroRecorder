/**
 * @macro-recorder/desktop - Library Naming Tests
 * Verifies unique naming across library macros with automatic numeric suffixes.
 */

import { describe, it, expect } from 'vitest';
import {
  sanitizeName,
  resolveUniqueMacroName,
  resolveUniqueFolderName,
} from '../utils/naming.js';

describe('Library Naming Utilities', () => {
  describe('sanitizeName', () => {
    it('removes invalid filesystem characters', () => {
      expect(sanitizeName('Valid Macro Name')).toBe('Valid Macro Name');
      expect(sanitizeName('Bad/Macro:Name*?')).toBe('BadMacroName');
      expect(sanitizeName('   Trimmed   ')).toBe('Trimmed');
      expect(sanitizeName('///', 'DefaultFallback')).toBe('DefaultFallback');
    });
  });

  describe('resolveUniqueMacroName', () => {
    it('returns desired name if not taken', () => {
      const existing = ['macro a', 'macro b'];
      expect(resolveUniqueMacroName('combo', existing)).toBe('combo');
    });

    it('adds numeric suffix 2 when name is taken', () => {
      const existing = ['combo'];
      expect(resolveUniqueMacroName('combo', existing)).toBe('combo 2');
    });

    it('increments numeric suffix when combo 2 is also taken', () => {
      const existing = ['combo', 'combo 2'];
      expect(resolveUniqueMacroName('combo', existing)).toBe('combo 3');
    });

    it('handles incrementing already numbered input names', () => {
      const existing = ['combo 2'];
      expect(resolveUniqueMacroName('combo 2', existing)).toBe('combo 3');
    });

    it('performs case-insensitive comparison', () => {
      const existing = ['Combo'];
      expect(resolveUniqueMacroName('combo', existing)).toBe('combo 2');
    });

    it('ignores the current macro id when renaming to same name', () => {
      const existing = ['my macro'];
      const macroIdMap = new Map([['my macro', 'id-1']]);
      expect(resolveUniqueMacroName('my macro', existing, 'id-1', macroIdMap)).toBe('my macro');
    });
  });

  describe('resolveUniqueFolderName', () => {
    it('returns name if no sibling folder has the same name', () => {
      const allFolders = ['Games/RPG', 'Work/Docs'];
      expect(resolveUniqueFolderName('Action', 'Games', allFolders)).toBe('Action');
    });

    it('increments sibling folder name if already taken in same parent', () => {
      const allFolders = ['Games/RPG'];
      expect(resolveUniqueFolderName('RPG', 'Games', allFolders)).toBe('RPG 2');
    });

    it('allows same folder name in different parent folders', () => {
      const allFolders = ['Games/Common'];
      expect(resolveUniqueFolderName('Common', 'Work', allFolders)).toBe('Common');
    });
  });
});
