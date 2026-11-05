/**
 * @macro-recorder/desktop - Library Tree Builder
 * Builds nested folder trees with enabled-first sorting, recursive counts,
 * and search/filter visibility.
 */

import {
  type MacroDefinition,
  MacroEventType,
} from '../../../../../../../packages/contracts/src/index.js';
import type {
  LibraryFolderNode,
  LibraryMacroNode,
  LibraryTreeNodeData,
} from '../types.js';
import { getMacroHotkeyDisplay } from './hotkey.js';

export const MAXIMUM_FOLDER_DEPTH = 8;

/**
 * Normalizes folder path: converts backslashes to forward slashes,
 * removes leading/trailing slashes, removes duplicate slashes.
 */
export function normalizeFolder(pathStr: string | null | undefined): string {
  if (!pathStr) return '';
  return pathStr
    .replace(/\\/g, '/')
    .replace(/^\/+|\/+$/g, '')
    .replace(/\/+/g, '/');
}

/**
 * Returns the folder name (last segment) of a normalized relative path.
 */
export function folderName(relativePath: string): string {
  const normalized = normalizeFolder(relativePath);
  if (!normalized) return '';
  const lastSlash = normalized.lastIndexOf('/');
  return lastSlash < 0 ? normalized : normalized.substring(lastSlash + 1);
}

/**
 * Returns the parent folder relative path.
 */
export function parentFolder(relativePath: string): string {
  const normalized = normalizeFolder(relativePath);
  if (!normalized) return '';
  const lastSlash = normalized.lastIndexOf('/');
  return lastSlash < 0 ? '' : normalized.substring(0, lastSlash);
}

/**
 * Returns all ancestor paths including the path itself.
 * Example: 'A/B/C' -> ['A/B/C', 'A/B', 'A']
 */
export function ancestorsOf(folderPath: string): string[] {
  const result: string[] = [];
  let current = normalizeFolder(folderPath);
  while (current.length > 0) {
    result.push(current);
    current = parentFolder(current);
  }
  return result;
}

/**
 * Determines whether a macro begins with a PixelColorTrigger
 * (ignoring leading comment actions).
 */
export function isAutomaticTriggerMacro(macro: MacroDefinition): boolean {
  if (!macro.events || macro.events.length === 0) return false;
  const nonComments = macro.events.filter((e) => e.type !== MacroEventType.Comment);
  if (nonComments.length === 0) return false;

  const sorted = [...nonComments].sort((a, b) => {
    if (a.timeMicroseconds !== b.timeMicroseconds) {
      return a.timeMicroseconds - b.timeMicroseconds;
    }
    const isWaitA = a.type === MacroEventType.Delay;
    const isWaitB = b.type === MacroEventType.Delay;
    if (isWaitA !== isWaitB) return isWaitA ? -1 : 1;
    return 0;
  });

  return sorted[0]?.type === MacroEventType.PixelColorTrigger;
}

/**
 * Orders macros enabled-first, then by modifiedAt descending.
 */
export function orderLibraryMacros(macros: readonly MacroDefinition[]): MacroDefinition[] {
  return [...macros].sort((a, b) => {
    const aEnabled = Boolean(a.isEnabled);
    const bEnabled = Boolean(b.isEnabled);
    if (aEnabled !== bEnabled) {
      return aEnabled ? -1 : 1;
    }
    const timeA = new Date(a.modifiedAt ?? 0).getTime();
    const timeB = new Date(b.modifiedAt ?? 0).getTime();
    if (timeA !== timeB) {
      return timeB - timeA;
    }
    return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
  });
}

export interface BuildTreeOptions {
  readonly folders: readonly string[];
  readonly macros: readonly MacroDefinition[];
  readonly expandedFolders?: ReadonlySet<string> | undefined;
  readonly selectedNodeId?: string | null | undefined;
  readonly modifiedMacroIds?: ReadonlySet<string> | undefined;
  readonly searchQuery?: string | undefined;
  readonly selectedTag?: string | null | undefined;
  readonly dropTargetId?: string | null | undefined;
}

/**
 * Builds the complete hierarchy tree of folders and macros.
 */
export function buildLibraryTree(options: BuildTreeOptions): LibraryTreeNodeData[] {
  const {
    folders = [],
    macros = [],
    expandedFolders = new Set<string>(),
    selectedNodeId = null,
    modifiedMacroIds = new Set<string>(),
    searchQuery = '',
    selectedTag = null,
    dropTargetId = null,
  } = options;

  const trimmedQuery = searchQuery.trim().toLowerCase();
  const isFiltering = trimmedQuery.length > 0 || Boolean(selectedTag);

  // Filter macros
  const matchingMacros = macros.filter((m) => {
    if (selectedTag && (!m.tags || !m.tags.includes(selectedTag))) {
      return false;
    }
    if (trimmedQuery.length > 0) {
      const nameMatch = m.name.toLowerCase().includes(trimmedQuery);
      const descMatch = m.description?.toLowerCase().includes(trimmedQuery) ?? false;
      const tagMatch = m.tags?.some((t) => t.toLowerCase().includes(trimmedQuery)) ?? false;
      if (!nameMatch && !descMatch && !tagMatch) {
        return false;
      }
    }
    return true;
  });

  // Collect all relevant folders
  const allFolderSet = new Set<string>();
  if (isFiltering) {
    for (const macro of matchingMacros) {
      const folder = normalizeFolder(macro.folder);
      if (folder) {
        for (const ancestor of ancestorsOf(folder)) {
          allFolderSet.add(ancestor);
        }
      }
    }
  } else {
    for (const f of folders) {
      const norm = normalizeFolder(f);
      if (norm) {
        for (const ancestor of ancestorsOf(norm)) {
          allFolderSet.add(ancestor);
        }
      }
    }
    for (const m of macros) {
      const norm = normalizeFolder(m.folder);
      if (norm) {
        for (const ancestor of ancestorsOf(norm)) {
          allFolderSet.add(ancestor);
        }
      }
    }
  }

  // Sort folders
  const sortedFolders = Array.from(allFolderSet).sort((a, b) =>
    a.localeCompare(b, undefined, { sensitivity: 'base' }),
  );

  // Group macros by normalized folder path
  const macrosByFolder = new Map<string, MacroDefinition[]>();
  for (const macro of matchingMacros) {
    const key = normalizeFolder(macro.folder);
    if (!macrosByFolder.has(key)) {
      macrosByFolder.set(key, []);
    }
    macrosByFolder.get(key)!.push(macro);
  }

  // Helper to build folder node
  function createFolderNode(folderPath: string, depth = 1): LibraryFolderNode {
    const id = `folder:${folderPath}`;
    const name = folderName(folderPath);
    const parent = parentFolder(folderPath);

    // Find direct subfolders
    const subfolderPaths = sortedFolders.filter(
      (f) => parentFolder(f) === folderPath && f !== folderPath,
    );

    const childNodes: LibraryTreeNodeData[] = [];

    // Subfolders first
    if (depth < MAXIMUM_FOLDER_DEPTH) {
      for (const sub of subfolderPaths) {
        childNodes.push(createFolderNode(sub, depth + 1));
      }
    }

    // Direct macros in this folder
    const directMacros = orderLibraryMacros(macrosByFolder.get(folderPath) ?? []);
    for (const m of directMacros) {
      childNodes.push(createMacroNode(m));
    }

    // Calculate recursive counts
    let totalMacroCount = directMacros.length;
    for (const child of childNodes) {
      if (child.isFolder) {
        totalMacroCount += child.macroCount;
      }
    }

    const isExpanded = isFiltering || expandedFolders.has(folderPath);
    const isSelected = selectedNodeId === id;
    const isDropTarget = dropTargetId === id;

    return {
      id,
      isFolder: true,
      name,
      relativePath: folderPath,
      parentPath: parent,
      children: childNodes,
      macroCount: totalMacroCount,
      directMacroCount: directMacros.length,
      isExpanded,
      isSelected,
      isDropTarget,
    };
  }

  function createMacroNode(macro: MacroDefinition): LibraryMacroNode {
    const id = `macro:${macro.id}`;
    const isSelected = selectedNodeId === id || selectedNodeId === macro.id;
    const isDropTarget = dropTargetId === id;
    const isModified = modifiedMacroIds.has(macro.id);
    const isAutoTrigger = isAutomaticTriggerMacro(macro);
    const hotkeyText = getMacroHotkeyDisplay(macro);

    return {
      id,
      isFolder: false,
      name: macro.name,
      relativePath: normalizeFolder(macro.folder),
      macro,
      hotkeyDisplay: hotkeyText,
      isMacroEnabled: Boolean(macro.isEnabled),
      isAutomaticTrigger: isAutoTrigger,
      isModified,
      isSelected,
      isDropTarget,
      tags: macro.tags ?? [],
      description: macro.description ?? '',
    };
  }

  // Top-level roots: root-level folders (parent === '') and root-level macros
  const roots: LibraryTreeNodeData[] = [];

  const rootFolders = sortedFolders.filter((f) => parentFolder(f) === '');
  for (const rf of rootFolders) {
    roots.push(createFolderNode(rf, 1));
  }

  const rootMacros = orderLibraryMacros(macrosByFolder.get('') ?? []);
  for (const rm of rootMacros) {
    roots.push(createMacroNode(rm));
  }

  return roots;
}

/**
 * Flattens visible nodes in DFS order, respecting isExpanded state.
 * Useful for virtualization, keyboard roving index, and accessible arrow-key navigation.
 */
export function flattenTree(nodes: readonly LibraryTreeNodeData[]): LibraryTreeNodeData[] {
  const result: LibraryTreeNodeData[] = [];

  function traverse(list: readonly LibraryTreeNodeData[]) {
    for (const node of list) {
      result.push(node);
      if (node.isFolder && node.isExpanded && node.children.length > 0) {
        traverse(node.children);
      }
    }
  }

  traverse(nodes);
  return result;
}
