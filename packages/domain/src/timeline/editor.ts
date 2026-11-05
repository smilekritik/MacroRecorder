/**
 * Mutable timeline editor owning rows, per-macro isolated undo/redo stacks,
 * clipboard, interval and absolute-time synchronization, and transaction operations.
 */

import {
  createCommentEvent,
  createDelayEvent,
  formatMacroEventDisplay,
  getEventEndTimeMicroseconds,
  getMacroDurationMicroseconds,
  isCommentEvent,
} from '../model/index.js';
import {
  cloneMacroEventPreservingId,
  normalizeEventsInPlace,
  roundToMilliseconds,
  scaleTime,
} from './processing.js';
import {
  type Guid,
  type MacroDefinition,
  type MacroEvent,
  MacroEventType,
  type Microseconds,
} from '../model/types.js';
import {
  type TimelineChangeListener,
  TimelineEditResult,
  type TimelineEditorOptions,
  type TimelineRow,
  type TimelineSnapshot,
} from './types.js';

/**
 * Safely updates time on an event, supporting both camelCase and PascalCase properties.
 */
function setEventTimeMicroseconds(event: MacroEvent, timeUs: Microseconds): void {
  const rec = event as unknown as Record<string, unknown>;
  rec.timeMicroseconds = timeUs;
  if ('TimeMicroseconds' in event) {
    rec.TimeMicroseconds = timeUs;
  }
}

/**
 * Updates comment text on an event depending on whether it is a comment row or normal action.
 */
function setRowComment(event: MacroEvent, text: string): void {
  const rec = event as unknown as Record<string, unknown>;
  if (isCommentEvent(event)) {
    rec.text = text;
    if ('Text' in event) {
      rec.Text = text;
    }
  } else {
    rec.comment = text;
    if ('Comment' in event) {
      rec.Comment = text;
    }
  }
}

/**
 * Reads comment text from an event depending on whether it is a comment row or normal action.
 */
function getRowComment(event: MacroEvent): string {
  if (isCommentEvent(event)) {
    return (
      ((event as unknown as Record<string, unknown>).text as string) ??
      ((event as unknown as Record<string, unknown>).Text as string) ??
      ''
    );
  }
  return event.comment ?? ((event as unknown as Record<string, unknown>).Comment as string) ?? '';
}

/**
 * Converts fractional milliseconds to integer microseconds.
 * Clamps negative values to zero.
 */
function tryToMicroseconds(milliseconds: number): { success: boolean; value: Microseconds } {
  if (!Number.isFinite(milliseconds) || milliseconds > Number.MAX_SAFE_INTEGER / 1000) {
    return { success: false, value: 0 };
  }
  const value = milliseconds <= 0 ? 0 : Math.round(milliseconds * 1000);
  return { success: true, value };
}

/**
 * Inserts actions after the last action with a lesser or equal time.
 * Uses binary search to avoid quadratic regressions on large additions.
 */
function insertByTime(ordered: MacroEvent[], additions: readonly MacroEvent[]): void {
  for (const item of additions) {
    let low = 0;
    let high = ordered.length - 1;
    let lastMatch = -1;

    while (low <= high) {
      const mid = (low + high) >> 1;
      const candidate = ordered[mid]!;
      if (!isCommentEvent(candidate) && candidate.timeMicroseconds <= item.timeMicroseconds) {
        lastMatch = mid;
        low = mid + 1;
      } else if (candidate.timeMicroseconds > item.timeMicroseconds) {
        high = mid - 1;
      } else {
        // Comment event or lower time, probe forward
        low = mid + 1;
      }
    }

    if (lastMatch >= 0) {
      // Advance past any comments attached to this anchor
      let insertIdx = lastMatch + 1;
      while (insertIdx < ordered.length && isCommentEvent(ordered[insertIdx]!)) {
        insertIdx++;
      }
      ordered.splice(insertIdx, 0, item);
    } else {
      ordered.unshift(item);
    }
  }
}

/**
 * Single timeline table row linking absolute time and previous interval.
 */
export class TimelineRowModel implements TimelineRow {
  private readonly _owner: TimelineEditor;
  private _event: MacroEvent;
  private readonly _listeners = new Set<(row: TimelineRow) => void>();

  public constructor(owner: TimelineEditor, item: MacroEvent) {
    this._owner = owner;
    this._event = item;
  }

  public get event(): MacroEvent {
    return this._event;
  }

  public set event(e: MacroEvent) {
    this._event = e;
  }

  public get Event(): MacroEvent {
    return this._event;
  }

  public get display(): string {
    return formatMacroEventDisplay(this._event);
  }

  public get Display(): string {
    return this.display;
  }

  public get isComment(): boolean {
    return isCommentEvent(this._event);
  }

  public get IsComment(): boolean {
    return this.isComment;
  }

  public get comment(): string {
    return getRowComment(this._event);
  }

  public set comment(val: string) {
    this._owner.setComment(this, val);
  }

  public get Comment(): string {
    return this.comment;
  }

  public set Comment(val: string) {
    this.comment = val;
  }

  public get timeMilliseconds(): number {
    return this._event.timeMicroseconds / 1000.0;
  }

  public set timeMilliseconds(val: number) {
    this._owner.setAbsoluteTime(this, val);
  }

  public get TimeMilliseconds(): number {
    return this.timeMilliseconds;
  }

  public set TimeMilliseconds(val: number) {
    this.timeMilliseconds = val;
  }

  public get intervalMilliseconds(): number {
    return this._owner.getIntervalMilliseconds(this);
  }

  public set intervalMilliseconds(val: number) {
    this._owner.setInterval(this, val);
  }

  public get IntervalMilliseconds(): number {
    return this.intervalMilliseconds;
  }

  public set IntervalMilliseconds(val: number) {
    this.intervalMilliseconds = val;
  }

  public subscribe(listener: (row: TimelineRow) => void): () => void {
    this._listeners.add(listener);
    return () => {
      this._listeners.delete(listener);
    };
  }

  public notifyTimeChanged(): void {
    for (const listener of this._listeners) {
      try {
        listener(this);
      } catch {
        // Suppress listener errors
      }
    }
  }

  public notifyCommentChanged(): void {
    for (const listener of this._listeners) {
      try {
        listener(this);
      } catch {
        // Suppress listener errors
      }
    }
  }

  public notifyIntervalChanged(): void {
    for (const listener of this._listeners) {
      try {
        listener(this);
      } catch {
        // Suppress listener errors
      }
    }
  }
}

/**
 * Owns all mutable timeline operations, per-macro undo histories, and the action clipboard.
 * Absolute time and previous interval remain two editable views of the same value.
 */
export class TimelineEditor {
  private readonly _undoByMacro = new Map<string, TimelineSnapshot[]>();
  private readonly _redoByMacro = new Map<string, TimelineSnapshot[]>();
  private _clipboard: MacroEvent[] = [];
  private _macro: MacroDefinition | null = null;
  private _rows: TimelineRowModel[] = [];
  private readonly _maxUndoDepth: number;
  private readonly _changeListeners = new Set<TimelineChangeListener>();

  public constructor(options?: TimelineEditorOptions) {
    this._maxUndoDepth = options?.maxUndoDepth ?? 100;
  }

  public get rows(): readonly TimelineRow[] {
    return this._rows;
  }

  public get Rows(): readonly TimelineRow[] {
    return this._rows;
  }

  public get hasClipboard(): boolean {
    return this._clipboard.length > 0;
  }

  public get HasClipboard(): boolean {
    return this.hasClipboard;
  }

  public get canUndo(): boolean {
    if (this._macro === null) return false;
    const history = this._undoByMacro.get(this.getMacroId(this._macro));
    return history !== undefined && history.length > 0;
  }

  public get CanUndo(): boolean {
    return this.canUndo;
  }

  public get canRedo(): boolean {
    if (this._macro === null) return false;
    const history = this._redoByMacro.get(this.getMacroId(this._macro));
    return history !== undefined && history.length > 0;
  }

  public get CanRedo(): boolean {
    return this.canRedo;
  }

  /**
   * Macros with unsaved timeline edits.
   */
  public get macrosWithPendingEdits(): readonly Guid[] {
    const result: Guid[] = [];
    for (const [key, history] of this._undoByMacro.entries()) {
      if (history.length > 0) {
        result.push(key as Guid);
      }
    }
    return result;
  }

  public get MacrosWithPendingEdits(): readonly Guid[] {
    return this.macrosWithPendingEdits;
  }

  /**
   * Checks whether the specified macro (or the currently loaded macro) has unsaved edits.
   */
  public isDirty(macroOrId?: MacroDefinition | Guid): boolean {
    if (!macroOrId) {
      return this.canUndo;
    }
    const id = typeof macroOrId === 'string' ? macroOrId : this.getMacroId(macroOrId);
    const history = this._undoByMacro.get(id);
    return history !== undefined && history.length > 0;
  }

  public get IsDirty(): boolean {
    return this.isDirty();
  }

  /**
   * Loads a macro definition into the editor and rebuilds rows.
   */
  public load(macro: MacroDefinition | null): void {
    this._macro = macro;
    this.rebuildRows();
  }

  public Load(macro: MacroDefinition | null): void {
    this.load(macro);
  }

  /**
   * Marks a macro as saved, clearing its undo history.
   */
  public markSaved(macro?: MacroDefinition | Guid): void {
    const target = macro ?? this._macro;
    if (!target) return;
    const id = typeof target === 'string' ? target : this.getMacroId(target);
    this._undoByMacro.delete(id);
    this._redoByMacro.delete(id);
    this.notifyChanged();
  }

  public MarkSaved(macro?: MacroDefinition | Guid): void {
    this.markSaved(macro);
  }

  /**
   * Drops undo/redo history for a specific macro.
   */
  public forget(macroId: Guid): void {
    this._undoByMacro.delete(macroId);
    this._redoByMacro.delete(macroId);
    this.notifyChanged();
  }

  public Forget(macroId: Guid): void {
    this.forget(macroId);
  }

  /**
   * Drops all undo/redo histories across all macros.
   */
  public forgetAll(): void {
    this._undoByMacro.clear();
    this._redoByMacro.clear();
    this.notifyChanged();
  }

  public ForgetAll(): void {
    this.forgetAll();
  }

  /**
   * Copies selected events into the clipboard, rebasing timestamps relative to the first event.
   */
  public copyEvents(events: readonly MacroEvent[]): number {
    const selectedIds = new Set(events.map((e) => e.id));
    const isSelected = (item: MacroEvent) => selectedIds.has(item.id) || events.includes(item);
    const ordered = this._rows.map((row) => row.event).filter(isSelected);
    if (ordered.length === 0) return 0;

    const origin = ordered[0]!.timeMicroseconds;
    this._clipboard = ordered.map((item) => {
      const copy = cloneMacroEventPreservingId(item, true);
      const rec = copy as unknown as Record<string, unknown>;
      const rebasing = Math.max(0, copy.timeMicroseconds - origin);
      rec.timeMicroseconds = rebasing;
      if ('TimeMicroseconds' in copy) {
        rec.TimeMicroseconds = rebasing;
      }
      return copy;
    });
    return this._clipboard.length;
  }

  public CopyEvents(events: readonly MacroEvent[]): number {
    return this.copyEvents(events);
  }

  /**
   * Pastes clipboard events right after the anchor, shifting subsequent events.
   */
  public pasteAfter(
    anchor: MacroEvent | null,
    selectionBefore?: readonly Guid[],
  ): TimelineEditResult {
    if (this._macro === null || this._clipboard.length === 0) {
      return TimelineEditResult.unchanged;
    }
    const ordered = this._rows.map((row) => row.event);
    let anchorIndex =
      anchor === null
        ? ordered.length - 1
        : ordered.findIndex((e) => e.id === anchor.id || e === anchor);
    if (anchor !== null && anchorIndex < 0) anchorIndex = ordered.length - 1;
    if (anchorIndex >= ordered.length) anchorIndex = ordered.length - 1;
    const actualAnchor = anchorIndex >= 0 ? ordered[anchorIndex]! : null;

    // Comments take no time: an insertion made only of them shifts nothing.
    const commentsOnly = this._clipboard.every(isCommentEvent);
    const gap =
      commentsOnly ||
      actualAnchor === null ||
      actualAnchor.type === MacroEventType.Delay ||
      actualAnchor.type === MacroEventType.PixelColorTrigger ||
      actualAnchor.type === MacroEventType.Comment
        ? 0
        : 10_000;
    const start = actualAnchor === null ? 0 : actualAnchor.timeMicroseconds + gap;
    const span = Math.max(...this._clipboard.map((item) => getEventEndTimeMicroseconds(item)));
    const occupied = commentsOnly ? 0 : Math.max(10_000, gap + span);

    this.captureUndo(selectionBefore ?? []);
    const inserted = this._clipboard.map((item) => {
      const copy = cloneMacroEventPreservingId(item, false);
      const rec = copy as unknown as Record<string, unknown>;
      const newTime = start + item.timeMicroseconds;
      rec.timeMicroseconds = newTime;
      if ('TimeMicroseconds' in copy) {
        rec.TimeMicroseconds = newTime;
      }
      return copy;
    });

    for (let index = anchorIndex + 1; index < ordered.length; index++) {
      setEventTimeMicroseconds(ordered[index]!, ordered[index]!.timeMicroseconds + occupied);
    }
    ordered.splice(anchorIndex + 1, 0, ...inserted);
    this.replaceEvents(ordered);
    return new TimelineEditResult(
      true,
      inserted.map((item) => item.id),
    );
  }

  public PasteAfter(
    anchor: MacroEvent | null,
    selectionBefore?: readonly Guid[],
  ): TimelineEditResult {
    return this.pasteAfter(anchor, selectionBefore);
  }

  /**
   * Inserts actions as a separate block right after the anchor, preserving the order of existing events.
   * If user sets a time later than the anchor, synthesizes a single gap pause.
   */
  public addEvents(
    events: readonly MacroEvent[],
    anchor: MacroEvent | null = null,
    insertAtMicroseconds = 0,
    occupiedMicroseconds = 0,
    selectionBefore?: readonly Guid[],
  ): TimelineEditResult {
    if (this._macro === null) return TimelineEditResult.unchanged;
    const added = [...events];
    if (added.length === 0 && occupiedMicroseconds <= 0) return TimelineEditResult.unchanged;

    this.captureUndo(selectionBefore ?? []);

    const ordered = this._rows.map((row) => row.event);
    let anchorIndex =
      anchor === null
        ? ordered.length - 1
        : ordered.findIndex((e) => e.id === anchor.id || e === anchor);
    if (anchor !== null && anchorIndex < 0) anchorIndex = ordered.length - 1;
    const anchorTime = anchorIndex >= 0 ? ordered[anchorIndex]!.timeMicroseconds : 0;

    const commentsOnly = added.length > 0 && added.every(isCommentEvent);
    const insertAt = roundToMilliseconds(insertAtMicroseconds);
    const lift = Math.max(0, anchorTime - insertAt);
    const start = insertAt + lift;
    const duration = roundToMilliseconds(occupiedMicroseconds);
    const gap = commentsOnly || anchorIndex < 0 ? 0 : Math.max(0, start - anchorTime);
    const shift = commentsOnly ? 0 : gap + duration;

    if (commentsOnly) {
      for (const item of added) setEventTimeMicroseconds(item, anchorTime);
    } else if (lift > 0) {
      for (const item of added) setEventTimeMicroseconds(item, item.timeMicroseconds + lift);
    }

    if (shift > 0) {
      for (let index = anchorIndex + 1; index < ordered.length; index++) {
        setEventTimeMicroseconds(ordered[index]!, ordered[index]!.timeMicroseconds + shift);
      }
    }

    const inserted: MacroEvent[] = [];
    if (gap > 0) {
      inserted.push(createDelayEvent({ timeMicroseconds: start, durationMicroseconds: 0 }));
    }
    inserted.push(...added);
    ordered.splice(anchorIndex + 1, 0, ...inserted);
    this.replaceEvents(ordered);
    return new TimelineEditResult(
      true,
      inserted.map((item) => item.id),
    );
  }

  public AddEvents(
    events: readonly MacroEvent[],
    anchor: MacroEvent | null = null,
    insertAtMicroseconds = 0,
    occupiedMicroseconds = 0,
    selectionBefore?: readonly Guid[],
  ): TimelineEditResult {
    return this.addEvents(
      events,
      anchor,
      insertAtMicroseconds,
      occupiedMicroseconds,
      selectionBefore,
    );
  }

  /**
   * Replaces an existing event with one or more replacement events.
   */
  public replaceEvent(
    original: MacroEvent,
    replacements: readonly MacroEvent[],
    selectionBefore?: readonly Guid[],
  ): TimelineEditResult {
    if (this._macro === null) return TimelineEditResult.unchanged;
    const ordered = this._rows.map((row) => row.event);
    const index = ordered.findIndex((e) => e.id === original.id || e === original);
    if (index < 0) return TimelineEditResult.unchanged;

    const added = [...replacements];
    if (added.length === 0) return TimelineEditResult.unchanged;

    this.captureUndo(selectionBefore ?? [original.id]);
    ordered.splice(index, 1);

    if (added.every(isCommentEvent)) {
      ordered.splice(index, 0, ...added);
    } else {
      insertByTime(ordered, added);
    }
    this.replaceEvents(ordered);
    return new TimelineEditResult(
      true,
      added.map((item) => item.id),
    );
  }

  public ReplaceEvent(
    original: MacroEvent,
    replacements: readonly MacroEvent[],
    selectionBefore?: readonly Guid[],
  ): TimelineEditResult {
    return this.replaceEvent(original, replacements, selectionBefore);
  }

  /**
   * Adds an empty comment row right after the selected action without moving the timeline.
   */
  public insertComment(
    anchor: MacroEvent | null = null,
    text = '',
    selectionBefore?: readonly Guid[],
  ): TimelineEditResult {
    if (this._macro === null) return TimelineEditResult.unchanged;
    this.captureUndo(selectionBefore ?? (anchor === null ? [] : [anchor.id]));
    const ordered = this._rows.map((row) => row.event);
    let index =
      anchor === null
        ? ordered.length
        : ordered.findIndex((e) => e.id === anchor.id || e === anchor) + 1;
    if (anchor !== null && index <= 0) index = ordered.length;
    const timeMicroseconds = index === 0 ? 0 : ordered[index - 1]!.timeMicroseconds;

    const comment = createCommentEvent({
      text,
      timeMicroseconds,
    });
    ordered.splice(index, 0, comment);
    this.replaceEvents(ordered);
    return new TimelineEditResult(true, [comment.id]);
  }

  public InsertComment(
    anchor: MacroEvent | null = null,
    text = '',
    selectionBefore?: readonly Guid[],
  ): TimelineEditResult {
    return this.insertComment(anchor, text, selectionBefore);
  }

  /**
   * Inserts a pause and shifts all later events.
   */
  public insertDelay(
    anchor: MacroEvent | null = null,
    durationMicroseconds = 100_000,
    selectionBefore?: readonly Guid[],
  ): TimelineEditResult {
    if (this._macro === null || durationMicroseconds <= 0) return TimelineEditResult.unchanged;
    const at =
      anchor !== null ? anchor.timeMicroseconds : getMacroDurationMicroseconds(this._macro);
    this.captureUndo(selectionBefore ?? (anchor === null ? [] : [anchor.id]));

    const macroEvents = this.getMacroEvents();
    for (const item of macroEvents) {
      if (item.timeMicroseconds > at) {
        setEventTimeMicroseconds(item, item.timeMicroseconds + durationMicroseconds);
      }
    }
    const delay = createDelayEvent({
      timeMicroseconds: at + durationMicroseconds,
      durationMicroseconds: 0,
    });
    macroEvents.push(delay);
    this.replaceEvents(normalizeEventsInPlace(macroEvents));
    return new TimelineEditResult(true, [delay.id]);
  }

  public InsertDelay(
    anchor: MacroEvent | null = null,
    durationMicroseconds = 100_000,
    selectionBefore?: readonly Guid[],
  ): TimelineEditResult {
    return this.insertDelay(anchor, durationMicroseconds, selectionBefore);
  }

  /**
   * Deletes selected actions and compacts the timeline by removing the gaps.
   */
  public deleteEvents(
    events: readonly MacroEvent[],
    selectionBefore?: readonly Guid[],
  ): TimelineEditResult {
    if (this._macro === null || events.length === 0) return TimelineEditResult.unchanged;
    const selectedIds = new Set(events.map((e) => e.id));
    const isSelected = (item: MacroEvent) => selectedIds.has(item.id) || events.includes(item);
    const ordered = this._rows.map((row) => row.event);
    if (!ordered.some(isSelected)) return TimelineEditResult.unchanged;

    this.captureUndo(selectionBefore ?? ordered.filter(isSelected).map((item) => item.id));

    const intervals = new Map<MacroEvent, number>();
    let previous = 0;
    for (const item of ordered) {
      intervals.set(item, Math.max(0, item.timeMicroseconds - previous));
      previous = item.timeMicroseconds;
    }

    const remaining = ordered.filter((item) => !isSelected(item));
    let time = 0;
    for (let index = 0; index < remaining.length; index++) {
      if (index > 0) {
        time += intervals.get(remaining[index]!) ?? 0;
      }
      setEventTimeMicroseconds(remaining[index]!, time);
    }
    this.replaceEvents(remaining);

    const firstRemoved = ordered.findIndex(isSelected);
    const neighborIndex = Math.min(firstRemoved, Math.max(0, remaining.length - 1));
    const neighbor = remaining[neighborIndex];
    return new TimelineEditResult(true, neighbor ? [neighbor.id] : []);
  }

  public DeleteEvents(
    events: readonly MacroEvent[],
    selectionBefore?: readonly Guid[],
  ): TimelineEditResult {
    return this.deleteEvents(events, selectionBefore);
  }

  /**
   * Reorders timeline actions while preserving preceding intervals between events.
   * Rebases the new leading action to 0 microseconds.
   */
  public moveEvents(
    events: readonly MacroEvent[],
    insertionIndex: number,
    selectionBefore?: readonly Guid[],
  ): TimelineEditResult {
    if (this._macro === null || events.length === 0 || this._rows.length < 2) {
      return TimelineEditResult.unchanged;
    }
    const ordered = this._rows.map((row) => row.event);
    const movingSet = new Set(events.map((e) => e.id));
    const isMoving = (item: MacroEvent) => movingSet.has(item.id) || events.includes(item);
    const moving = ordered.filter(isMoving);
    if (moving.length === 0) return TimelineEditResult.unchanged;

    const clampedInsertion = Math.max(0, Math.min(insertionIndex, ordered.length));
    const countInPrefix = ordered.slice(0, clampedInsertion).filter(isMoving).length;
    const remaining = ordered.filter((item) => !isMoving(item));
    const adjustedIndex = Math.max(0, Math.min(clampedInsertion - countInPrefix, remaining.length));
    const reordered = [
      ...remaining.slice(0, adjustedIndex),
      ...moving,
      ...remaining.slice(adjustedIndex),
    ];

    if (ordered.every((item, idx) => item === reordered[idx])) {
      return TimelineEditResult.unchanged;
    }

    this.captureUndo(selectionBefore ?? moving.map((item) => item.id));

    const intervals = new Map<MacroEvent, number>();
    let previous = 0;
    for (const item of ordered) {
      intervals.set(item, Math.max(0, item.timeMicroseconds - previous));
      previous = item.timeMicroseconds;
    }

    let time = 0;
    for (let index = 0; index < reordered.length; index++) {
      if (index > 0) {
        time += intervals.get(reordered[index]!) ?? 0;
      }
      setEventTimeMicroseconds(reordered[index]!, time);
    }
    this.replaceEvents(reordered);
    return new TimelineEditResult(
      true,
      moving.map((item) => item.id),
    );
  }

  public MoveEvents(
    events: readonly MacroEvent[],
    insertionIndex: number,
    selectionBefore?: readonly Guid[],
  ): TimelineEditResult {
    return this.moveEvents(events, insertionIndex, selectionBefore);
  }

  /**
   * Scales timeline timestamps and overlay durations by a factor.
   */
  public scale(factor: number, selectionBefore?: readonly Guid[]): TimelineEditResult {
    if (
      this._macro === null ||
      factor < 0.1 ||
      factor > 10.0 ||
      this.getMacroEvents().length === 0
    ) {
      return TimelineEditResult.unchanged;
    }
    this.captureUndo(selectionBefore ?? []);
    scaleTime(this._macro, factor);
    this.rebuildRows();
    return new TimelineEditResult(true, selectionBefore ? [...selectionBefore] : []);
  }

  public Scale(factor: number, selectionBefore?: readonly Guid[]): TimelineEditResult {
    return this.scale(factor, selectionBefore);
  }

  /**
   * Undoes the last edit transaction on the current macro.
   */
  public undo(): TimelineEditResult {
    if (this._macro === null) return TimelineEditResult.unchanged;
    const macroId = this.getMacroId(this._macro);
    const history = this._undoByMacro.get(macroId);
    if (!history || history.length === 0) return TimelineEditResult.unchanged;

    const snapshot = history.pop()!;

    // Push current state to redo stack
    const redoStack = this.getOrCreateRedoStack(macroId);
    redoStack.push({
      events: this.getMacroEvents().map((item) => cloneMacroEventPreservingId(item, true)),
      modifiedAt: this._macro.modifiedAt ?? new Date().toISOString(),
      selectedEventIds: [...snapshot.selectedEventIds],
    });
    if (this._maxUndoDepth > 0 && redoStack.length > this._maxUndoDepth) {
      redoStack.shift();
    }

    const macroEvents = this.getMacroEvents();
    macroEvents.length = 0;
    for (const item of snapshot.events) {
      macroEvents.push(cloneMacroEventPreservingId(item, true));
    }
    const macroRec = this._macro as unknown as Record<string, unknown>;
    macroRec.modifiedAt = snapshot.modifiedAt;
    if ('ModifiedAt' in this._macro) {
      macroRec.ModifiedAt = snapshot.modifiedAt;
    }
    this.rebuildRows();
    this.notifyChanged();
    return new TimelineEditResult(true, snapshot.selectedEventIds);
  }

  public Undo(): TimelineEditResult {
    return this.undo();
  }

  /**
   * Redoes the last undone edit transaction on the current macro.
   */
  public redo(): TimelineEditResult {
    if (this._macro === null) return TimelineEditResult.unchanged;
    const macroId = this.getMacroId(this._macro);
    const redoStack = this._redoByMacro.get(macroId);
    if (!redoStack || redoStack.length === 0) return TimelineEditResult.unchanged;

    const snapshot = redoStack.pop()!;

    // Push current state to undo stack
    const undoStack = this.getOrCreateUndoStack(macroId);
    undoStack.push({
      events: this.getMacroEvents().map((item) => cloneMacroEventPreservingId(item, true)),
      modifiedAt: this._macro.modifiedAt ?? new Date().toISOString(),
      selectedEventIds: [...snapshot.selectedEventIds],
    });
    if (this._maxUndoDepth > 0 && undoStack.length > this._maxUndoDepth) {
      undoStack.shift();
    }

    const macroEvents = this.getMacroEvents();
    macroEvents.length = 0;
    for (const item of snapshot.events) {
      macroEvents.push(cloneMacroEventPreservingId(item, true));
    }
    const macroRec = this._macro as unknown as Record<string, unknown>;
    macroRec.modifiedAt = snapshot.modifiedAt;
    if ('ModifiedAt' in this._macro) {
      macroRec.ModifiedAt = snapshot.modifiedAt;
    }
    this.rebuildRows();
    this.notifyChanged();
    return new TimelineEditResult(true, snapshot.selectedEventIds);
  }

  public Redo(): TimelineEditResult {
    return this.redo();
  }

  /**
   * Sets absolute time on a row, shifting all subsequent tail events.
   */
  public setAbsoluteTime(row: TimelineRow, milliseconds: number): void {
    const index = this._rows.indexOf(row as TimelineRowModel);
    if (index < 0) return;
    const converted = tryToMicroseconds(milliseconds);
    if (!converted.success) return;
    const previous = index === 0 ? 0 : this._rows[index - 1]!.event.timeMicroseconds;
    this.shiftTail(index, Math.max(previous, converted.value));
  }

  public SetAbsoluteTime(row: TimelineRow, milliseconds: number): void {
    this.setAbsoluteTime(row, milliseconds);
  }

  /**
   * Sets preceding interval on a row, shifting all subsequent tail events.
   */
  public setInterval(row: TimelineRow, milliseconds: number): void {
    const index = this._rows.indexOf(row as TimelineRowModel);
    if (index < 0) return;
    const converted = tryToMicroseconds(milliseconds);
    if (!converted.success) return;
    const previous = index === 0 ? 0 : this._rows[index - 1]!.event.timeMicroseconds;
    const requested = previous + converted.value;
    this.shiftTail(index, requested);
  }

  public SetInterval(row: TimelineRow, milliseconds: number): void {
    this.setInterval(row, milliseconds);
  }

  /**
   * Edits an action's note or comment row text.
   */
  public setComment(row: TimelineRow, value: string): void {
    const text = value ?? '';
    const current = getRowComment(row.event);
    if (current === text) return;
    this.captureUndo([row.event.id]);
    setRowComment(row.event, text);
    row.notifyCommentChanged();
    if (this._macro !== null) {
      const now = new Date().toISOString();
      const macroRec = this._macro as unknown as Record<string, unknown>;
      macroRec.modifiedAt = now;
      if ('ModifiedAt' in this._macro) {
        macroRec.ModifiedAt = now;
      }
    }
    this.notifyChanged();
  }

  public SetComment(row: TimelineRow, value: string): void {
    this.setComment(row, value);
  }

  /**
   * Computes the preceding interval in fractional milliseconds.
   */
  public getIntervalMilliseconds(row: TimelineRow): number {
    const index = this._rows.indexOf(row as TimelineRowModel);
    if (index < 0) return 0;
    const previous = index === 0 ? 0 : this._rows[index - 1]!.event.timeMicroseconds;
    return (row.event.timeMicroseconds - previous) / 1000.0;
  }

  public GetIntervalMilliseconds(row: TimelineRow): number {
    return this.getIntervalMilliseconds(row);
  }

  /**
   * Subscribes to editor state changes (edits, undo, reload).
   */
  public subscribe(listener: TimelineChangeListener): () => void {
    this._changeListeners.add(listener);
    return () => {
      this._changeListeners.delete(listener);
    };
  }

  private notifyChanged(): void {
    for (const listener of this._changeListeners) {
      try {
        listener();
      } catch {
        // Suppress listener errors
      }
    }
  }

  private shiftTail(index: number, requestedTime: number): void {
    const targetRow = this._rows[index];
    if (!targetRow) return;
    const delta = requestedTime - targetRow.event.timeMicroseconds;
    if (delta === 0) return;

    this.captureUndo([targetRow.event.id]);

    // Shift whole tail first, then notify
    for (let i = index; i < this._rows.length; i++) {
      const ev = this._rows[i]!.event;
      setEventTimeMicroseconds(ev, ev.timeMicroseconds + delta);
    }
    for (let i = index; i < this._rows.length; i++) {
      this._rows[i]!.notifyTimeChanged();
      this._rows[i]!.notifyIntervalChanged();
    }
    if (this._macro !== null) {
      const now = new Date().toISOString();
      const macroRec = this._macro as unknown as Record<string, unknown>;
      macroRec.modifiedAt = now;
      if ('ModifiedAt' in this._macro) {
        macroRec.ModifiedAt = now;
      }
    }
    this.notifyChanged();
  }

  private captureUndo(selectedEventIds: readonly Guid[]): void {
    if (this._macro === null) return;
    const macroId = this.getMacroId(this._macro);
    const history = this.getOrCreateUndoStack(macroId);
    history.push({
      events: this.getMacroEvents().map((item) => cloneMacroEventPreservingId(item, true)),
      modifiedAt: this._macro.modifiedAt ?? new Date().toISOString(),
      selectedEventIds: [...selectedEventIds],
    });

    if (this._maxUndoDepth > 0 && history.length > this._maxUndoDepth) {
      history.shift();
    }

    // New action clears redo history
    this._redoByMacro.delete(macroId);
    this.notifyChanged();
  }

  private replaceEvents(events: readonly MacroEvent[]): void {
    if (this._macro === null) return;
    const items = [...events];
    const macroEvents = this.getMacroEvents();
    macroEvents.length = 0;
    macroEvents.push(...items);

    const now = new Date().toISOString();
    const macroRec = this._macro as unknown as Record<string, unknown>;
    macroRec.modifiedAt = now;
    if ('ModifiedAt' in this._macro) {
      macroRec.ModifiedAt = now;
    }
    this.rebuildRows();
    this.notifyChanged();
  }

  private rebuildRows(): void {
    this._rows = [];
    if (this._macro === null) return;
    const events = this.getMacroEvents();
    normalizeEventsInPlace(events);
    for (const item of events) {
      this._rows.push(new TimelineRowModel(this, item));
    }
  }

  private getMacroEvents(): MacroEvent[] {
    if (!this._macro) return [];
    const rec = this._macro as unknown as Record<string, unknown>;
    if (!this._macro.events) {
      const alt = rec.Events;
      if (Array.isArray(alt)) {
        rec.events = alt as MacroEvent[];
      } else {
        rec.events = [];
      }
    }
    return this._macro.events as MacroEvent[];
  }

  private getMacroId(macro: MacroDefinition): string {
    return macro.id ?? ((macro as unknown as Record<string, unknown>).Id as string) ?? 'default';
  }

  private getOrCreateUndoStack(macroId: string): TimelineSnapshot[] {
    let stack = this._undoByMacro.get(macroId);
    if (!stack) {
      stack = [];
      this._undoByMacro.set(macroId, stack);
    }
    return stack;
  }

  private getOrCreateRedoStack(macroId: string): TimelineSnapshot[] {
    let stack = this._redoByMacro.get(macroId);
    if (!stack) {
      stack = [];
      this._redoByMacro.set(macroId, stack);
    }
    return stack;
  }
}
