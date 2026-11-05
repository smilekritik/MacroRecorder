/**
 * @macro-recorder/desktop - Library Feature Types
 * Core interfaces, tree node contracts, and action types for macro library management.
 */

import type {
  MacroDefinition,
} from '../../../../../../packages/contracts/src/index.js';

export interface LibraryFolderNode {
  readonly id: string;
  readonly isFolder: true;
  readonly name: string;
  readonly relativePath: string;
  readonly parentPath: string;
  readonly children: readonly LibraryTreeNodeData[];
  readonly macroCount: number;
  readonly directMacroCount: number;
  readonly isExpanded: boolean;
  readonly isSelected: boolean;
  readonly isDropTarget: boolean;
}

export interface LibraryMacroNode {
  readonly id: string;
  readonly isFolder: false;
  readonly name: string;
  readonly relativePath: string; // The folder path the macro belongs to ('', 'Folder', 'A/B')
  readonly macro: MacroDefinition;
  readonly hotkeyDisplay: string;
  readonly isMacroEnabled: boolean;
  readonly isAutomaticTrigger: boolean;
  readonly isModified: boolean;
  readonly isSelected: boolean;
  readonly isDropTarget: boolean;
  readonly tags: readonly string[];
  readonly description: string;
}

export type LibraryTreeNodeData = LibraryFolderNode | LibraryMacroNode;

export interface LibraryFilterOptions {
  readonly searchQuery: string;
  readonly selectedTag: string | null;
}

export interface LibraryClipboardItem {
  readonly type: 'macro' | 'folder';
  readonly macro?: MacroDefinition | undefined;
  readonly folderRelativePath?: string | undefined;
  readonly name: string;
}

export interface LibraryUndoAction {
  readonly title: string;
  readonly undo: () => Promise<void>;
}

export interface LibraryDragItem {
  readonly id: string;
  readonly isFolder: boolean;
  readonly relativePath: string;
  readonly parentFolder: string;
  readonly name: string;
  readonly macro?: MacroDefinition | undefined;
}

export interface LibraryOperationResult<T = void> {
  readonly success: boolean;
  readonly data?: T;
  readonly error?: string;
  readonly statusMessage?: string;
}
