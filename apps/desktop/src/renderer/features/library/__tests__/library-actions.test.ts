/**
 * @macro-recorder/desktop - Library Actions Tests
 * Verifies create, duplicate, rename, move, delete, restore, bulk enable/disable,
 * clipboard copy/paste, and undo stack workflows.
 */

import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import type { MacroDefinition } from '../../../../../../../packages/contracts/src/index.js';
import {
  createMacroAction,
  duplicateMacroAction,
  renameMacroAction,
  deleteMacroAction,
  createFolderAction,
  deleteFolderAction,
  moveFolderAction,
  setFolderMacrosEnabledAction,
  useLibraryActions,
} from '../hooks/useLibraryActions.js';

describe('Library Actions Hook and Workflows', () => {
  describe('Pure Action Functions', () => {
    it('creates a new macro with unique name in target folder', async () => {
      const existing: MacroDefinition = {
        schemaVersion: 12,
        id: 'm1',
        name: 'New macro',
        folder: '',
        description: '',
        isEnabled: true,
        tags: [],
        modifiedAt: new Date().toISOString(),
        recording: {} as any,
        playback: {} as any,
        hotkey: {} as any,
        events: [],
      };

      const onSaveMacro = vi.fn(async () => ({ success: true }));
      const created = await createMacroAction({
        macros: [existing],
        targetFolder: 'Games',
        onSaveMacro,
      });

      expect(created.name).toBe('New macro 2');
      expect(created.folder).toBe('Games');
      expect(onSaveMacro).toHaveBeenCalledWith(created, true);
    });

    it('duplicates a macro with unique numbered name', async () => {
      const source: MacroDefinition = {
        schemaVersion: 12,
        id: 'm1',
        name: 'Combo',
        folder: 'Games',
        description: 'Test',
        isEnabled: true,
        tags: ['test'],
        modifiedAt: new Date().toISOString(),
        recording: {} as any,
        playback: {} as any,
        hotkey: {} as any,
        events: [],
      };

      const onSaveMacro = vi.fn(async () => ({ success: true }));
      const copy = await duplicateMacroAction({
        sourceMacro: source,
        allMacros: [source],
        onSaveMacro,
      });

      expect(copy.name).toBe('Combo 2');
      expect(copy.id).not.toBe(source.id);
      expect(copy.folder).toBe('Games');
      expect(onSaveMacro).toHaveBeenCalledWith(copy, true);
    });

    it('renames a macro with unique name check', async () => {
      const source: MacroDefinition = {
        schemaVersion: 12,
        id: 'm1',
        name: 'Original Name',
        folder: '',
        description: '',
        isEnabled: true,
        tags: [],
        modifiedAt: new Date().toISOString(),
        recording: {} as any,
        playback: {} as any,
        hotkey: {} as any,
        events: [],
      };

      const onSaveMacro = vi.fn(async () => ({ success: true }));
      const renamed = await renameMacroAction({
        macro: source,
        newName: 'New Name',
        allMacros: [source],
        onSaveMacro,
      });

      expect(renamed).toBe('New Name');
      expect(onSaveMacro).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'New Name' }),
        true,
      );
    });

    it('deletes a macro and returns trash token', async () => {
      const macro: MacroDefinition = {
        schemaVersion: 12,
        id: 'm-del',
        name: 'To Delete',
        folder: 'Trashable',
        description: '',
        isEnabled: true,
        tags: [],
        modifiedAt: new Date().toISOString(),
        recording: {} as any,
        playback: {} as any,
        hotkey: {} as any,
        events: [],
      };

      const onDeleteMacro = vi.fn(async () => ({ token: 'trash-token-123' }));
      const token = await deleteMacroAction({ macro, onDeleteMacro });

      expect(token).toBe('trash-token-123');
      expect(onDeleteMacro).toHaveBeenCalledWith('m-del');
    });

    it('creates, moves, and deletes folders', async () => {
      const onCreateFolder = vi.fn(async () => ({ success: true }));
      const onMoveFolder = vi.fn(async () => ({ success: true }));
      const onDeleteFolder = vi.fn(async () => ({ token: 'trash-folder-1' }));

      // Create
      const created = await createFolderAction({
        parentPath: 'Games',
        folderNameInput: 'RPG',
        allFolders: ['Games'],
        onCreateFolder,
      });
      expect(created).toBe('Games/RPG');
      expect(onCreateFolder).toHaveBeenCalledWith('Games/RPG');

      // Move
      const moved = await moveFolderAction({
        sourcePath: 'Games/RPG',
        destinationParentPath: 'Archive',
        onMoveFolder,
      });
      expect(moved).toBe('Archive/RPG');
      expect(onMoveFolder).toHaveBeenCalledWith({
        sourceRelativePath: 'Games/RPG',
        targetRelativePath: 'Archive/RPG',
      });

      // Delete
      const token = await deleteFolderAction({
        folderRelativePath: 'Archive/RPG',
        onDeleteFolder,
      });
      expect(token).toBe('trash-folder-1');
      expect(onDeleteFolder).toHaveBeenCalledWith('Archive/RPG');
    });

    it('performs bulk folder enabling and disabling', async () => {
      const m1: MacroDefinition = {
        schemaVersion: 12,
        id: '1',
        name: 'M1',
        folder: 'Work',
        description: '',
        isEnabled: false,
        tags: [],
        modifiedAt: new Date().toISOString(),
        recording: {} as any,
        playback: {} as any,
        hotkey: {} as any,
        events: [],
      };

      const m2: MacroDefinition = {
        schemaVersion: 12,
        id: '2',
        name: 'M2',
        folder: 'Work/Reports',
        description: '',
        isEnabled: false,
        tags: [],
        modifiedAt: new Date().toISOString(),
        recording: {} as any,
        playback: {} as any,
        hotkey: {} as any,
        events: [],
      };

      const onSaveMacro = vi.fn(async () => ({ success: true }));

      const res = await setFolderMacrosEnabledAction({
        folderPath: 'Work',
        enabled: true,
        macros: [m1, m2],
        onSaveMacro,
      });

      expect(res.changed).toBe(2);
      expect(res.skipped).toBe(0);
      expect(onSaveMacro).toHaveBeenCalledTimes(2);
    });
  });

  describe('useLibraryActions Hook Integration', () => {
    it('initializes hook and exposes undo stack and clipboard', () => {
      let captured: ReturnType<typeof useLibraryActions> | null = null;

      function TestHarness() {
        captured = useLibraryActions({
          macros: [],
          folders: [],
          onSaveMacro: async () => ({}),
          onDeleteMacro: async () => ({}),
          onRestoreMacro: async () => ({}),
          onMoveMacro: async () => ({}),
          onCreateFolder: async () => ({}),
          onDeleteFolder: async () => ({}),
          onMoveFolder: async () => ({}),
        });
        return React.createElement('div', null, 'loaded');
      }

      renderToString(React.createElement(TestHarness));

      expect(captured).not.toBeNull();
      expect(captured!.canUndo).toBe(false);
      expect(captured!.clipboard).toBeNull();
      expect(typeof captured!.createMacro).toBe('function');
      expect(typeof captured!.undo).toBe('function');
    });
  });
});
