import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { TimelineTable } from '../TimelineTable.js';
import { TimelineToolbar } from '../TimelineToolbar.js';
import { ScaleTimeDialog } from '../ScaleTimeDialog.js';
import { SaveDiscardPromptDialog } from '../SaveDiscardPromptDialog.js';
import { TimelineEditorView } from '../TimelineEditorView.js';
import { TimelineEditor } from '../../../../../../../packages/domain/src/timeline/editor.js';
import {
  createDefaultMacroDefinition,
  createKeyDownEvent,
  createCommentEvent,
} from '../../../../../../../packages/domain/src/model/index.js';

describe('Timeline visual components rendering', () => {
  it('renders TimelineTable with columns and empty state', () => {
    const html = renderToString(
      React.createElement(TimelineTable, {
        rows: [],
        selectedKeys: new Set<string>(),
      }),
    );

    expect(html).toContain('Time, ms');
    expect(html).toContain('Since previous, ms');
    expect(html).toContain('Action');
    expect(html).toContain('Comment');
    expect(html).toContain('No actions in this macro timeline');
  });

  it('renders TimelineTable with rows and formatted display', () => {
    const editor = new TimelineEditor();
    const macro = createDefaultMacroDefinition({
      events: [
        createKeyDownEvent({ timeMicroseconds: 0, virtualKey: 0x41 }),
        createCommentEvent({ timeMicroseconds: 50_000, text: 'Test checkpoint' }),
      ],
    });
    editor.load(macro);

    const html = renderToString(
      React.createElement(TimelineTable, {
        rows: editor.rows,
        selectedKeys: new Set([editor.rows[0]!.event.id]),
      }),
    );

    expect(html).toContain('Time, ms');
    expect(html).toContain('Test checkpoint');
  });

  it('renders the seven reference toolbar buttons and accessible status', () => {
    const html = renderToString(
      React.createElement(TimelineToolbar, {
        isDirty: true,
        canUndo: true,
        canRedo: false,
        selectedCount: 1,
        statusText: 'Actions added: 2. Save the changes.',
        onAddAction: () => {},
        onAddDelay: () => {},
        onAddComment: () => {},
        onEditSelected: () => {},
        onDeleteSelected: () => {},
        onUndo: () => {},
        onRedo: () => {},
        onScaleTime: () => {},
        onSave: () => {},
      }),
    );

    expect(html).toContain('Add action');
    expect(html).toContain('Add delay');
    expect(html).toContain('Add comment');
    // These controls are absent from the current MainWindow toolbar.
    expect(html).not.toContain('Scale time');
    expect(html).toContain('Edit');
    expect(html).toContain('Delete selected');
    expect(html).toContain('Undo change');
    expect(html).not.toContain('Redo change');
    expect(html.match(/<button\b/g)).toHaveLength(7);
    expect(html).toContain('Save changes');
    expect(html).toContain('Actions added: 2. Save the changes.');
    expect(html).toContain('role="status"');
    expect(html).toContain('●');
  });

  it('renders ScaleTimeDialog and SaveDiscardPromptDialog component definitions', () => {
    const scaleClosedHtml = renderToString(
      React.createElement(ScaleTimeDialog, {
        isOpen: false,
        onClose: () => {},
        onScale: () => {},
      }),
    );
    expect(scaleClosedHtml).toBe('');

    const discardClosedHtml = renderToString(
      React.createElement(SaveDiscardPromptDialog, {
        isOpen: false,
        macroName: 'Sample Macro',
        onSave: () => {},
        onDiscard: () => {},
        onCancel: () => {},
      }),
    );
    expect(discardClosedHtml).toBe('');
  });

  it('renders TimelineEditorView full editor without crashing', () => {
    const macro = createDefaultMacroDefinition({
      name: 'Full Flow Macro',
      events: [
        createKeyDownEvent({ timeMicroseconds: 0, virtualKey: 0x41 }),
      ],
    });

    const html = renderToString(
      React.createElement(TimelineEditorView, {
        macro,
      }),
    );

    expect(html).toContain('Time, ms');
    expect(html).toContain('Add action');
    expect(html).toContain('Save changes');
  });
});
