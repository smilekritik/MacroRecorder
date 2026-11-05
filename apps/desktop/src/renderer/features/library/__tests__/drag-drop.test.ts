/**
 * @macro-recorder/desktop - Drag and Drop Tests
 * Verifies drag validation rules: self-drop rejection, parent drop rejection,
 * self-nesting prevention, and depth enforcement.
 */

import { describe, it, expect } from 'vitest';
import {
  isSameOrInside,
  getFolderDepth,
  canDropInLibrary,
} from '../utils/drag-drop.js';
import type { LibraryTreeNodeData } from '../types.js';

describe('Library Drag and Drop Rules', () => {
  describe('isSameOrInside', () => {
    it('returns true when child equals parent', () => {
      expect(isSameOrInside('Games', 'Games')).toBe(true);
      expect(isSameOrInside('Games/RPG', 'Games/RPG')).toBe(true);
    });

    it('returns true when child is inside parent', () => {
      expect(isSameOrInside('Games/RPG', 'Games')).toBe(true);
      expect(isSameOrInside('Games/RPG/TurnBased', 'Games')).toBe(true);
      expect(isSameOrInside('Games/RPG/TurnBased', 'Games/RPG')).toBe(true);
    });

    it('returns false when child is not inside parent', () => {
      expect(isSameOrInside('Work', 'Games')).toBe(false);
      expect(isSameOrInside('Games_Old', 'Games')).toBe(false);
      expect(isSameOrInside('Games', 'Games/RPG')).toBe(false);
    });

    it('handles library root correctly', () => {
      expect(isSameOrInside('Games', '')).toBe(true);
      expect(isSameOrInside('', '')).toBe(true);
    });
  });

  describe('getFolderDepth', () => {
    it('calculates depth correctly', () => {
      expect(getFolderDepth('')).toBe(0);
      expect(getFolderDepth('A')).toBe(1);
      expect(getFolderDepth('A/B')).toBe(2);
      expect(getFolderDepth('A/B/C/D/E/F/G/H')).toBe(8);
    });
  });

  describe('canDropInLibrary', () => {
    const folderA: LibraryTreeNodeData = {
      id: 'folder:A',
      isFolder: true,
      name: 'A',
      relativePath: 'A',
      parentPath: '',
      children: [],
      macroCount: 0,
      directMacroCount: 0,
      isExpanded: true,
      isSelected: false,
      isDropTarget: false,
    };

    const folderB: LibraryTreeNodeData = {
      id: 'folder:B',
      isFolder: true,
      name: 'B',
      relativePath: 'B',
      parentPath: '',
      children: [],
      macroCount: 0,
      directMacroCount: 0,
      isExpanded: true,
      isSelected: false,
      isDropTarget: false,
    };

    const folderSubA: LibraryTreeNodeData = {
      id: 'folder:A/Sub',
      isFolder: true,
      name: 'Sub',
      relativePath: 'A/Sub',
      parentPath: 'A',
      children: [],
      macroCount: 0,
      directMacroCount: 0,
      isExpanded: true,
      isSelected: false,
      isDropTarget: false,
    };

    const macroInA: LibraryTreeNodeData = {
      id: 'macro:m1',
      isFolder: false,
      name: 'Macro 1',
      relativePath: 'A',
      macro: { id: 'm1', name: 'Macro 1', folder: 'A' } as any,
      hotkeyDisplay: '',
      isMacroEnabled: true,
      isAutomaticTrigger: false,
      isModified: false,
      isSelected: false,
      isDropTarget: false,
      tags: [],
      description: '',
    };

    it('rejects dropping onto itself', () => {
      const res = canDropInLibrary(folderA, folderA);
      expect(res.canDrop).toBe(false);
      expect(res.reason).toContain('Cannot drop onto itself');
    });

    it('rejects dropping into current parent folder (no-op)', () => {
      // Macro in A dragged to folder A
      const resMacro = canDropInLibrary(macroInA, folderA);
      expect(resMacro.canDrop).toBe(false);
      expect(resMacro.reason).toContain('Already in this folder');

      // Folder A/Sub dragged to folder A
      const resFolder = canDropInLibrary(folderSubA, folderA);
      expect(resFolder.canDrop).toBe(false);
      expect(resFolder.reason).toContain('Already in this folder');
    });

    it('rejects folder self-nesting (moving folder inside itself or child)', () => {
      // Moving folder A into folder A/Sub
      const res = canDropInLibrary(folderA, folderSubA);
      expect(res.canDrop).toBe(false);
      expect(res.reason).toContain('cannot be moved inside itself');
    });

    it('allows moving macro to a different folder', () => {
      const res = canDropInLibrary(macroInA, folderB);
      expect(res.canDrop).toBe(true);
      expect(res.targetFolder).toBe('B');
    });

    it('allows moving macro to library root (target = null)', () => {
      const res = canDropInLibrary(macroInA, null);
      expect(res.canDrop).toBe(true);
      expect(res.targetFolder).toBe('');
    });

    it('allows moving folder to a different folder', () => {
      const res = canDropInLibrary(folderA, folderB);
      expect(res.canDrop).toBe(true);
      expect(res.targetFolder).toBe('B');
    });

    it('rejects moving folder if destination depth exceeds 8 levels', () => {
      const deepTarget: LibraryTreeNodeData = {
        id: 'folder:1/2/3/4/5/6/7',
        isFolder: true,
        name: '7',
        relativePath: '1/2/3/4/5/6/7',
        parentPath: '1/2/3/4/5/6',
        children: [],
        macroCount: 0,
        directMacroCount: 0,
        isExpanded: false,
        isSelected: false,
        isDropTarget: false,
      };

      const multiLevelFolder: LibraryTreeNodeData = {
        id: 'folder:X/Y',
        isFolder: true,
        name: 'X',
        relativePath: 'X',
        parentPath: '',
        children: [
          {
            id: 'folder:X/Y',
            isFolder: true,
            name: 'Y',
            relativePath: 'X/Y',
            parentPath: 'X',
            children: [],
            macroCount: 0,
            directMacroCount: 0,
            isExpanded: false,
            isSelected: false,
            isDropTarget: false,
          },
        ],
        macroCount: 0,
        directMacroCount: 0,
        isExpanded: false,
        isSelected: false,
        isDropTarget: false,
      };

      // Depth 7 + multiLevelFolder (depth 2) = 9 > 8
      const res = canDropInLibrary(multiLevelFolder, deepTarget);
      expect(res.canDrop).toBe(false);
      expect(res.reason).toContain('Exceeds maximum folder depth');
    });
  });
});
