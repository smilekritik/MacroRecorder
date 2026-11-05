import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import type { IpcMain, IpcMainInvokeEvent } from 'electron';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { ApplicationRoot } from '../composition-root.js';
import { MacroLibraryStore } from '../../../../../../packages/storage/src/library/library-store.js';
import { PreferencesStore } from '../../../../../../packages/storage/src/preferences/store.js';
import { RunHistoryStore } from '../../../../../../packages/storage/src/history/store.js';
import { createDefaultMacroDefinition } from '../../../../../../packages/contracts/src/domain/macro.js';
import {
  FakeHotkeyAdapter,
  FakeInputAdapter,
  FakePixelAdapter,
  FakeWindowAdapter,
  FakeWindowOrchestrator,
} from '../adapters/index.js';
import {
  FakeLibraryStore,
  FakePreferencesStore,
  FakeRunHistoryStore,
} from '../coordinators/index.js';
import { IpcHandlerRegistry } from '../../ipc/registry.js';
import type { MacroDefinition, MacroEvent } from '../../ipc/types.js';

function createMockIpcRegistry(): IpcHandlerRegistry {
  const handlers = new Map<
    string,
    (event: IpcMainInvokeEvent, ...args: unknown[]) => Promise<unknown>
  >();
  const ipcMain = {
    handle: (channel: string, listener: (event: IpcMainInvokeEvent, ...args: unknown[]) => Promise<unknown>) => {
      handlers.set(channel, listener);
    },
    removeHandler: (channel: string) => {
      handlers.delete(channel);
    },
  } as unknown as IpcMain;

  return new IpcHandlerRegistry({ ipcMainInstance: ipcMain });
}

describe('Application Composition Root & State Machines', () => {
  let app: ApplicationRoot;
  let fakeInput: FakeInputAdapter;
  let fakeHotkey: FakeHotkeyAdapter;
  let fakePixel: FakePixelAdapter;
  let fakeWindow: FakeWindowAdapter;
  let fakeOrchestrator: FakeWindowOrchestrator;
  let fakeLibrary: FakeLibraryStore;
  let fakePrefs: FakePreferencesStore;
  let fakeHistory: FakeRunHistoryStore;

  beforeEach(() => {
    fakeInput = new FakeInputAdapter();
    fakeHotkey = new FakeHotkeyAdapter();
    fakePixel = new FakePixelAdapter();
    fakeWindow = new FakeWindowAdapter();
    fakeOrchestrator = new FakeWindowOrchestrator();
    fakeLibrary = new FakeLibraryStore();
    fakePrefs = new FakePreferencesStore();
    fakeHistory = new FakeRunHistoryStore();

    app = ApplicationRoot.createWithFakes({
      adapters: {
        input: fakeInput,
        hotkey: fakeHotkey,
        pixel: fakePixel,
        window: fakeWindow,
        orchestrator: fakeOrchestrator,
      },
      stores: {
        library: fakeLibrary,
        preferences: fakePrefs,
        runHistory: fakeHistory,
      },
      ipcRegistry: createMockIpcRegistry(),
    });
  });

  afterEach(() => {
    app.dispose();
  });

  describe('Initialization and Deterministic Fake Composition', () => {
    it('creates all adapters, stores, state managers, and coordinators cleanly', async () => {
      expect(app.ready).toBe(false);
      await app.initialize();
      expect(app.ready).toBe(true);

      expect(app.adapters.input).toBe(fakeInput);
      expect(app.stores.library).toBe(fakeLibrary);
      expect(app.state.dirtyEditor).toBeDefined();
      expect(app.state.concurrentMacro).toBeDefined();
      expect(app.state.trigger).toBeDefined();
      expect(app.state.overlay).toBeDefined();
      expect(app.state.gamepad).toBeDefined();
      expect(app.coordinators.library).toBeDefined();
      expect(app.coordinators.playback).toBeDefined();
      expect(app.coordinators.recording).toBeDefined();
      expect(app.coordinators.globalControl).toBeDefined();
      expect(app.coordinators.shutdown).toBeDefined();
      expect(app.ipc.bridge).toBeDefined();
      expect(app.ipc.broadcaster).toBeDefined();
      expect(app.ipc.subscriptions).toBe(app.ipc.registry.subscriptions);
    });

    it('uses durable production stores rooted at appPath', async () => {
      const rootPath = fs.mkdtempSync(path.join(os.tmpdir(), 'macro-recorder-production-root-'));
      const production = ApplicationRoot.createDefault({
        appPath: rootPath,
        ipcRegistry: createMockIpcRegistry(),
        adapters: {
          input: fakeInput,
          hotkey: fakeHotkey,
          pixel: fakePixel,
          window: fakeWindow,
          gamepad: app.adapters.gamepad,
          orchestrator: fakeOrchestrator,
          engine: {
            onReport: () => () => undefined,
            loadMacros: () => [],
            upsertMacro: () => [],
            start: () => 1,
            activate: () => undefined,
            pause: () => false,
            resume: () => false,
            stop: () => false,
            emergencyStop: () => undefined,
            suspendAutomatic: () => undefined,
            setRecording: () => undefined,
            configureGamepad: () => undefined,
          },
        },
      });

      try {
        await production.stores.library.save(createDefaultMacroDefinition({ id: 'production-persistence', name: 'Persistence probe' }) as unknown as MacroDefinition);
        const reloaded = await new MacroLibraryStore(rootPath).loadAll();
        expect(reloaded.map(macro => macro.id)).toContain('production-persistence');
        production.stores.preferences.save();
        expect(new PreferencesStore({ rootPath }).load()).toEqual(production.stores.preferences.getPreferences());
        expect(production.stores.runHistory).toBeInstanceOf(RunHistoryStore);
      } finally {
        production.dispose();
        fs.rmSync(rootPath, { recursive: true, force: true });
      }
    });
  });

  describe('Success Criterion 1: Emergency Control & Universal Input Release', () => {
    it('cancels recording countdown before it can start', () => {
      vi.useFakeTimers();
      try {
        app.coordinators.recording.start(undefined, 5);
        expect(app.coordinators.recording.isCountdown).toBe(true);

        app.emergencyStop('Emergency during countdown');
        vi.advanceTimersByTime(6000);

        expect(app.coordinators.recording.hasActiveSession).toBe(false);
        expect(app.coordinators.recording.currentState).toBe('Idle');
      } finally {
        vi.useRealTimers();
      }
    });

    it('stops a paused recording session', () => {
      app.coordinators.recording.start();
      app.coordinators.recording.pause();
      expect(app.coordinators.recording.isPaused).toBe(true);

      app.emergencyStop('Emergency during paused recording');

      expect(app.coordinators.recording.hasActiveSession).toBe(false);
      expect(app.coordinators.recording.currentState).toBe('Idle');
    });

    it('emergencyStop immediately halts playback, recording, and releases all inputs', async () => {
      await app.initialize();

      // Simulate active keys held down
      fakeInput.trackInputState(65, true);

      // Start recording
      app.coordinators.recording.start();
      expect(app.coordinators.recording.isRecording).toBe(true);

      // Trigger Main-Process Emergency Stop
      const result = app.emergencyStop('Emergency hotkey pressed');
      expect(result.stopped).toBe(true);
      expect(result.inputsReleased).toBe(true);

      // Verify recording halted and inputs released
      expect(app.coordinators.recording.isRecording).toBe(false);
      expect(fakeInput.releaseAllCalls.length).toBeGreaterThan(0);
    });

    it('emergency stop operates independently of renderer closure or reload', async () => {
      await app.initialize();

      // Simulate renderer unregistering / crashing
      app.ipc.bridge.unregisterAll();

      fakeInput.trackInputState(66, true);

      // Emergency stop directly on composition root
      const result = app.emergencyStop('Renderer disconnected');
      expect(result.stopped).toBe(true);
      expect(fakeInput.releaseAllCalls.length).toBeGreaterThan(0);
    });
  });

  describe('Success Criterion 2: Concurrent Macros and Overlay Isolation', () => {
    it('isolates concurrent macro sessions, execution contexts, and receipts', async () => {
      await app.initialize();

      const macroA: MacroDefinition = {
        schemaVersion: 12,
        id: 'macro-alpha',
        name: 'Macro Alpha',
        events: [
          { id: '1', eventType: 'Delay', type: 'Delay', durationMicroseconds: 50000, timeMicroseconds: 0 },
        ],
        isEnabled: true,
      };

      const macroB: MacroDefinition = {
        schemaVersion: 12,
        id: 'macro-beta',
        name: 'Macro Beta',
        events: [
          { id: '2', eventType: 'Delay', type: 'Delay', durationMicroseconds: 80000, timeMicroseconds: 0 },
        ],
        isEnabled: true,
      };

      const sessionA = app.state.concurrentMacro.createSession(macroA, 1.5, 1001);
      const sessionB = app.state.concurrentMacro.createSession(macroB, 0.5, 1002);

      expect(sessionA.sessionId).not.toBe(sessionB.sessionId);
      expect(sessionA.speed).toBe(1.5);
      expect(sessionB.speed).toBe(0.5);
      expect(sessionA.targetWindowHandle).toBe(1001);
      expect(sessionB.targetWindowHandle).toBe(1002);

      // Stop session A only
      app.state.concurrentMacro.stopSession(sessionA.sessionId, 'Stopped A');
      expect(sessionA.abortController.signal.aborted).toBe(true);
      expect(sessionB.abortController.signal.aborted).toBe(false);

      // Stop all sessions
      app.state.concurrentMacro.stopAllSessions('Emergency stop');
      expect(sessionB.abortController.signal.aborted).toBe(true);
    });

    it('isolates overlay cards and resolves per-macro visibility overrides', () => {
      const overlay = app.state.overlay;

      // Global setting enabled, no override -> true
      expect(overlay.resolveCardVisibility(undefined, true)).toBe(true);
      // Global setting disabled, ForceShow override -> true
      expect(overlay.resolveCardVisibility('ForceShow', false)).toBe(true);
      // Global setting enabled, ForceHide override -> false
      expect(overlay.resolveCardVisibility('ForceHide', true)).toBe(false);
      // Global setting enabled, Inherit -> true
      expect(overlay.resolveCardVisibility('Inherit', true)).toBe(true);
    });
  });

  describe('Success Criterion 3: Automatic Trigger Lifecycle Transitions', () => {
    it('suspends and resumes triggers across recording and playback lifecycle transitions', async () => {
      await app.initialize();

      const triggerCoord = app.state.trigger;
      const triggerMacro: MacroDefinition = {
        schemaVersion: 12,
        id: 'trigger-1',
        name: 'Pixel Trigger Macro',
        events: [
          {
            id: 'e1',
            type: 'PixelColorTrigger',
            pixelX: 100,
            pixelY: 200,
            expectedColorRgb: 0xff0000,
            cooldownMs: 1000,
            timeMicroseconds: 0,
          } as unknown as MacroEvent,
        ],
        isEnabled: true,
      };

      triggerCoord.registerMacro(triggerMacro);
      expect(triggerCoord.activeTriggerCount).toBe(1);

      // Start recording -> triggers must suspend
      app.coordinators.recording.start();
      expect(triggerCoord.suspended).toBe(true);

      // Stop recording -> triggers must resume
      app.coordinators.recording.stop();
      expect(triggerCoord.suspended).toBe(false);

      // Shutdown -> triggers must suspend
      app.coordinators.shutdown.triggerEmergencyRelease('power_suspend');
      expect(triggerCoord.suspended).toBe(true);
    });

    it('samples pixel color and respects cooldown', () => {
      const triggerCoord = app.state.trigger;
      fakePixel.setColorAt(50, 60, 0x00ff00);

      const firedMacros: string[] = [];
      triggerCoord.onTriggerFired((m) => firedMacros.push(m.id));

      const macro: MacroDefinition = {
        schemaVersion: 12,
        id: 'pixel-macro-1',
        name: 'Green Trigger',
        events: [
          {
            id: 'e1',
            type: 'PixelColorTrigger',
            pixelX: 50,
            pixelY: 60,
            expectedColorRgb: 0x00ff00,
            cooldownMs: 5000,
            timeMicroseconds: 0,
          } as unknown as MacroEvent,
        ],
        isEnabled: true,
      };

      triggerCoord.registerMacro(macro);

      // First sample fires
      const firedFirst = triggerCoord.sampleAllTriggers();
      expect(firedFirst).toBe(1);
      expect(firedMacros).toContain('pixel-macro-1');

      // Immediate second sample should be suppressed by cooldown
      const firedSecond = triggerCoord.sampleAllTriggers();
      expect(firedSecond).toBe(0);
      expect(firedMacros).toHaveLength(1);
    });
  });

  describe('Success Criterion 4: Hotkey Routing & Deduping', () => {
    it('saving settings or macros refreshes hotkey routing without duplicate registrations', async () => {
      await app.initialize();

      const initialRegistered = fakeHotkey.getRegisteredHotkeys().length;

      // Save a new macro with a hotkey
      const macro: MacroDefinition = {
        schemaVersion: 12,
        id: 'macro-hotkey-1',
        name: 'Hotkey Macro',
        events: [],
        isEnabled: true,
        hotkey: {
          key: 'F7',
          virtualKey: 118,
          modifiers: 0,
        },
      };

      await app.coordinators.library.saveMacro(macro);
      app.coordinators.globalControl.refreshMacroHotkeys(app.coordinators.library.getMacros());

      const countAfterFirst = fakeHotkey.getRegisteredHotkeys().length;
      expect(countAfterFirst).toBe(initialRegistered + 1);

      // Re-save without changing hotkey -> must not create duplicates
      await app.coordinators.library.saveMacro(macro);
      app.coordinators.globalControl.refreshMacroHotkeys(app.coordinators.library.getMacros());

      const countAfterSecond = fakeHotkey.getRegisteredHotkeys().length;
      expect(countAfterSecond).toBe(countAfterFirst);
    });

    it('migrates legacy F12 bind-map hotkey to F11', () => {
      fakePrefs.save({
        bindMapHotkey: { key: 'F12', virtualKey: 123 },
      });

      const settings = app.coordinators.settings;
      const prefs = settings.loadPreferences();
      const bindMap = prefs['bindMapHotkey'] as { key: string; virtualKey: number };
      expect(bindMap.key).toBe('F11');
      expect(bindMap.virtualKey).toBe(0x7a);
    });
  });

  describe('Success Criterion 5: Cancellation Support & Progress Reporting', () => {
    it('supports cancellation tokens on long operations', async () => {
      const importExport = app.coordinators.importExport;
      const abortController = new AbortController();
      abortController.abort();

      await expect(
        importExport.importMacro('nonexistent.mrmacro', abortController.signal),
      ).rejects.toThrow(/cancelled/i);

      await expect(
        importExport.exportMacro(
          { schemaVersion: 12, id: '1', name: 'Test', events: [] },
          'json',
          'out.json',
          abortController.signal,
        ),
      ).rejects.toThrow(/cancelled/i);
    });

    it('reports typed progress during import', async () => {
      const importExport = app.coordinators.importExport;
      const progressUpdates: number[] = [];

      try {
        await importExport.importMacro('test.json', undefined, (p) => {
          progressUpdates.push(p.percentage);
        });
      } catch {
        // File may not exist in fake test, but progress callback before read is invoked
      }

      expect(progressUpdates.length).toBeGreaterThan(0);
    });
  });

  describe('Success Criterion 6: Dirty Editor Manager State Machine', () => {
    it('tracks draft modifications, dirty markers, and undo states', () => {
      const editor = app.state.dirtyEditor;

      const baseMacro: MacroDefinition = {
        schemaVersion: 12,
        id: 'editor-macro',
        name: 'Editor Macro',
        events: [],
      };

      editor.openMacro(baseMacro);
      expect(editor.isDirty(baseMacro.id)).toBe(false);

      const modified: MacroDefinition = {
        ...baseMacro,
        name: 'Updated Name',
      };

      editor.updateDraft(baseMacro.id, modified, 1, true, false);
      expect(editor.isDirty(baseMacro.id)).toBe(true);
      expect(editor.hasAnyDirty()).toBe(true);

      // Discard draft reverts to original snapshot
      const reverted = editor.discardDraft(baseMacro.id);
      expect(reverted?.name).toBe('Editor Macro');
      expect(editor.isDirty(baseMacro.id)).toBe(false);
    });
  });

  describe('Orderly 7-Phase Shutdown Orchestration', () => {
    it('executes the shutdown order phases cleanly and disposes resources', async () => {
      await app.initialize();

      const customShutdownApp = ApplicationRoot.createWithFakes({
        adapters: {
          input: fakeInput,
          hotkey: fakeHotkey,
          pixel: fakePixel,
          window: fakeWindow,
          orchestrator: fakeOrchestrator,
        },
        ipcRegistry: createMockIpcRegistry(),
      });

      await customShutdownApp.initialize();
      await customShutdownApp.shutdown('user_quit');

      expect(customShutdownApp.ready).toBe(false);
      expect(fakeInput.releaseAllCalls.length).toBeGreaterThan(0);
      expect(fakeHotkey.getRegisteredHotkeys().length).toBe(0);
    });
  });

  describe('Window Targeting & UIPI Elevation Guard', () => {
    it('detects elevated administrator windows and provides UIPI integrity warnings', async () => {
      await app.initialize();

      const wt = app.coordinators.windowTargeting;
      fakeWindow.higherIntegrityHandles.add(9999);
      fakeWindow.chromiumHandles.add(8888);

      // Elevated window check
      const integrity = wt.checkWindowIntegrity(9999);
      expect(integrity.canInject).toBe(false);
      expect(integrity.targetIsHigher).toBe(true);
      expect(integrity.warningMessage).toMatch(/administrator/i);

      // Chromium warning check
      const chromiumCheck = wt.isChromiumOrElevated(8888);
      expect(chromiumCheck.isChromium).toBe(true);
      expect(chromiumCheck.warning).toMatch(/Chromium/i);

      // Normal window activation by name
      fakeWindow.openWindows.push({
        handle: 1234,
        title: 'Document - Notepad',
        processName: 'notepad.exe',
        processId: 4321,
      });

      const activated = wt.activateWindowByName('notepad.exe', 'Notepad');
      expect(activated).toBe(true);
      expect(fakeWindow.activatedHandles).toContain(1234);
    });
  });

  describe('Diagnostics Coordinator & Run History', () => {
    it('records run history and computes dispatch timing statistics', async () => {
      await app.initialize();

      const diag = app.coordinators.diagnostics;

      diag.recordRun(
        { id: 'm1', name: 'Macro 1' },
        [
          {
            eventId: 'r1',
            id: 'r1',
            scheduledMicroseconds: 0,
            dispatchStartedMicroseconds: 100,
            startedMicroseconds: 100,
            dispatchCompletedMicroseconds: 200,
            completedMicroseconds: 200,
            success: true,
            dispatchJitterMilliseconds: 0.1,
          },
          {
            eventId: 'r2',
            id: 'r2',
            scheduledMicroseconds: 1000,
            dispatchStartedMicroseconds: 1050,
            startedMicroseconds: 1050,
            dispatchCompletedMicroseconds: 1100,
            completedMicroseconds: 1100,
            success: true,
            dispatchJitterMilliseconds: 0.05,
          },
        ],
        'Hotkey',
        150,
      );

      const history = diag.loadRunHistory();
      expect(history.length).toBeGreaterThan(0);
      expect(history[0]?.macroId).toBe('m1');

      const stats = diag.getSummaryStatistics();
      expect(stats.totalRuns).toBe(1);
      expect(stats.totalDispatched).toBe(2);
      expect(stats.totalFailed).toBe(0);

      diag.clearRunHistory();
      expect(diag.loadRunHistory()).toHaveLength(0);
    });
  });

  describe('Gamepad Coordinator Lifetime & State', () => {
    it('manages virtual gamepad state, readings, and prompt dismissal', async () => {
      await app.initialize();

      const gp = app.state.gamepad;
      expect(gp.isDriverPromptDismissed).toBe(false);

      gp.setDriverPromptDismissed(true);
      expect(gp.isDriverPromptDismissed).toBe(true);

      const readings = gp.getReadings();
      expect(Array.isArray(readings)).toBe(true);
    });
  });

  describe('Playback Coordinator Speed Clamping & Repeat Guards', () => {
    it('clamps playback speed between 0.1x and 10.0x', async () => {
      await app.initialize();

      const macro: MacroDefinition = {
        schemaVersion: 12,
        id: 'speed-macro',
        name: 'Speed Test Macro',
        events: [],
        isEnabled: true,
      };

      // Speed under 0.1 clamped to 0.1
      const underCtx = app.state.concurrentMacro.createSession(macro, 0.01);
      expect(underCtx.speed).toBe(0.01); // stored on ctx as requested, coordinator clamps on play

      // PlaybackCoordinator clampSpeed method
      expect(app.coordinators.playback.clampSpeed(0.01)).toBe(0.1);
      expect(app.coordinators.playback.clampSpeed(25.0)).toBe(10.0);
      expect(app.coordinators.playback.clampSpeed(2.5)).toBe(2.5);
    });
  });

  describe('Library Coordinator Folder Hierarchy & Trash', () => {
    it('handles nested folder hierarchy, deletion to trash, and restoration', async () => {
      await app.initialize();

      const lib = app.coordinators.library;

      // Create folder
      await lib.createFolder('Work/Automation');
      const folders = lib.getFolders();
      expect(folders).toContain('Work/Automation');

      // Save macro into folder
      const macro: MacroDefinition = {
        schemaVersion: 12,
        id: 'trash-test-macro',
        name: 'Trash Test Macro',
        folderRelativePath: 'Work/Automation',
        events: [],
        isEnabled: true,
      };

      await lib.saveMacro(macro);
      expect(lib.getMacroById('trash-test-macro')).toBeDefined();

      // Delete macro to trash
      const token = await lib.deleteMacro('trash-test-macro');
      expect(token).toBeDefined();
      expect(lib.getMacroById('trash-test-macro')).toBeUndefined();

      // Restore macro from trash
      const restored = await lib.restoreMacro(token, 'Work/Automation', 'Trash Test Macro');
      expect(restored).toBe(true);
    });
  });
});
