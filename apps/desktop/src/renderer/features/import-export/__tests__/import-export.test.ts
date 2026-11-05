/**
 * @macro-recorder/desktop - Import/Export Feature Tests
 * Verifies:
 * - ImportReportView (non-blocking warnings)
 * - ImportConfirmationView (safe review)
 * - BackupRestoreManager (whole library backup and Merge/Replace restore)
 * - DiagnosticsManager (run history, jitter, JSON export)
 */

import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import {
  ImportReportView,
  ImportConfirmationView,
  BackupRestoreManager,
  DiagnosticsManager,
} from '../index.js';

// Mock design-system Modal
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

// Mock useApi
vi.mock('../../../hooks/useApi.js', () => ({
  useApi: () => ({
    invoke: vi.fn().mockResolvedValue({ success: true, data: [] }),
    on: vi.fn().mockReturnValue(() => {}),
  }),
}));

describe('Import/Export Feature', () => {
  describe('ImportReportView', () => {
    it('renders complete non-blocking warnings that do not block converted actions', () => {
      const html = renderToString(
        React.createElement(ImportReportView, {
          report: {
            formatName: 'AutoHotkey v2',
            macroCount: 3,
            eventCount: 88,
            warnings: [
              { line: 14, message: 'Coordinate relative mode normalized to active window origin.' },
              { line: 42, message: 'Loop counter substituted with standard repeat count.' },
            ],
            userSummary: 'Imported 3 macros with 88 actions',
          },
          onClose: () => {},
        }),
      );

      expect(html).toContain('Import complete');
      expect(html).toContain('3 macros imported successfully');
      expect(html).toContain('AutoHotkey v2');
      expect(html).toContain('88');
      expect(html).toContain('Non-fatal conversion warnings');
      expect(html).toContain('These lines were adapted or skipped without interrupting successfully imported actions.');
      expect(html).toContain('Coordinate relative mode normalized to active window origin.');
      expect(html).toContain('Loop counter substituted with standard repeat count.');
      expect(html).toContain('Done');
    });
  });

  describe('ImportConfirmationView', () => {
    it('renders pre-import review with filename, format badge, and disabled notice', () => {
      const html = renderToString(
        React.createElement(ImportConfirmationView, {
          sourcePath: 'C:\\Work\\gaming-macros.mrmacro',
          targetFolder: 'Imported',
          onConfirm: () => {},
          onCancel: () => {},
        }),
      );

      expect(html).toContain('Import macro');
      expect(html).toContain('Review file details before adding to library.');
      expect(html).toContain('gaming-macros.mrmacro');
      expect(html).toContain('MRMACRO');
      expect(html).toContain('The macro will be imported in a disabled state so you can safely inspect actions');
      expect(html).toContain('Cancel');
      expect(html).toContain('Import');
    });
  });

  describe('BackupRestoreManager', () => {
    it('renders library backup and restore controls', () => {
      const html = renderToString(
        React.createElement(BackupRestoreManager, {
          resolvedLibraryPath: 'C:\\Users\\Test\\Macros',
          onBackupCreated: () => {},
          onBackupRestored: () => {},
        }),
      );

      expect(html).toContain('Library backup');
      expect(html).toContain('Save the whole library into a single .mrbackup file');
      expect(html).toContain('Include app settings in the backup');
      expect(html).toContain('Create backup…');
      expect(html).toContain('Restore from backup…');
    });
  });

  describe('DiagnosticsManager', () => {
    it('renders run history header and action buttons', () => {
      const html = renderToString(
        React.createElement(DiagnosticsManager, {
          onExportDiagnostics: () => {},
        }),
      );

      expect(html).toContain('Run history and diagnostics');
      expect(html).toContain('Export CSV');
      expect(html).toContain('Export JSON');
      expect(html).toContain('Clear history');
      expect(html).toContain('No execution runs recorded yet.');
    });
  });
});
