/**
 * @macro-recorder/desktop - Library Components Tests
 * Verifies rendering and user interaction flows for HotkeyAssignmentBox,
 * TagManager, MacroDetailsHeader, ConfirmDeleteDialog, DirtyNavigationDialog,
 * and MacroLibraryPanel.
 */

import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import type { MacroDefinition } from '../../../../../../../packages/contracts/src/index.js';
import { HotkeyAssignmentBox } from '../components/HotkeyAssignmentBox.js';
import { TagManager } from '../components/TagManager.js';
import { MacroDetailsHeader } from '../components/MacroDetailsHeader.js';
import { ConfirmDeleteDialog } from '../components/ConfirmDeleteDialog.js';
import { DirtyNavigationDialog } from '../components/DirtyNavigationDialog.js';
import { MacroLibraryPanel } from '../components/MacroLibraryPanel.js';

// Mock design-system Modal to render children directly during test rendering
vi.mock('../../../design-system/Modal.js', () => ({
  Modal: ({ isOpen, children, title }: any) => {
    if (!isOpen) return null;
    return React.createElement(
      'div',
      { 'data-modal-open': 'true', 'data-modal-title': title },
      children,
    );
  },
}));

describe('Library Components', () => {
  const sampleMacro: MacroDefinition = {
    schemaVersion: 12,
    id: 'm1',
    name: 'Sample Macro',
    folder: 'Games',
    description: 'This is a sample description.',
    isEnabled: true,
    tags: ['sample', 'test'],
    modifiedAt: new Date().toISOString(),
    recording: {} as any,
    playback: {} as any,
    hotkey: {
      virtualKey: 0x41, // 'A'
      mouseButton: 'None',
      wheel: 'None',
      control: true,
      alt: false,
      shift: false,
      windows: false,
    },
    events: [],
  };

  describe('HotkeyAssignmentBox', () => {
    it('renders current macro hotkey display without being stale', () => {
      const html = renderToString(
        React.createElement(HotkeyAssignmentBox, {
          macro: sampleMacro,
          allMacros: [sampleMacro],
          onAssignHotkey: vi.fn(),
        }),
      );

      expect(html).toContain('Ctrl + A');
      expect(html).toContain('Macro shortcut');
      expect(html).toContain('Clear');
    });

    it('displays "Automatic trigger" for pixel triggers', () => {
      const autoMacro: MacroDefinition = {
        ...sampleMacro,
        events: [
          {
            id: 'e1',
            type: 'PixelColorTrigger',
            timeMicroseconds: 0,
            comment: '',
          } as any,
        ],
      };

      const html = renderToString(
        React.createElement(HotkeyAssignmentBox, {
          macro: autoMacro,
          allMacros: [autoMacro],
          onAssignHotkey: vi.fn(),
        }),
      );

      expect(html).toContain('Automatic trigger');
    });

    it('renders warning when hotkey conflicts with another enabled macro', () => {
      const conflictingMacro: MacroDefinition = {
        ...sampleMacro,
        id: 'm2',
        name: 'Existing Macro',
      };

      const html = renderToString(
        React.createElement(HotkeyAssignmentBox, {
          macro: sampleMacro,
          allMacros: [sampleMacro, conflictingMacro],
          onAssignHotkey: vi.fn(),
        }),
      );

      expect(html).toContain('Shortcut is already assigned to macro “Existing Macro”.');
    });
  });

  describe('TagManager', () => {
    it('renders tag chips and add button', () => {
      const html = renderToString(
        React.createElement(TagManager, {
          tags: ['gaming', 'fast'],
          onAddTag: vi.fn(),
          onRemoveTag: vi.fn(),
        }),
      );

      expect(html).toContain('#gaming');
      expect(html).toContain('#fast');
      expect(html).toContain('+ Tag');
    });
  });

  describe('MacroDetailsHeader', () => {
    it('renders reference metadata and shortcut without a duplicate enabled switch or tag bar', () => {
      const html = renderToString(
        React.createElement(MacroDetailsHeader, {
          macro: sampleMacro,
          allMacros: [sampleMacro],
          isModified: true,
          onUpdateName: vi.fn(),
          onUpdateDescription: vi.fn(),
          onToggleEnabled: vi.fn(),
          onAssignHotkey: vi.fn(),
          onAddTag: vi.fn(),
          onRemoveTag: vi.fn(),
        }),
      );

      expect(html).toContain('Sample Macro');
      expect(html).toContain('This is a sample description.');
      expect(html).toContain('edited'); // warning badge
      // MainWindow owns the single enabled switch, as in the reference XAML.
      expect(html).not.toContain('role="switch"');
      expect(html).not.toContain('#sample');
      expect(html).toContain('Macro name. Double-click to edit');
      expect(html).toContain('Macro description. Double-click to edit');
      expect(html).toContain('Ctrl + A');
    });
  });

  describe('ConfirmDeleteDialog', () => {
    it('renders macro deletion confirmation', () => {
      const html = renderToString(
        React.createElement(ConfirmDeleteDialog, {
          isOpen: true,
          isFolder: false,
          targetName: 'My Macro',
          onConfirm: vi.fn(),
          onCancel: vi.fn(),
        }),
      );

      expect(html).toContain('Delete this macro?');
      expect(html).toContain('The macro and all of its actions will be permanently deleted.');
      expect(html).toContain('My Macro');
      expect(html).toContain('Delete macro');
    });

    it('renders folder deletion confirmation with macro count', () => {
      const html = renderToString(
        React.createElement(ConfirmDeleteDialog, {
          isOpen: true,
          isFolder: true,
          targetName: 'Old Folder',
          macroCount: 5,
          onConfirm: vi.fn(),
          onCancel: vi.fn(),
        }),
      );

      expect(html).toContain('Delete this folder?');
      expect(html).toContain('Old Folder — macros inside: 5');
      expect(html).toContain('Delete folder');
    });
  });

  describe('DirtyNavigationDialog', () => {
    it('renders unsaved prompt with Save, Discard, and Cancel buttons', () => {
      const promptState = {
        isOpen: true,
        macro: sampleMacro,
        onSaveAndProceed: vi.fn(async () => {}),
        onDiscardAndProceed: vi.fn(),
        onCancel: vi.fn(),
      };

      const html = renderToString(
        React.createElement(DirtyNavigationDialog, { state: promptState }),
      );

      expect(html).toContain('There are unsaved changes');
      expect(html).toContain('Sample Macro');
      expect(html).toContain('Save changes');
      expect(html).toContain('Discard changes');
      expect(html).toContain('Cancel');
    });
  });

  describe('MacroLibraryPanel', () => {
    it('renders sidebar with title, search input, 4-button toolbar, tree, and footer', () => {
      const rootMacro: MacroDefinition = {
        ...sampleMacro,
        id: 'm-root',
        name: 'Root Macro',
        folder: '',
      };

      const html = renderToString(
        React.createElement(MacroLibraryPanel, {
          macros: [sampleMacro, rootMacro],
          folders: ['Games'],
          selectedMacroId: 'm-root',
          onSaveMacro: vi.fn(async () => ({})),
          onDeleteMacro: vi.fn(async () => ({})),
          onRestoreMacro: vi.fn(async () => ({})),
          onMoveMacro: vi.fn(async () => ({})),
          onCreateFolder: vi.fn(async () => ({})),
          onDeleteFolder: vi.fn(async () => ({})),
          onMoveFolder: vi.fn(async () => ({})),
        }),
      );

      expect(html).toContain('Macro library');
      expect(html).toContain('Search by name and tags');
      expect(html).toContain('New');
      expect(html).toContain('Copy');
      expect(html).toContain('Import');
      expect(html).toContain('Export');
      expect(html).toContain('New folder');
      expect(html).toContain('Open folder');
      expect(html).toContain('Delete macro');
      expect(html).toContain('Games');
      expect(html).toContain('Root Macro');
    });
  });
});
