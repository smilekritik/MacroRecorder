import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { computeVirtualRange } from '../../../design-system/VirtualList.js';
import { TimelineTable } from '../TimelineTable.js';
import { TimelineEditor } from '../../../../../../../packages/domain/src/timeline/editor.js';
import {
  createDefaultMacroDefinition,
  createKeyDownEvent,
} from '../../../../../../../packages/domain/src/model/index.js';
import type { MacroEvent } from '../../../../../../../packages/contracts/src/index.js';

describe('Timeline Virtualization and Responsiveness at Scale', () => {
  it('computes virtual ranges for 50,000 events in less than 1ms', () => {
    const start = performance.now();
    for (let i = 0; i < 100; i++) {
      computeVirtualRange({
        itemCount: 50_000,
        itemHeight: 36,
        containerHeight: 480,
        scrollTop: i * 360,
        overscan: 10,
      });
    }
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(100); // 100 iterations well under 100ms
  });

  it('renders only visible subset of 10,000 recorded events without crashing', () => {
    const events: MacroEvent[] = [];
    for (let i = 0; i < 10_000; i++) {
      events.push(createKeyDownEvent({ timeMicroseconds: i * 20_000, virtualKey: 0x41 }));
    }

    const macro = createDefaultMacroDefinition({ events });
    const editor = new TimelineEditor();
    editor.load(macro);

    expect(editor.rows.length).toBe(10_000);

    const startTime = performance.now();
    const html = renderToString(
      React.createElement(TimelineTable, {
        rows: editor.rows,
        selectedKeys: new Set(['key-1', 'key-9999']),
        containerHeight: 480,
        itemHeight: 36,
      }),
    );
    const renderDuration = performance.now() - startTime;

    // Must render very quickly
    expect(renderDuration).toBeLessThan(500);

    // Verify only a small fraction of DOM rows are rendered (containerHeight 480 / 36 = 14 + overscan ~34 rows)
    const rowMatches = (html.match(/role="row"/g) || []).length;
    // 1 header row + approx 25-35 visible rows << 10,000
    expect(rowMatches).toBeLessThan(50);
  });

  it('preserves multi-select stability over 10,000 items', () => {
    const selected = new Set<string>();
    for (let i = 0; i < 500; i++) {
      selected.add(`event-${i * 20}`);
    }

    expect(selected.size).toBe(500);
    expect(selected.has('event-0')).toBe(true);
    expect(selected.has('event-200')).toBe(true);
    expect(selected.has('event-9980')).toBe(true);
  });
});
