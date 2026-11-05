/**
 * Primary Timeline Editor View combining virtualized table, action dialogs,
 * undo/redo operations, drag reorder, multiselect, scaling, and dirty state management.
 */

import React, { useState, useCallback, useEffect, useMemo } from 'react';
import type { MacroEvent } from '../../../../../../packages/contracts/src/index.js';
import { suggestInsertionTime } from '../../../../../../packages/domain/src/timeline/processing.js';
import type { TimelineRow } from '../../../../../../packages/domain/src/timeline/types.js';
import { AddActionDialog } from '../actions/AddActionDialog.js';
import { EmptyMacroStart } from './EmptyMacroStart.js';
import type { ActionDialogSubmitResult } from '../actions/types.js';
import { SaveDiscardPromptDialog } from './SaveDiscardPromptDialog.js';
import { ScaleTimeDialog } from './ScaleTimeDialog.js';
import { TimelineTable } from './TimelineTable.js';
import { TimelineToolbar } from './TimelineToolbar.js';
import type {
  TimelineColumnId,
  TimelineEditorViewProps,
} from './types.js';
import { useDirtyDecision } from './useDirtyDecision.js';
import { useTimelineController } from './useTimelineController.js';
import { useTimelineKeyboardShortcuts } from './useTimelineKeyboardShortcuts.js';
import { useTimelineSelection } from './useTimelineSelection.js';

export function TimelineEditorView({
  onStartRecording,
  onImportFile,
  onSelectedTimeChange,
  macro,
  availableMacroNames = [],
  onSaveMacro,
  onStatusChange,
  className = '',
}: TimelineEditorViewProps) {
  const [statusMessage, setStatusMessage] = useState<string>('');
  const [isAddDialogOpen, setIsAddDialogOpen] = useState<boolean>(false);
  const [editingEvent, setEditingEvent] = useState<MacroEvent | null>(null);
  const [isScaleDialogOpen, setIsScaleDialogOpen] = useState<boolean>(false);

  const handleStatusChange = useCallback(
    (msg: string) => {
      setStatusMessage(msg);
      onStatusChange?.(msg);
    },
    [onStatusChange],
  );

  const selection = useTimelineSelection([]);

  const controller = useTimelineController({
    macro,
    onStatusChange: handleStatusChange,
    onSelectionRequested: (selectedIds) => {
      selection.setSelectedKeyList(selectedIds);
    },
  });

  const allOrderedKeys = useMemo(
    () => controller.rows.map((r) => r.event.id),
    [controller.rows],
  );

  // Dirty decision guard
  const dirtyGuard = useDirtyDecision({
    isDirty: controller.isDirty,
    macroName: macro?.name ?? 'Macro',
    onSave: async () => {
      if (macro) {
        await onSaveMacro?.(macro);
        controller.markSaved();
      }
    },
    onDiscard: () => {
      controller.editor.forget(macro?.id ?? '');
      controller.refreshState();
    },
  });

  // Selected events and anchor resolution
  const selectedRows = useMemo(() => {
    return controller.rows.filter((r) => selection.selectedKeys.has(r.event.id));
  }, [controller.rows, selection.selectedKeys]);

  useEffect(() => {
    const last = selectedRows[selectedRows.length - 1];
    onSelectedTimeChange?.(last ? Number(last.event.timeMicroseconds) / 1000 : null);
  }, [selectedRows, onSelectedTimeChange]);

  const selectedEvents = useMemo(() => {
    return selectedRows.map((r) => r.event);
  }, [selectedRows]);

  const anchorRow = useMemo<TimelineRow | null>(() => {
    if (selectedRows.length > 0) {
      // Last selected row in input order
      return selectedRows[selectedRows.length - 1]!;
    }
    return controller.rows.length > 0
      ? controller.rows[controller.rows.length - 1]!
      : null;
  }, [selectedRows, controller.rows]);

  const selectedEventIds = useMemo(() => {
    return selectedEvents.map((e) => e.id);
  }, [selectedEvents]);

  // Operations
  const handleAddActionClick = () => {
    setEditingEvent(null);
    setIsAddDialogOpen(true);
  };

  const handleEditSelected = () => {
    if (selectedRows.length !== 1) {
      handleStatusChange('Select one action to edit.');
      return;
    }
    const row = selectedRows[0]!;
    if (row.isComment) return;
    setEditingEvent(row.event);
    setIsAddDialogOpen(true);
  };

  const handleDoubleClickRow = (row: TimelineRow, _column: TimelineColumnId) => {
    if (row.isComment) return;
    setEditingEvent(row.event);
    setIsAddDialogOpen(true);
  };

  const handleActionDialogSubmit = (result: ActionDialogSubmitResult) => {
    if (editingEvent) {
      controller.replaceEvent(editingEvent, result.events, selectedEventIds);
    } else {
      controller.addEvents(
        result.events,
        anchorRow?.event ?? null,
        result.shiftAfterMicroseconds,
        result.shiftDurationMicroseconds,
        selectedEventIds,
      );
    }
    setEditingEvent(null);
  };

  const handleAddDelay = () => {
    controller.insertDelay(anchorRow?.event ?? null, 100_000, selectedEventIds);
  };

  const handleAddComment = () => {
    controller.insertComment(anchorRow?.event ?? null, '', selectedEventIds);
  };

  const handleDeleteSelected = () => {
    if (selectedEvents.length === 0) {
      handleStatusChange('Select actions to delete.');
      return;
    }
    controller.deleteEvents(selectedEvents, selectedEventIds);
  };

  const handleMoveUp = () => {
    if (selectedRows.length === 0) return;
    const firstIndex = controller.rows.indexOf(selectedRows[0]!);
    if (firstIndex <= 0) return;
    controller.moveEvents(selectedEvents, firstIndex - 1, selectedEventIds);
  };

  const handleMoveDown = () => {
    if (selectedRows.length === 0) return;
    const lastIndex = controller.rows.indexOf(selectedRows[selectedRows.length - 1]!);
    if (lastIndex >= controller.rows.length - 1) return;
    controller.moveEvents(selectedEvents, lastIndex + 2, selectedEventIds);
  };

  const handleCopy = () => {
    controller.copyEvents(selectedEvents);
  };

  const handlePaste = () => {
    controller.pasteEvents(anchorRow?.event ?? null, selectedEventIds);
  };

  const handleSave = async () => {
    if (macro) {
      await onSaveMacro?.(macro);
      controller.markSaved();
    }
  };

  // Bind all keyboard shortcuts
  useTimelineKeyboardShortcuts({
    isEnabled: !isAddDialogOpen && !isScaleDialogOpen && !dirtyGuard.isPromptOpen,
    onDelete: handleDeleteSelected,
    onCopy: handleCopy,
    onPaste: handlePaste,
    onUndo: controller.undo,
    onRedo: controller.redo,
    onMoveUp: handleMoveUp,
    onMoveDown: handleMoveDown,
    onSelectAll: () => selection.selectAll(allOrderedKeys),
    onEscape: selection.clearSelection,
  });

  const suggestedTimeMs = useMemo(() => {
    const macroEvents = macro?.events ?? [];
    const timeUs = suggestInsertionTime(macroEvents, anchorRow?.event ?? null);
    return Math.round(timeUs / 1000);
  }, [macro, anchorRow]);

  // Read from the macro: rows arrive a moment later, and must not flash the start choices.
  const hasEvents = (macro?.events?.length ?? 0) > 0;

  return React.createElement(
    'div',
    {
      className: `reference-timeline-editor flex flex-col flex-1 min-h-0 w-full ${className}`,
    },
    // An empty macro asks how to fill it; a table with no rows would say nothing useful.
    !hasEvents && React.createElement(EmptyMacroStart, {
      onRecord: onStartRecording,
      onAddAction: handleAddActionClick,
      onImport: onImportFile,
    }),

    // Virtualized Table
    hasEvents && React.createElement(TimelineTable, {
      rows: controller.rows,
      selectedKeys: selection.selectedKeys,
      focusedKey: selection.focusedKey ?? undefined,
      onSelectRow: (key, e) => selection.handleRowClick(key, e, allOrderedKeys),
      onDoubleClickRow: handleDoubleClickRow,
      onTimeChange: (row, ms) => controller.setAbsoluteTime(row, ms),
      onIntervalChange: (row, ms) => controller.setInterval(row, ms),
      onCommentChange: (row, val) => controller.setComment(row, val),
      onReorder: (draggedIds, targetIndex) => {
        const eventsToMove = controller.rows
          .filter((r) => draggedIds.includes(r.event.id))
          .map((r) => r.event);
        controller.moveEvents(eventsToMove, targetIndex, selectedEventIds);
      },
      onClearSelection: selection.clearSelection,
    }),

    // Bottom Action Toolbar
    React.createElement(TimelineToolbar, {
      isDirty: controller.isDirty,
      canUndo: controller.canUndo,
      canRedo: controller.canRedo,
      selectedCount: selection.selectedKeys.size,
      statusText: statusMessage,
      onAddAction: handleAddActionClick,
      onAddDelay: handleAddDelay,
      onAddComment: handleAddComment,
      onEditSelected: handleEditSelected,
      onDeleteSelected: handleDeleteSelected,
      onUndo: controller.undo,
      onRedo: controller.redo,
      onScaleTime: () => setIsScaleDialogOpen(true),
      onSave: handleSave,
    }),

    // Add / Edit Action Dialog
    React.createElement(AddActionDialog, {
      isOpen: isAddDialogOpen,
      mode: editingEvent ? 'edit' : 'add',
      initialEvent: editingEvent ?? undefined,
      suggestedTimeMs,
      anchorEvent: anchorRow?.event ?? null,
      availableMacroNames,
      onClose: () => {
        setIsAddDialogOpen(false);
        setEditingEvent(null);
      },
      onSubmit: handleActionDialogSubmit,
    }),

    // Scale Time Dialog
    React.createElement(ScaleTimeDialog, {
      isOpen: isScaleDialogOpen,
      onClose: () => setIsScaleDialogOpen(false),
      onScale: (factor) => controller.scaleTimeline(factor, selectedEventIds),
    }),

    // Unsaved Changes Save/Discard Decision Dialog
    React.createElement(SaveDiscardPromptDialog, {
      isOpen: dirtyGuard.isPromptOpen,
      macroName: dirtyGuard.macroName,
      onSave: dirtyGuard.handleSaveDecision,
      onDiscard: dirtyGuard.handleDiscardDecision,
      onCancel: dirtyGuard.handleCancelDecision,
    }),
  );
}
