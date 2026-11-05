import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import {
  SelectionProvider,
  useSelectionContext,
  TimelineStateProvider,
  useTimelineStateContext,
  LibraryStateProvider,
  useLibraryStateContext,
} from '../index.js';
import type { MacroDefinition, MacroEvent } from '../../../../../../packages/contracts/src/index.js';

describe('State boundaries and React contexts', () => {
  it('provides selection state and preserves keys', () => {
    let captured: ReturnType<typeof useSelectionContext> | null = null;

    function TestConsumer() {
      captured = useSelectionContext();
      return React.createElement('div', null, `Selected count: ${captured.selectedKeys.size}`);
    }

    renderToString(
      React.createElement(
        SelectionProvider,
        { initialSelectedKeys: new Set(['macro-1', 'macro-2']) },
        React.createElement(TestConsumer),
      ),
    );

    expect(captured).not.toBeNull();
    expect(captured!.selectedKeys.has('macro-1')).toBe(true);
    expect(captured!.selectedKeys.has('macro-2')).toBe(true);
    expect(captured!.selectedKeys.has('macro-3')).toBe(false);
  });

  it('manages timeline events undo rules', () => {
    let captured: ReturnType<typeof useTimelineStateContext> | null = null;

    function TestConsumer() {
      captured = useTimelineStateContext();
      return React.createElement('div', null, `Events: ${captured.events.length}`);
    }

    const initialEvents: MacroEvent[] = [
      {
        id: '00000000-0000-0000-0000-000000000001',
        comment: '',
        type: 'Delay',
        timeMicroseconds: 0,
        durationMicroseconds: 100000,
      },
    ];

    renderToString(
      React.createElement(
        TimelineStateProvider,
        { initialEvents },
        React.createElement(TestConsumer),
      ),
    );

    expect(captured).not.toBeNull();
    expect(captured!.events.length).toBe(1);
    expect(captured!.isDirty).toBe(false);
    expect(captured!.canUndo).toBe(false);
    expect(captured!.canRedo).toBe(false);
  });

  it('filters library macros by folder, tag, and search query', () => {
    let captured: ReturnType<typeof useLibraryStateContext> | null = null;

    function TestConsumer() {
      captured = useLibraryStateContext();
      return React.createElement('div', null, `Macros: ${captured.filteredMacros.length}`);
    }

    const testMacros: MacroDefinition[] = [
      {
        schemaVersion: 12,
        id: '11111111-1111-1111-1111-111111111111',
        name: 'Auto Clicker',
        folder: 'Games',
        description: 'Rapid left click',
        tags: ['gaming', 'mouse'],
        events: [],
      } as unknown as MacroDefinition,
      {
        schemaVersion: 12,
        id: '22222222-2222-2222-2222-222222222222',
        name: 'Form Fill',
        folder: 'Work',
        description: 'Fills standard web forms',
        tags: ['work', 'browser'],
        events: [],
      } as unknown as MacroDefinition,
    ];

    renderToString(
      React.createElement(
        LibraryStateProvider,
        { initialMacros: testMacros, initialFolders: ['Games', 'Work'] },
        React.createElement(TestConsumer),
      ),
    );

    expect(captured).not.toBeNull();
    expect(captured!.macros.length).toBe(2);
    expect(captured!.filteredMacros.length).toBe(2);
  });
});
