/**
 * Hook managing the domain TimelineEditor lifecycle, undo/redo state,
 * row subscriptions, and timeline edit operations.
 */

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import type {
  Guid,
  MacroDefinition,
  MacroEvent,
} from '../../../../../../packages/contracts/src/index.js';
import {
  TimelineEditor,
  type TimelineRow,
  TimelineEditResult,
} from '../../../../../../packages/domain/src/timeline/index.js';

export interface UseTimelineControllerOptions {
  readonly macro: MacroDefinition | null;
  readonly onStatusChange?: ((status: string) => void) | undefined;
  readonly onSelectionRequested?: ((selectedIds: ReadonlyArray<string>) => void) | undefined;
}

export function useTimelineController({
  macro,
  onStatusChange,
  onSelectionRequested,
}: UseTimelineControllerOptions) {
  const editorRef = useRef<TimelineEditor>(new TimelineEditor());
  const editor = editorRef.current;

  const [version, setVersion] = useState(0);
  const [isDirty, setIsDirty] = useState(false);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  // Sync state from editor
  const refreshState = useCallback(() => {
    setVersion((v) => v + 1);
    setIsDirty(editor.isDirty(macro ?? undefined));
    setCanUndo(editor.canUndo);
    setCanRedo(editor.canRedo);
  }, [editor, macro]);

  // Load macro when it changes
  useEffect(() => {
    editor.load(macro);
    refreshState();
  }, [editor, macro, refreshState]);

  // Subscribe to editor events
  useEffect(() => {
    const unsub = editor.subscribe(() => {
      refreshState();
    });
    return unsub;
  }, [editor, refreshState]);

  const rows = useMemo(() => editor.rows, [editor, version]);

  const handleEditResult = useCallback(
    (result: TimelineEditResult, successStatus?: string) => {
      if (result.changed) {
        refreshState();
        if (result.selectedEventIds && result.selectedEventIds.length > 0) {
          onSelectionRequested?.(result.selectedEventIds);
        }
        if (successStatus) {
          onStatusChange?.(successStatus);
        }
      }
      return result;
    },
    [refreshState, onSelectionRequested, onStatusChange],
  );

  const addEvents = useCallback(
    (
      events: readonly MacroEvent[],
      anchor: MacroEvent | null = null,
      insertAtMicroseconds = 0,
      occupiedMicroseconds = 0,
      selectionBefore?: readonly Guid[],
    ) => {
      const result = editor.addEvents(
        events,
        anchor,
        insertAtMicroseconds,
        occupiedMicroseconds,
        selectionBefore,
      );
      const count = events.length;
      return handleEditResult(
        result,
        count === 1 ? 'Action added. Save the changes.' : `Actions added: ${count}. Save the changes.`,
      );
    },
    [editor, handleEditResult],
  );

  const replaceEvent = useCallback(
    (
      original: MacroEvent,
      replacements: readonly MacroEvent[],
      selectionBefore?: readonly Guid[],
    ) => {
      const result = editor.replaceEvent(original, replacements, selectionBefore);
      return handleEditResult(result, 'Action changed. Save the macro.');
    },
    [editor, handleEditResult],
  );

  const insertDelay = useCallback(
    (anchor: MacroEvent | null = null, durationMicroseconds = 100_000, selectionBefore?: readonly Guid[]) => {
      const result = editor.insertDelay(anchor, durationMicroseconds, selectionBefore);
      return handleEditResult(result, 'Delay added. Save the changes.');
    },
    [editor, handleEditResult],
  );

  const insertComment = useCallback(
    (anchor: MacroEvent | null = null, text = '', selectionBefore?: readonly Guid[]) => {
      const result = editor.insertComment(anchor, text, selectionBefore);
      return handleEditResult(result, 'Comment row added. Type the text and save your changes.');
    },
    [editor, handleEditResult],
  );

  const deleteEvents = useCallback(
    (events: readonly MacroEvent[], selectionBefore?: readonly Guid[]) => {
      const count = events.length;
      const result = editor.deleteEvents(events, selectionBefore);
      const msg =
        count === 1
          ? 'Action deleted. The timeline gap was closed; Ctrl+Z undoes the deletion.'
          : `Deleted actions: ${count}. The timeline gap was closed; Ctrl+Z undoes the deletion.`;
      return handleEditResult(result, msg);
    },
    [editor, handleEditResult],
  );

  const moveEvents = useCallback(
    (events: readonly MacroEvent[], insertionIndex: number, selectionBefore?: readonly Guid[]) => {
      const count = events.length;
      const result = editor.moveEvents(events, insertionIndex, selectionBefore);
      const msg =
        count === 1
          ? 'Action moved. Timings recalculated.'
          : `Moved actions: ${count}. Timings recalculated.`;
      return handleEditResult(result, msg);
    },
    [editor, handleEditResult],
  );

  const scaleTimeline = useCallback(
    (factor: number, selectionBefore?: readonly Guid[]) => {
      const result = editor.scale(factor, selectionBefore);
      return handleEditResult(result, 'Timings scaled. Save the changes.');
    },
    [editor, handleEditResult],
  );

  const copyEvents = useCallback(
    (events: readonly MacroEvent[]) => {
      const count = editor.copyEvents(events);
      if (count === 0) {
        onStatusChange?.('Select actions to copy.');
      } else {
        onStatusChange?.(`Copied actions: ${count}.`);
      }
      return count;
    },
    [editor, onStatusChange],
  );

  const pasteEvents = useCallback(
    (anchor: MacroEvent | null = null, selectionBefore?: readonly Guid[]) => {
      if (!editor.hasClipboard) {
        onStatusChange?.('The action clipboard is empty. Copy actions with Ctrl+C first.');
        return TimelineEditResult.unchanged;
      }
      const result = editor.pasteAfter(anchor, selectionBefore);
      return handleEditResult(
        result,
        `Pasted actions: ${result.selectedEventIds.length}. Save the changes.`,
      );
    },
    [editor, handleEditResult, onStatusChange],
  );

  const undo = useCallback(() => {
    if (!editor.canUndo) {
      onStatusChange?.('There are no timeline changes to undo.');
      return TimelineEditResult.unchanged;
    }
    const result = editor.undo();
    return handleEditResult(result, 'The last timeline change was undone.');
  }, [editor, handleEditResult, onStatusChange],
  );

  const redo = useCallback(() => {
    if (!editor.canRedo) {
      return TimelineEditResult.unchanged;
    }
    const result = editor.redo();
    return handleEditResult(result, 'The last undone change was restored.');
  }, [editor, handleEditResult]);

  const setAbsoluteTime = useCallback(
    (row: TimelineRow, milliseconds: number) => {
      editor.setAbsoluteTime(row, milliseconds);
      refreshState();
    },
    [editor, refreshState],
  );

  const setInterval = useCallback(
    (row: TimelineRow, milliseconds: number) => {
      editor.setInterval(row, milliseconds);
      refreshState();
    },
    [editor, refreshState],
  );

  const setComment = useCallback(
    (row: TimelineRow, value: string) => {
      editor.setComment(row, value);
      refreshState();
    },
    [editor, refreshState],
  );

  const markSaved = useCallback(() => {
    editor.markSaved(macro ?? undefined);
    refreshState();
    onStatusChange?.(macro ? `Saved: ${macro.name ?? 'Macro'}` : 'Saved.');
  }, [editor, macro, refreshState, onStatusChange]);

  return {
    editor,
    rows,
    isDirty,
    canUndo,
    canRedo,
    hasClipboard: editor.hasClipboard,
    addEvents,
    replaceEvent,
    insertDelay,
    insertComment,
    deleteEvents,
    moveEvents,
    scaleTimeline,
    copyEvents,
    pasteEvents,
    undo,
    redo,
    setAbsoluteTime,
    setInterval,
    setComment,
    markSaved,
    refreshState,
  };
}
