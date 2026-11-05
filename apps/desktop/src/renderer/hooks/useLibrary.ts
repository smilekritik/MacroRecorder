import { useCallback } from 'react';
import {
  IpcChannels,
  type MacroDefinition,
} from '../../../../../packages/contracts/src/index.js';
import { useIpcQuery } from './useIpcQuery.js';
import { useIpcMutation } from './useIpcMutation.js';
import type { MacroRecorderApi } from './useApi.js';

export interface UseLibraryOptions {
  readonly apiOverride?: MacroRecorderApi | undefined;
}

export function useLibrary(options: UseLibraryOptions = {}) {
  const libraryQuery = useIpcQuery(
    IpcChannels.STORAGE_LOAD_LIBRARY,
    {},
    { apiOverride: options.apiOverride },
  );

  const saveMutation = useIpcMutation(IpcChannels.STORAGE_SAVE_MACRO, {
    apiOverride: options.apiOverride,
    onSuccess: () => {
      void libraryQuery.refetch();
    },
  });

  const deleteMacroMutation = useIpcMutation(IpcChannels.STORAGE_DELETE_MACRO, {
    apiOverride: options.apiOverride,
    onSuccess: () => {
      void libraryQuery.refetch();
    },
  });

  const restoreMacroMutation = useIpcMutation(IpcChannels.STORAGE_RESTORE_MACRO, {
    apiOverride: options.apiOverride,
    onSuccess: () => {
      void libraryQuery.refetch();
    },
  });

  const moveMacroMutation = useIpcMutation(IpcChannels.STORAGE_MOVE_MACRO, {
    apiOverride: options.apiOverride,
    onSuccess: () => {
      void libraryQuery.refetch();
    },
  });

  const createFolderMutation = useIpcMutation(IpcChannels.STORAGE_CREATE_FOLDER, {
    apiOverride: options.apiOverride,
    onSuccess: () => {
      void libraryQuery.refetch();
    },
  });

  const deleteFolderMutation = useIpcMutation(IpcChannels.STORAGE_DELETE_FOLDER, {
    apiOverride: options.apiOverride,
    onSuccess: () => {
      void libraryQuery.refetch();
    },
  });

  const moveFolderMutation = useIpcMutation(IpcChannels.STORAGE_MOVE_FOLDER, {
    apiOverride: options.apiOverride,
    onSuccess: () => {
      void libraryQuery.refetch();
    },
  });

  const saveMacro = useCallback(
    async (macro: MacroDefinition, touchModified = true) => {
      return await saveMutation.mutateAsync({ macro, touchModified });
    },
    [saveMutation],
  );

  const deleteMacro = useCallback(
    async (macroId: string) => {
      return await deleteMacroMutation.mutateAsync({ macroId });
    },
    [deleteMacroMutation],
  );

  const restoreMacro = useCallback(
    async (params: { token: string; folderRelativePath: string; macroName: string }) => {
      return await restoreMacroMutation.mutateAsync(params);
    },
    [restoreMacroMutation],
  );

  const moveMacro = useCallback(
    async (params: { macroId: string; folderRelativePath: string }) => {
      return await moveMacroMutation.mutateAsync(params);
    },
    [moveMacroMutation],
  );

  const createFolder = useCallback(
    async (folderRelativePath: string) => {
      return await createFolderMutation.mutateAsync({ folderRelativePath });
    },
    [createFolderMutation],
  );

  const deleteFolder = useCallback(
    async (folderRelativePath: string) => {
      return await deleteFolderMutation.mutateAsync({ folderRelativePath });
    },
    [deleteFolderMutation],
  );

  const moveFolder = useCallback(
    async (params: { sourceRelativePath: string; targetRelativePath: string }) => {
      return await moveFolderMutation.mutateAsync(params);
    },
    [moveFolderMutation],
  );

  return {
    macros: libraryQuery.data?.macros ?? [],
    folders: libraryQuery.data?.folders ?? [],
    isLoading: libraryQuery.isLoading,
    error:
      libraryQuery.error ||
      saveMutation.error ||
      deleteMacroMutation.error ||
      restoreMacroMutation.error ||
      moveMacroMutation.error ||
      createFolderMutation.error ||
      deleteFolderMutation.error ||
      moveFolderMutation.error,
    saveMacro,
    deleteMacro,
    restoreMacro,
    moveMacro,
    createFolder,
    deleteFolder,
    moveFolder,
    refetch: libraryQuery.refetch,
  };
}
