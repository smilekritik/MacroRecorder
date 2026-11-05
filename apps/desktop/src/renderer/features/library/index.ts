/**
 * @macro-recorder/desktop - Macro Library & Folder Workflows
 * Public API for the library feature module.
 */

// Types & Contracts
export * from './types.js';

// Utilities
export * from './utils/tree-builder.js';
export * from './utils/drag-drop.js';
export * from './utils/naming.js';
export * from './utils/hotkey.js';

// Hooks
export * from './hooks/useLibraryTree.js';
export * from './hooks/useLibraryDragDrop.js';
export * from './hooks/useLibraryActions.js';
export * from './hooks/useDirtyNavigation.js';

// Components
export * from './components/MacroLibraryPanel.js';
export * from './components/LibraryTreeView.js';
export * from './components/LibraryTreeNode.js';
export * from './components/LibraryContextMenu.js';
export * from './components/LibrarySearchFilter.js';
export * from './components/MacroDetailsHeader.js';
export * from './components/HotkeyAssignmentBox.js';
export * from './components/TagManager.js';
export * from './components/ConfirmDeleteDialog.js';
export * from './components/DirtyNavigationDialog.js';
