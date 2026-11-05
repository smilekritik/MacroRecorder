/**
 * @macro-recorder/desktop - Tree Builder Tests
 * Verifies enabled-first sorting, nested folder hierarchy (up to 8 levels),
 * recursive macro counting, and automatic trigger detection.
 */

import { describe, it, expect } from 'vitest';
import type { MacroDefinition } from '../../../../../../../packages/contracts/src/index.js';
import {
  normalizeFolder,
  folderName,
  parentFolder,
  ancestorsOf,
  isAutomaticTriggerMacro,
  orderLibraryMacros,
  buildLibraryTree,
  flattenTree,
} from '../utils/tree-builder.js';

describe('Tree Builder Utilities', () => {
  describe('Path Utilities', () => {
    it('normalizes folder paths across slashes and backslashes', () => {
      expect(normalizeFolder('Games\\Action\\RPG')).toBe('Games/Action/RPG');
      expect(normalizeFolder('/Games/Action/')).toBe('Games/Action');
      expect(normalizeFolder('///Games///')).toBe('Games');
      expect(normalizeFolder('')).toBe('');
      expect(normalizeFolder(null)).toBe('');
    });

    it('extracts folder name correctly', () => {
      expect(folderName('Games/Action/RPG')).toBe('RPG');
      expect(folderName('Games')).toBe('Games');
      expect(folderName('')).toBe('');
    });

    it('extracts parent folder correctly', () => {
      expect(parentFolder('Games/Action/RPG')).toBe('Games/Action');
      expect(parentFolder('Games/Action')).toBe('Games');
      expect(parentFolder('Games')).toBe('');
      expect(parentFolder('')).toBe('');
    });

    it('resolves ancestors in hierarchical order', () => {
      expect(ancestorsOf('Games/Action/RPG')).toEqual([
        'Games/Action/RPG',
        'Games/Action',
        'Games',
      ]);
      expect(ancestorsOf('Games')).toEqual(['Games']);
      expect(ancestorsOf('')).toEqual([]);
    });
  });

  describe('Automatic Trigger Detection', () => {
    it('detects a macro starting with a PixelColorTrigger', () => {
      const macro: MacroDefinition = {
        schemaVersion: 12,
        id: '1',
        name: 'Auto Trigger',
        folder: '',
        description: '',
        isEnabled: true,
        tags: [],
        modifiedAt: new Date().toISOString(),
        recording: {} as any,
        playback: {} as any,
        hotkey: {} as any,
        events: [
          {
            id: 'e1',
            type: 'PixelColorTrigger',
            timeMicroseconds: 0,
            comment: '',
          } as any,
        ],
      };
      expect(isAutomaticTriggerMacro(macro)).toBe(true);
    });

    it('detects automatic trigger even when preceded by comment rows', () => {
      const macro: MacroDefinition = {
        schemaVersion: 12,
        id: '2',
        name: 'Comment Then Trigger',
        folder: '',
        description: '',
        isEnabled: true,
        tags: [],
        modifiedAt: new Date().toISOString(),
        recording: {} as any,
        playback: {} as any,
        hotkey: {} as any,
        events: [
          {
            id: 'c1',
            type: 'Comment',
            timeMicroseconds: 0,
            comment: 'Note about trigger',
          } as any,
          {
            id: 'e1',
            type: 'PixelColorTrigger',
            timeMicroseconds: 1000,
            comment: '',
          } as any,
        ],
      };
      expect(isAutomaticTriggerMacro(macro)).toBe(true);
    });

    it('returns false for keyboard and mouse macros without pixel trigger', () => {
      const macro: MacroDefinition = {
        schemaVersion: 12,
        id: '3',
        name: 'Standard Macro',
        folder: '',
        description: '',
        isEnabled: true,
        tags: [],
        modifiedAt: new Date().toISOString(),
        recording: {} as any,
        playback: {} as any,
        hotkey: {} as any,
        events: [
          {
            id: 'k1',
            type: 'KeyDown',
            timeMicroseconds: 0,
            comment: '',
          } as any,
        ],
      };
      expect(isAutomaticTriggerMacro(macro)).toBe(false);
    });
  });

  describe('Enabled-First Ordering', () => {
    it('puts enabled macros before disabled macros, then orders by modifiedAt desc', () => {
      const olderEnabled: MacroDefinition = {
        schemaVersion: 12,
        id: '1',
        name: 'Older Enabled',
        folder: '',
        description: '',
        isEnabled: true,
        tags: [],
        modifiedAt: '2026-01-01T10:00:00.000Z',
        recording: {} as any,
        playback: {} as any,
        hotkey: {} as any,
        events: [],
      };

      const newerDisabled: MacroDefinition = {
        schemaVersion: 12,
        id: '2',
        name: 'Newer Disabled',
        folder: '',
        description: '',
        isEnabled: false,
        tags: [],
        modifiedAt: '2026-06-01T10:00:00.000Z',
        recording: {} as any,
        playback: {} as any,
        hotkey: {} as any,
        events: [],
      };

      const newerEnabled: MacroDefinition = {
        schemaVersion: 12,
        id: '3',
        name: 'Newer Enabled',
        folder: '',
        description: '',
        isEnabled: true,
        tags: [],
        modifiedAt: '2026-03-01T10:00:00.000Z',
        recording: {} as any,
        playback: {} as any,
        hotkey: {} as any,
        events: [],
      };

      const ordered = orderLibraryMacros([newerDisabled, olderEnabled, newerEnabled]);
      expect(ordered.map((m) => m.name)).toEqual([
        'Newer Enabled',
        'Older Enabled',
        'Newer Disabled',
      ]);
    });
  });

  describe('buildLibraryTree', () => {
    it('builds nested folder hierarchy up to 8 levels deep and calculates recursive counts', () => {
      const folders = [
        'L1',
        'L1/L2',
        'L1/L2/L3',
        'L1/L2/L3/L4',
        'L1/L2/L3/L4/L5',
        'L1/L2/L3/L4/L5/L6',
        'L1/L2/L3/L4/L5/L6/L7',
        'L1/L2/L3/L4/L5/L6/L7/L8',
      ];

      const macros: MacroDefinition[] = [
        {
          schemaVersion: 12,
          id: 'm-root',
          name: 'Root Macro',
          folder: '',
          description: '',
          isEnabled: true,
          tags: ['root'],
          modifiedAt: new Date().toISOString(),
          recording: {} as any,
          playback: {} as any,
          hotkey: {} as any,
          events: [],
        },
        {
          schemaVersion: 12,
          id: 'm-l1',
          name: 'L1 Macro',
          folder: 'L1',
          description: '',
          isEnabled: true,
          tags: ['level1'],
          modifiedAt: new Date().toISOString(),
          recording: {} as any,
          playback: {} as any,
          hotkey: {} as any,
          events: [],
        },
        {
          schemaVersion: 12,
          id: 'm-l8',
          name: 'Deepest Macro',
          folder: 'L1/L2/L3/L4/L5/L6/L7/L8',
          description: '',
          isEnabled: false,
          tags: ['deep'],
          modifiedAt: new Date().toISOString(),
          recording: {} as any,
          playback: {} as any,
          hotkey: {} as any,
          events: [],
        },
      ];

      const tree = buildLibraryTree({ folders, macros });

      // Roots: 1 folder ('L1') and 1 macro ('Root Macro')
      expect(tree.length).toBe(2);

      const l1Node = tree.find((n) => n.isFolder && n.name === 'L1');
      expect(l1Node).toBeDefined();
      if (l1Node && l1Node.isFolder) {
        expect(l1Node.macroCount).toBe(2); // m-l1 and m-l8
        expect(l1Node.directMacroCount).toBe(1); // m-l1
      }
    });

    it('filters by search query and auto-expands ancestor folders', () => {
      const folders = ['Games', 'Games/RPG'];
      const macros: MacroDefinition[] = [
        {
          schemaVersion: 12,
          id: '1',
          name: 'Heal Combo',
          folder: 'Games/RPG',
          description: 'Spams potion key',
          isEnabled: true,
          tags: ['healing'],
          modifiedAt: new Date().toISOString(),
          recording: {} as any,
          playback: {} as any,
          hotkey: {} as any,
          events: [],
        },
        {
          schemaVersion: 12,
          id: '2',
          name: 'Attack Macro',
          folder: 'Games',
          description: 'Basic attack',
          isEnabled: true,
          tags: ['dps'],
          modifiedAt: new Date().toISOString(),
          recording: {} as any,
          playback: {} as any,
          hotkey: {} as any,
          events: [],
        },
      ];

      const tree = buildLibraryTree({
        folders,
        macros,
        searchQuery: 'potion', // Matches Heal Combo description
      });

      expect(tree.length).toBe(1);
      const gamesNode = tree[0];
      expect(gamesNode?.isFolder).toBe(true);
      if (gamesNode?.isFolder) {
        expect(gamesNode.isExpanded).toBe(true);
        expect(gamesNode.children.length).toBe(1); // Games/RPG
        const rpgNode = gamesNode.children[0];
        expect(rpgNode?.isFolder).toBe(true);
        if (rpgNode?.isFolder) {
          expect(rpgNode.isExpanded).toBe(true);
          expect(rpgNode.children.length).toBe(1);
          expect(rpgNode.children[0]?.name).toBe('Heal Combo');
        }
      }
    });

    it('flattens visible nodes respecting isExpanded', () => {
      const folders = ['Work'];
      const macros: MacroDefinition[] = [
        {
          schemaVersion: 12,
          id: '1',
          name: 'Root Macro',
          folder: '',
          description: '',
          isEnabled: true,
          tags: [],
          modifiedAt: new Date().toISOString(),
          recording: {} as any,
          playback: {} as any,
          hotkey: {} as any,
          events: [],
        },
        {
          schemaVersion: 12,
          id: '2',
          name: 'Work Macro',
          folder: 'Work',
          description: '',
          isEnabled: true,
          tags: [],
          modifiedAt: new Date().toISOString(),
          recording: {} as any,
          playback: {} as any,
          hotkey: {} as any,
          events: [],
        },
      ];

      // Collapsed: Work folder is collapsed
      const treeCollapsed = buildLibraryTree({
        folders,
        macros,
        expandedFolders: new Set(),
      });
      const flatCollapsed = flattenTree(treeCollapsed);
      expect(flatCollapsed.map((n) => n.name)).toEqual(['Work', 'Root Macro']);

      // Expanded: Work folder expanded
      const treeExpanded = buildLibraryTree({
        folders,
        macros,
        expandedFolders: new Set(['Work']),
      });
      const flatExpanded = flattenTree(treeExpanded);
      expect(flatExpanded.map((n) => n.name)).toEqual(['Work', 'Work Macro', 'Root Macro']);
    });
  });
});
