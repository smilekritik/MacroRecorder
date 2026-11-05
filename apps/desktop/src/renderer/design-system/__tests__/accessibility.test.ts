import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import {
  Button,
  Input,
  Checkbox,
  PillSwitch,
  Slider,
  Select,
  Tabs,
  GroupCard,
  InsetPanel,
  CardBorder,
  PageTitleText,
} from '../index.js';

describe('Accessible UI primitives and keyboard focus', () => {
  it('renders Button with proper type, accessible name and focus ring', () => {
    const html = renderToString(
      React.createElement(Button, { variant: 'accent', 'aria-label': 'Start Record' }, 'Record'),
    );

    expect(html).toContain('type="button"');
    expect(html).toContain('aria-label="Start Record"');
    expect(html).toContain('focus-visible:ring-[var(--color-focus)]');
    expect(html).toContain('Record');
  });

  it('renders disabled Button with aria-disabled and disabled attribute', () => {
    const html = renderToString(
      React.createElement(Button, { disabled: true }, 'Disabled Action'),
    );

    expect(html).toContain('disabled=""');
    expect(html).toContain('aria-disabled="true"');
    expect(html).toContain('disabled:opacity-[0.62]');
  });

  it('renders Input with accessible label binding and error message', () => {
    const html = renderToString(
      React.createElement(Input, {
        label: 'Macro Name',
        errorMessage: 'Name is required',
        id: 'test-macro-name',
      }),
    );

    expect(html).toContain('for="test-macro-name"');
    expect(html).toContain('id="test-macro-name"');
    expect(html).toContain('aria-invalid="true"');
    expect(html).toContain('role="alert"');
    expect(html).toContain('Name is required');
    expect(html).toContain('border-[var(--color-danger)]');
  });

  it('renders Checkbox with role="checkbox", aria-checked, and label', () => {
    const html = renderToString(
      React.createElement(Checkbox, {
        checked: true,
        onChange: () => {},
        label: 'Relative movement',
      }),
    );

    expect(html).toContain('role="checkbox"');
    expect(html).toContain('aria-checked="true"');
    expect(html).toContain('Relative movement');
    expect(html).toContain('focus-visible:ring-[var(--color-focus)]');
  });

  it('renders PillSwitch with role="switch" and aria-checked', () => {
    const html = renderToString(
      React.createElement(PillSwitch, {
        checked: false,
        onChange: () => {},
        label: 'Repeat forever',
      }),
    );

    expect(html).toContain('role="switch"');
    expect(html).toContain('aria-checked="false"');
    expect(html).toContain('Repeat forever');
    expect(html).toContain('w-[42px]');
    expect(html).toContain('h-[24px]');
  });

  it('renders Slider with role="slider", min, max, valuenow, and accessible name', () => {
    const html = renderToString(
      React.createElement(Slider, {
        value: 2.5,
        min: 0.1,
        max: 10.0,
        onChange: () => {},
        label: 'Playback Speed',
        valueText: '2.5x',
      }),
    );

    expect(html).toContain('role="slider"');
    expect(html).toContain('aria-valuemin="0.1"');
    expect(html).toContain('aria-valuemax="10"');
    expect(html).toContain('aria-valuenow="2.5"');
    expect(html).toContain('aria-valuetext="2.5x"');
    expect(html).toContain('aria-label="Playback Speed"');
  });

  it('renders Select with role="combobox", aria-haspopup="listbox", and aria-expanded="false"', () => {
    const html = renderToString(
      React.createElement(Select, {
        options: [
          { value: 'en', label: 'English' },
          { value: 'ru', label: 'Russian' },
        ],
        value: 'en',
        onChange: () => {},
        label: 'Language',
      }),
    );

    expect(html).toContain('role="combobox"');
    expect(html).toContain('aria-haspopup="listbox"');
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain('Language');
    expect(html).toContain('English');
  });

  it('renders Tabs with role="tablist", role="tab", aria-selected, and role="tabpanel"', () => {
    const html = renderToString(
      React.createElement(Tabs, {
        items: [
          { id: 'tab-1', label: 'General', content: 'General Settings' },
          { id: 'tab-2', label: 'Hotkeys', content: 'Hotkey Settings' },
        ],
        activeTabId: 'tab-1',
        onTabChange: () => {},
      }),
    );

    expect(html).toContain('role="tablist"');
    expect(html).toContain('role="tab"');
    expect(html).toContain('aria-selected="true"');
    expect(html).toContain('aria-selected="false"');
    expect(html).toContain('role="tabpanel"');
    expect(html).toContain('General Settings');
  });

  it('renders Card components with semantic background tokens', () => {
    const groupHtml = renderToString(
      React.createElement(GroupCard, null, 'Group Card Content'),
    );
    expect(groupHtml).toContain('bg-[var(--color-surface-raised)]');
    expect(groupHtml).toContain('rounded-[10px]');

    const insetHtml = renderToString(
      React.createElement(InsetPanel, null, 'Inset Content'),
    );
    expect(insetHtml).toContain('bg-[var(--color-surface)]');
    expect(insetHtml).toContain('rounded-[7px]');

    const cardBorderHtml = renderToString(
      React.createElement(CardBorder, null, 'Bordered Card'),
    );
    expect(cardBorderHtml).toContain('rounded-[8px]');
  });

  it('renders Typography primitives', () => {
    const titleHtml = renderToString(
      React.createElement(PageTitleText, null, 'Macro Recorder'),
    );
    expect(titleHtml).toContain('<h1');
    expect(titleHtml).toContain('text-[22px]');
    expect(titleHtml).toContain('font-semibold');
  });
});
