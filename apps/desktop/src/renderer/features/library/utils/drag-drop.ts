/**
 * @macro-recorder/desktop - Library Drag and Drop Rules
 * Validates drop targets, rejects self-nesting, and enforces folder hierarchy limits.
 */

import type { LibraryTreeNodeData } from '../types.js';
import { normalizeFolder, MAXIMUM_FOLDER_DEPTH } from './tree-builder.js';

/**
 * Checks whether `childPath` is equal to or inside `parentPath`.
 *
 * Example:
 * - isSameOrInside('A/B', 'A') -> true
 * - isSameOrInside('A', 'A') -> true
 * - isSameOrInside('B', 'A') -> false
 * - isSameOrInside('A_suffix', 'A') -> false
 */
export function isSameOrInside(childPath: string, parentPath: string): boolean {
  const normChild = normalizeFolder(childPath).toLowerCase();
  const normParent = normalizeFolder(parentPath).toLowerCase();

  if (normParent.length === 0) {
    // Root contains everything
    return true;
  }

  if (normChild === normParent) {
    return true;
  }

  return normChild.startsWith(`${normParent}/`);
}

/**
 * Calculates depth of folder path (1-based: '' is 0, 'A' is 1, 'A/B' is 2).
 */
export function getFolderDepth(folderPath: string): number {
  const norm = normalizeFolder(folderPath);
  if (!norm) return 0;
  return norm.split('/').length;
}

export interface DragDropValidationResult {
  readonly canDrop: boolean;
  readonly reason?: string | undefined;
  readonly targetFolder: string;
}

/**
 * Determines whether `dragged` can be dropped onto `target`.
 * Rejects:
 * 1. Dropping onto itself
 * 2. Dropping into its current direct parent folder (no-op move)
 * 3. Dropping a folder into itself or any of its descendants (self-nesting cycle)
 * 4. Exceeding maximum nesting depth (8 levels)
 */
export function canDropInLibrary(
  dragged: LibraryTreeNodeData,
  target: LibraryTreeNodeData | null,
): DragDropValidationResult {
  // Determine landing folder
  const targetFolder = target === null
    ? ''
    : target.isFolder
      ? target.relativePath
      : target.relativePath; // For macro, drops into the folder the macro resides in

  const normalizedTarget = normalizeFolder(targetFolder);

  // 1. Cannot drop onto itself
  if (target !== null && dragged.id === target.id) {
    return { canDrop: false, reason: 'Cannot drop onto itself', targetFolder: normalizedTarget };
  }

  // 2. Cannot drop into the same parent folder (already there)
  const currentParent = dragged.isFolder ? dragged.parentPath : dragged.relativePath;
  if (normalizeFolder(currentParent).toLowerCase() === normalizedTarget.toLowerCase()) {
    return { canDrop: false, reason: 'Already in this folder', targetFolder: normalizedTarget };
  }

  // 3. A folder cannot be dropped inside itself or its descendants
  if (dragged.isFolder) {
    if (isSameOrInside(normalizedTarget, dragged.relativePath)) {
      return {
        canDrop: false,
        reason: 'A folder cannot be moved inside itself or its subfolders',
        targetFolder: normalizedTarget,
      };
    }

    // 4. Check folder depth limit
    const targetDepth = getFolderDepth(normalizedTarget);
    const draggedSubtreeDepth = getMaxSubtreeDepth(dragged);
    if (targetDepth + draggedSubtreeDepth > MAXIMUM_FOLDER_DEPTH) {
      return {
        canDrop: false,
        reason: `Exceeds maximum folder depth of ${MAXIMUM_FOLDER_DEPTH}`,
        targetFolder: normalizedTarget,
      };
    }
  }

  return { canDrop: true, targetFolder: normalizedTarget };
}

function getMaxSubtreeDepth(folderNode: LibraryTreeNodeData): number {
  if (!folderNode.isFolder) return 0;
  let maxChildDepth = 0;
  for (const child of folderNode.children) {
    if (child.isFolder) {
      maxChildDepth = Math.max(maxChildDepth, getMaxSubtreeDepth(child));
    }
  }
  return 1 + maxChildDepth;
}
