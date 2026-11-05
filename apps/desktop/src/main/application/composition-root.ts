/**
 * Electron Main-Process Composition Root for Macro Recorder.
 *
 * Assembles and wires domain storage, privileged hardware adapters, state machines,
 * coordinators, IPC handlers, push broadcasters, system tray, single-instance routing,
 * and orderly shutdown orchestration.
 *
 * Guarantees:
 * 1. Renderer reload/closure cannot disable emergency stop or strand held inputs.
 * 2. Concurrent macro sessions and overlay cards remain completely isolated.
 * 3. Automatic pixel triggers suspend and resume across recording and power state transitions.
 * 4. Saving macros or settings atomically refreshes hotkey routing without duplicate registrations.
 * 5. All long operations support cancellation tokens and typed progress reporting.
 * 6. Can run 100% deterministically against fakes for unit and integration testing.
 */

import { IpcHandlerRegistry } from '../ipc/registry.js';
import { IpcEventChannels } from '../ipc/channels.js';
import { SubscriptionManager } from '../ipc/subscriptions.js';
import { MacroLibraryStore } from '../../../../../packages/storage/src/library/library-store.js';
import { PreferencesStore } from '../../../../../packages/storage/src/preferences/store.js';
import { RunHistoryStore } from '../../../../../packages/storage/src/history/store.js';
import type {
  AppPreferences as ContractAppPreferences,
  MacroDefinition as ContractMacroDefinition,
} from '../../../../../packages/contracts/src/index.js';
import type {
  AppPreferences,
  MacroDefinition,
  MacroEvent,
  SystemCommandRequest,
  SystemCommandResponse,
} from '../ipc/types.js';
import {
  FakeGamepadAdapter,
  FakeHotkeyAdapter,
  FakeInputAdapter,
  FakePixelAdapter,
  FakeWindowAdapter,
  FakeWindowOrchestrator,
  NativeGamepadAdapter,
  NativeHotkeyAdapter,
  NativeInputAdapter,
  NativePixelAdapter,
  NativeWindowAdapter,
  WindowOrchestratorAdapter,
} from './adapters/index.js';
import {
  DiagnosticsCoordinator,
  FakeLibraryStore,
  FakePreferencesStore,
  FakeRunHistoryStore,
  GlobalControlCoordinator,
  ImportExportCoordinator,
  LibraryCoordinator,
  PlaybackCoordinator,
  RecordingCoordinator,
  SettingsCoordinator,
  ShutdownOrchestrator,
  WindowTargetingCoordinator,
} from './coordinators/index.js';
import { IpcBridge, IpcBroadcaster } from './ipc/index.js';
import { randomUUID } from 'node:crypto';
import { NativeEngineAdapter, type EngineReport, type IPlaybackEngine } from './adapters/engine-adapter.js';
import {
  ConcurrentMacroManager,
  DirtyEditorManager,
  GamepadCoordinator,
  OverlayCoordinator,
  TriggerCoordinator,
} from './state/index.js';
import type {
  IGamepadAdapter,
  IHotkeyAdapter,
  IInputInjectorAdapter,
  ILibraryStore,
  IPixelColorAdapter,
  IPreferencesStore,
  IRunHistoryStore,
  IWindowOrchestratorAdapter,
  IWindowTargetingAdapter,
} from './types.js';

class ProductionLibraryStoreAdapter implements ILibraryStore {
  public readonly rootPath: string;

  constructor(private readonly store: MacroLibraryStore) {
    this.rootPath = store.rootPath;
  }

  private toApplicationMacro(macro: ContractMacroDefinition): MacroDefinition {
    return {
      ...macro,
      folderRelativePath: macro.folder,
      events: macro.events.map((event) => ({ ...event, eventType: event.type }) as MacroEvent),
    } as MacroDefinition;
  }

  private toContractMacro(macro: MacroDefinition): ContractMacroDefinition {
    const folder = String(macro['folder'] ?? macro.folderRelativePath ?? '');
    const events = macro.events.map((event) => ({
      ...event,
      type: String(event.type ?? event.eventType),
      comment: String(event['comment'] ?? ''),
    }));
    return { ...macro, folder, events } as unknown as ContractMacroDefinition;
  }

  public async loadAll(): Promise<MacroDefinition[]> {
    return (await this.store.loadAll()).map((macro) => this.toApplicationMacro(macro));
  }

  public async save(macro: MacroDefinition, options?: { touchModified?: boolean | undefined }): Promise<void> {
    const contractMacro = this.toContractMacro(macro);
    await this.store.save(contractMacro, options);
    Object.assign(macro, this.toApplicationMacro(contractMacro));
  }

  public async delete(macro: { id?: string; name: string; folder?: string; storagePath?: string }): Promise<string> {
    return this.store.delete(macro);
  }

  public restoreMacro(token: string, folderRelativePath: string, macroName: string): Promise<boolean> {
    return this.store.restoreMacro(token, folderRelativePath, macroName);
  }

  public restoreFolder(token: string, relativePath: string): Promise<boolean> {
    return this.store.restoreFolder(token, relativePath);
  }

  public async moveToFolder(macro: MacroDefinition, folderRelativePath: string): Promise<void> {
    const contractMacro = this.toContractMacro({ ...macro, folderRelativePath });
    await this.store.moveToFolder(contractMacro, folderRelativePath);
    Object.assign(macro, this.toApplicationMacro(contractMacro));
  }

  public loadFolders(): Promise<string[]> {
    return this.store.loadFolders();
  }

  public createFolder(parentRelativePath: string, name: string): Promise<string> {
    return this.store.createFolder(parentRelativePath, name);
  }

  public deleteFolder(relativePath: string): Promise<string> {
    return this.store.deleteFolder(relativePath);
  }

  public moveFolder(relativePath: string, newParentRelativePath: string): Promise<string> {
    return this.store.moveFolder(relativePath, newParentRelativePath);
  }

  public cleanupTrash(keepMaxAgeMs: number): Promise<number> {
    return this.store.cleanupTrash(keepMaxAgeMs);
  }

  public async importMacro(
    macro: MacroDefinition,
    folderRelativePath = '',
  ): Promise<{ macro: MacroDefinition; warning?: string }> {
    const result = await this.store.importMacro(this.toContractMacro(macro), folderRelativePath);
    return {
      macro: this.toApplicationMacro(result.macro),
      ...(result.warning ? { warning: result.warning } : {}),
    };
  }

  public async getFolderTreeInfo(): Promise<{ folders: string[]; macroCounts: Record<string, number> }> {
    const info = await this.store.getFolderTreeInfo();
    return { folders: [...info.folders], macroCounts: { ...info.macroCounts } };
  }

  public resolveUniqueName(desiredName: string, owner?: { storagePath?: string }): string {
    return this.store.resolveUniqueName(desiredName, owner);
  }
}

class ProductionPreferencesStoreAdapter implements IPreferencesStore {
  constructor(private readonly store: PreferencesStore) {}

  public load(): AppPreferences {
    return this.store.load() as unknown as AppPreferences;
  }

  public save(newPrefs?: AppPreferences): void {
    this.store.save(newPrefs as unknown as ContractAppPreferences | undefined);
  }

  public saveAsync(newPrefs?: AppPreferences): Promise<void> {
    return this.store.saveAsync(newPrefs as unknown as ContractAppPreferences | undefined);
  }

  public reset(): void {
    this.store.reset();
  }

  public getPreferences(): AppPreferences {
    return this.store.getPreferences() as unknown as AppPreferences;
  }

  public updatePreferences(partial: Partial<AppPreferences>, save?: boolean): AppPreferences {
    return this.store.updatePreferences(partial as Partial<ContractAppPreferences>, save) as unknown as AppPreferences;
  }

  public subscribe(listener: (prefs: AppPreferences) => void): () => void {
    return this.store.subscribe((preferences) => listener(preferences as unknown as AppPreferences));
  }
}

export interface ApplicationAdapters {
  /** Executes macros natively. Production always has one; test doubles use the JS scheduler. */
  readonly engine?: IPlaybackEngine | undefined;
  readonly input: IInputInjectorAdapter;
  readonly hotkey: IHotkeyAdapter;
  readonly pixel: IPixelColorAdapter;
  readonly window: IWindowTargetingAdapter;
  readonly gamepad: IGamepadAdapter;
  readonly orchestrator: IWindowOrchestratorAdapter;
}

function gamepadReportToEvent(report: EngineReport): MacroEvent {
  return {
    id: randomUUID(),
    type: String(report.gamepadEvent),
    eventType: String(report.gamepadEvent),
    device: 'Gamepad',
    timeMicroseconds: 0,
    comment: '',
    gamepadButton: report.gamepadButton ?? undefined,
    gamepadAxis: report.gamepadAxis ?? undefined,
    axisValue: report.axisValue ?? undefined,
    padIndex: report.padIndex ?? 0,
  } as unknown as MacroEvent;
}

export interface ApplicationStores {
  readonly library: ILibraryStore;
  readonly preferences: IPreferencesStore;
  readonly runHistory: IRunHistoryStore;
}

export interface ApplicationStateManagers {
  readonly dirtyEditor: DirtyEditorManager;
  readonly concurrentMacro: ConcurrentMacroManager;
  readonly trigger: TriggerCoordinator;
  readonly overlay: OverlayCoordinator;
  readonly gamepad: GamepadCoordinator;
}

export interface ApplicationCoordinators {
  readonly library: LibraryCoordinator;
  readonly playback: PlaybackCoordinator;
  readonly recording: RecordingCoordinator;
  readonly globalControl: GlobalControlCoordinator;
  readonly windowTargeting: WindowTargetingCoordinator;
  readonly diagnostics: DiagnosticsCoordinator;
  readonly importExport: ImportExportCoordinator;
  readonly settings: SettingsCoordinator;
  readonly shutdown: ShutdownOrchestrator;
}

export interface ApplicationIpcInfrastructure {
  readonly registry: IpcHandlerRegistry;
  readonly subscriptions: SubscriptionManager;
  readonly bridge: IpcBridge;
  readonly broadcaster: IpcBroadcaster;
}

export interface ApplicationRootOptions {
  readonly adapters?: Partial<ApplicationAdapters> | undefined;
  readonly stores?: Partial<ApplicationStores> | undefined;
  readonly ipcRegistry?: IpcHandlerRegistry | undefined;
  readonly subscriptionManager?: SubscriptionManager | undefined;
  readonly appPath?: string | undefined;
  /** Library location when it differs from the data folder that holds settings. */
  readonly libraryPath?: string | undefined;
  readonly systemCommands?: ((request: SystemCommandRequest) => Promise<SystemCommandResponse>) | undefined;
}

export class ApplicationRoot {
  public readonly adapters: ApplicationAdapters;
  public readonly stores: ApplicationStores;
  public readonly state: ApplicationStateManagers;
  public readonly coordinators: ApplicationCoordinators;
  public readonly ipc: ApplicationIpcInfrastructure;

  private isInitialized = false;
  private isDisposed = false;

  constructor(
    adapters: ApplicationAdapters,
    stores: ApplicationStores,
    ipcRegistry?: IpcHandlerRegistry,
    subscriptionManager?: SubscriptionManager,
    systemCommands?: (request: SystemCommandRequest) => Promise<SystemCommandResponse>,
  ) {
    this.adapters = adapters;
    this.stores = stores;

    // 1. Instantiate IPC infrastructure. Production must fail fast if Electron IPC is unavailable.
    const registry = ipcRegistry ?? new IpcHandlerRegistry({ subscriptionManager });
    if (subscriptionManager && registry.subscriptions !== subscriptionManager) {
      throw new Error('ipcRegistry and subscriptionManager must share the same SubscriptionManager');
    }
    const subscriptions = registry.subscriptions;

    // 2. Instantiate State Managers
    const dirtyEditor = new DirtyEditorManager();
    const concurrentMacro = new ConcurrentMacroManager();
    const overlay = new OverlayCoordinator(adapters.orchestrator);
    const trigger = new TriggerCoordinator(adapters.pixel);
    const gamepad = new GamepadCoordinator(adapters.gamepad);

    this.state = {
      dirtyEditor,
      concurrentMacro,
      trigger,
      overlay,
      gamepad,
    };

    // 3. Instantiate Coordinators
    const library = new LibraryCoordinator({
      store: stores.library,
      editorManager: dirtyEditor,
    });
    const settings = new SettingsCoordinator({
      store: stores.preferences,
    });
    const diagnostics = new DiagnosticsCoordinator(stores.runHistory);

    const importExport = new ImportExportCoordinator({
      libraryRootPath: stores.library.rootPath,
      libraryCoordinator: library,
      settingsCoordinator: settings,
      diagnosticsCoordinator: diagnostics,
    });

    const windowTargeting = new WindowTargetingCoordinator({
      windowAdapter: adapters.window,
      injectorAdapter: adapters.input,
    });

    const playback = new PlaybackCoordinator({
      inputAdapter: adapters.input,
      windowTargetingAdapter: adapters.window,
      libraryCoordinator: library,
      concurrentMacroManager: concurrentMacro,
      overlayCoordinator: overlay,
      runHistoryStore: adapters.engine
        ? ({ record: (...args: Parameters<DiagnosticsCoordinator['recordRun']>) => diagnostics.recordRun(...args) } as unknown as IRunHistoryStore)
        : stores.runHistory,
      onRunLoadPeaks: (macroId, peaks) => diagnostics.rememberLoadPeaks(macroId, peaks),
      pixelAdapter: adapters.pixel,
      resolveMacroById: (id) => library.getMacroById(id),
      resolveMacroByName: (name) => library.getMacroByName(name),
      engine: adapters.engine,
    });

    const recording = new RecordingCoordinator({
      windowOrchestrator: adapters.orchestrator,
      triggerCoordinator: trigger,
      overlayCoordinator: overlay,
    });

    const globalControl = new GlobalControlCoordinator({
      hotkeyAdapter: adapters.hotkey,
      playbackCoordinator: playback,
      recordingCoordinator: recording,
      triggerCoordinator: trigger,
      windowOrchestrator: adapters.orchestrator,
      inputAdapter: adapters.input,
      onMacrosChanged: (macros) => adapters.engine?.loadMacros(macros),
    });

    recording.configure({
      capture: adapters.engine,
      controlGestures: () => globalControl.controlGestures(),
      persist: (macro) => {
        void library.saveMacro(macro)
          .then(() => {
            globalControl.refreshMacroHotkeys(library.getMacros());
            // Lets every window reload the macro that now holds the recording.
            subscriptions.broadcast(IpcEventChannels.RECORDING_STATE_CHANGED, 'Idle');
          })
          .catch((error) => console.error('Could not save the recording', error));
      },
    });

    adapters.engine?.onReport((report) => {
      if (report.kind === 'hotkey' && typeof report.hotkeyId === 'number') {
        (adapters.hotkey as { handleNativeTrigger?: (id: number) => void }).handleNativeTrigger?.(report.hotkeyId);
      } else if (report.kind === 'gamepad' && report.gamepadEvent) {
        recording.addEvent(gamepadReportToEvent(report), report.timestampMicroseconds ?? undefined);
      } else if (report.kind === 'emergency' && recording.hasActiveSession) {
        recording.stop();
      }
    });

    const shutdown = new ShutdownOrchestrator({
      triggerCoordinator: trigger,
      playbackCoordinator: playback,
      recordingCoordinator: recording,
      inputAdapter: adapters.input,
      hotkeyAdapter: adapters.hotkey,
      overlayCoordinator: overlay,
    });

    this.coordinators = {
      library,
      playback,
      recording,
      globalControl,
      windowTargeting,
      diagnostics,
      importExport,
      settings,
      shutdown,
    };

    // 4. Wire IPC Bridge and Broadcaster
    const bridge = new IpcBridge(registry, {
      libraryCoordinator: library,
      playbackCoordinator: playback,
      recordingCoordinator: recording,
      globalControlCoordinator: globalControl,
      windowTargetingCoordinator: windowTargeting,
      diagnosticsCoordinator: diagnostics,
      importExportCoordinator: importExport,
      settingsCoordinator: settings,
      windowOrchestrator: adapters.orchestrator,
      gamepadCoordinator: gamepad,
      overlayCoordinator: overlay,
      pixelAdapter: adapters.pixel,
      dirtyEditorManager: dirtyEditor,
      systemCommands,
    });

    const broadcaster = new IpcBroadcaster(subscriptions, {
      playbackCoordinator: playback,
      recordingCoordinator: recording,
      globalControlCoordinator: globalControl,
      gamepadCoordinator: gamepad,
      overlayCoordinator: overlay,
    });

    this.ipc = {
      registry,
      subscriptions,
      bridge,
      broadcaster,
    };
  }

  /**
   * Factory method to create an ApplicationRoot configured entirely with deterministic fakes.
   * Ideal for unit and integration testing without Electron or native Windows API dependencies.
   */
  public static createWithFakes(options: ApplicationRootOptions = {}): ApplicationRoot {
    const adapters: ApplicationAdapters = {
      input: options.adapters?.input ?? new FakeInputAdapter(),
      hotkey: options.adapters?.hotkey ?? new FakeHotkeyAdapter(),
      pixel: options.adapters?.pixel ?? new FakePixelAdapter(),
      window: options.adapters?.window ?? new FakeWindowAdapter(),
      gamepad: options.adapters?.gamepad ?? new FakeGamepadAdapter(),
      orchestrator: options.adapters?.orchestrator ?? new FakeWindowOrchestrator(),
    };

    const stores: ApplicationStores = {
      library: options.stores?.library ?? new FakeLibraryStore(),
      preferences: options.stores?.preferences ?? new FakePreferencesStore(),
      runHistory: options.stores?.runHistory ?? new FakeRunHistoryStore(),
    };

    return new ApplicationRoot(
      adapters,
      stores,
      options.ipcRegistry,
      options.subscriptionManager,
    );
  }

  /**
   * Factory method to create an ApplicationRoot configured with default native adapters
   * and production stores.
   */
  public static createDefault(options: ApplicationRootOptions = {}): ApplicationRoot {
    const adapters: ApplicationAdapters = {
      input: options.adapters?.input ?? new NativeInputAdapter(),
      hotkey: options.adapters?.hotkey ?? new NativeHotkeyAdapter(),
      pixel: options.adapters?.pixel ?? new NativePixelAdapter(),
      window: options.adapters?.window ?? new NativeWindowAdapter(),
      gamepad: options.adapters?.gamepad ?? new NativeGamepadAdapter(),
      orchestrator: options.adapters?.orchestrator ?? new WindowOrchestratorAdapter(),
      engine: options.adapters?.engine ?? new NativeEngineAdapter(),
    };

    const dataRoot = options.appPath;
    const libraryStore = options.stores?.library ?? new ProductionLibraryStoreAdapter(
      new MacroLibraryStore(options.libraryPath ?? dataRoot),
    );
    const stores: ApplicationStores = {
      library: libraryStore,
      preferences: options.stores?.preferences ?? new ProductionPreferencesStoreAdapter(
        new PreferencesStore(dataRoot ? { rootPath: dataRoot } : undefined),
      ),
      runHistory: options.stores?.runHistory ?? new RunHistoryStore(libraryStore.rootPath),
    };

    return new ApplicationRoot(
      adapters,
      stores,
      options.ipcRegistry,
      options.subscriptionManager,
      options.systemCommands,
    );
  }

  /**
   * Initializes the application:
   * 1. Loads preferences and library macros
   * 2. Initializes system and macro hotkeys
   * 3. Registers IPC handlers and starts push broadcaster
   * 4. Attaches OS power/suspend listeners for emergency release
   */
  public async initialize(): Promise<void> {
    if (this.isInitialized || this.isDisposed) return;
    this.isInitialized = true;

    // 1. Load preferences
    const preferences = this.coordinators.settings.load();
    let appliedGamepad: string | null = null;
    const applyGamepadSettings = (current: Record<string, unknown>): void => {
      const output = String(current['gamepadOutput'] ?? 'Xbox360');
      const hide = Boolean(current['hideRealGamepad']);
      if (appliedGamepad === `${output}|${hide}`) return;
      appliedGamepad = `${output}|${hide}`;
      this.adapters.engine?.configureGamepad(output, hide);
    };
    applyGamepadSettings(preferences);
    this.coordinators.settings.onPreferencesChanged(applyGamepadSettings);

    // 2. Load macro library and register automatic pixel-trigger macros.
    await this.coordinators.library.loadLibrary();
    // The native engine runs automatic monitors itself; the JS poller only serves test doubles.
    if (!this.adapters.engine) {
      for (const macro of this.coordinators.library.getAllMacros()) {
        this.state.trigger.registerMacro(macro);
      }
      this.state.trigger.onTriggerFired((macro) => {
        void this.coordinators.playback.play(macro, { activationName: 'Automatic' });
      });
    }

    // 3. Register global system hotkeys & macro hotkeys
    this.coordinators.globalControl.initialize();
    this.coordinators.globalControl.refreshSystemHotkeys(preferences);
    this.coordinators.globalControl.refreshMacroHotkeys(
      this.coordinators.library.getAllMacros(),
    );

    // 4. Register IPC channels & start event broadcaster
    this.ipc.bridge.registerAll();
    this.ipc.broadcaster.start();

    // 5. Connect power suspend / logoff listeners
    this.coordinators.shutdown.attachPowerListeners();
  }

  /**
   * Executes emergency stop from Main Process.
   * Immediately aborts active playback and recording sessions, suspends triggers,
   * and invokes the Universal Input Release guarantee (releaseAll on native inputs).
   *
   * This operates independently of renderer processes and survives renderer reload/closure.
   */
  public emergencyStop(reason: string = 'Emergency stop invoked'): {
    stopped: boolean;
    inputsReleased: boolean;
  } {
    const result = this.coordinators.globalControl.emergencyStop(reason);
    this.state.gamepad.emergencyNeutralize(
      String(this.coordinators.settings.preferences['gamepadOutput'] ?? 'Xbox360'),
    );
    return result;
  }

  /**
   * Executes orderly 7-phase shutdown.
   */
  public async shutdown(reason: string = 'Normal application exit'): Promise<void> {
    await this.coordinators.shutdown.executeShutdown(reason);
    this.dispose();
  }

  /**
   * Disposes of all adapters, state managers, and IPC registrations.
   */
  public dispose(): void {
    if (this.isDisposed) return;
    this.isDisposed = true;

    // Stop coordinators
    this.coordinators.globalControl.dispose();
    this.state.trigger.stop();
    this.state.concurrentMacro.cancelAll('Application disposed');

    // Stop IPC
    this.ipc.broadcaster.stop();
    this.ipc.bridge.unregisterAll();

    // Guarantee all inputs released and virtual devices neutralized.
    this.adapters.input.releaseAll();
    this.state.gamepad.emergencyNeutralize(
      String(this.coordinators.settings.preferences['gamepadOutput'] ?? 'Xbox360'),
    );
    this.state.gamepad.dispose();
    this.adapters.hotkey.unregisterAll();
  }

  public get ready(): boolean {
    return this.isInitialized && !this.isDisposed;
  }
}
