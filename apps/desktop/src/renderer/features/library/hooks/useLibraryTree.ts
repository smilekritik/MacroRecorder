/**
 * @macro-recorder/desktop - Library Tree Hook
 * Manages tree expansion, node selection, search and tag filtering, and visible node flattening.
 */

import { useState, useMemo, useCallback, useEffect } from 'react';
import type { MacroDefinition } from '../../../../../../../packages/contracts/src/index.js';
import {
  buildLibraryTree,
  flattenTree,
  normalizeFolder,
} from '../utils/tree-builder.js';

export interface UseLibraryTreeProps {
  readonly macros: readonly MacroDefinition[];
  readonly folders: readonly string[];
  readonly initialSelectedMacroId?: string | null | undefined;
  readonly initialSelectedFolder?: string | null | undefined;
  readonly modifiedMacroIds?: ReadonlySet<string> | undefined;
  readonly onSelectionChange?: ((macro: MacroDefinition | null, folder: string | null) => void) | undefined;
}

export function useLibraryTree({
  macros,
  folders,
  initialSelectedMacroId = null,
  initialSelectedFolder = null,
  modifiedMacroIds = new Set<string>(),
  onSelectionChange,
}: UseLibraryTreeProps) {
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(() => {
    if (initialSelectedMacroId) return `macro:${initialSelectedMacroId}`;
    if (initialSelectedFolder) return `folder:${normalizeFolder(initialSelectedFolder)}`;
    return null;
  });
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);

  // Extract all distinct tags from macros
  const allTags = useMemo(() => {
    const set = new Set<string>();
    for (const m of macros) {
      if (m.tags) {
        for (const t of m.tags) {
          if (t.trim()) set.add(t.trim());
        }
      }
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
  }, [macros]);

  // Build tree
  const treeNodes = useMemo(() => {
    return buildLibraryTree({
      folders,
      macros,
      expandedFolders,
      selectedNodeId,
      modifiedMacroIds,
      searchQuery,
      selectedTag,
      dropTargetId,
    });
  }, [
    folders,
    macros,
    expandedFolders,
    selectedNodeId,
    modifiedMacroIds,
    searchQuery,
    selectedTag,
    dropTargetId,
  ]);

  // Flatten visible nodes
  const flattenedVisibleNodes = useMemo(() => {
    return flattenTree(treeNodes);
  }, [treeNodes]);

  // Selected Macro & Selected Folder derived from selectedNodeId
  const { selectedMacro, selectedFolder } = useMemo(() => {
    if (!selectedNodeId) {
      return { selectedMacro: null, selectedFolder: null };
    }

    if (selectedNodeId.startsWith('macro:')) {
      const macroId = selectedNodeId.substring(6);
      const found = macros.find((m) => m.id === macroId) ?? null;
      return {
        selectedMacro: found,
        selectedFolder: found ? normalizeFolder(found.folder) : null,
      };
    }

    if (selectedNodeId.startsWith('folder:')) {
      const folderPath = selectedNodeId.substring(7);
      return {
        selectedMacro: null,
        selectedFolder: normalizeFolder(folderPath),
      };
    }

    // Direct ID match fallback
    const directMacro = macros.find((m) => m.id === selectedNodeId) ?? null;
    if (directMacro) {
      return {
        selectedMacro: directMacro,
        selectedFolder: normalizeFolder(directMacro.folder),
      };
    }

    return { selectedMacro: null, selectedFolder: null };
  }, [selectedNodeId, macros]);

  // Notify selection change
  useEffect(() => {
    onSelectionChange?.(selectedMacro, selectedFolder);
  }, [selectedMacro, selectedFolder, onSelectionChange]);

  const toggleFolder = useCallback((folderPath: string) => {
    const norm = normalizeFolder(folderPath);
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(norm)) {
        next.delete(norm);
      } else {
        next.add(norm);
      }
      return next;
    });
  }, []);

  const expandFolder = useCallback((folderPath: string) => {
    const norm = normalizeFolder(folderPath);
    setExpandedFolders((prev) => {
      if (prev.has(norm)) return prev;
      const next = new Set(prev);
      next.add(norm);
      return next;
    });
  }, []);

  const collapseFolder = useCallback((folderPath: string) => {
    const norm = normalizeFolder(folderPath);
    setExpandedFolders((prev) => {
      if (!prev.has(norm)) return prev;
      const next = new Set(prev);
      next.delete(norm);
      return next;
    });
  }, []);

  const expandAll = useCallback(() => {
    const all = new Set<string>();
    for (const f of folders) {
      const norm = normalizeFolder(f);
      if (norm) all.add(norm);
    }
    for (const m of macros) {
      const norm = normalizeFolder(m.folder);
      if (norm) all.add(norm);
    }
    setExpandedFolders(all);
  }, [folders, macros]);

  const collapseAll = useCallback(() => {
    setExpandedFolders(new Set());
  }, []);

  const selectNode = useCallback((nodeId: string | null) => {
    setSelectedNodeId(nodeId);
  }, []);

  const selectMacro = useCallback((macro: MacroDefinition | null) => {
    setSelectedNodeId(macro ? `macro:${macro.id}` : null);
  }, []);

  const selectFolder = useCallback((folderPath: string | null) => {
    setSelectedNodeId(folderPath !== null ? `folder:${normalizeFolder(folderPath)}` : null);
  }, []);

  return {
    expandedFolders,
    toggleFolder,
    expandFolder,
    collapseFolder,
    expandAll,
    collapseAll,
    searchQuery,
    setSearchQuery,
    selectedTag,
    setSelectedTag,
    allTags,
    selectedNodeId,
    selectedMacro,
    selectedFolder,
    selectNode,
    selectMacro,
    selectFolder,
    treeNodes,
    flattenedVisibleNodes,
    dropTargetId,
    setDropTargetId,
  };
}
