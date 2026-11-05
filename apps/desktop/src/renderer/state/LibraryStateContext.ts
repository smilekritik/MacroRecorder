import React, { createContext, useContext, useState, useMemo, useCallback } from 'react';
import type { MacroDefinition } from '../../../../../packages/contracts/src/index.js';

export interface LibraryStateContextValue {
  readonly macros: ReadonlyArray<MacroDefinition>;
  readonly folders: ReadonlyArray<string>;
  readonly selectedFolder: string | null;
  readonly selectedMacroId: string | null;
  readonly searchQuery: string;
  readonly filterTag: string | null;
  readonly filteredMacros: ReadonlyArray<MacroDefinition>;
  readonly setMacros: (macros: ReadonlyArray<MacroDefinition>) => void;
  readonly setFolders: (folders: ReadonlyArray<string>) => void;
  readonly setSelectedFolder: (folder: string | null) => void;
  readonly setSelectedMacroId: (id: string | null) => void;
  readonly setSearchQuery: (query: string) => void;
  readonly setFilterTag: (tag: string | null) => void;
}

const LibraryStateContext = createContext<LibraryStateContextValue | null>(null);

export interface LibraryStateProviderProps {
  readonly initialMacros?: ReadonlyArray<MacroDefinition> | undefined;
  readonly initialFolders?: ReadonlyArray<string> | undefined;
  readonly children?: React.ReactNode | undefined;
}

export function LibraryStateProvider({
  initialMacros = [],
  initialFolders = [],
  children,
}: LibraryStateProviderProps) {
  const [macros, setMacros] = useState<ReadonlyArray<MacroDefinition>>(initialMacros);
  const [folders, setFolders] = useState<ReadonlyArray<string>>(initialFolders);
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null);
  const [selectedMacroId, setSelectedMacroId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [filterTag, setFilterTag] = useState<string | null>(null);

  const filteredMacros = useMemo(() => {
    return macros.filter((macro) => {
      // Folder filtering
      if (selectedFolder !== null) {
        const macroFolder = macro.folder ?? '';
        if (macroFolder !== selectedFolder) {
          return false;
        }
      }

      // Tag filtering
      if (filterTag !== null) {
        if (!macro.tags || !macro.tags.includes(filterTag)) {
          return false;
        }
      }

      // Search query filtering
      if (searchQuery.trim().length > 0) {
        const query = searchQuery.toLowerCase();
        const nameMatch = macro.name.toLowerCase().includes(query);
        const descMatch = macro.description?.toLowerCase().includes(query);
        if (!nameMatch && !descMatch) {
          return false;
        }
      }

      return true;
    });
  }, [macros, selectedFolder, filterTag, searchQuery]);

  const handleSetFolder = useCallback((f: string | null) => setSelectedFolder(f), []);
  const handleSetMacroId = useCallback((id: string | null) => setSelectedMacroId(id), []);
  const handleSetSearchQuery = useCallback((q: string) => setSearchQuery(q), []);
  const handleSetFilterTag = useCallback((t: string | null) => setFilterTag(t), []);

  const value = useMemo<LibraryStateContextValue>(
    () => ({
      macros,
      folders,
      selectedFolder,
      selectedMacroId,
      searchQuery,
      filterTag,
      filteredMacros,
      setMacros: (newMacros) => setMacros(newMacros),
      setFolders: (newFolders) => setFolders(newFolders),
      setSelectedFolder: handleSetFolder,
      setSelectedMacroId: handleSetMacroId,
      setSearchQuery: handleSetSearchQuery,
      setFilterTag: handleSetFilterTag,
    }),
    [
      macros,
      folders,
      selectedFolder,
      selectedMacroId,
      searchQuery,
      filterTag,
      filteredMacros,
      handleSetFolder,
      handleSetMacroId,
      handleSetSearchQuery,
      handleSetFilterTag,
    ],
  );

  return React.createElement(LibraryStateContext.Provider, { value }, children);
}

export function useLibraryStateContext(): LibraryStateContextValue {
  const ctx = useContext(LibraryStateContext);
  if (!ctx) {
    throw new Error('useLibraryStateContext must be used within a LibraryStateProvider');
  }
  return ctx;
}
