import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { AddActionDialog } from '../AddActionDialog.js';
import { ActionForm } from '../ActionForm.js';
import { createKeyDownEvent } from '../../../../../../../packages/domain/src/model/index.js';

describe('AddActionDialog and ActionForm component rendering', () => {
  it('renders ActionForm in add mode without crashing', () => {
    const html = renderToString(
      React.createElement(ActionForm, {
        mode: 'add',
        suggestedTimeMs: 150,
        onCancel: () => {},
        onSubmit: () => {},
      }),
    );

    expect(html).toContain('Action type');
    expect(html).toContain('Start time, ms');
    expect(html).toContain('Add to timeline');
    expect(html).toContain('150');
  });

  it('renders ActionForm in edit mode with existing event values', () => {
    const existing = createKeyDownEvent({
      timeMicroseconds: 250_000,
      virtualKey: 0x42,
      comment: 'Special note',
    });

    const html = renderToString(
      React.createElement(ActionForm, {
        mode: 'edit',
        initialEvent: existing,
        onCancel: () => {},
        onSubmit: () => {},
      }),
    );

    expect(html).toContain('Save action');
    expect(html).toContain('250');
    expect(html).toContain('Special note');
  });

  it('renders AddActionDialog component definition', () => {
    const closedHtml = renderToString(
      React.createElement(AddActionDialog, {
        isOpen: false,
        onClose: () => {},
        onSubmit: () => {},
      }),
    );
    expect(closedHtml).toBe('');
    expect(typeof AddActionDialog).toBe('function');
  });
});
