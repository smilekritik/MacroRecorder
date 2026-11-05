/**
 * IPC Bridge connects Electron IPC channels to domain coordinators and state managers.
 * Translates incoming typed IPC requests into coordinator calls, passing cancellation tokens
 * and handling domain errors.
 */

import type { SystemCommandRequest, SystemCommandResponse } from '../../ipc/types.js';
import { IpcChannels } from '../../ipc/channels.js';
import type { IpcHandlerRegistry } from '../../ipc/registry.js';
import type { OverlayPlacement } from '../../ipc/types.js';
import type { IPixelColorAdapter, IWindowOrchestratorAdapter } from '../types.js';
import type {
  DiagnosticsCoordinator,
  GlobalControlCoordinator,
  ImportExportCoordinator,
  LibraryCoordinator,
  PlaybackCoordinator,
  RecordingCoordinator,
  SettingsCoordinator,
  WindowTargetingCoordinator,
} from '../coordinators/index.js';
import type {
  DirtyEditorManager,
  GamepadCoordinator,
  OverlayCoordinator,
} from '../state/index.js';

export interface IpcBridgeDependencies {
  readonly libraryCoordinator: LibraryCoordinator;
  readonly playbackCoordinator: PlaybackCoordinator;
  readonly recordingCoordinator: RecordingCoordinator;
  readonly globalControlCoordinator: GlobalControlCoordinator;
  readonly windowTargetingCoordinator: WindowTargetingCoordinator;
  readonly diagnosticsCoordinator: DiagnosticsCoordinator;
  readonly importExportCoordinator: ImportExportCoordinator;
  readonly settingsCoordinator: SettingsCoordinator;
  readonly windowOrchestrator: IWindowOrchestratorAdapter;
  readonly gamepadCoordinator: GamepadCoordinator;
  readonly overlayCoordinator: OverlayCoordinator;
  readonly pixelAdapter: IPixelColorAdapter;
  readonly dirtyEditorManager?: DirtyEditorManager | undefined;
  readonly systemCommands?: ((request: SystemCommandRequest) => Promise<SystemCommandResponse>) | undefined;
}

export class IpcBridge {
  private readonly registry: IpcHandlerRegistry;
  private readonly deps: IpcBridgeDependencies;

  constructor(registry: IpcHandlerRegistry, deps: IpcBridgeDependencies) {
    this.registry = registry;
    this.deps = deps;
  }

  /**
   * Registers all IPC channel handlers.
   */
  public registerAll(): void {
    const { deps, registry } = this;

    // --- Playback Channels ---
    registry.register(IpcChannels.PLAYBACK_START, async (req) => {
      return await deps.playbackCoordinator.start(req);
    });

    registry.register(IpcChannels.PLAYBACK_PAUSE, () => {
      return deps.playbackCoordinator.pause();
    });

    registry.register(IpcChannels.PLAYBACK_RESUME, () => {
      return deps.playbackCoordinator.resume();
    });

    registry.register(IpcChannels.PLAYBACK_STOP, (req) => {
      return deps.playbackCoordinator.stop(req.reason);
    });

    registry.register(IpcChannels.PLAYBACK_GET_STATUS, () => {
      return deps.playbackCoordinator.getStatus();
    });

    // --- Recording Channels ---
    registry.register(IpcChannels.RECORDING_START, (req) => {
      const isRecording = deps.recordingCoordinator.start(
        req.options,
        req.countdownSeconds,
        req.choice,
        req.macroId ? deps.libraryCoordinator.getMacroById(req.macroId) : null,
        req.insertAtMicroseconds,
      );
      return { isRecording };
    });

    registry.register(IpcChannels.RECORDING_PAUSE, () => {
      deps.recordingCoordinator.pause();
      return { isPaused: deps.recordingCoordinator.isPaused };
    });

    registry.register(IpcChannels.RECORDING_RESUME, () => {
      deps.recordingCoordinator.resume();
      return { isRecording: deps.recordingCoordinator.isRecording };
    });

    registry.register(IpcChannels.RECORDING_STOP, () => {
      const macro = deps.recordingCoordinator.stop();
      return { macro };
    });

    // --- Emergency Stop Channel ---
    registry.register(IpcChannels.EMERGENCY_STOP, (req) => {
      return deps.globalControlCoordinator.emergencyStop(req.reason);
    });

    // --- Storage & Library Channels ---
    registry.register(IpcChannels.STORAGE_LOAD_LIBRARY, async () => {
      return await deps.libraryCoordinator.loadLibrary();
    });

    registry.register(IpcChannels.STORAGE_SAVE_MACRO, async (req) => {
      const result = await deps.libraryCoordinator.saveMacro(req.macro, {
        touchModified: req.touchModified,
      });
      deps.dirtyEditorManager?.markClean(req.macro.id, req.macro);
      deps.globalControlCoordinator.refreshMacroHotkeys(deps.libraryCoordinator.getMacros());
      return result;
    });

    registry.register(IpcChannels.STORAGE_DELETE_MACRO, async (req) => {
      const token = await deps.libraryCoordinator.deleteMacro(req.macroId);
      deps.dirtyEditorManager?.clear(req.macroId);
      deps.globalControlCoordinator.refreshMacroHotkeys(deps.libraryCoordinator.getMacros());
      return { token };
    });

    registry.register(IpcChannels.STORAGE_RESTORE_MACRO, async (req) => {
      const restored = await deps.libraryCoordinator.restoreMacro(
        req.token,
        req.folderRelativePath,
        req.macroName,
      );
      deps.globalControlCoordinator.refreshMacroHotkeys(deps.libraryCoordinator.getMacros());
      return { restored };
    });

    registry.register(IpcChannels.STORAGE_MOVE_MACRO, async (req) => {
      const moved = await deps.libraryCoordinator.moveMacro(req.macroId, req.folderRelativePath);
      return { moved };
    });

    registry.register(IpcChannels.STORAGE_CREATE_FOLDER, async (req) => {
      const created = await deps.libraryCoordinator.createFolder(req.folderRelativePath);
      return { created };
    });

    registry.register(IpcChannels.STORAGE_DELETE_FOLDER, async (req) => {
      const token = await deps.libraryCoordinator.deleteFolder(req.folderRelativePath);
      return { token };
    });

    registry.register(IpcChannels.STORAGE_RESTORE_FOLDER, async (req) => {
      const restored = await deps.libraryCoordinator.restoreFolder(req.token, req.folderRelativePath);
      return { restored };
    });

    registry.register(IpcChannels.STORAGE_MOVE_FOLDER, async (req) => {
      const moved = await deps.libraryCoordinator.moveFolder(
        req.sourceRelativePath,
        req.targetRelativePath,
      );
      return { moved };
    });

    registry.register(IpcChannels.STORAGE_EXPORT_MACRO, async (req, ctx) => {
      const macro = deps.libraryCoordinator.getMacroById(req.macroId);
      if (!macro) {
        throw new Error(`Macro not found: ${req.macroId}`);
      }
      const exportedPath = await deps.importExportCoordinator.exportMacro(
        macro,
        req.format,
        req.destinationPath,
        ctx.signal,
      );
      return { exportedPath };
    });

    registry.register(IpcChannels.STORAGE_IMPORT_MACRO, async (req, ctx) => {
      const result = await deps.importExportCoordinator.importMacro(
        req.sourcePath,
        ctx.signal,
      );
      // Importing resolves name collisions, unlike a plain save of an existing macro.
      const stored = await deps.libraryCoordinator.importMacro(result.macro, req.targetFolderRelativePath);
      (result as { macro: unknown }).macro = stored.macro;
      deps.globalControlCoordinator.refreshMacroHotkeys(deps.libraryCoordinator.getMacros());
      return { result };
    });

    registry.register(IpcChannels.STORAGE_EXPORT_BACKUP, async (req, ctx) => {
      const exportedPath = await deps.importExportCoordinator.exportBackup(
        req.destinationPath,
        req.includesSettings,
        ctx.signal,
      );
      return { exportedPath };
    });

    registry.register(IpcChannels.STORAGE_RESTORE_BACKUP, async (req, ctx) => {
      const result = await deps.importExportCoordinator.restoreBackup(
        req.sourcePath,
        req.mode,
        ctx.signal,
      );
      await deps.libraryCoordinator.loadLibrary();
      deps.globalControlCoordinator.refreshMacroHotkeys(deps.libraryCoordinator.getMacros());
      return { result };
    });

    registry.register(IpcChannels.STORAGE_EXPORT_DIAGNOSTICS, async (req, ctx) => {
      return await deps.diagnosticsCoordinator.exportDiagnostics(
        req.format,
        req.destinationPath,
        ctx.signal,
        undefined,
        (req as { macroId?: string }).macroId,
      );
    });

    registry.register(IpcChannels.STORAGE_LOAD_RUN_HISTORY, () => {
      return { entries: deps.diagnosticsCoordinator.loadRunHistory() };
    });

    registry.register(IpcChannels.STORAGE_CLEAR_RUN_HISTORY, () => {
      return deps.diagnosticsCoordinator.clearRunHistory();
    });

    // --- Preferences Channels ---
    registry.register(IpcChannels.PREFERENCES_LOAD, () => {
      return { preferences: deps.settingsCoordinator.load() };
    });

    registry.register(IpcChannels.PREFERENCES_SAVE, (req) => {
      const preferences = deps.settingsCoordinator.save(req.preferences);
      // Re-registering also leaves a gap in the emergency stop, so it only happens when needed.
      if (Object.keys(req.preferences).some((key) => key.endsWith('Hotkey'))) {
        deps.globalControlCoordinator.refreshSystemHotkeys(preferences);
      }
      return { preferences };
    });

    registry.register(IpcChannels.PREFERENCES_RESET, () => {
      const reset = deps.settingsCoordinator.reset();
      deps.globalControlCoordinator.refreshSystemHotkeys(deps.settingsCoordinator.getPreferences());
      return { reset };
    });

    // --- Window Targeting Channels ---
    registry.register(IpcChannels.WINDOWS_GET_OPEN, (req) => {
      return {
        windows: deps.windowTargetingCoordinator.getOpenWindows(req.excludedProcessId),
      };
    });

    registry.register(IpcChannels.WINDOWS_INSPECT, (req) => {
      return {
        snapshot: deps.windowTargetingCoordinator.inspectWindow({
          followMouse: req.followMouse,
          selfHandle: req.selfHandle,
          ownerHandle: req.ownerHandle,
        }),
      };
    });

    registry.register(IpcChannels.SYSTEM_COMMAND, async (req) => {
      if (req.command === 'lastRun') {
        return { ok: true, run: deps.diagnosticsCoordinator.getLastRun(String(req.relativePath ?? '')) };
      }
      if (!deps.systemCommands) {
        return { ok: false, error: 'System commands are unavailable.' };
      }
      return deps.systemCommands(req);
    });

    registry.register(IpcChannels.WINDOWS_ACTIVATE, (req) => {
      return {
        activated: deps.windowTargetingCoordinator.activateWindow(
          req.processName,
          req.windowTitle,
        ),
      };
    });

    registry.register(IpcChannels.WINDOWS_OPEN, (req) => {
      return {
        opened: deps.windowOrchestrator.openWindow(req.windowId, req.params),
      };
    });

    registry.register(IpcChannels.WINDOWS_CLOSE, (req) => {
      return {
        closed: deps.windowOrchestrator.closeWindow(req.windowId),
      };
    });

    registry.register(IpcChannels.WINDOWS_MINIMIZE_MAIN, () => {
      deps.windowOrchestrator.minimizeMainWindow();
      return { minimized: true };
    });

    registry.register(IpcChannels.WINDOWS_RESTORE_MAIN, () => {
      deps.windowOrchestrator.restoreMainWindow();
      return { restored: true };
    });

    // --- Gamepad Channels ---
    registry.register(IpcChannels.GAMEPAD_GET_READINGS, () => {
      return { readings: deps.gamepadCoordinator.getReadings() };
    });

    registry.register(IpcChannels.GAMEPAD_INSTALL_DRIVER, async (req) => {
      return await deps.gamepadCoordinator.installDriver(req.driver);
    });

    registry.register(IpcChannels.GAMEPAD_SET_HIDING, (req) => {
      return { hidingActive: deps.gamepadCoordinator.setHiding(req.hide) };
    });

    // --- Pixel Color Channels ---
    registry.register(IpcChannels.PIXEL_CAPTURE, (req) => {
      return deps.pixelAdapter.samplePixelColor(req.x, req.y);
    });

    // --- Overlay Channels ---
    registry.register(IpcChannels.OVERLAY_UPDATE, (req) => {
      deps.overlayCoordinator.update(
        req.macroId,
        req.state,
        req.macroName,
        req.playbackSpeed,
      );
      return { updated: true };
    });

    registry.register(IpcChannels.OVERLAY_COUNTDOWN, (req) => {
      deps.overlayCoordinator.showCountdown(req.seconds);
      return { shown: true };
    });

    registry.register(IpcChannels.OVERLAY_CLEAR, () => {
      deps.overlayCoordinator.clear();
      return { cleared: true };
    });

    registry.register(IpcChannels.OVERLAY_SET_PLACEMENT, (req) => {
      const placement: OverlayPlacement = {
        infoX: req.infoX,
        infoY: req.infoY,
        annotationX: req.annotationX,
        annotationY: req.annotationY,
      };
      deps.overlayCoordinator.setPlacement(placement);
      deps.settingsCoordinator.save({
        ...deps.settingsCoordinator.preferences,
        overlayInfoX: req.infoX,
        overlayInfoY: req.infoY,
        overlayAnnotationX: req.annotationX,
        overlayAnnotationY: req.annotationY,
      });
      return { placement };
    });
  }

  /**
   * Unregisters all channel handlers from the registry.
   */
  public unregisterAll(): void {
    this.registry.unregisterAll();
  }
}
