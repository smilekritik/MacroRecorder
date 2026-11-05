/**
 * @macro-recorder/desktop - Dialogs Feature Tests
 * Comprehensive tests for all 10 system dialogs:
 * - FirstRunDialog
 * - AlreadyRunningDialog
 * - ChoiceDialog
 * - ConfirmDeleteDialog
 * - ConfirmImportDialog
 * - ImportReportDialog
 * - TextPromptDialog
 * - WelcomeDialog
 * - ResetConfirmDialog
 * - BackupRestoreChoiceDialog
 */

import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import {
  FirstRunDialog,
  AlreadyRunningDialog,
  ChoiceDialog,
  ConfirmDeleteDialog,
  ConfirmImportDialog,
  ImportReportDialog,
  TextPromptDialog,
  WelcomeDialog,
  ResetConfirmDialog,
  BackupRestoreChoiceDialog,
} from '../index.js';
import { AppTheme } from '../../../../../../../packages/contracts/src/domain/enums.js';

// Mock design-system Modal to render synchronously during server-side string rendering
vi.mock('../../../design-system/Modal.js', () => ({
  Modal: ({ isOpen, children, title }: any) => {
    if (!isOpen) return null;
    return React.createElement(
      'div',
      { 'data-modal-open': 'true', 'data-modal-title': typeof title === 'string' ? title : 'modal' },
      children,
    );
  },
}));

describe('Dialogs Feature', () => {
  describe('FirstRunDialog', () => {
    it('renders language and theme configuration options', () => {
      const html = renderToString(
        React.createElement(FirstRunDialog, {
          isOpen: true,
          initialTheme: AppTheme.Dark,
          initialLanguage: 'en',
          onComplete: () => {},
        }),
      );

      expect(html).toContain('First launch — Macro Recorder');
      expect(html).toContain('Choose how the application should look');
      expect(html).toContain('Application language');
      expect(html).toContain('English');
      expect(html).toContain('Dark');
      expect(html).toContain('Light');
      expect(html).toContain('Continue');
    });

    it('returns null when closed', () => {
      const html = renderToString(
        React.createElement(FirstRunDialog, {
          isOpen: false,
          onComplete: () => {},
        }),
      );
      expect(html).toBe('');
    });
  });

  describe('AlreadyRunningDialog', () => {
    it('renders notification about already running instance', () => {
      const html = renderToString(
        React.createElement(AlreadyRunningDialog, {
          isOpen: true,
          onClose: () => {},
        }),
      );

      expect(html).toContain('Macro Recorder is already running');
      expect(html).toContain('A second instance will not be opened');
      expect(html).toContain('Switching to the application that is already running');
      expect(html).toContain('Got it');
    });
  });

  describe('ChoiceDialog', () => {
    it('renders custom choices with stripe tone styling', () => {
      const html = renderToString(
        React.createElement(ChoiceDialog, {
          isOpen: true,
          question: 'Resolve Conflict',
          description: 'A macro with this name already exists. Choose what to do:',
          options: [
            { title: 'Overwrite', tone: 'danger' },
            { title: 'Keep Both (Rename)', tone: 'accent' },
            { title: 'Ignore', tone: 'neutral' },
          ],
          onSelect: () => {},
          onCancel: () => {},
        }),
      );

      expect(html).toContain('Resolve Conflict');
      expect(html).toContain('A macro with this name already exists');
      expect(html).toContain('Overwrite');
      expect(html).toContain('Keep Both (Rename)');
      expect(html).toContain('Cancel');
    });
  });

  describe('ConfirmDeleteDialog', () => {
    it('renders single macro deletion warning', () => {
      const html = renderToString(
        React.createElement(ConfirmDeleteDialog, {
          isOpen: true,
          mode: 'macro',
          targetName: 'Auto Farm Loop',
          onConfirm: () => {},
          onCancel: () => {},
        }),
      );

      expect(html).toContain('Delete macro');
      expect(html).toContain('Delete this macro?');
      expect(html).toContain('Auto Farm Loop');
      expect(html).toContain('The macro and all of its actions will be permanently deleted');
    });

    it('renders folder deletion with item count warning', () => {
      const html = renderToString(
        React.createElement(ConfirmDeleteDialog, {
          isOpen: true,
          mode: 'folder',
          targetName: 'Combat Macros',
          macroCount: 8,
          onConfirm: () => {},
          onCancel: () => {},
        }),
      );

      expect(html).toContain('Delete folder');
      expect(html).toContain('Delete this folder?');
      expect(html).toContain('Combat Macros — macros inside: 8');
      expect(html).toContain('The folder will be deleted from disk together with every macro');
    });

    it('renders action deletion warning', () => {
      const html = renderToString(
        React.createElement(ConfirmDeleteDialog, {
          isOpen: true,
          mode: 'actions',
          eventCount: 3,
          onConfirm: () => {},
          onCancel: () => {},
        }),
      );

      expect(html).toContain('Delete actions');
      expect(html).toContain('Delete 3 selected actions?');
      expect(html).toContain('Selected actions: 3');
      expect(html).toContain('undo the deletion with Ctrl+Z');
    });
  });

  describe('ConfirmImportDialog', () => {
    it('renders pre-import review with format badge and safe disabled notice', () => {
      const html = renderToString(
        React.createElement(ConfirmImportDialog, {
          isOpen: true,
          sourcePath: 'C:\\Users\\Test\\Documents\\macros.mrmacro',
          onConfirm: () => {},
          onCancel: () => {},
        }),
      );

      expect(html).toContain('Import macro');
      expect(html).toContain('Import this macro?');
      expect(html).toContain('.MRMACRO');
      expect(html).toContain('macros.mrmacro');
      expect(html).toContain('disabled state');
      expect(html).toContain('Import macro');
    });
  });

  describe('ImportReportDialog', () => {
    it('renders post-import summary and non-blocking warnings', () => {
      const html = renderToString(
        React.createElement(ImportReportDialog, {
          isOpen: true,
          report: {
            formatName: 'AMC / Macro Recorder V2',
            macroCount: 2,
            eventCount: 45,
            warnings: [
              { message: 'Unsupported window filter converted to unconditional delay.' },
              { message: 'Mouse acceleration curves normalized to linear interpolation.' },
            ],
            userSummary: 'Imported 2 macros with 45 actions',
          },
          onClose: () => {},
        }),
      );

      expect(html).toContain('Import complete');
      expect(html).toContain('AMC / Macro Recorder V2');
      expect(html).toContain('2');
      expect(html).toContain('45');
      expect(html).toContain('Needs attention:');
      expect(html).toContain('Unsupported window filter converted to unconditional delay.');
      expect(html).toContain('Mouse acceleration curves normalized to linear interpolation.');
      expect(html).toContain('All imported macros are added in a disabled state');
    });
  });

  describe('TextPromptDialog', () => {
    it('renders text prompt with question and initial value', () => {
      const html = renderToString(
        React.createElement(TextPromptDialog, {
          isOpen: true,
          question: 'Rename Macro',
          description: 'Enter new macro name:',
          initialValue: 'Original Name',
          onConfirm: () => {},
          onCancel: () => {},
        }),
      );

      expect(html).toContain('Rename Macro');
      expect(html).toContain('Enter new macro name:');
      expect(html).toContain('value="Original Name"');
      expect(html).toContain('Done');
    });
  });

  describe('WelcomeDialog', () => {
    it('renders default hotkeys and quick guide tour', () => {
      const html = renderToString(
        React.createElement(WelcomeDialog, {
          isOpen: true,
          onClose: () => {},
        }),
      );

      expect(html).toContain('Welcome to Macro Recorder');
      expect(html).toContain('Basic shortcuts');
      expect(html).toContain('Start recording');
      expect(html).toContain('F7');
      expect(html).toContain('Stop recording');
      expect(html).toContain('F8');
      expect(html).toContain('Pause / resume playback');
      expect(html).toContain('F9');
      expect(html).toContain('Emergency stop');
      expect(html).toContain('F10');
      expect(html).toContain('Bind map');
      expect(html).toContain('F11');
      expect(html).toContain('Get started');
    });
  });

  describe('ResetConfirmDialog', () => {
    it('renders factory reset warning and danger confirmation', () => {
      const html = renderToString(
        React.createElement(ResetConfirmDialog, {
          isOpen: true,
          onConfirm: () => {},
          onCancel: () => {},
        }),
      );

      expect(html).toContain('Delete all macros and settings?');
      expect(html).toContain('The macro library and settings will be deleted from disk.');
      expect(html).toContain('Permanent Deletion');
      expect(html).toContain('Deleted macros cannot be recovered.');
      expect(html).toContain('Delete everything and restart');
    });
  });

  describe('BackupRestoreChoiceDialog', () => {
    it('renders Merge vs Replace restoration choices', () => {
      const html = renderToString(
        React.createElement(BackupRestoreChoiceDialog, {
          isOpen: true,
          onSelectMode: () => {},
          onCancel: () => {},
        }),
      );

      expect(html).toContain('Restore from backup');
      expect(html).toContain('Add macros from the backup to the current ones, or replace the whole library?');
      expect(html).toContain('Add');
      expect(html).toContain('Merge with the current library.');
      expect(html).toContain('Replace');
      expect(html).toContain('Move the current one to trash and restore from the backup.');
    });
  });
});
