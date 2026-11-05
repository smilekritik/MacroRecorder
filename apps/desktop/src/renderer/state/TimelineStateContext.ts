import React, { createContext, useContext, useState, useCallback, useMemo } from 'react';
import type { MacroEvent } from '../../../../../packages/contracts/src/index.js';

export interface TimelineHistoryEntry {
  readonly events: ReadonlyArray<MacroEvent>;
  readonly description: string;
}

export interface TimelineStateContextValue {
  readonly events: ReadonlyArray<MacroEvent>;
  readonly isDirty: boolean;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  readonly setEvents: (events: ReadonlyArray<MacroEvent>) => void;
  readonly pushChange: (newEvents: ReadonlyArray<MacroEvent>, description: string) => void;
  readonly undo: () => void;
  readonly redo: () => void;
  readonly markSaved: () => void;
}

const TimelineStateContext = createContext<TimelineStateContextValue | null>(null);

export interface TimelineStateProviderProps {
  readonly initialEvents?: ReadonlyArray<MacroEvent> | undefined;
  readonly children?: React.ReactNode | undefined;
}

/**
 * Timeline editor state boundary.
 * Implements isolated per-macro undo/redo stacks.
 * Conforms to: Saving a macro clears its undo history.
 */
export function TimelineStateProvider({
  initialEvents = [],
  children,
}: TimelineStateProviderProps) {
  const [events, setEventsState] = useState<ReadonlyArray<MacroEvent>>(initialEvents);
  const [undoStack, setUndoStack] = useState<ReadonlyArray<TimelineHistoryEntry>>([]);
  const [redoStack, setRedoStack] = useState<ReadonlyArray<TimelineHistoryEntry>>([]);
  const [isDirty, setIsDirty] = useState<boolean>(false);

  const setEvents = useCallback((newEvents: ReadonlyArray<MacroEvent>) => {
    setEventsState(newEvents);
    setUndoStack([]);
    setRedoStack([]);
    setIsDirty(false);
  }, []);

  const pushChange = useCallback(
    (newEvents: ReadonlyArray<MacroEvent>, description: string) => {
      setUndoStack((prev) => [...prev, { events, description }]);
      setRedoStack([]);
      setEventsState(newEvents);
      setIsDirty(true);
    },
    [events],
  );

  const undo = useCallback(() => {
    if (undoStack.length === 0) return;

    const previousEntry = undoStack[undoStack.length - 1];
    if (!previousEntry) return;

    setUndoStack((prev) => prev.slice(0, -1));
    setRedoStack((prev) => [...prev, { events, description: previousEntry.description }]);
    setEventsState(previousEntry.events);
    setIsDirty(true);
  }, [undoStack, events]);

  const redo = useCallback(() => {
    if (redoStack.length === 0) return;

    const nextEntry = redoStack[redoStack.length - 1];
    if (!nextEntry) return;

    setRedoStack((prev) => prev.slice(0, -1));
    setUndoStack((prev) => [...prev, { events, description: nextEntry.description }]);
    setEventsState(nextEntry.events);
    setIsDirty(true);
  }, [redoStack, events]);

  // Saving a macro clears its undo history
  const markSaved = useCallback(() => {
    setUndoStack([]);
    setRedoStack([]);
    setIsDirty(false);
  }, []);

  const value = useMemo<TimelineStateContextValue>(
    () => ({
      events,
      isDirty,
      canUndo: undoStack.length > 0,
      canRedo: redoStack.length > 0,
      setEvents,
      pushChange,
      undo,
      redo,
      markSaved,
    }),
    [events, isDirty, undoStack.length, redoStack.length, setEvents, pushChange, undo, redo, markSaved],
  );

  return React.createElement(TimelineStateContext.Provider, { value }, children);
}

export function useTimelineStateContext(): TimelineStateContextValue {
  const ctx = useContext(TimelineStateContext);
  if (!ctx) {
    throw new Error('useTimelineStateContext must be used within a TimelineStateProvider');
  }
  return ctx;
}
