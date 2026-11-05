/**
 * Types and interfaces for the Timeline Editor and Virtualized Timeline Table.
 */

import type {
  MacroDefinition,
  MacroEvent,
} from '../../../../../../packages/contracts/src/index.js';
import type { TimelineRow } from '../../../../../../packages/domain/src/timeline/types.js';

/**
 * Visual representation of a single timeline row for rendering.
 */
export interface TimelineRowViewModel {
  readonly id: string;
  readonly event: MacroEvent;
  readonly display: string;
  readonly isComment: boolean;
  readonly comment: string;
  readonly timeMilliseconds: number;
  readonly intervalMilliseconds: number;
  readonly isSelected: boolean;
  readonly isFocused: boolean;
}

/**
 * Column identifiers in the timeline data grid.
 */
export type TimelineColumnId = 'time' | 'interval' | 'action' | 'comment';

/**
 * State for currently active inline cell editor.
 */
export interface InlineEditState {
  readonly rowId: string;
  readonly column: TimelineColumnId;
  readonly initialValue: string;
}

/**
 * Drag-and-drop state for timeline row reordering.
 */
export interface TimelineDragState {
  readonly isDragging: boolean;
  readonly draggedIds: ReadonlyArray<string>;
  readonly dropTargetIndex: number | null;
  readonly isDropAfter: boolean;
}

/**
 * Decision returned when prompting user about unsaved timeline changes.
 */
export type DirtyDecisionResult = 'save' | 'discard' | 'cancel';

/**
 * Props for the ScaleTimeDialog.
 */
export interface ScaleTimeDialogProps {
  readonly isOpen: boolean;
  readonly onClose: () => void;
  readonly onScale: (factor: number) => void;
}

/**
 * Props for the SaveDiscardPromptDialog.
 */
export interface SaveDiscardPromptDialogProps {
  readonly isOpen: boolean;
  readonly macroName: string;
  readonly onSave: () => void;
  readonly onDiscard: () => void;
  readonly onCancel: () => void;
}

/**
 * Props for the TimelineTable component.
 */
export interface TimelineTableProps {
  readonly rows: ReadonlyArray<TimelineRow>;
  readonly selectedKeys: ReadonlySet<string>;
  readonly focusedKey?: string | undefined;
  readonly containerHeight?: number | undefined;
  readonly itemHeight?: number | undefined;
  readonly onSelectRow?: ((key: string, e: React.MouseEvent) => void) | undefined;
  readonly onDoubleClickRow?: ((row: TimelineRow, column: TimelineColumnId) => void) | undefined;
  readonly onTimeChange?: ((row: TimelineRow, timeMs: number) => void) | undefined;
  readonly onIntervalChange?: ((row: TimelineRow, intervalMs: number) => void) | undefined;
  readonly onCommentChange?: ((row: TimelineRow, text: string) => void) | undefined;
  readonly onReorder?: ((movedIds: ReadonlyArray<string>, targetIndex: number) => void) | undefined;
  readonly onClearSelection?: (() => void) | undefined;
  readonly className?: string | undefined;
}

/**
 * Props for the TimelineToolbar component.
 */
export interface TimelineToolbarProps {
  readonly isDirty: boolean;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  readonly selectedCount: number;
  readonly statusText?: string | undefined;
  readonly onAddAction: () => void;
  readonly onAddDelay: () => void;
  readonly onAddComment: () => void;
  readonly onEditSelected: () => void;
  readonly onDeleteSelected: () => void;
  readonly onUndo: () => void;
  readonly onRedo: () => void;
  readonly onScaleTime: () => void;
  readonly onSave: () => void;
}

/**
 * Props for the complete TimelineEditorView component.
 */
export interface TimelineEditorViewProps {
  readonly onStartRecording?: (() => void) | undefined;
  readonly onImportFile?: (() => void) | undefined;
  readonly onSelectedTimeChange?: ((timeMs: number | null) => void) | undefined;
  readonly macro: MacroDefinition | null;
  readonly availableMacroNames?: ReadonlyArray<string> | undefined;
  readonly onSaveMacro?: ((macro: MacroDefinition) => Promise<void> | void) | undefined;
  readonly onStatusChange?: ((status: string) => void) | undefined;
  readonly className?: string | undefined;
}
